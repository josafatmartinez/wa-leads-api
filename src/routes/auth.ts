import { Router, type Request, type Response, type CookieOptions } from 'express';
import { z } from 'zod';

import { env } from '../config/env';
import { getSupabaseAnonClient } from '../lib/supabaseAdmin';

const tokenSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  remember: z.boolean().optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
});

const COOKIE_TOKEN_NAME = 'supabase-auth-token';
const COOKIE_REFRESH_NAME = 'supabase-auth-refresh-token';
const REMEMBER_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function buildCookieOptions(maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  };
}

function setSessionCookies(res: Response, session: any, remember: boolean) {
  if (!session) return;
  const expiresInMs = session.expires_in ? session.expires_in * 1000 : REMEMBER_DURATION_MS;
  const tokenMaxAge = remember ? REMEMBER_DURATION_MS : expiresInMs;
  const refreshMaxAge = remember ? REMEMBER_DURATION_MS : expiresInMs;

  if (session.access_token) {
    res.cookie(COOKIE_TOKEN_NAME, session.access_token, buildCookieOptions(tokenMaxAge));
  }
  if (session.refresh_token) {
    res.cookie(COOKIE_REFRESH_NAME, session.refresh_token, buildCookieOptions(refreshMaxAge));
  }
}

export const authRouter = Router();

authRouter.post('/token', async (req: Request, res: Response) => {
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: { message: 'invalid payload', issues: parsed.error.format() } });
    return;
  }

  const remember = parsed.data.remember ?? false;

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

    const session = data?.session ?? null;
    if (!session) {
      res.status(500).json({ ok: false, error: { message: 'missing session information' } });
      return;
    }
    setSessionCookies(res, session, remember);

    res.json({
      ok: true,
      session: data?.session ?? null,
      user: data?.user ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'authentication failed';
    res.status(500).json({ ok: false, error: { message } });
  }
});

authRouter.post('/register', async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      ok: false,
      error: { message: 'invalid payload', issues: parsed.error.format() },
    });
    return;
  }

  try {
    const supabase = await getSupabaseAnonClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          full_name: parsed.data.fullName ?? null,
          phone: parsed.data.phone ?? null,
        },
      },
    });

    if (error) {
      res.status(400).json({ ok: false, error: { message: error.message } });
      return;
    }

    res.status(201).json({ ok: true, data: { user: data?.user ?? null, session: data?.session ?? null } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'registration failed';
    res.status(500).json({ ok: false, error: { message } });
  }
});
