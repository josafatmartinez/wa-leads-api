import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getSupabaseAdmin, getSupabaseAnonClient } from '../lib/supabaseAdmin';
import {
  requireSupabaseAuth,
  type SupabaseAuthenticatedRequest,
} from '../middlewares/supabaseAuth';

const tokenSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const passwordResetSchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().url().optional(),
});

const passwordUpdateSchema = z.object({
  password: z.string().min(1),
});

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ ok: false, error: { message: 'invalid payload', issues: parsed.error.format() } });
    return;
  }

  try {
    const supabase = await getSupabaseAnonClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      res.status(400).json({ ok: false, error: { message: error.message } });
      return;
    }

    res.status(201).json({
      ok: true,
      session: data?.session ?? null,
      user: data?.user ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'register failed';
    res.status(500).json({ ok: false, error: { message } });
  }
});

async function createSession(req: Request, res: Response) {
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ ok: false, error: { message: 'invalid payload', issues: parsed.error.format() } });
    return;
  }

  try {
    const supabase = await getSupabaseAnonClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error) {
      res.status(401).json({ ok: false, error: { message: error.message } });
      return;
    }

    res.json({
      ok: true,
      session: data?.session ?? null,
      user: data?.user ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'authentication failed';
    res.status(500).json({ ok: false, error: { message } });
  }
}

authRouter.post('/sessions', createSession);

authRouter.post('/token', async (req: Request, res: Response) => {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', 'Wed, 31 Dec 2026 23:59:59 GMT');
  await createSession(req, res);
});

authRouter.post('/password/reset', async (req: Request, res: Response) => {
  const parsed = passwordResetSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ ok: false, error: { message: 'invalid payload', issues: parsed.error.format() } });
    return;
  }

  try {
    const supabase = await getSupabaseAnonClient();
    const options = parsed.data.redirectTo ? { redirectTo: parsed.data.redirectTo } : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, options);

    if (error) {
      res.status(400).json({ ok: false, error: { message: error.message } });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'password reset failed';
    res.status(500).json({ ok: false, error: { message } });
  }
});

authRouter.post('/password', requireSupabaseAuth, async (req: Request, res: Response) => {
  const parsed = passwordUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ ok: false, error: { message: 'invalid payload', issues: parsed.error.format() } });
    return;
  }

  const { supabaseUser } = req as SupabaseAuthenticatedRequest;

  try {
    const supabase = await getSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.updateUserById(supabaseUser.id, {
      password: parsed.data.password,
    });

    if (error) {
      res.status(400).json({ ok: false, error: { message: error.message } });
      return;
    }

    res.json({ ok: true, user: data.user ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'password update failed';
    res.status(500).json({ ok: false, error: { message } });
  }
});
