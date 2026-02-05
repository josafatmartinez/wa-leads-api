import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { getSupabaseAnonClient } from '../lib/supabaseAdmin';

const tokenSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1).optional(),
  phone: z.string().optional(),
});

export const authRouter = Router();

authRouter.post('/token', async (req: Request, res: Response) => {
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: { message: 'invalid payload', issues: parsed.error.format() } });
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
