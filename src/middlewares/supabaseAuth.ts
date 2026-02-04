import type { NextFunction, Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';

import { getSupabaseAdmin } from '../lib/supabaseAdmin';

export type SupabaseAuthenticatedRequest = Request & {
  supabaseUser: User;
};

export async function requireSupabaseAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.header('authorization');
  if (!authHeader) {
    res.status(401).json({ ok: false, error: { message: 'missing authorization header' } });
    return;
  }

  const [, token] = authHeader.match(/^Bearer (.+)$/i) ?? [];
  if (!token) {
    res.status(401).json({ ok: false, error: { message: 'invalid authorization header' } });
    return;
  }

  try {
    const supabase = await getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ ok: false, error: { message: error?.message ?? 'invalid token' } });
      return;
    }

    (req as SupabaseAuthenticatedRequest).supabaseUser = data.user;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'authentication failure';
    res.status(401).json({ ok: false, error: { message } });
  }
}
