import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eraser,
  FileSearch,
  Flag,
  Lightbulb,
  Loader2,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { buildRedactedSourceClue } from '../../utils/sourceVerification';
import type {
  AttemptItem,
  QuestionItem,
  QuizItem,
  StudyPlanProgressUpdate,
} from '../../types';

interface QuizPlayerViewProps {
  quizId: number;
  onViewSource: (docId: number, pageNumber: number, excerpt: string) => void;
  onCompleted: (
    attemptId: number,
    newlyUnlocked: Array<{ badgeKey: string; title: string; description: string }>,
    updatedStudyPlans?: StudyPlanProgressUpdate[]
  ) => void;
  onExit: () => void;
}

interface StoredQuizDraft {
  answers: Record<number, string>;
  reviewFlags: Record<number, boolean>;
  currentIndex: number;
  elapsedSeconds: number;
}

export const QuizPlayerView: React.FC<QuizPlayerViewProps> = ({
  quizId,
  onViewSource,
  onCompleted,
  onExit,
}) => {
  const draftKey = `aqm_quiz_draft_${quizId}`;
  const [quiz, setQuiz] = useState<QuizItem | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [reviewFlags, setReviewFlags] = useState<Record<number, boolean>>({});
  const [revealedMap, setRevealedMap] = useState<Record<number, boolean>>({});
  const [clueVisibleMap, setClueVisibleMap] = useState<Record<number, boolean>>({});
  const [restoredDraft, setRestoredDraft] = useState(false);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    submittedRef.current = false;
    setSubmitting(false);
    setConfirmOpen(false);
    setError(null);
    setLoading(true);
    setAnswers({});
    setReviewFlags({});
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setRemainingSeconds(null);
    setRestoredDraft(false);
    setClueVisibleMap({});
    setRevealedMap({});
    apiFetch<{ quiz: QuizItem; questions: QuestionItem[] }>(`/api/quizzes/${quizId}?play=1`)
      .then((res) => {
        setQuiz(res.quiz);
        setQuestions(res.questions);

        let loadedDraft: StoredQuizDraft | null = null;
        try {
          const raw = localStorage.getItem(draftKey);
          if (raw) {
            loadedDraft = JSON.parse(raw) as StoredQuizDraft;
          }
        } catch {
          loadedDraft = null;
        }

        if (loadedDraft && typeof loadedDraft === 'object') {
          const validIds = new Set(res.questions.map((q) => q.id));
          const restoredAnswers: Record<number, string> = {};
          for (const [k, v] of Object.entries(loadedDraft.answers || {})) {
            const qId = Number(k);
            if (validIds.has(qId) && typeof v === 'string' && v.trim()) {
              restoredAnswers[qId] = v;
            }
          }
          const restoredFlags: Record<number, boolean> = {};
          for (const [k, v] of Object.entries(loadedDraft.reviewFlags || {})) {
            const qId = Number(k);
            if (validIds.has(qId) && v) restoredFlags[qId] = true;
          }
          const hasSavedProgress =
            Object.keys(restoredAnswers).length > 0 || Object.keys(restoredFlags).length > 0;
          if (hasSavedProgress) {
            setAnswers(restoredAnswers);
            setReviewFlags(restoredFlags);
            setCurrentIndex(
              Math.min(
                Math.max(0, loadedDraft.currentIndex || 0),
                Math.max(0, res.questions.length - 1)
              )
            );
            setElapsedSeconds(Math.max(0, loadedDraft.elapsedSeconds || 0));
            setRestoredDraft(true);
          }
        }

        if (res.quiz.timeLimitSeconds > 0) {
          const used = loadedDraft?.elapsedSeconds ?? 0;
          setRemainingSeconds(Math.max(10, res.quiz.timeLimitSeconds - used));
        } else {
          setRemainingSeconds(null);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load quiz.');
      })
      .finally(() => setLoading(false));
  }, [quizId, draftKey]);

  // Persist draft automatically
  useEffect(() => {
    if (!quiz || loading || submittedRef.current) return;
    try {
      const payload: StoredQuizDraft = {
        answers,
        reviewFlags,
        currentIndex,
        elapsedSeconds,
      };
      localStorage.setItem(draftKey, JSON.stringify(payload));
    } catch {
      // ignore storage quota errors
    }
  }, [quiz, loading, answers, reviewFlags, currentIndex, elapsedSeconds, draftKey]);

  const handleSubmit = useCallback(
    async (auto = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      if (!auto) setConfirmOpen(false);
      setSubmitting(true);
      try {
        const payload = {
          timeTakenSeconds: elapsedSeconds,
          responses: questions.map((q) => ({
            questionId: q.id,
            selectedAnswer: answers[q.id] ?? null,
            markedForReview: Boolean(reviewFlags[q.id]),
          })),
        };
        const res = await apiFetch<{
          attempt: AttemptItem;
          unlockedBadges: Array<{ badgeKey: string; title: string; description: string }>;
          updatedStudyPlans?: StudyPlanProgressUpdate[];
        }>(`/api/quizzes/${quizId}/submit`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        try {
          localStorage.removeItem(draftKey);
        } catch {
          // ignore
        }
        onCompleted(res.attempt.id, res.unlockedBadges || [], res.updatedStudyPlans || []);
      } catch (err) {
        submittedRef.current = false;
        setSubmitting(false);
        setError(err instanceof Error ? err.message : 'Failed to submit quiz.');
      }
    },
    [elapsedSeconds, questions, answers, reviewFlags, quizId, draftKey, onCompleted]
  );

  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  useEffect(() => {
    if (!quiz || loading) return;
    const interval = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
      setRemainingSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (!submittedRef.current) {
            handleSubmitRef.current(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [quiz, loading]);

  const currentQuestion = questions[currentIndex];

  const handleSelectAnswer = useCallback(
    (questionId: number, value: string) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      if (quiz?.mode === 'practice' && quiz?.showExplanationsImmediate) {
        setRevealedMap((prev) => ({ ...prev, [questionId]: true }));
      }
    },
    [quiz]
  );

  const handleClearAnswer = (questionId: number) => {
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    setRevealedMap((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
  };

  const handleResetDraft = () => {
    setAnswers({});
    setReviewFlags({});
    setRevealedMap({});
    setClueVisibleMap({});
    setCurrentIndex(0);
    setElapsedSeconds(0);
    setRemainingSeconds(quiz && quiz.timeLimitSeconds > 0 ? quiz.timeLimitSeconds : null);
    setRestoredDraft(false);
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  };

  const toggleBookmark = useCallback(async (q: QuestionItem) => {
    try {
      const res = await apiFetch<{ question: QuestionItem }>(`/api/questions/${q.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isBookmarked: !q.isBookmarked }),
      });
      setQuestions((prev) => prev.map((item) => (item.id === q.id ? res.question : item)));
    } catch {
      // ignore non-fatal bookmark error
    }
  }, []);

  // Keyboard shortcuts: 1-4 options, ArrowLeft/ArrowRight navigation, F flag, B bookmark
  useEffect(() => {
    if (!quiz || !currentQuestion || confirmOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setReviewFlags((prev) => ({
          ...prev,
          [currentQuestion.id]: !prev[currentQuestion.id],
        }));
      } else if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        toggleBookmark(currentQuestion);
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (
          (currentQuestion.questionType === 'mcq' ||
            currentQuestion.questionType === 'true_false' ||
            currentQuestion.questionType === 'match') &&
          currentQuestion.options[idx]
        ) {
          e.preventDefault();
          handleSelectAnswer(currentQuestion.id, currentQuestion.options[idx]);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [quiz, currentQuestion, questions.length, confirmOpen, handleSelectAnswer, toggleBookmark]);

  if (loading) {
    return (
      <div className="glass-surface rounded-2xl p-12 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        <span className="text-sm text-slate-500">Loading your quiz session...</span>
      </div>
    );
  }

  if (error || !quiz || !currentQuestion) {
    return (
      <div className="glass-surface rounded-2xl p-8 text-center space-y-4">
        <p className="text-sm text-red-500">{error || 'Quiz contains no questions.'}</p>
        <button
          type="button"
          onClick={onExit}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold cursor-pointer"
        >
          Back to Quizzes
        </button>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).filter((k) => answers[Number(k)]?.trim()).length;
  const progressPct = Math.round(((currentIndex + 1) / questions.length) * 100);
  const selectedVal = answers[currentQuestion.id] ?? '';
  const isPracticeFeedbackVisible =
    quiz.mode === 'practice' &&
    quiz.showExplanationsImmediate &&
    revealedMap[currentQuestion.id] &&
    currentQuestion.correctAnswer;

  const isClueVisible = Boolean(clueVisibleMap[currentQuestion.id]);
  const redactedClue = buildRedactedSourceClue(
    currentQuestion.evidenceExcerpt,
    currentQuestion.correctAnswer
  );

  const isAnswerRight =
    selectedVal.trim().toLowerCase() === currentQuestion.correctAnswer.trim().toLowerCase();

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Top Quiz Header */}
      <div className="glass-surface rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
            {quiz.title}
          </h2>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
            <span>{quiz.subjectName}</span>
            <span aria-hidden="true">·</span>
            <span>{quiz.mode === 'exam' ? 'Exam Mode' : 'Practice Mode'}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Question {currentIndex + 1} of {questions.length}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {restoredDraft && (
            <button
              type="button"
              onClick={handleResetDraft}
              title="Clear saved draft answers and start fresh"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Draft</span>
            </button>
          )}

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 font-mono text-xs font-semibold tabular-nums">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            <span>
              {remainingSeconds !== null ? formatTimer(remainingSeconds) : formatTimer(elapsedSeconds)}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold cursor-pointer"
          >
            Submit Test
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          style={{ width: `${progressPct}%` }}
          className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Question Card */}
        <div className="lg:col-span-8 glass-surface rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-blue-600 dark:text-cyan-400">
                Q{currentIndex + 1}
              </span>
              <span aria-hidden="true">·</span>
              <span>{currentQuestion.difficulty}</span>
              <span aria-hidden="true">·</span>
              <span>Page {currentQuestion.pageNumber}</span>
            </div>

            {currentQuestion.verifiedSource && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>100% Based on Your Uploaded Material</span>
              </span>
            )}
          </div>

          <h3 className="font-display text-lg sm:text-xl font-bold leading-snug text-slate-900 dark:text-white">
            {currentQuestion.questionText}
          </h3>

          {/* Answer Input Area by Question Type */}
          {(currentQuestion.questionType === 'mcq' ||
            currentQuestion.questionType === 'true_false' ||
            currentQuestion.questionType === 'match') && (
            <div className="space-y-2.5">
              {currentQuestion.options.map((opt, idx) => {
                const isSelected = selectedVal === opt;
                return (
                  <button
                    key={`${currentQuestion.id}-opt-${idx}`}
                    type="button"
                    onClick={() => handleSelectAnswer(currentQuestion.id, opt)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-3 cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-500/15 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-600'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs font-mono font-bold shrink-0">
                      {String.fromCharCode(65 + idx)}
                    </span>
                    <span className="text-sm sm:text-base">{opt}</span>
                  </button>
                );
              })}
            </div>
          )}

          {(currentQuestion.questionType === 'fill_blank' ||
            currentQuestion.questionType === 'short_answer') && (
            <div className="space-y-2">
              <label htmlFor="free-answer" className="block text-xs font-semibold text-slate-500">
                Your Answer
              </label>
              <input
                id="free-answer"
                type="text"
                value={selectedVal}
                onChange={(e) => handleSelectAnswer(currentQuestion.id, e.target.value)}
                placeholder="Type your answer strictly from your notes..."
                className="w-full px-4 py-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Practice Mode Source Clue */}
          {quiz.mode === 'practice' && isClueVisible && (
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-xs space-y-1">
              <div className="font-semibold text-blue-600 dark:text-cyan-400">
                Source Clue · {currentQuestion.documentName} · {currentQuestion.chapterTitle} (Page{' '}
                {currentQuestion.pageNumber})
              </div>
              <p className="text-slate-700 dark:text-slate-200 italic leading-relaxed">
                &ldquo;{redactedClue || 'Check the highlighted paragraph on this page.'}&rdquo;
              </p>
            </div>
          )}

          {/* Practice Mode Immediate Feedback */}
          {isPracticeFeedbackVisible && (
            <div
              className={`p-4 rounded-xl border space-y-2 ${
                isAnswerRight
                  ? 'bg-emerald-500/10 border-emerald-500/30'
                  : 'bg-amber-500/10 border-amber-500/30'
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-bold">
                {isAnswerRight ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-700 dark:text-emerald-300">Correct Answer</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-amber-700 dark:text-amber-300">
                      Correct Answer: {currentQuestion.correctAnswer}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed">
                {currentQuestion.explanation}
              </p>
              <div className="pt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span>
                  Source: {currentQuestion.documentName} · Page {currentQuestion.pageNumber}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onViewSource(
                      currentQuestion.documentId,
                      currentQuestion.pageNumber,
                      currentQuestion.evidenceExcerpt
                    )
                  }
                  className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  <FileSearch className="w-3.5 h-3.5" />
                  <span>View PDF Source</span>
                </button>
              </div>
            </div>
          )}

          {/* Question Action Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setReviewFlags((prev) => ({
                    ...prev,
                    [currentQuestion.id]: !prev[currentQuestion.id],
                  }))
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                  reviewFlags[currentQuestion.id]
                    ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                    : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{reviewFlags[currentQuestion.id] ? 'Marked for Review' : 'Mark for Review'}</span>
              </button>

              <button
                type="button"
                onClick={() => toggleBookmark(currentQuestion)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                  currentQuestion.isBookmarked
                    ? 'bg-violet-500/20 text-violet-600 dark:text-violet-300'
                    : 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>{currentQuestion.isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
              </button>

              {selectedVal && (
                <button
                  type="button"
                  onClick={() => handleClearAnswer(currentQuestion.id)}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <Eraser className="w-3.5 h-3.5" />
                  <span>Clear Answer</span>
                </button>
              )}

              {quiz.mode === 'practice' && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setClueVisibleMap((prev) => ({
                        ...prev,
                        [currentQuestion.id]: !prev[currentQuestion.id],
                      }))
                    }
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                      isClueVisible
                        ? 'bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-cyan-400'
                        : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>{isClueVisible ? 'Hide Clue' : 'Source Clue'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      onViewSource(
                        currentQuestion.documentId,
                        currentQuestion.pageNumber,
                        currentQuestion.evidenceExcerpt
                      )
                    }
                    className="px-3 py-1.5 rounded-lg border border-blue-500/40 text-blue-600 dark:text-cyan-400 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSearch className="w-3.5 h-3.5" />
                    <span>View PDF Source</span>
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 disabled:opacity-40 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                disabled={currentIndex >= questions.length - 1}
                onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="hidden sm:flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>Shortcuts: 1–4 pick option · ←/→ switch question · F flag review · B bookmark</span>
            {restoredDraft && <span className="text-emerald-500">Draft auto-saved</span>}
          </div>
        </div>

        {/* Question Navigator Sidebar */}
        <div className="lg:col-span-4 glass-surface rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold">Question Navigator</h3>
            <span className="font-mono text-xs tabular-nums text-slate-500">
              {answeredCount}/{questions.length} answered
            </span>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, idx) => {
              const isCurrent = idx === currentIndex;
              const isAnswered = Boolean(answers[q.id]?.trim());
              const isReview = Boolean(reviewFlags[q.id]);

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-9 rounded-lg font-mono text-xs font-bold tabular-nums transition-all cursor-pointer ${
                    isCurrent
                      ? 'ring-2 ring-blue-500 bg-blue-600 text-white'
                      : isReview
                        ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40'
                        : isAnswered
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Navigator Color Legend */}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-blue-600 inline-block" />
              <span>Current</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500/50 inline-block" />
              <span>Answered</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-amber-500/30 border border-amber-500/50 inline-block" />
              <span>Review</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-slate-200 dark:bg-slate-800 inline-block" />
              <span>Unanswered</span>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4"
        >
          <div className="glass-surface rounded-2xl p-6 max-w-md w-full space-y-4">
            <h3 className="font-display text-lg font-bold">Submit Your Quiz?</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You have answered {answeredCount} out of {questions.length} questions. Unanswered questions will be scored as 0.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-semibold cursor-pointer"
              >
                Continue Quiz
              </button>
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold cursor-pointer"
              >
                {submitting ? 'Scoring...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

