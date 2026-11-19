export interface UserProfile {
  id: number;
  uid: string;
  name: string;
  email: string;
  role: 'student' | 'admin' | string;
  emailVerified: boolean;
  avatarUrl: string | null;
  language: string;
  theme: 'dark' | 'light';
  reducedMotion: boolean;
  dailyGoalMinutes: number;
  dailyGoalQuestions: number;
  xp: number;
  level: number;
  streakDays: number;
  notificationsEnabled: boolean;
  privacyHideLeaderboard: boolean;
}

export interface SubscriptionInfo {
  plan: 'free' | 'pro' | 'premium';
  status: string;
  maxDocuments: number;
  maxQuizzesPerMonth: number;
}

export interface AchievementBadge {
  id: number;
  badgeKey: string;
  title: string;
  description: string;
  unlockedAt: string;
}

export interface DetectedChapter {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  topics: string[];
}

export interface DocumentItem {
  id: number;
  userId: number;
  subjectId: number | null;
  subjectName: string;
  folderName: string;
  title: string;
  fileName: string;
  fileType: 'pdf' | 'docx' | 'pptx' | 'txt';
  fileSize: number;
  pageCount: number;
  status: 'ready' | 'warning' | 'error' | 'processing';
  warningMessage: string | null;
  detectedChapters: DetectedChapter[];
  hasPdfBinary?: boolean;
  createdAt: string;
}

export interface DocumentPageItem {
  id: number;
  documentId: number;
  pageNumber: number;
  chapterTitle: string | null;
  content: string;
  wordCount: number;
}

export interface QuizItem {
  id: number;
  title: string;
  subjectName: string;
  documentIds: number[];
  chapterFilter: string;
  difficulty: string;
  questionTypes: string[];
  language: string;
  mode: 'practice' | 'exam';
  timeLimitSeconds: number;
  negativeMarking: number;
  marksPerQuestion: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  showExplanationsImmediate: boolean;
  questionCount: number;
  createdAt: string;
  latestAttempt?: AttemptItem | null;
}

export interface QuestionItem {
  id: number;
  quizId: number | null;
  documentId: number;
  documentName: string;
  subjectName: string;
  chapterTitle: string;
  pageNumber: number;
  questionType: 'mcq' | 'true_false' | 'fill_blank' | 'short_answer' | 'match';
  difficulty: 'Easy' | 'Medium' | 'Hard';
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  evidenceExcerpt: string;
  verifiedSource: boolean;
  isBookmarked: boolean;
  bookmarkNote: string | null;
  createdAt: string;
}

export interface BreakdownStat {
  name: string;
  correct: number;
  total: number;
  accuracy: number;
}

export interface AttemptItem {
  id: number;
  quizId: number;
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  timeTakenSeconds: number;
  xpEarned: number;
  subjectBreakdown: BreakdownStat[];
  chapterBreakdown: BreakdownStat[];
  difficultyBreakdown: BreakdownStat[];
  completedAt: string;
}

export interface FlashcardItem {
  id: number;
  documentId: number | null;
  documentName: string;
  subjectName: string;
  pageNumber: number;
  front: string;
  back: string;
  evidenceExcerpt: string;
  difficultyRating: 'Easy' | 'Medium' | 'Difficult';
  reviewCount: number;
  createdAt: string;
}

export interface StudyPlanItem {
  id: number;
  documentId: number | null;
  title: string;
  subjectName: string;
  chapterTitle: string;
  targetDate: string;
  targetQuestions: number;
  completedQuestions: number;
  status: string;
  createdAt: string;
}

export interface StudyPlanProgressUpdate {
  planId: number;
  title: string;
  addedQuestions: number;
  previousCompleted: number;
  completedQuestions: number;
  targetQuestions: number;
  status: 'in_progress' | 'completed';
}

export interface OverviewResponse {
  stats: {
    totalDocuments: number;
    totalQuizzes: number;
    questionsAttempted: number;
    correctAnswers: number;
    overallAccuracy: number;
    studyTimeSeconds: number;
    streakDays: number;
    xp: number;
    level: number;
  };
  weeklyProgress: Array<{
    date: string;
    label: string;
    questionsSolved: number;
    accuracy: number;
  }>;
  subjectPerformance: BreakdownStat[];
  weakTopics: Array<{
    chapterTitle: string;
    subjectName: string;
    documentId: number;
    mistakes: number;
    total: number;
  }>;
  recentDocuments: Array<{
    id: number;
    title: string;
    subjectName: string;
    pageCount: number;
    createdAt: string;
  }>;
  recentQuizzes: QuizItem[];
  recentAttempts: AttemptItem[];
  achievements: AchievementBadge[];
}

export interface PlanConfig {
  id: string;
  name: string;
  audience: string;
  priceMonthlyUsd: number;
  maxDocuments: number;
  maxQuizzesPerMonth: number;
  features: string[];
}
