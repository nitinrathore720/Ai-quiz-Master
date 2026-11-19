import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Calendar,
  CheckCircle2,
  Download,
  FileSearch,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { Result3DRing } from '../three/Result3DRing';
import type {
  AttemptItem,
  QuestionItem,
  QuizItem,
  StudyPlanProgressUpdate,
} from '../../types';

interface ResultAnalysisViewProps {
  attemptId: number;
  unlockedBadges?: Array<{ badgeKey: string; title: string; description: string }>;
  updatedStudyPlans?: StudyPlanProgressUpdate[];
  onRetakeQuiz: (quizId: number) => void;
  onGenerateAnother: () => void;
  onOpenPlanner?: () => void;
  onViewSource: (docId: number, pageNumber: number, excerpt: string) => void;
}

interface UserResponseRow {
  id: number;
  questionId: number;
  selectedAnswer: string | null;
  isCorrect: boolean;
  markedForReview: boolean;
}

export const ResultAnalysisView: React.FC<ResultAnalysisViewProps> = ({
  attemptId,
  unlockedBadges = [],
  updatedStudyPlans = [],
  onRetakeQuiz,
  onGenerateAnother,
  onOpenPlanner,
  onViewSource,
}) => {
  const [attempt, setAttempt] = useState<AttemptItem | null>(null);
  const [quiz, setQuiz] = useState<QuizItem | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [responses, setResponses] = useState<UserResponseRow[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'wrong'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<{
      attempt: AttemptItem;
      quiz: QuizItem;
      questions: QuestionItem[];
      responses: UserResponseRow[];
    }>(`/api/attempts/${attemptId}`)
      .then((res) => {
        setAttempt(res.attempt);
        setQuiz(res.quiz);
        setQuestions(res.questions);
        setResponses(res.responses);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load result.');
      })
      .finally(() => setLoading(false));
  }, [attemptId]);

  const handleDownloadPdf = () => {
    if (!attempt || !quiz) return;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('AI QUIZ MASTER — Result Report', 14, 18);
    doc.setFontSize(11);
    doc.text(`Quiz: ${quiz.title}`, 14, 28);
    doc.text(`Subject: ${quiz.subjectName} | Mode: ${quiz.mode}`, 14, 35);
    doc.text(
      `Score: ${attempt.score}/${attempt.maxScore} (${attempt.percentage}%) | Time: ${attempt.timeTakenSeconds}s`,
      14,
      42
    );
    doc.text(
      `Correct: ${attempt.correctCount} | Incorrect: ${attempt.incorrectCount} | Unanswered: ${attempt.unansweredCount}`,
      14,
      49
    );

    let y = 62;
    const respMap = new Map(responses.map((r) => [r.questionId, r]));
    questions.forEach((q, idx) => {
      if (y > 265) {
        doc.addPage();
        y = 18;
      }
      const resp = respMap.get(q.id);
      const qLines = doc.splitTextToSize(`${idx + 1}. ${q.questionText}`, 180);
      doc.setFontSize(10);
      doc.text(qLines, 14, y);
      y += qLines.length * 5 + 2;
      doc.text(
        `Your Answer: ${resp?.selectedAnswer || 'Unanswered'} | Correct: ${q.correctAnswer} (Page ${q.pageNumber})`,
        14,
        y
      );
      y += 8;
    });

    doc.save(`${quiz.title.replace(/\s+/g, '_')}_Result.pdf`);
  };

  if (loading) {
    return (
      <div className="glass-surface rounded-2xl p-12 flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <span className="text-sm text-slate-500">Analyzing your quiz performance...</span>
      </div>
    );
  }

  if (error || !attempt || !quiz) {
    return (
      <div className="glass-surface rounded-2xl p-8 text-center text-red-500">
        {error || 'Result not found.'}
      </div>
    );
  }

  const respMap = new Map(responses.map((r) => [r.questionId, r]));
  const revisionQuestions = questions.filter((q) => !respMap.get(q.id)?.isCorrect);
  const displayedQuestions = filterMode === 'wrong' ? revisionQuestions : questions;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {unlockedBadges.length > 0 && (
        <div className="glass-surface rounded-2xl p-5 border border-amber-500/40 bg-amber-500/10 flex items-center gap-4">
          <Sparkles className="w-6 h-6 text-amber-400 shrink-0" />
          <div>
            <div className="font-display font-bold text-sm text-amber-600 dark:text-amber-300">
              Achievement Unlocked!
            </div>
            <div className="text-xs text-slate-700 dark:text-slate-200">
              {unlockedBadges.map((b) => `${b.title} — ${b.description}`).join(' · ')}
            </div>
          </div>
        </div>
      )}

      {updatedStudyPlans.length > 0 && (
        <div className="glass-surface rounded-2xl p-5 border border-emerald-500/35 bg-emerald-500/10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-display font-bold text-sm text-emerald-700 dark:text-emerald-300">
                Study Planner Updated Automatically
              </div>
              <div className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5 mt-0.5">
                {updatedStudyPlans.map((u) => (
                  <div key={u.planId}>
                    <span className="font-semibold">{u.title}</span>: +{u.addedQuestions} answered (
                    {u.completedQuestions} / {u.targetQuestions} Qs
                    {u.status === 'completed' ? ' · Completed!' : ''})
                  </div>
                ))}
              </div>
            </div>
          </div>
          {onOpenPlanner && (
            <button
              type="button"
              onClick={onOpenPlanner}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
            >
              View Study Planner
            </button>
          )}
        </div>
      )}

      {/* Top 3D Score Card */}
      <div className="glass-surface rounded-2xl p-6 sm:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        <div className="md:col-span-4">
          <Result3DRing percentage={attempt.percentage} />
        </div>

        <div className="md:col-span-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {quiz.title}
              </h2>
              <p className="text-sm text-blue-600 dark:text-cyan-400 font-semibold inline-flex items-center gap-1.5 mt-1">
                <TrendingUp className="w-4 h-4" />
                <span>Your learning progress is improving!</span>
              </p>
            </div>
            <span className="font-mono text-xs px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 font-semibold">
              +{attempt.xpEarned} XP Earned
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-900/70">
              <div className="text-xs text-slate-500">Total Score</div>
              <div className="font-display text-lg font-bold tabular-nums">
                {attempt.score}/{attempt.maxScore}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-900/70">
              <div className="text-xs text-slate-500">Correct</div>
              <div className="font-display text-lg font-bold tabular-nums text-emerald-500">
                {attempt.correctCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-900/70">
              <div className="text-xs text-slate-500">Incorrect</div>
              <div className="font-display text-lg font-bold tabular-nums text-red-500">
                {attempt.incorrectCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-900/70">
              <div className="text-xs text-slate-500">Unanswered</div>
              <div className="font-display text-lg font-bold tabular-nums text-slate-400">
                {attempt.unansweredCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-100/80 dark:bg-slate-900/70">
              <div className="text-xs text-slate-500">Time Taken</div>
              <div className="font-display text-lg font-bold tabular-nums">
                {attempt.timeTakenSeconds}s
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onRetakeQuiz(quiz.id)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retake Quiz</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterMode((m) => (m === 'wrong' ? 'all' : 'wrong'))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-semibold cursor-pointer"
            >
              <span>
                {filterMode === 'wrong'
                  ? 'Show All Questions'
                  : `Review Wrong Answers (${revisionQuestions.length})`}
              </span>
            </button>
            <button
              type="button"
              onClick={onGenerateAnother}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-semibold cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />
              <span>Generate Another Quiz</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-semibold cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Result as PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Breakdowns: Subject, Chapter, Difficulty */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: 'Subject Accuracy', items: attempt.subjectBreakdown },
          { title: 'Chapter Accuracy', items: attempt.chapterBreakdown },
          { title: 'Difficulty Accuracy', items: attempt.difficultyBreakdown },
        ].map((group) => (
          <div key={group.title} className="glass-surface rounded-2xl p-5 space-y-3">
            <h3 className="font-display text-sm font-bold">{group.title}</h3>
            <div className="space-y-2.5">
              {group.items.map((item) => (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium min-w-0">{item.name}</span>
                    <span className="font-mono tabular-nums text-slate-500 shrink-0 whitespace-nowrap">
                      {item.accuracy}% ({item.correct}/{item.total})
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${item.accuracy}%` }}
                      className="h-full bg-blue-500 rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Question-by-Question Review */}
      <div className="space-y-4">
        <h3 className="font-display text-lg font-bold">
          {filterMode === 'wrong' ? 'Questions Needing Revision' : 'Detailed Answer Review'}
        </h3>
        {displayedQuestions.map((q, idx) => {
          const resp = respMap.get(q.id);
          const isCorrect = Boolean(resp?.isCorrect);
          return (
            <div key={q.id} className="glass-surface rounded-2xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  {isCorrect ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />
                      Question {idx + 1} · Correct
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
                      <XCircle className="w-4 h-4" />
                      Question {idx + 1} · Needs Revision
                    </span>
                  )}
                </div>

                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  100% Based on Your Uploaded Material
                </span>
              </div>

              <p className="font-display font-semibold text-base text-slate-900 dark:text-white">
                {q.questionText}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-900">
                  <span className="text-slate-500">Your Answer: </span>
                  <span className="font-semibold">{resp?.selectedAnswer || 'Unanswered'}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  <span>Correct Answer: </span>
                  <span className="font-semibold">{q.correctAnswer}</span>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                {q.explanation}
              </p>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-slate-500">
                  {q.documentName} · {q.chapterTitle} · Page {q.pageNumber}
                </span>
                <button
                  type="button"
                  onClick={() => onViewSource(q.documentId, q.pageNumber, q.evidenceExcerpt)}
                  className="inline-flex items-center gap-1.5 font-semibold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  <FileSearch className="w-3.5 h-3.5" />
                  <span>View PDF Source</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
