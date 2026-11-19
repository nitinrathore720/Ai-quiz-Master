export interface ScorableQuestion {
  id: number;
  subjectName: string;
  chapterTitle: string;
  difficulty: string;
  questionType: string;
  correctAnswer: string;
}

export interface SubmittedResponseInput {
  questionId: number;
  selectedAnswer: string | null;
  markedForReview?: boolean;
  timeSpentSeconds?: number;
}

export interface BreakdownStat {
  name: string;
  correct: number;
  total: number;
  accuracy: number;
}

export interface QuizCalculationResult {
  score: number;
  maxScore: number;
  percentage: number;
  correctCount: number;
  incorrectCount: number;
  unansweredCount: number;
  xpEarned: number;
  subjectBreakdown: BreakdownStat[];
  chapterBreakdown: BreakdownStat[];
  difficultyBreakdown: BreakdownStat[];
  gradedResponses: Array<{
    questionId: number;
    selectedAnswer: string | null;
    isCorrect: boolean;
    markedForReview: boolean;
    timeSpentSeconds: number;
  }>;
}

export function normalizeAnswer(val: string | null | undefined): string {
  if (!val) return '';
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function isAnswerCorrect(
  question: ScorableQuestion,
  selectedAnswer: string | null | undefined
): boolean {
  if (!selectedAnswer || !selectedAnswer.trim()) return false;
  const normUser = normalizeAnswer(selectedAnswer);
  const normCorrect = normalizeAnswer(question.correctAnswer);

  if (normUser === normCorrect) return true;

  if (question.questionType === 'short_answer') {
    const correctTokens = normCorrect.split(/\s+/).filter((w) => w.length > 2);
    if (correctTokens.length === 0) return normUser === normCorrect;
    const userTokens = new Set(normUser.split(/\s+/));
    let matched = 0;
    for (const t of correctTokens) {
      if (userTokens.has(t)) matched++;
    }
    return matched / correctTokens.length >= 0.7;
  }

  return false;
}

function buildBreakdown(
  entries: Array<{ key: string; isCorrect: boolean }>
): BreakdownStat[] {
  const map = new Map<string, { correct: number; total: number }>();
  for (const item of entries) {
    const current = map.get(item.key) || { correct: 0, total: 0 };
    current.total += 1;
    if (item.isCorrect) current.correct += 1;
    map.set(item.key, current);
  }
  return Array.from(map.entries()).map(([name, stat]) => ({
    name,
    correct: stat.correct,
    total: stat.total,
    accuracy: stat.total > 0 ? Math.round((stat.correct / stat.total) * 100) : 0,
  }));
}

export function calculateQuizResults(
  questions: ScorableQuestion[],
  responses: SubmittedResponseInput[],
  marksPerQuestion = 1,
  negativeMarking = 0
): QuizCalculationResult {
  const responseMap = new Map<number, SubmittedResponseInput>();
  for (const r of responses) {
    responseMap.set(r.questionId, r);
  }

  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;

  const subjectEntries: Array<{ key: string; isCorrect: boolean }> = [];
  const chapterEntries: Array<{ key: string; isCorrect: boolean }> = [];
  const difficultyEntries: Array<{ key: string; isCorrect: boolean }> = [];

  const gradedResponses = questions.map((q) => {
    const resp = responseMap.get(q.id);
    const selected = resp?.selectedAnswer ?? null;
    const hasAnswer = Boolean(selected && selected.trim().length > 0);
    const correct = hasAnswer ? isAnswerCorrect(q, selected) : false;

    if (!hasAnswer) {
      unansweredCount += 1;
    } else if (correct) {
      correctCount += 1;
    } else {
      incorrectCount += 1;
    }

    subjectEntries.push({ key: q.subjectName || 'General', isCorrect: correct });
    chapterEntries.push({ key: q.chapterTitle || 'Full Document', isCorrect: correct });
    difficultyEntries.push({ key: q.difficulty || 'Medium', isCorrect: correct });

    return {
      questionId: q.id,
      selectedAnswer: selected,
      isCorrect: correct,
      markedForReview: Boolean(resp?.markedForReview),
      timeSpentSeconds: resp?.timeSpentSeconds ?? 0,
    };
  });

  const maxScore = Number((questions.length * marksPerQuestion).toFixed(2));
  const rawScore = correctCount * marksPerQuestion - incorrectCount * negativeMarking;
  const score = Number(Math.max(0, rawScore).toFixed(2));
  const percentage = maxScore > 0 ? Number(((score / maxScore) * 100).toFixed(1)) : 0;
  const xpEarned = Math.max(10, correctCount * 15 + (percentage >= 80 ? 25 : 0));

  return {
    score,
    maxScore,
    percentage,
    correctCount,
    incorrectCount,
    unansweredCount,
    xpEarned,
    subjectBreakdown: buildBreakdown(subjectEntries),
    chapterBreakdown: buildBreakdown(chapterEntries),
    difficultyBreakdown: buildBreakdown(difficultyEntries),
    gradedResponses,
  };
}
