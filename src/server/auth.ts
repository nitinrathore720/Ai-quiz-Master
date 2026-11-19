import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { subscriptions, users } from '../db/schema.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

export const SESSION_COOKIE_NAME = 'aqm_session';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  crypto
    .createHash('sha256')
    .update(process.env.SQL_PASSWORD || process.env.GEMINI_API_KEY || 'ai-quiz-master-local-secret')
    .digest('hex');

export interface AuthenticatedUser {
  id: number;
  uid: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  language: string;
  theme: string;
  reducedMotion: boolean;
  dailyGoalMinutes: number;
  dailyGoalQuestions: number;
  xp: number;
  level: number;
  streakDays: number;
  notificationsEnabled: boolean;
  privacyHideLeaderboard: boolean;
}

export interface AuthRequest extends Request {
  currentUser?: AuthenticatedUser;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function createSessionToken(userId: number, uid: string): string {
  const payload = JSON.stringify({
    userId,
    uid,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): { userId: number; uid: string } | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed.userId !== 'number' || typeof parsed.uid !== 'string') {
      return null;
    }
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) {
      return null;
    }
    return { userId: parsed.userId, uid: parsed.uid };
  } catch {
    return null;
  }
}

function isHttpsRequest(req?: Request): boolean {
  if (!req) return process.env.NODE_ENV === 'production';
  const proto = String(req.headers['x-forwarded-proto'] || '');
  return Boolean(req.secure || proto.includes('https') || process.env.NODE_ENV === 'production');
}

export function setSessionCookie(res: Response, token: string, req?: Request): void {
  const isHttps = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });
}

export function clearSessionCookie(res: Response, req?: Request): void {
  const isHttps = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
  });
}

export function sanitizeUser(row: typeof users.$inferSelect): AuthenticatedUser {
  return {
    id: row.id,
    uid: row.uid,
    name: row.name,
    email: row.email,
    role: row.role,
    emailVerified: row.emailVerified,
    avatarUrl: row.avatarUrl,
    language: row.language,
    theme: row.theme,
    reducedMotion: row.reducedMotion,
    dailyGoalMinutes: row.dailyGoalMinutes,
    dailyGoalQuestions: row.dailyGoalQuestions,
    xp: row.xp,
    level: row.level,
    streakDays: row.streakDays,
    notificationsEnabled: row.notificationsEnabled,
    privacyHideLeaderboard: row.privacyHideLeaderboard,
  };
}

export async function ensureSubscription(userId: number): Promise<void> {
  await db
    .insert(subscriptions)
    .values({
      userId,
      plan: 'free',
      status: 'active',
      maxDocuments: 10,
      maxQuizzesPerMonth: 25,
    })
    .onConflictDoNothing({ target: subscriptions.userId });
}

export async function getOrCreateFirebaseUser(
  uid: string,
  email: string,
  name: string,
  avatarUrl?: string | null
): Promise<typeof users.$inferSelect> {
  const existingByEmail = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (existingByEmail.length > 0) {
    const updated = await db
      .update(users)
      .set({
        uid,
        emailVerified: true,
        avatarUrl: avatarUrl || existingByEmail[0].avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingByEmail[0].id))
      .returning();
    await ensureSubscription(updated[0].id);
    return updated[0];
  }

  const inserted = await db
    .insert(users)
    .values({
      uid,
      name: name || email.split('@')[0],
      email: email.toLowerCase(),
      emailVerified: true,
      avatarUrl: avatarUrl || null,
      role: 'student',
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: email.toLowerCase(),
        emailVerified: true,
        updatedAt: new Date(),
      },
    })
    .returning();

  await ensureSubscription(inserted[0].id);
  return inserted[0];
}

export async function resolveAuthUser(req: AuthRequest): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice('Bearer '.length).trim();
    if (bearerToken) {
      // First check signed local/demo/session token (2 dot-separated segments)
      const session = verifySessionToken(bearerToken);
      if (session) {
        const rows = await db
          .select()
          .from(users)
          .where(eq(users.id, session.userId))
          .limit(1);
        if (rows.length > 0 && rows[0].uid === session.uid) {
          return sanitizeUser(rows[0]);
        }
      }

      // Otherwise verify Firebase ID token (Google Sign-In)
      try {
        const decoded = await adminAuth.verifyIdToken(bearerToken);
        const dbUser = await getOrCreateFirebaseUser(
          decoded.uid,
          decoded.email || `${decoded.uid}@firebase.local`,
          decoded.name || decoded.email?.split('@')[0] || 'Scholar',
          decoded.picture || null
        );
        return sanitizeUser(dbUser);
      } catch (err) {
        console.error('Firebase token verification failed:', err);
      }
    }
  }

  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (cookieToken) {
    const session = verifySessionToken(cookieToken);
    if (session) {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.id, session.userId))
        .limit(1);
      if (rows.length > 0 && rows[0].uid === session.uid) {
        return sanitizeUser(rows[0]);
      }
    }
  }

  return null;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await resolveAuthUser(req);
    if (user) {
      req.currentUser = user;
      next();
      return;
    }

    res.status(401).json({ error: 'Authentication required. Please sign in.' });
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ error: 'Authentication verification failed.' });
  }
}

export async function requireAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.currentUser) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  if (req.currentUser.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden: Administrator privileges required.' });
    return;
  }
  next();
}
