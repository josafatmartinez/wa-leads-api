import { Router, type Request, type Response } from 'express';
import type { ParsedQs } from 'qs';
import type { Logger } from 'pino';
import crypto from 'node:crypto';

import { env } from '../config/env';
import { processInbound } from '../bot/engine';
import { buildLeadSlug, ensureUniqueSlug } from '../lib/slug';
import { sendButtons, sendList, sendText } from '../lib/waSend';
import {
  findTenantByPhoneNumberId,
  findTenantByVerifyToken,
  getConversation,
  getTenantTree,
  isDuplicateMessage,
  markMessageProcessed,
  upsertConversation,
  updateConversation,
} from '../repositories/conversationsRepo';
import { getSupabaseAdmin } from '../lib/supabaseAdmin';
import { TREE, type TreeDefinition } from '../bot/tree';

function getFirstQueryParam(
  value: string | ParsedQs | (string | ParsedQs)[] | undefined,
): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const first = value.find((item): item is string => typeof item === 'string');
    return first;
  }
  return undefined;
}

function isValidHubSignature256(rawBody: Buffer | undefined, headerValue: string, secret: string) {
  const match = headerValue.match(/^sha256=([a-f0-9]{64})$/i);
  if (!match) return false;

  const provided = Buffer.from(match[1], 'hex');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody ?? Buffer.alloc(0))
    .digest();
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(provided, expected);
}

async function isConversationSlugTaken(tenantId: string, slug: string, customerPhone: string) {
  const supabase = await getSupabaseAdmin();
  const { data, error } = await supabase
    .from('conversations')
    .select('customer_phone,slug')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw new Error(`slug lookup failed: ${error.message}`);
  if (!data) return false;
  const existingCustomer = (data as any).customer_phone as string | undefined;
  return existingCustomer !== customerPhone;
}

export function createWhatsappRouter(logger: Logger) {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    const mode = getFirstQueryParam(req.query['hub.mode']);
    const verifyToken = getFirstQueryParam(req.query['hub.verify_token']);
    const challenge = getFirstQueryParam(req.query['hub.challenge']);

    if (mode === 'subscribe') {
      const matchesTenant = Boolean(verifyToken && (await findTenantByVerifyToken(verifyToken)));
      if (matchesTenant) {
        res.status(200).send(challenge ?? '');
        return;
      }

      res.sendStatus(403);
      return;
    }

    res.status(200).send('OK');
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const body = req.body as any;
      const value = body?.entry?.[0]?.changes?.[0]?.value;
      const msg = value?.messages?.[0];

      const from = msg?.from as string | undefined;
      const messageId = msg?.id as string | undefined;
      const phoneNumberId = value?.metadata?.phone_number_id as string | undefined;

      if (!msg || !from || !messageId || !phoneNumberId) {
        logger.info({ hasMessage: Boolean(msg) }, 'whatsapp webhook received (no message)');
        res.status(200).json({ ok: true });
        return;
      }

      const tenantWhatsapp = await findTenantByPhoneNumberId(phoneNumberId);
      if (!tenantWhatsapp) {
        logger.warn({ phoneNumberId }, 'whatsapp webhook ignored: tenant not configured');
        res.status(200).json({ ok: true });
        return;
      }

      const tenantId = tenantWhatsapp.tenant_id;
      const appSecret = tenantWhatsapp?.meta_app_secret;
      if (appSecret) {
        const signatureHeader = req.header('x-hub-signature-256');
        const valid =
          typeof signatureHeader === 'string' &&
          isValidHubSignature256(req.rawBody, signatureHeader, appSecret);

        if (!valid) {
          logger.warn(
            { hasSignature: Boolean(signatureHeader) },
            'invalid whatsapp webhook signature',
          );
          res.sendStatus(401);
          return;
        }
      }
      const accessToken = tenantWhatsapp?.access_token ?? env.WHATSAPP_ACCESS_TOKEN;
      const version = env.WHATSAPP_GRAPH_VERSION;

      if (!accessToken) throw new Error('Missing WHATSAPP_ACCESS_TOKEN');

      logger.info(
        { from, messageId, phoneNumberId, tenantId, messageType: msg?.type },
        'whatsapp inbound message',
      );

      const duplicate = await isDuplicateMessage(messageId);
      if (duplicate) {
        res.status(200).json({ ok: true });
        return;
      }

      try {
        await markMessageProcessed(messageId, tenantId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/duplicate key|unique/i.test(message)) {
          res.status(200).json({ ok: true });
          return;
        }
        throw err;
      }

      const existingConversation = await getConversation(tenantId, from);
      const handoffToHuman = Boolean((existingConversation as any)?.handoff_to_human);
      if (handoffToHuman) {
        res.status(200).json({ ok: true });
        return;
      }

      const currentNodeKey =
        typeof (existingConversation as any)?.current_node === 'string'
          ? ((existingConversation as any).current_node as string)
          : undefined;
      const tenantTreeRow = await getTenantTree(tenantId);
      const treeDefinition: TreeDefinition = tenantTreeRow?.tree ?? TREE;
      const answers = ((existingConversation as any)?.answers ?? {}) as Record<string, unknown>;
      const normalizedAnswers: Record<string, string> = {};
      for (const [k, v] of Object.entries(answers)) {
        if (typeof v === 'string') normalizedAnswers[k] = v;
      }

      const { nextNodeKey, updatedAnswers, responseAction, shouldHandoff } = processInbound({
        conversation: { currentNodeKey, answers: normalizedAnswers },
        inboundMessage: msg,
        tree: treeDefinition,
      });

      const now = new Date().toISOString();
      let slug = ((existingConversation as any)?.slug as string | null | undefined) ?? null;
      if (!slug) {
        const baseSlug = buildLeadSlug(from);
        slug = await ensureUniqueSlug(baseSlug, (candidate) =>
          isConversationSlugTaken(tenantId, candidate, from),
        );
      }

      await upsertConversation({
        tenant_id: tenantId,
        customer_phone: from,
        current_node: nextNodeKey,
        answers: updatedAnswers,
        slug,
        last_inbound_at: now,
        updated_at: now,
      });

      if (responseAction.type === 'text' || responseAction.type === 'end') {
        await sendText({
          to: from,
          phoneNumberId,
          accessToken,
          version,
          text: responseAction.body,
        });
      } else if (responseAction.type === 'buttons') {
        await sendButtons({
          to: from,
          phoneNumberId,
          accessToken,
          version,
          text: responseAction.body,
          buttons: responseAction.options,
        });
      } else if (responseAction.type === 'list') {
        await sendList({
          to: from,
          phoneNumberId,
          accessToken,
          version,
          text: responseAction.body,
          buttonText: 'Seleccionar',
          sections: [
            {
              title: 'Opciones',
              rows: responseAction.options.map((o) => ({ id: o.id, title: o.title })),
            },
          ],
        });
      }

      if (shouldHandoff) {
        await updateConversation(tenantId, from, { handoff_to_human: true, updated_at: now });
      }

      res.status(200).json({ ok: true });
    } catch (err) {
      logger.error({ err }, 'whatsapp webhook processing failed');
      res.status(200).json({ ok: true });
    }
  });

  return router;
}
