import crypto from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  achievements,
  documentChunks,
  documentPages,
  documents,
  errorLogs,
  flashcards,
  questions,
  quizAttempts,
  quizzes,
  studyPlans,
  subjects,
  subscriptions,
  systemConfig,
  usageRecords,
  userResponses,
  users,
} from '../db/schema.ts';
import {
  clearSessionCookie,
  createSessionToken,
  ensureSubscription,
  getOrCreateFirebaseUser,
  hashPassword,
  requireAdmin,
  requireAuth,
  resolveAuthUser,
  sanitizeUser,
  setSessionCookie,
  verifyPassword,
  type AuthRequest,
} from './auth.ts';
import { extractDocumentContent } from './documentExtractor.ts';
import { generateSourceVerifiedFlashcards, generateSourceVerifiedQuiz } from './geminiQuiz.ts';
import {
  computeStudyPlanProgressUpdates,
  filterSourceBySelection,
  parseQuestionCountParam,
} from '../utils/documentLogic.ts';
import { calculateQuizResults } from '../utils/quizScoring.ts';
import { DEFAULT_PLANS_CONFIG, ensureAdminAccount, ensureSystemDefaults, getOrSeedDemoStudent } from './seedDemo.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Simple sliding-window rate limiter per IP
const rateBuckets = new Map<string, number[]>();
function rateLimit(maxHits: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'local'}:${req.path}`;
    const now = Date.now();
    const hits = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
    if (hits.length >= maxHits) {
      res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
      return;
    }
    hits.push(now);
    rateBuckets.set(key, hits);
    next();
  };
}

async function logServerError(userId: number | null, context: string, message: string): Promise<void> {
  try {
    await db.insert(errorLogs).values({ userId, context, message });
  } catch {
    // avoid cascading failures during error logging
  }
}

async function evaluateAndUnlockBadges(userId: number): Promise<Array<{ badgeKey: string; title: string; description: string }>> {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) return [];

  const existingBadges = await db.select().from(achievements).where(eq(achievements.userId, userId));
  const owned = new Set(existingBadges.map((b) => b.badgeKey));

  const userAttempts = await db.select().from(quizAttempts).where(eq(quizAttempts.userId, userId));
  const totalSolved = userAttempts.reduce((acc, a) => acc + a.correctCount + a.incorrectCount, 0);
  const highAccuracy = userAttempts.some((a) => a.percentage >= 90 && a.correctCount >= 3);

  const candidates = [
    {
      condition: userAttempts.length >= 1,
      badgeKey: 'first_quiz',
      title: 'First Quiz',
      description: 'Completed your first source-verified practice quiz.',
    },
    {
      condition: userAttempts.length >= 5,
      badgeKey: 'quiz_master',
      title: 'Quiz Master',
      description: 'Completed 5 or more quizzes from your study materials.',
    },
    {
      condition: totalSolved >= 100,
      badgeKey: 'hundred_solved',
      title: '100 Questions Solved',
      description: 'Answered at least 100 source-verified questions.',
    },
    {
      condition: userRow.streakDays >= 7,
      badgeKey: 'seven_day_streak',
      title: '7-Day Streak',
      description: 'Maintained a 7-day continuous study streak.',
    },
    {
      condition: highAccuracy,
      badgeKey: 'accuracy_champion',
      title: 'Accuracy Champion',
      description: 'Scored 90% or higher on a quiz attempt.',
    },
  ];

  const newlyUnlocked: Array<{ badgeKey: string; title: string; description: string }> = [];
  for (const c of candidates) {
    if (c.condition && !owned.has(c.badgeKey)) {
      await db.insert(achievements).values({
        userId,
        badgeKey: c.badgeKey,
        title: c.title,
        description: c.description,
      });
      newlyUnlocked.push({
        badgeKey: c.badgeKey,
        title: c.title,
        description: c.description,
      });
    }
  }
  return newlyUnlocked;
}

export function registerRoutes(app: Express): void {
  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  // Public Plans config
  app.get('/api/plans', async (_req, res) => {
    try {
      await ensureSystemDefaults();
      const [cfg] = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, 'plans_and_features'))
        .limit(1);
      const value = (cfg?.value as typeof DEFAULT_PLANS_CONFIG) || DEFAULT_PLANS_CONFIG;
      res.json({
        plans: value.plans || DEFAULT_PLANS_CONFIG.plans,
        paymentConfigured: Boolean(process.env.STRIPE_SECRET_KEY || process.env.RAZORPAY_KEY_ID),
      });
    } catch (err) {
      console.error('Failed to fetch plans:', err);
      res.status(500).json({ error: 'Unable to load subscription plans.' });
    }
  });

  // ================= AUTHENTICATION =================
  app.post('/api/auth/signup', rateLimit(20, 60_000), async (req, res) => {
    try {
      await ensureSystemDefaults();
      const { name, email, password } = req.body || {};
      if (!name || typeof name !== 'string' || name.trim().length < 2) {
        res.status(400).json({ error: 'Please enter your full name (at least 2 characters).' });
        return;
      }
      if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (!password || typeof password !== 'string' || password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (existing.length > 0) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      const verificationCode = String(crypto.randomInt(100000, 999999));
      const uid = `local_${crypto.randomUUID()}`;

      const [created] = await db
        .insert(users)
        .values({
          uid,
          name: name.trim(),
          email: normalizedEmail,
          passwordHash: hashPassword(password),
          role: 'student',
          emailVerified: false,
          verificationCode,
        })
        .returning();

      await ensureSubscription(created.id);
      const token = createSessionToken(created.id, created.uid);
      setSessionCookie(res, token, req);

      res.status(201).json({
        user: sanitizeUser(created),
        sessionToken: token,
        verificationCodePreview: verificationCode,
      });
    } catch (err: unknown) {
      console.error('Signup error:', err);
      res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
  });

  app.post('/api/auth/login', rateLimit(25, 60_000), async (req, res) => {
    try {
      await ensureAdminAccount();
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const rows = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (rows.length === 0 || !verifyPassword(String(password), rows[0].passwordHash)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const user = rows[0];
      await ensureSubscription(user.id);
      const token = createSessionToken(user.id, user.uid);
      setSessionCookie(res, token, req);
      res.json({ user: sanitizeUser(user), sessionToken: token });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });

  app.post('/api/auth/demo', async (req, res) => {
    try {
      await ensureSystemDefaults();
      const demoUser = await getOrSeedDemoStudent();
      const token = createSessionToken(demoUser.id, demoUser.uid);
      setSessionCookie(res, token, req);
      res.json({ user: sanitizeUser(demoUser), sessionToken: token });
    } catch (err) {
      console.error('Demo login error:', err);
      res.status(500).json({ error: 'Unable to sign into demo account.' });
    }
  });

  app.post('/api/auth/firebase', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : req.body?.idToken;
      if (!token) {
        res.status(400).json({ error: 'Missing Firebase ID token.' });
        return;
      }
      const decoded = await adminAuth.verifyIdToken(token);
      const dbUser = await getOrCreateFirebaseUser(
        decoded.uid,
        decoded.email || `${decoded.uid}@firebase.local`,
        decoded.name || decoded.email?.split('@')[0] || 'Scholar',
        decoded.picture || null
      );
      const sessionToken = createSessionToken(dbUser.id, dbUser.uid);
      setSessionCookie(res, sessionToken, req);
      res.json({ user: sanitizeUser(dbUser), sessionToken });
    } catch (err) {
      console.error('Firebase auth error:', err);
      res.status(401).json({ error: 'Google sign-in verification failed.' });
    }
  });

  app.post('/api/auth/verify-email', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { code } = req.body || {};
      const userId = req.currentUser!.id;
      const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!row) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      if (!code || String(code).trim() !== row.verificationCode) {
        res.status(400).json({ error: 'Invalid verification code.' });
        return;
      }
      const [updated] = await db
        .update(users)
        .set({ emailVerified: true, verificationCode: null, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning();
      res.json({ user: sanitizeUser(updated) });
    } catch (err) {
      console.error('Verify email error:', err);
      res.status(500).json({ error: 'Failed to verify email.' });
    }
  });

  app.post('/api/auth/forgot-password', rateLimit(15, 60_000), async (req, res) => {
    try {
      const { email } = req.body || {};
      if (!email) {
        res.status(400).json({ error: 'Email is required.' });
        return;
      }
      const normalized = String(email).trim().toLowerCase();
      const [row] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
      if (!row) {
        res.json({
          message: 'If an account matches this email, a reset token has been generated.',
        });
        return;
      }
      const resetToken = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await db
        .update(users)
        .set({ resetToken, resetTokenExpiresAt: expiresAt, updatedAt: new Date() })
        .where(eq(users.id, row.id));

      res.json({
        message: 'Password reset token generated. Enter it below to set a new password.',
        resetTokenPreview: resetToken,
      });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ error: 'Unable to initiate password reset.' });
    }
  });

  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { email, token, newPassword } = req.body || {};
      if (!email || !token || !newPassword || String(newPassword).length < 6) {
        res.status(400).json({ error: 'Email, valid reset token, and new password (6+ chars) are required.' });
        return;
      }
      const normalized = String(email).trim().toLowerCase();
      const [row] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
      if (
        !row ||
        !row.resetToken ||
        row.resetToken !== String(token).trim() ||
        !row.resetTokenExpiresAt ||
        row.resetTokenExpiresAt.getTime() < Date.now()
      ) {
        res.status(400).json({ error: 'Reset token is invalid or expired.' });
        return;
      }

      await db
        .update(users)
        .set({
          passwordHash: hashPassword(String(newPassword)),
          resetToken: null,
          resetTokenExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, row.id));

      res.json({ message: 'Password updated successfully. You may now log in.' });
    } catch (err) {
      console.error('Reset password error:', err);
      res.status(500).json({ error: 'Failed to reset password.' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(res, req);
    res.json({ ok: true });
  });

  app.get('/api/auth/session', async (req: AuthRequest, res) => {
    try {
      const user = await resolveAuthUser(req);
      if (!user) {
        res.json({ authenticated: false, user: null, subscription: null, achievements: [] });
        return;
      }
      await ensureSubscription(user.id);
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)).limit(1);
      const userBadges = await db.select().from(achievements).where(eq(achievements.userId, user.id));
      res.json({
        authenticated: true,
        user,
        sessionToken: createSessionToken(user.id, user.uid),
        subscription: sub || { plan: 'free', status: 'active', maxDocuments: 10, maxQuizzesPerMonth: 25 },
        achievements: userBadges,
      });
    } catch (err) {
      console.error('Get /session error:', err);
      res.status(500).json({ error: 'Failed to verify session.' });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      await ensureSubscription(userId);
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
      const userBadges = await db.select().from(achievements).where(eq(achievements.userId, userId));
      res.json({
        user: req.currentUser,
        subscription: sub || { plan: 'free', status: 'active', maxDocuments: 10, maxQuizzesPerMonth: 25 },
        achievements: userBadges,
      });
    } catch (err) {
      console.error('Get /me error:', err);
      res.status(500).json({ error: 'Failed to fetch user profile.' });
    }
  });

  app.patch('/api/auth/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const body = req.body || {};
      const updates: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (typeof body.name === 'string' && body.name.trim().length >= 2) {
        updates.name = body.name.trim();
      }
      if (typeof body.avatarUrl === 'string' || body.avatarUrl === null) {
        updates.avatarUrl = body.avatarUrl;
      }
      if (typeof body.language === 'string') {
        updates.language = body.language;
      }
      if (body.theme === 'dark' || body.theme === 'light') {
        updates.theme = body.theme;
      }
      if (typeof body.reducedMotion === 'boolean') {
        updates.reducedMotion = body.reducedMotion;
      }
      if (typeof body.dailyGoalMinutes === 'number' && body.dailyGoalMinutes >= 5) {
        updates.dailyGoalMinutes = Math.min(480, Math.round(body.dailyGoalMinutes));
      }
      if (typeof body.dailyGoalQuestions === 'number' && body.dailyGoalQuestions >= 1) {
        updates.dailyGoalQuestions = Math.min(200, Math.round(body.dailyGoalQuestions));
      }
      if (typeof body.notificationsEnabled === 'boolean') {
        updates.notificationsEnabled = body.notificationsEnabled;
      }
      if (typeof body.privacyHideLeaderboard === 'boolean') {
        updates.privacyHideLeaderboard = body.privacyHideLeaderboard;
      }

      const [updated] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, userId))
        .returning();

      res.json({ user: sanitizeUser(updated) });
    } catch (err) {
      console.error('Update profile error:', err);
      res.status(500).json({ error: 'Failed to update settings.' });
    }
  });

  app.post('/api/auth/change-password', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const { currentPassword, newPassword } = req.body || {};
      if (!newPassword || String(newPassword).length < 6) {
        res.status(400).json({ error: 'New password must be at least 6 characters.' });
        return;
      }
      const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!row) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      if (row.passwordHash && !verifyPassword(String(currentPassword || ''), row.passwordHash)) {
        res.status(401).json({ error: 'Current password is incorrect.' });
        return;
      }
      await db
        .update(users)
        .set({ passwordHash: hashPassword(String(newPassword)), updatedAt: new Date() })
        .where(eq(users.id, userId));
      res.json({ message: 'Password updated successfully.' });
    } catch (err) {
      console.error('Change password error:', err);
      res.status(500).json({ error: 'Unable to update password.' });
    }
  });

  app.delete('/api/auth/account', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      await db.delete(users).where(eq(users.id, userId));
      clearSessionCookie(res, req);
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete account error:', err);
      res.status(500).json({ error: 'Failed to delete account.' });
    }
  });

  // ================= DOCUMENTS & SUBJECTS =================
  app.get('/api/documents', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const docs = await db
        .select({
          id: documents.id,
          userId: documents.userId,
          subjectId: documents.subjectId,
          subjectName: documents.subjectName,
          folderName: documents.folderName,
          title: documents.title,
          fileName: documents.fileName,
          fileType: documents.fileType,
          fileSize: documents.fileSize,
          pageCount: documents.pageCount,
          status: documents.status,
          warningMessage: documents.warningMessage,
          detectedChapters: documents.detectedChapters,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(eq(documents.userId, userId))
        .orderBy(desc(documents.createdAt));

      const userSubjects = await db
        .select()
        .from(subjects)
        .where(eq(subjects.userId, userId));

      res.json({ documents: docs, subjects: userSubjects });
    } catch (err) {
      console.error('List documents error:', err);
      res.status(500).json({ error: 'Failed to load documents.' });
    }
  });

  app.post('/api/documents/upload', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Please select a PDF, DOCX, PPTX, or TXT file to upload.' });
        return;
      }

      const ext = file.originalname.split('.').pop()?.toLowerCase() || '';
      if (!['pdf', 'docx', 'pptx', 'txt'].includes(ext)) {
        res.status(400).json({ error: 'Unsupported file format. Allowed formats: PDF, DOCX, PPTX, TXT.' });
        return;
      }

      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
      const maxDocs = sub?.maxDocuments ?? 10;
      const existingDocs = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(documents)
        .where(eq(documents.userId, userId));
      if ((existingDocs[0]?.count ?? 0) >= maxDocs) {
        res.status(403).json({
          error: `Document limit (${maxDocs}) reached for your current plan. Delete older files or upgrade your plan.`,
        });
        return;
      }

      const fileType = ext as 'pdf' | 'docx' | 'pptx' | 'txt';
      const extraction = await extractDocumentContent(file.buffer, file.originalname, fileType);

      if (extraction.status === 'error') {
        res.status(422).json({
          error: extraction.warningMessage || 'Document could not be processed.',
        });
        return;
      }

      const requestedSubject =
        typeof req.body?.subjectName === 'string' && req.body.subjectName.trim()
          ? req.body.subjectName.trim()
          : extraction.detectedSubject || 'General';
      const folderName =
        typeof req.body?.folderName === 'string' && req.body.folderName.trim()
          ? req.body.folderName.trim()
          : 'Root';
      const docTitle =
        typeof req.body?.title === 'string' && req.body.title.trim()
          ? req.body.title.trim()
          : file.originalname.replace(/\.[^.]+$/, '');

      let subjectId: number | null = null;
      const existingSubj = await db
        .select()
        .from(subjects)
        .where(and(eq(subjects.userId, userId), eq(subjects.name, requestedSubject)))
        .limit(1);
      if (existingSubj.length > 0) {
        subjectId = existingSubj[0].id;
      } else {
        const [newSubj] = await db
          .insert(subjects)
          .values({ userId, name: requestedSubject })
          .returning();
        subjectId = newSubj.id;
      }

      const storeBase64 = fileType === 'pdf' && file.buffer.length <= 8 * 1024 * 1024
        ? file.buffer.toString('base64')
        : null;

      const [insertedDoc] = await db
        .insert(documents)
        .values({
          userId,
          subjectId,
          subjectName: requestedSubject,
          folderName,
          title: docTitle,
          fileName: file.originalname,
          fileType,
          fileSize: file.size,
          pageCount: extraction.pageCount,
          status: extraction.status,
          warningMessage: extraction.warningMessage,
          detectedChapters: extraction.detectedChapters,
          fileBase64: storeBase64,
        })
        .returning();

      if (extraction.pages.length > 0) {
        const pageRows = extraction.pages.map((p) => ({
          documentId: insertedDoc.id,
          userId,
          pageNumber: p.pageNumber,
          chapterTitle: p.chapterTitle,
          content: p.content,
          wordCount: p.wordCount,
        }));
        for (let i = 0; i < pageRows.length; i += 80) {
          await db.insert(documentPages).values(pageRows.slice(i, i + 80));
        }
      }

      if (extraction.chunks.length > 0) {
        const chunkRows = extraction.chunks.map((c) => ({
          documentId: insertedDoc.id,
          userId,
          pageNumber: c.pageNumber,
          chapterTitle: c.chapterTitle,
          chunkIndex: c.chunkIndex,
          content: c.content,
        }));
        for (let i = 0; i < chunkRows.length; i += 80) {
          await db.insert(documentChunks).values(chunkRows.slice(i, i + 80));
        }
      }

      await db.insert(usageRecords).values({
        userId,
        actionType: 'upload',
        tokensUsed: 0,
        metadata: { fileName: file.originalname, fileType, pageCount: extraction.pageCount },
      });

      const { fileBase64: _omit, ...safeDoc } = insertedDoc;
      res.status(201).json({
        document: safeDoc,
        pages: extraction.pages,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      console.error('Upload error:', err);
      await logServerError(req.currentUser?.id ?? null, 'document_upload', msg);
      res.status(500).json({ error: msg });
    }
  });

  app.get('/api/documents/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const docId = Number(req.params.id);
      if (!docId) {
        res.status(400).json({ error: 'Invalid document ID.' });
        return;
      }

      const [doc] = await db
        .select({
          id: documents.id,
          userId: documents.userId,
          subjectId: documents.subjectId,
          subjectName: documents.subjectName,
          folderName: documents.folderName,
          title: documents.title,
          fileName: documents.fileName,
          fileType: documents.fileType,
          fileSize: documents.fileSize,
          pageCount: documents.pageCount,
          status: documents.status,
          warningMessage: documents.warningMessage,
          detectedChapters: documents.detectedChapters,
          hasPdfBinary: sql<boolean>`(${documents.fileBase64} IS NOT NULL)`,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(and(eq(documents.id, docId), eq(documents.userId, userId)))
        .limit(1);

      if (!doc) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }

      const pages = await db
        .select()
        .from(documentPages)
        .where(and(eq(documentPages.documentId, docId), eq(documentPages.userId, userId)))
        .orderBy(documentPages.pageNumber);

      res.json({ document: doc, pages });
    } catch (err) {
      console.error('Get document error:', err);
      res.status(500).json({ error: 'Failed to load document details.' });
    }
  });

  app.get('/api/documents/:id/file', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const docId = Number(req.params.id);
      const [doc] = await db
        .select({
          fileName: documents.fileName,
          fileType: documents.fileType,
          fileBase64: documents.fileBase64,
        })
        .from(documents)
        .where(and(eq(documents.id, docId), eq(documents.userId, userId)))
        .limit(1);

      if (!doc || !doc.fileBase64) {
        res.status(404).json({ error: 'Original PDF file binary is unavailable for this document.' });
        return;
      }

      const buf = Buffer.from(doc.fileBase64, 'base64');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${doc.fileName.replace(/"/g, '')}"`);
      res.send(buf);
    } catch (err) {
      console.error('Stream PDF error:', err);
      res.status(500).json({ error: 'Unable to load original PDF.' });
    }
  });

  app.patch('/api/documents/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const docId = Number(req.params.id);
      const { subjectName, folderName, title } = req.body || {};

      const [existing] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, docId), eq(documents.userId, userId)))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }

      const [updated] = await db
        .update(documents)
        .set({
          subjectName: typeof subjectName === 'string' && subjectName.trim() ? subjectName.trim() : existing.subjectName,
          folderName: typeof folderName === 'string' && folderName.trim() ? folderName.trim() : existing.folderName,
          title: typeof title === 'string' && title.trim() ? title.trim() : existing.title,
        })
        .where(and(eq(documents.id, docId), eq(documents.userId, userId)))
        .returning();

      const { fileBase64: _omit, ...safeDoc } = updated;
      res.json({ document: safeDoc });
    } catch (err) {
      console.error('Update document error:', err);
      res.status(500).json({ error: 'Failed to update document.' });
    }
  });

  app.delete('/api/documents/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const docId = Number(req.params.id);
      const deleted = await db
        .delete(documents)
        .where(and(eq(documents.id, docId), eq(documents.userId, userId)))
        .returning({ id: documents.id });

      if (deleted.length === 0) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete document error:', err);
      res.status(500).json({ error: 'Failed to delete document.' });
    }
  });

  // ================= SOURCE-ONLY AI QUIZ GENERATION =================
  app.post('/api/quizzes/generate', requireAuth, rateLimit(1200, 60_000), async (req: AuthRequest, res) => {
    const streamMode = req.headers.accept?.includes('application/x-ndjson');
    const writeStream = (obj: unknown) => {
      if (streamMode && !res.writableEnded) {
        res.write(`${JSON.stringify(obj)}\n`);
      }
    };
    const sendStage = (stage: string, detail?: string) => {
      writeStream({ type: 'stage', stage, detail });
    };

    try {
      const userId = req.currentUser!.id;
      const {
        title,
        subjectName,
        documentIds,
        selectedChapters,
        selectedTopics,
        pageStart,
        pageEnd,
        topicFilter,
        questionCount = 5,
        difficulty = 'Mixed',
        questionTypes = ['mcq'],
        language = 'English',
        mode = 'practice',
        randomizeQuestions = false,
        randomizeOptions = false,
        showExplanationsImmediate = true,
        timeLimitSeconds = 0,
        negativeMarking = 0,
        marksPerQuestion = 1,
      } = req.body || {};

      if (!Array.isArray(documentIds) || documentIds.length === 0) {
        res.status(400).json({ error: 'Select at least one uploaded document to generate a quiz.' });
        return;
      }

      const cleanDocIds = documentIds.map((id: unknown) => Number(id)).filter((n: number) => n > 0);
      const ownedDocs = await db
        .select({
          id: documents.id,
          title: documents.title,
          fileName: documents.fileName,
          subjectName: documents.subjectName,
          detectedChapters: documents.detectedChapters,
        })
        .from(documents)
        .where(and(eq(documents.userId, userId), inArray(documents.id, cleanDocIds)));

      if (ownedDocs.length === 0) {
        res.status(404).json({ error: 'Selected documents were not found in your account.' });
        return;
      }

      if (streamMode) {
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
      }

      sendStage('Reading your document', `Loading ${ownedDocs.length} selected study document(s).`);

      const docMap = new Map(ownedDocs.map((d) => [d.id, d]));

      const allPages = await db
        .select()
        .from(documentPages)
        .where(and(eq(documentPages.userId, userId), inArray(documentPages.documentId, cleanDocIds)))
        .orderBy(documentPages.documentId, documentPages.pageNumber);

      const allChunks = await db
        .select()
        .from(documentChunks)
        .where(and(eq(documentChunks.userId, userId), inArray(documentChunks.documentId, cleanDocIds)))
        .orderBy(documentChunks.documentId, documentChunks.chunkIndex);

      const cleanSelectedChapters = Array.isArray(selectedChapters)
        ? selectedChapters.map((c: unknown) => String(c).trim()).filter(Boolean)
        : [];
      const cleanSelectedTopics = Array.isArray(selectedTopics)
        ? selectedTopics.map((t: unknown) => String(t).trim()).filter(Boolean)
        : [];
      const cleanTopicFilter = typeof topicFilter === 'string' ? topicFilter.trim() : '';

      const { filteredPages, filteredChunks, focusTopics } = filterSourceBySelection({
        docs: ownedDocs.map((d) => ({
          id: d.id,
          detectedChapters: Array.isArray(d.detectedChapters) ? d.detectedChapters : [],
        })),
        pages: allPages,
        chunks: allChunks,
        selectedChapters: cleanSelectedChapters,
        selectedTopics: cleanSelectedTopics,
        topicFilter: cleanTopicFilter,
        pageStart: Number(pageStart) || 0,
        pageEnd: Number(pageEnd) || 0,
      });

      if (filteredPages.length === 0 || filteredChunks.length === 0) {
        const msg =
          'No sections in your uploaded material matched the selected topic(s) or page range. Try selecting a different topic or clearing extra filters.';
        if (streamMode) {
          writeStream({ type: 'error', error: msg });
          if (!res.writableEnded) res.end();
        } else {
          res.status(422).json({ error: msg });
        }
        return;
      }

      const existingUserQuestions = await db
        .select({ questionText: questions.questionText })
        .from(questions)
        .where(and(eq(questions.userId, userId), inArray(questions.documentId, cleanDocIds)));

      const resolvedSubject =
        typeof subjectName === 'string' && subjectName.trim()
          ? subjectName.trim()
          : ownedDocs[0].subjectName || 'General';

      const requestedCount = parseQuestionCountParam(questionCount, { min: 1, max: 50 });
      if (requestedCount === null) {
        const msg = 'Number of questions must be a whole number between 1 and 50.';
        if (streamMode) {
          writeStream({ type: 'error', error: msg });
          if (!res.writableEnded) res.end();
        } else {
          res.status(400).json({ error: msg });
        }
        return;
      }

      const result = await generateSourceVerifiedQuiz({
        subjectName: resolvedSubject,
        questionCount: requestedCount,
        difficulty,
        questionTypes,
        language,
        chunks: filteredChunks.map((c) => ({
          documentId: c.documentId,
          documentName: docMap.get(c.documentId)?.fileName || 'Document',
          pageNumber: c.pageNumber,
          chapterTitle: c.chapterTitle || 'Full Document',
          content: c.content,
        })),
        sourcePages: filteredPages.map((p) => ({
          documentId: p.documentId,
          documentName: docMap.get(p.documentId)?.fileName || 'Document',
          pageNumber: p.pageNumber,
          content: p.content,
        })),
        existingQuestionTexts: existingUserQuestions.map((q) => q.questionText),
        focusTopics,
        prioritizeTopChunks: focusTopics.length > 0,
        onStage: sendStage,
      });

      if (result.insufficientReason || result.questions.length === 0) {
        const errMsg =
          result.insufficientReason ||
          'Insufficient information in your uploaded document to generate this question. Please upload more study material.';
        if (streamMode) {
          writeStream({ type: 'error', error: errMsg });
          if (!res.writableEnded) res.end();
        } else {
          res.status(422).json({ error: errMsg });
        }
        return;
      }

      const defaultTopicSuffix =
        focusTopics.length > 0 ? ` — ${focusTopics.slice(0, 2).join(', ')}` : '';
      const quizTitle =
        typeof title === 'string' && title.trim()
          ? title.trim()
          : `${ownedDocs[0].title}${defaultTopicSuffix} Quiz`;

      const chapterFilterLabel =
        focusTopics.length > 0
          ? focusTopics.slice(0, 5).join(', ')
          : cleanSelectedChapters.length > 0
            ? cleanSelectedChapters.join(', ')
            : 'All Chapters';

      const [savedQuiz] = await db
        .insert(quizzes)
        .values({
          userId,
          title: quizTitle,
          subjectName: resolvedSubject,
          documentIds: cleanDocIds,
          chapterFilter: chapterFilterLabel,
          difficulty,
          questionTypes,
          language,
          mode,
          timeLimitSeconds: Number(timeLimitSeconds) || 0,
          negativeMarking: Number(negativeMarking) || 0,
          marksPerQuestion: Number(marksPerQuestion) || 1,
          randomizeQuestions: Boolean(randomizeQuestions),
          randomizeOptions: Boolean(randomizeOptions),
          showExplanationsImmediate: Boolean(showExplanationsImmediate),
          questionCount: result.questions.length,
        })
        .returning();

      const savedQuestions = await db
        .insert(questions)
        .values(
          result.questions.map((q) => ({
            quizId: savedQuiz.id,
            userId,
            documentId: q.documentId,
            documentName: q.documentName,
            subjectName: q.subjectName,
            chapterTitle: q.chapterTitle,
            pageNumber: q.pageNumber,
            questionType: q.questionType,
            difficulty: q.difficulty,
            questionText: q.questionText,
            options:
              randomizeOptions && q.questionType === 'mcq'
                ? [...q.options].sort(() => Math.random() - 0.5)
                : q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            evidenceExcerpt: q.evidenceExcerpt,
            verifiedSource: true,
          }))
        )
        .returning();

      await db.insert(usageRecords).values({
        userId,
        actionType: 'quiz_gen',
        tokensUsed: result.tokensUsed,
        metadata: {
          quizId: savedQuiz.id,
          requestedCount,
          verifiedCount: savedQuestions.length,
          rejectedCount: result.rejectedCount,
        },
      });

      const payload = {
        type: 'complete',
        quiz: savedQuiz,
        questions: savedQuestions,
        rejectedCount: result.rejectedCount,
      };

      if (streamMode) {
        writeStream(payload);
        if (!res.writableEnded) res.end();
      } else {
        res.status(201).json(payload);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Quiz generation failed.';
      console.error('Quiz generation error:', err);
      await logServerError(req.currentUser?.id ?? null, 'quiz_generation', msg);
      if (streamMode) {
        writeStream({ type: 'error', error: msg });
        if (!res.writableEnded) res.end();
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  app.get('/api/quizzes', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const userQuizzes = await db
        .select()
        .from(quizzes)
        .where(eq(quizzes.userId, userId))
        .orderBy(desc(quizzes.createdAt));

      const userAttempts = await db
        .select()
        .from(quizAttempts)
        .where(eq(quizAttempts.userId, userId))
        .orderBy(desc(quizAttempts.completedAt));

      const latestAttemptMap = new Map<number, typeof quizAttempts.$inferSelect>();
      for (const a of userAttempts) {
        if (!latestAttemptMap.has(a.quizId)) {
          latestAttemptMap.set(a.quizId, a);
        }
      }

      res.json({
        quizzes: userQuizzes.map((q) => ({
          ...q,
          latestAttempt: latestAttemptMap.get(q.id) || null,
        })),
      });
    } catch (err) {
      console.error('List quizzes error:', err);
      res.status(500).json({ error: 'Failed to load quizzes.' });
    }
  });

  app.post('/api/quizzes/from-questions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const { title, questionIds, mode = 'practice', timeLimitSeconds = 0 } = req.body || {};

      if (!Array.isArray(questionIds) || questionIds.length === 0) {
        res.status(400).json({ error: 'Select at least one question to create a practice set.' });
        return;
      }

      const cleanIds = questionIds
        .map((id: unknown) => Number(id))
        .filter((n: number) => Number.isInteger(n) && n > 0)
        .slice(0, 50);

      if (cleanIds.length === 0) {
        res.status(400).json({ error: 'No valid question IDs provided.' });
        return;
      }

      const sourceQuestions = await db
        .select()
        .from(questions)
        .where(and(eq(questions.userId, userId), inArray(questions.id, cleanIds)));

      if (sourceQuestions.length === 0) {
        res.status(404).json({ error: 'No matching verified questions found in your account.' });
        return;
      }

      const docIds = Array.from(new Set(sourceQuestions.map((q) => q.documentId).filter(Boolean)));
      const types = Array.from(new Set(sourceQuestions.map((q) => q.questionType)));
      const quizTitle =
        typeof title === 'string' && title.trim()
          ? title.trim()
          : `Custom Revision Set (${sourceQuestions.length} Qs)`;

      const [savedQuiz] = await db
        .insert(quizzes)
        .values({
          userId,
          title: quizTitle,
          subjectName: sourceQuestions[0].subjectName || 'Mixed Subjects',
          documentIds: docIds,
          chapterFilter: 'Selected Questions',
          difficulty: 'Mixed',
          questionTypes: types,
          language: 'English',
          mode: mode === 'exam' ? 'exam' : 'practice',
          timeLimitSeconds: Number(timeLimitSeconds) || 0,
          negativeMarking: 0,
          marksPerQuestion: 1,
          randomizeQuestions: false,
          randomizeOptions: false,
          showExplanationsImmediate: mode !== 'exam',
          questionCount: sourceQuestions.length,
        })
        .returning();

      const clonedQuestions = await db
        .insert(questions)
        .values(
          sourceQuestions.map((q) => ({
            quizId: savedQuiz.id,
            userId,
            documentId: q.documentId,
            documentName: q.documentName,
            subjectName: q.subjectName,
            chapterTitle: q.chapterTitle,
            pageNumber: q.pageNumber,
            questionType: q.questionType,
            difficulty: q.difficulty,
            questionText: q.questionText,
            options: q.options,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            evidenceExcerpt: q.evidenceExcerpt,
            verifiedSource: true,
            isBookmarked: false,
          }))
        )
        .returning();

      res.status(201).json({ quiz: savedQuiz, questions: clonedQuestions });
    } catch (err) {
      console.error('Create custom quiz error:', err);
      res.status(500).json({ error: 'Failed to create custom practice quiz.' });
    }
  });

  app.get('/api/quizzes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const quizId = Number(req.params.id);
      const [quiz] = await db
        .select()
        .from(quizzes)
        .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, userId)))
        .limit(1);

      if (!quiz) {
        res.status(404).json({ error: 'Quiz not found.' });
        return;
      }

      let quizQuestions = await db
        .select()
        .from(questions)
        .where(and(eq(questions.quizId, quizId), eq(questions.userId, userId)))
        .orderBy(questions.id);

      if (quiz.randomizeQuestions && req.query.play === '1') {
        quizQuestions = [...quizQuestions].sort(() => Math.random() - 0.5);
      }

      const hideSolutions = req.query.play === '1' && quiz.mode === 'exam';
      const sanitizedQuestions = quizQuestions.map((q) =>
        hideSolutions
          ? {
              ...q,
              correctAnswer: '',
              explanation: '',
            }
          : q
      );

      res.json({ quiz, questions: sanitizedQuestions });
    } catch (err) {
      console.error('Get quiz error:', err);
      res.status(500).json({ error: 'Failed to load quiz.' });
    }
  });

  app.delete('/api/quizzes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const quizId = Number(req.params.id);
      const deleted = await db
        .delete(quizzes)
        .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, userId)))
        .returning({ id: quizzes.id });
      if (deleted.length === 0) {
        res.status(404).json({ error: 'Quiz not found.' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete quiz error:', err);
      res.status(500).json({ error: 'Failed to delete quiz.' });
    }
  });

  app.post('/api/quizzes/:id/submit', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const quizId = Number(req.params.id);
      const { responses = [], timeTakenSeconds = 0 } = req.body || {};

      const [quiz] = await db
        .select()
        .from(quizzes)
        .where(and(eq(quizzes.id, quizId), eq(quizzes.userId, userId)))
        .limit(1);

      if (!quiz) {
        res.status(404).json({ error: 'Quiz not found.' });
        return;
      }

      const quizQuestions = await db
        .select()
        .from(questions)
        .where(and(eq(questions.quizId, quizId), eq(questions.userId, userId)))
        .orderBy(questions.id);

      const calc = calculateQuizResults(
        quizQuestions,
        Array.isArray(responses) ? responses : [],
        quiz.marksPerQuestion,
        quiz.negativeMarking
      );

      const [attempt] = await db
        .insert(quizAttempts)
        .values({
          quizId,
          userId,
          score: calc.score,
          maxScore: calc.maxScore,
          percentage: calc.percentage,
          correctCount: calc.correctCount,
          incorrectCount: calc.incorrectCount,
          unansweredCount: calc.unansweredCount,
          timeTakenSeconds: Math.max(1, Number(timeTakenSeconds) || 1),
          xpEarned: calc.xpEarned,
          subjectBreakdown: calc.subjectBreakdown,
          chapterBreakdown: calc.chapterBreakdown,
          difficultyBreakdown: calc.difficultyBreakdown,
        })
        .returning();

      if (calc.gradedResponses.length > 0) {
        await db.insert(userResponses).values(
          calc.gradedResponses.map((r) => ({
            attemptId: attempt.id,
            questionId: r.questionId,
            userId,
            selectedAnswer: r.selectedAnswer,
            isCorrect: r.isCorrect,
            markedForReview: r.markedForReview,
            timeSpentSeconds: r.timeSpentSeconds,
          }))
        );
      }

      // Update user XP, level, and real study streak
      const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (userRow) {
        const today = new Date().toISOString().slice(0, 10);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        let newStreak = userRow.streakDays;
        if (userRow.lastStudyDate !== today) {
          newStreak = userRow.lastStudyDate === yesterday ? userRow.streakDays + 1 : 1;
        }
        const newXp = userRow.xp + calc.xpEarned;
        const newLevel = Math.max(1, Math.floor(newXp / 150) + 1);
        await db
          .update(users)
          .set({
            xp: newXp,
            level: newLevel,
            streakDays: newStreak,
            lastStudyDate: today,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      }

      const unlockedBadges = await evaluateAndUnlockBadges(userId);

      // Automatically update Study Planner progress strictly from genuinely answered quiz questions
      const answeredQuestionIds = new Set(
        calc.gradedResponses
          .filter((r) => Boolean(r.selectedAnswer && r.selectedAnswer.trim().length > 0))
          .map((r) => r.questionId)
      );
      const answeredQuestions = quizQuestions
        .filter((q) => answeredQuestionIds.has(q.id))
        .map((q) => ({
          documentId: q.documentId,
          subjectName: q.subjectName,
          chapterTitle: q.chapterTitle,
        }));

      let updatedStudyPlans: ReturnType<typeof computeStudyPlanProgressUpdates> = [];
      if (answeredQuestions.length > 0) {
        const userPlans = await db
          .select()
          .from(studyPlans)
          .where(eq(studyPlans.userId, userId));

        updatedStudyPlans = computeStudyPlanProgressUpdates(userPlans, {
          title: quiz.title,
          subjectName: quiz.subjectName,
          documentIds: Array.isArray(quiz.documentIds) ? quiz.documentIds : [],
          chapterFilter: quiz.chapterFilter || 'All Chapters',
          answeredQuestions,
        });

        for (const upd of updatedStudyPlans) {
          await db
            .update(studyPlans)
            .set({
              completedQuestions: upd.completedQuestions,
              status: upd.status,
            })
            .where(and(eq(studyPlans.id, upd.planId), eq(studyPlans.userId, userId)));
        }
      }

      res.status(201).json({
        attempt,
        gradedResponses: calc.gradedResponses,
        questions: quizQuestions,
        unlockedBadges,
        updatedStudyPlans,
      });
    } catch (err) {
      console.error('Submit quiz error:', err);
      res.status(500).json({ error: 'Failed to grade and save quiz attempt.' });
    }
  });

  app.get('/api/attempts/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const attemptId = Number(req.params.id);
      const [attempt] = await db
        .select()
        .from(quizAttempts)
        .where(and(eq(quizAttempts.id, attemptId), eq(quizAttempts.userId, userId)))
        .limit(1);

      if (!attempt) {
        res.status(404).json({ error: 'Quiz attempt not found.' });
        return;
      }

      const [quiz] = await db
        .select()
        .from(quizzes)
        .where(and(eq(quizzes.id, attempt.quizId), eq(quizzes.userId, userId)))
        .limit(1);

      const responses = await db
        .select()
        .from(userResponses)
        .where(and(eq(userResponses.attemptId, attemptId), eq(userResponses.userId, userId)));

      const quizQuestions = await db
        .select()
        .from(questions)
        .where(and(eq(questions.quizId, attempt.quizId), eq(questions.userId, userId)))
        .orderBy(questions.id);

      res.json({ attempt, quiz, responses, questions: quizQuestions });
    } catch (err) {
      console.error('Get attempt error:', err);
      res.status(500).json({ error: 'Failed to load quiz results.' });
    }
  });

  // ================= DASHBOARD ANALYTICS =================
  app.get('/api/dashboard/overview', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;

      const userDocs = await db
        .select({
          id: documents.id,
          title: documents.title,
          subjectName: documents.subjectName,
          pageCount: documents.pageCount,
          createdAt: documents.createdAt,
        })
        .from(documents)
        .where(eq(documents.userId, userId))
        .orderBy(desc(documents.createdAt));

      const userQuizzes = await db
        .select()
        .from(quizzes)
        .where(eq(quizzes.userId, userId))
        .orderBy(desc(quizzes.createdAt));

      const userAttempts = await db
        .select()
        .from(quizAttempts)
        .where(eq(quizAttempts.userId, userId))
        .orderBy(desc(quizAttempts.completedAt));

      const userResponsesAll = await db
        .select({
          isCorrect: userResponses.isCorrect,
          questionId: userResponses.questionId,
          subjectName: questions.subjectName,
          chapterTitle: questions.chapterTitle,
          documentId: questions.documentId,
        })
        .from(userResponses)
        .innerJoin(questions, eq(userResponses.questionId, questions.id))
        .where(eq(userResponses.userId, userId));

      const totalDocuments = userDocs.length;
      const totalQuizzes = userQuizzes.length;
      const questionsAttempted = userAttempts.reduce(
        (acc, a) => acc + a.correctCount + a.incorrectCount,
        0
      );
      const correctAnswers = userAttempts.reduce((acc, a) => acc + a.correctCount, 0);
      const overallAccuracy =
        questionsAttempted > 0 ? Math.round((correctAnswers / questionsAttempted) * 100) : 0;
      const studyTimeSeconds = userAttempts.reduce((acc, a) => acc + a.timeTakenSeconds, 0);

      // Weekly progress calculated strictly from real attempts in the last 7 days
      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const weeklyMap = new Map<string, { label: string; correct: number; total: number }>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        const key = d.toISOString().slice(0, 10);
        weeklyMap.set(key, { label: dayLabels[d.getDay()], correct: 0, total: 0 });
      }
      for (const att of userAttempts) {
        const key = new Date(att.completedAt).toISOString().slice(0, 10);
        const bucket = weeklyMap.get(key);
        if (bucket) {
          bucket.correct += att.correctCount;
          bucket.total += att.correctCount + att.incorrectCount;
        }
      }
      const weeklyProgress = Array.from(weeklyMap.entries()).map(([date, b]) => ({
        date,
        label: b.label,
        questionsSolved: b.total,
        accuracy: b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0,
      }));

      // Subject-wise performance & weak topics calculated strictly from real user responses
      const subjectStats = new Map<string, { correct: number; total: number }>();
      const topicMistakes = new Map<string, { chapterTitle: string; subjectName: string; documentId: number; mistakes: number; total: number }>();

      for (const r of userResponsesAll) {
        const s = subjectStats.get(r.subjectName) || { correct: 0, total: 0 };
        s.total += 1;
        if (r.isCorrect) s.correct += 1;
        subjectStats.set(r.subjectName, s);

        const tKey = `${r.documentId}:${r.chapterTitle}`;
        const t = topicMistakes.get(tKey) || {
          chapterTitle: r.chapterTitle,
          subjectName: r.subjectName,
          documentId: r.documentId,
          mistakes: 0,
          total: 0,
        };
        t.total += 1;
        if (!r.isCorrect) t.mistakes += 1;
        topicMistakes.set(tKey, t);
      }

      const subjectPerformance = Array.from(subjectStats.entries()).map(([name, s]) => ({
        name,
        correct: s.correct,
        total: s.total,
        accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
      }));

      const weakTopics = Array.from(topicMistakes.values())
        .filter((t) => t.mistakes > 0)
        .sort((a, b) => b.mistakes - a.mistakes)
        .slice(0, 6);

      const userBadges = await db.select().from(achievements).where(eq(achievements.userId, userId));

      res.json({
        stats: {
          totalDocuments,
          totalQuizzes,
          questionsAttempted,
          correctAnswers,
          overallAccuracy,
          studyTimeSeconds,
          streakDays: req.currentUser!.streakDays,
          xp: req.currentUser!.xp,
          level: req.currentUser!.level,
        },
        weeklyProgress,
        subjectPerformance,
        weakTopics,
        recentDocuments: userDocs.slice(0, 5),
        recentQuizzes: userQuizzes.slice(0, 5),
        recentAttempts: userAttempts.slice(0, 5),
        achievements: userBadges,
      });
    } catch (err) {
      console.error('Dashboard overview error:', err);
      res.status(500).json({ error: 'Failed to load dashboard overview.' });
    }
  });

  // ================= QUESTION BANK & BOOKMARKS =================
  app.get('/api/questions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const rows = await db
        .select()
        .from(questions)
        .where(eq(questions.userId, userId))
        .orderBy(desc(questions.createdAt));

      const search = typeof req.query.search === 'string' ? req.query.search.toLowerCase().trim() : '';
      const subject = typeof req.query.subject === 'string' ? req.query.subject : '';
      const difficulty = typeof req.query.difficulty === 'string' ? req.query.difficulty : '';
      const type = typeof req.query.type === 'string' ? req.query.type : '';
      const bookmarkedOnly = req.query.bookmarked === '1';

      const filtered = rows.filter((q) => {
        if (bookmarkedOnly && !q.isBookmarked) return false;
        if (subject && q.subjectName !== subject) return false;
        if (difficulty && q.difficulty !== difficulty) return false;
        if (type && q.questionType !== type) return false;
        if (
          search &&
          !q.questionText.toLowerCase().includes(search) &&
          !q.chapterTitle.toLowerCase().includes(search) &&
          !q.documentName.toLowerCase().includes(search)
        ) {
          return false;
        }
        return true;
      });

      res.json({ questions: filtered });
    } catch (err) {
      console.error('List questions error:', err);
      res.status(500).json({ error: 'Failed to load question bank.' });
    }
  });

  app.patch('/api/questions/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const qId = Number(req.params.id);
      const body = req.body || {};

      const [existing] = await db
        .select()
        .from(questions)
        .where(and(eq(questions.id, qId), eq(questions.userId, userId)))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: 'Question not found.' });
        return;
      }

      const [updated] = await db
        .update(questions)
        .set({
          questionText: typeof body.questionText === 'string' ? body.questionText : existing.questionText,
          options: Array.isArray(body.options) ? body.options : existing.options,
          correctAnswer: typeof body.correctAnswer === 'string' ? body.correctAnswer : existing.correctAnswer,
          explanation: typeof body.explanation === 'string' ? body.explanation : existing.explanation,
          difficulty: typeof body.difficulty === 'string' ? body.difficulty : existing.difficulty,
          isBookmarked: typeof body.isBookmarked === 'boolean' ? body.isBookmarked : existing.isBookmarked,
          bookmarkNote:
            body.bookmarkNote !== undefined
              ? typeof body.bookmarkNote === 'string'
                ? body.bookmarkNote
                : null
              : existing.bookmarkNote,
        })
        .where(and(eq(questions.id, qId), eq(questions.userId, userId)))
        .returning();

      res.json({ question: updated });
    } catch (err) {
      console.error('Update question error:', err);
      res.status(500).json({ error: 'Failed to update question.' });
    }
  });

  app.post('/api/questions/:id/regenerate', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const qId = Number(req.params.id);
      const [existing] = await db
        .select()
        .from(questions)
        .where(and(eq(questions.id, qId), eq(questions.userId, userId)))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: 'Question not found.' });
        return;
      }

      const pages = await db
        .select()
        .from(documentPages)
        .where(and(eq(documentPages.documentId, existing.documentId), eq(documentPages.userId, userId)));

      const chunks = await db
        .select()
        .from(documentChunks)
        .where(and(eq(documentChunks.documentId, existing.documentId), eq(documentChunks.userId, userId)));

      const gen = await generateSourceVerifiedQuiz({
        subjectName: existing.subjectName,
        questionCount: 1,
        difficulty: (existing.difficulty as 'Easy' | 'Medium' | 'Hard') || 'Medium',
        questionTypes: [(existing.questionType as 'mcq') || 'mcq'],
        language: 'English',
        chunks: chunks.map((c) => ({
          documentId: c.documentId,
          documentName: existing.documentName,
          pageNumber: c.pageNumber,
          chapterTitle: c.chapterTitle || existing.chapterTitle,
          content: c.content,
        })),
        sourcePages: pages.map((p) => ({
          documentId: p.documentId,
          documentName: existing.documentName,
          pageNumber: p.pageNumber,
          content: p.content,
        })),
        existingQuestionTexts: [existing.questionText],
      });

      if (gen.questions.length === 0) {
        res.status(422).json({
          error:
            gen.insufficientReason ||
            'Insufficient information in your uploaded document to regenerate this question.',
        });
        return;
      }

      const replacement = gen.questions[0];
      const [updated] = await db
        .update(questions)
        .set({
          questionText: replacement.questionText,
          options: replacement.options,
          correctAnswer: replacement.correctAnswer,
          explanation: replacement.explanation,
          evidenceExcerpt: replacement.evidenceExcerpt,
          pageNumber: replacement.pageNumber,
          verifiedSource: true,
        })
        .where(and(eq(questions.id, qId), eq(questions.userId, userId)))
        .returning();

      res.json({ question: updated });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to regenerate question.';
      console.error('Regenerate question error:', err);
      res.status(500).json({ error: msg });
    }
  });

  app.delete('/api/questions/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const qId = Number(req.params.id);
      await db.delete(questions).where(and(eq(questions.id, qId), eq(questions.userId, userId)));
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete question error:', err);
      res.status(500).json({ error: 'Failed to delete question.' });
    }
  });

  // ================= FLASHCARDS & REVISION =================
  app.get('/api/flashcards', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const cards = await db
        .select()
        .from(flashcards)
        .where(eq(flashcards.userId, userId))
        .orderBy(desc(flashcards.createdAt));
      res.json({ flashcards: cards });
    } catch (err) {
      console.error('List flashcards error:', err);
      res.status(500).json({ error: 'Failed to load flashcards.' });
    }
  });

  app.post('/api/flashcards/generate', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const { documentId, count = 6 } = req.body || {};
      const docId = Number(documentId);
      if (!docId) {
        res.status(400).json({ error: 'Please select an uploaded document.' });
        return;
      }

      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, docId), eq(documents.userId, userId)))
        .limit(1);

      if (!doc) {
        res.status(404).json({ error: 'Document not found.' });
        return;
      }

      const pages = await db
        .select()
        .from(documentPages)
        .where(and(eq(documentPages.documentId, docId), eq(documentPages.userId, userId)));

      const chunks = await db
        .select()
        .from(documentChunks)
        .where(and(eq(documentChunks.documentId, docId), eq(documentChunks.userId, userId)));

      const result = await generateSourceVerifiedFlashcards({
        subjectName: doc.subjectName,
        count: Math.min(15, Math.max(2, Number(count) || 6)),
        chunks: chunks.map((c) => ({
          documentId: doc.id,
          documentName: doc.fileName,
          pageNumber: c.pageNumber,
          chapterTitle: c.chapterTitle || 'Full Document',
          content: c.content,
        })),
        sourcePages: pages.map((p) => ({
          documentId: doc.id,
          documentName: doc.fileName,
          pageNumber: p.pageNumber,
          content: p.content,
        })),
      });

      if (result.cards.length === 0) {
        res.status(422).json({
          error:
            result.insufficientReason ||
            'Insufficient information in your uploaded document to generate flashcards.',
        });
        return;
      }

      const inserted = await db
        .insert(flashcards)
        .values(
          result.cards.map((c) => ({
            userId,
            documentId: c.documentId,
            documentName: c.documentName,
            subjectName: c.subjectName,
            pageNumber: c.pageNumber,
            front: c.front,
            back: c.back,
            evidenceExcerpt: c.evidenceExcerpt,
            difficultyRating: 'Medium',
          }))
        )
        .returning();

      await db.insert(usageRecords).values({
        userId,
        actionType: 'flashcard_gen',
        tokensUsed: result.tokensUsed,
        metadata: { documentId: doc.id, count: inserted.length },
      });

      res.status(201).json({ flashcards: inserted });
    } catch (err) {
      console.error('Generate flashcards error:', err);
      res.status(500).json({ error: 'Failed to generate flashcards.' });
    }
  });

  app.patch('/api/flashcards/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const cardId = Number(req.params.id);
      const { difficultyRating, incrementReview } = req.body || {};

      const [existing] = await db
        .select()
        .from(flashcards)
        .where(and(eq(flashcards.id, cardId), eq(flashcards.userId, userId)))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: 'Flashcard not found.' });
        return;
      }

      const [updated] = await db
        .update(flashcards)
        .set({
          difficultyRating:
            difficultyRating === 'Easy' || difficultyRating === 'Medium' || difficultyRating === 'Difficult'
              ? difficultyRating
              : existing.difficultyRating,
          reviewCount: incrementReview ? existing.reviewCount + 1 : existing.reviewCount,
        })
        .where(and(eq(flashcards.id, cardId), eq(flashcards.userId, userId)))
        .returning();

      res.json({ flashcard: updated });
    } catch (err) {
      console.error('Update flashcard error:', err);
      res.status(500).json({ error: 'Failed to update flashcard.' });
    }
  });

  app.delete('/api/flashcards/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const cardId = Number(req.params.id);
      await db.delete(flashcards).where(and(eq(flashcards.id, cardId), eq(flashcards.userId, userId)));
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete flashcard error:', err);
      res.status(500).json({ error: 'Failed to delete flashcard.' });
    }
  });

  // ================= STUDY PLANNER =================
  app.get('/api/study-plans', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const rows = await db
        .select()
        .from(studyPlans)
        .where(eq(studyPlans.userId, userId))
        .orderBy(desc(studyPlans.createdAt));
      res.json({ studyPlans: rows });
    } catch (err) {
      console.error('Study plans error:', err);
      res.status(500).json({ error: 'Failed to load study plans.' });
    }
  });

  app.post('/api/study-plans', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const { title, subjectName, chapterTitle, targetDate, targetQuestions, documentId } = req.body || {};
      if (!title || !subjectName || !targetDate) {
        res.status(400).json({ error: 'Title, subject, and target date are required.' });
        return;
      }
      const enforcedQuestions = parseQuestionCountParam(targetQuestions, { min: 1, max: 200 });
      if (enforcedQuestions === null) {
        res.status(400).json({ error: 'Number of questions must be a whole number between 1 and 200.' });
        return;
      }
      const [created] = await db
        .insert(studyPlans)
        .values({
          userId,
          documentId: documentId ? Number(documentId) : null,
          title: String(title).trim(),
          subjectName: String(subjectName).trim(),
          chapterTitle: String(chapterTitle || 'All Chapters').trim(),
          targetDate: String(targetDate),
          targetQuestions: enforcedQuestions,
        })
        .returning();
      res.status(201).json({ studyPlan: created });
    } catch (err) {
      console.error('Create study plan error:', err);
      res.status(500).json({ error: 'Failed to create study plan.' });
    }
  });

  app.patch('/api/study-plans/:id', requireAuth, async (_req: AuthRequest, res) => {
    res.status(403).json({
      error:
        'Study plan progress and completion are tracked automatically when you complete quizzes.',
    });
  });

  app.delete('/api/study-plans/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.currentUser!.id;
      const planId = Number(req.params.id);
      await db.delete(studyPlans).where(and(eq(studyPlans.id, planId), eq(studyPlans.userId, userId)));
      res.json({ ok: true });
    } catch (err) {
      console.error('Delete study plan error:', err);
      res.status(500).json({ error: 'Failed to delete study plan.' });
    }
  });

  // ================= ADMIN PANEL (ROLE-GATED) =================
  app.get('/api/admin/overview', requireAuth, requireAdmin, async (_req, res) => {
    try {
      await ensureSystemDefaults();
      const allUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          emailVerified: users.emailVerified,
          xp: users.xp,
          streakDays: users.streakDays,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));

      const allSubs = await db.select().from(subscriptions);
      const subMap = new Map(allSubs.map((s) => [s.userId, s]));

      const docStats = await db
        .select({
          totalDocuments: sql<number>`count(*)::int`,
          totalPages: sql<number>`coalesce(sum(${documents.pageCount}), 0)::int`,
        })
        .from(documents);

      const usageStats = await db
        .select({
          totalActions: sql<number>`count(*)::int`,
          totalTokens: sql<number>`coalesce(sum(${usageRecords.tokensUsed}), 0)::int`,
        })
        .from(usageRecords);

      const recentLogs = await db.select().from(errorLogs).orderBy(desc(errorLogs.createdAt)).limit(25);
      const [cfg] = await db
        .select()
        .from(systemConfig)
        .where(eq(systemConfig.key, 'plans_and_features'))
        .limit(1);

      res.json({
        users: allUsers.map((u) => ({
          ...u,
          subscription: subMap.get(u.id) || null,
        })),
        documentStats: docStats[0] || { totalDocuments: 0, totalPages: 0 },
        usageStats: usageStats[0] || { totalActions: 0, totalTokens: 0 },
        errorLogs: recentLogs,
        config: cfg?.value || DEFAULT_PLANS_CONFIG,
      });
    } catch (err) {
      console.error('Admin overview error:', err);
      res.status(500).json({ error: 'Failed to load admin overview.' });
    }
  });

  app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      const { role, plan } = req.body || {};
      if (role === 'student' || role === 'admin') {
        await db.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, targetId));
      }
      if (plan === 'free' || plan === 'pro' || plan === 'premium') {
        const limits =
          plan === 'premium'
            ? { maxDocuments: 500, maxQuizzesPerMonth: 1500 }
            : plan === 'pro'
              ? { maxDocuments: 75, maxQuizzesPerMonth: 200 }
              : { maxDocuments: 10, maxQuizzesPerMonth: 25 };
        await db
          .insert(subscriptions)
          .values({ userId: targetId, plan, status: 'active', ...limits })
          .onConflictDoUpdate({
            target: subscriptions.userId,
            set: { plan, ...limits, updatedAt: new Date() },
          });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('Admin update user error:', err);
      res.status(500).json({ error: 'Failed to update user.' });
    }
  });

  app.patch('/api/admin/config', requireAuth, requireAdmin, async (req, res) => {
    try {
      const value = req.body?.config;
      if (!value || typeof value !== 'object') {
        res.status(400).json({ error: 'Invalid configuration payload.' });
        return;
      }
      await db
        .insert(systemConfig)
        .values({ key: 'plans_and_features', value, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: systemConfig.key,
          set: { value, updatedAt: new Date() },
        });
      res.json({ ok: true, config: value });
    } catch (err) {
      console.error('Admin config error:', err);
      res.status(500).json({ error: 'Failed to save configuration.' });
    }
  });

  // Ensure API errors (such as Multer file-size limit or malformed JSON) always return JSON rather than HTML
  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File exceeds the 10 MB upload limit.' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    const errWithStatus = err as { status?: number; statusCode?: number; message?: string };
    const candidateStatus = errWithStatus?.status ?? errWithStatus?.statusCode;
    const status =
      typeof candidateStatus === 'number' && candidateStatus >= 400 && candidateStatus < 600
        ? candidateStatus
        : err instanceof SyntaxError
          ? 400
          : 500;
    const msg = err instanceof Error ? err.message : 'Internal server error.';
    res.status(status).json({ error: msg });
  });
}
