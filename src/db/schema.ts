import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
} from 'drizzle-orm/pg-core';

export interface DetectedChapter {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  topics: string[];
}

export interface BreakdownStat {
  name: string;
  correct: number;
  total: number;
  accuracy: number;
}

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('student'),
  emailVerified: boolean('email_verified').notNull().default(false),
  verificationCode: text('verification_code'),
  resetToken: text('reset_token'),
  resetTokenExpiresAt: timestamp('reset_token_expires_at'),
  avatarUrl: text('avatar_url'),
  language: text('language').notNull().default('English'),
  theme: text('theme').notNull().default('dark'),
  reducedMotion: boolean('reduced_motion').notNull().default(false),
  dailyGoalMinutes: integer('daily_goal_minutes').notNull().default(30),
  dailyGoalQuestions: integer('daily_goal_questions').notNull().default(20),
  xp: integer('xp').notNull().default(0),
  level: integer('level').notNull().default(1),
  streakDays: integer('streak_days').notNull().default(0),
  lastStudyDate: text('last_study_date'),
  notificationsEnabled: boolean('notifications_enabled').notNull().default(true),
  privacyHideLeaderboard: boolean('privacy_hide_leaderboard').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),
  plan: text('plan').notNull().default('free'),
  status: text('status').notNull().default('active'),
  maxDocuments: integer('max_documents').notNull().default(10),
  maxQuizzesPerMonth: integer('max_quizzes_per_month').notNull().default(25),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const subjects = pgTable('subjects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  color: text('color').notNull().default('#3B82F6'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  subjectId: integer('subject_id').references(() => subjects.id, {
    onDelete: 'set null',
  }),
  subjectName: text('subject_name').notNull().default('General'),
  folderName: text('folder_name').notNull().default('Root'),
  title: text('title').notNull(),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  pageCount: integer('page_count').notNull().default(1),
  status: text('status').notNull().default('ready'),
  warningMessage: text('warning_message'),
  detectedChapters: jsonb('detected_chapters').$type<DetectedChapter[]>().notNull().default([]),
  fileBase64: text('file_base64'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documentPages = pgTable('document_pages', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .references(() => documents.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  pageNumber: integer('page_number').notNull(),
  chapterTitle: text('chapter_title'),
  content: text('content').notNull(),
  wordCount: integer('word_count').notNull().default(0),
});

export const documentChunks = pgTable('document_chunks', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .references(() => documents.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  pageNumber: integer('page_number').notNull(),
  chapterTitle: text('chapter_title'),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
});

export const quizzes = pgTable('quizzes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  subjectName: text('subject_name').notNull(),
  documentIds: jsonb('document_ids').$type<number[]>().notNull().default([]),
  chapterFilter: text('chapter_filter').notNull().default('All Chapters'),
  difficulty: text('difficulty').notNull().default('Mixed'),
  questionTypes: jsonb('question_types').$type<string[]>().notNull().default(['mcq']),
  language: text('language').notNull().default('English'),
  mode: text('mode').notNull().default('practice'),
  timeLimitSeconds: integer('time_limit_seconds').notNull().default(0),
  negativeMarking: real('negative_marking').notNull().default(0),
  marksPerQuestion: real('marks_per_question').notNull().default(1),
  randomizeQuestions: boolean('randomize_questions').notNull().default(false),
  randomizeOptions: boolean('randomize_options').notNull().default(false),
  showExplanationsImmediate: boolean('show_explanations_immediate').notNull().default(true),
  questionCount: integer('question_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const questions = pgTable('questions', {
  id: serial('id').primaryKey(),
  quizId: integer('quiz_id').references(() => quizzes.id, {
    onDelete: 'cascade',
  }),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  documentId: integer('document_id')
    .references(() => documents.id, { onDelete: 'cascade' })
    .notNull(),
  documentName: text('document_name').notNull(),
  subjectName: text('subject_name').notNull(),
  chapterTitle: text('chapter_title').notNull(),
  pageNumber: integer('page_number').notNull().default(1),
  questionType: text('question_type').notNull().default('mcq'),
  difficulty: text('difficulty').notNull().default('Medium'),
  questionText: text('question_text').notNull(),
  options: jsonb('options').$type<string[]>().notNull().default([]),
  correctAnswer: text('correct_answer').notNull(),
  explanation: text('explanation').notNull(),
  evidenceExcerpt: text('evidence_excerpt').notNull(),
  verifiedSource: boolean('verified_source').notNull().default(true),
  isBookmarked: boolean('is_bookmarked').notNull().default(false),
  bookmarkNote: text('bookmark_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const quizAttempts = pgTable('quiz_attempts', {
  id: serial('id').primaryKey(),
  quizId: integer('quiz_id')
    .references(() => quizzes.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  score: real('score').notNull(),
  maxScore: real('max_score').notNull(),
  percentage: real('percentage').notNull(),
  correctCount: integer('correct_count').notNull(),
  incorrectCount: integer('incorrect_count').notNull(),
  unansweredCount: integer('unanswered_count').notNull(),
  timeTakenSeconds: integer('time_taken_seconds').notNull(),
  xpEarned: integer('xp_earned').notNull().default(0),
  subjectBreakdown: jsonb('subject_breakdown').$type<BreakdownStat[]>().notNull().default([]),
  chapterBreakdown: jsonb('chapter_breakdown').$type<BreakdownStat[]>().notNull().default([]),
  difficultyBreakdown: jsonb('difficulty_breakdown').$type<BreakdownStat[]>().notNull().default([]),
  completedAt: timestamp('completed_at').defaultNow().notNull(),
});

export const userResponses = pgTable('user_responses', {
  id: serial('id').primaryKey(),
  attemptId: integer('attempt_id')
    .references(() => quizAttempts.id, { onDelete: 'cascade' })
    .notNull(),
  questionId: integer('question_id')
    .references(() => questions.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  selectedAnswer: text('selected_answer'),
  isCorrect: boolean('is_correct').notNull().default(false),
  markedForReview: boolean('marked_for_review').notNull().default(false),
  timeSpentSeconds: integer('time_spent_seconds').notNull().default(0),
});

export const flashcards = pgTable('flashcards', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  documentId: integer('document_id').references(() => documents.id, {
    onDelete: 'cascade',
  }),
  documentName: text('document_name').notNull(),
  subjectName: text('subject_name').notNull(),
  pageNumber: integer('page_number').notNull().default(1),
  front: text('front').notNull(),
  back: text('back').notNull(),
  evidenceExcerpt: text('evidence_excerpt').notNull(),
  difficultyRating: text('difficulty_rating').notNull().default('Medium'),
  reviewCount: integer('review_count').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const studyPlans = pgTable('study_plans', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  documentId: integer('document_id').references(() => documents.id, {
    onDelete: 'set null',
  }),
  title: text('title').notNull(),
  subjectName: text('subject_name').notNull(),
  chapterTitle: text('chapter_title').notNull(),
  targetDate: text('target_date').notNull(),
  targetQuestions: integer('target_questions').notNull().default(10),
  completedQuestions: integer('completed_questions').notNull().default(0),
  status: text('status').notNull().default('pending'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const achievements = pgTable('achievements', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  badgeKey: text('badge_key').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  unlockedAt: timestamp('unlocked_at').defaultNow().notNull(),
});

export const usageRecords = pgTable('usage_records', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  actionType: text('action_type').notNull(),
  tokensUsed: integer('tokens_used').notNull().default(0),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const errorLogs = pgTable('error_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id'),
  context: text('context').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const systemConfig = pgTable('system_config', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
