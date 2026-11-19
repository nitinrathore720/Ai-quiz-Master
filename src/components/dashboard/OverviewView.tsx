import React from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  Play,
  Target,
  TrendingUp,
  Upload,
} from 'lucide-react';
import type { OverviewResponse } from '../../types';

interface OverviewViewProps {
  data: OverviewResponse | null;
  loading: boolean;
  dailyGoalQuestions?: number;
  dailyGoalMinutes?: number;
  reducedMotion?: boolean;
  onNavigate: (tab: string) => void;
  onPlayQuiz: (quizId: number) => void;
  onPracticeWeakTopic: (documentId: number, chapterTitle: string, subjectName: string) => void;
}

function formatStudyTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}m`;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  data,
  loading,
  dailyGoalQuestions = 15,
  dailyGoalMinutes = 30,
  reducedMotion = false,
  onNavigate,
  onPlayQuiz,
  onPracticeWeakTopic,
}) => {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass-surface rounded-2xl p-5 h-28 animate-pulse" />
        ))}
      </div>
    );
  }

  const { stats, weeklyProgress, subjectPerformance, weakTopics, recentQuizzes, recentDocuments } = data;
  const maxWeeklyQuestions = Math.max(5, ...weeklyProgress.map((d) => d.questionsSolved));
  const todaySolved = weeklyProgress[weeklyProgress.length - 1]?.questionsSolved ?? 0;
  const goalPct = Math.min(100, Math.round((todaySolved / Math.max(1, dailyGoalQuestions)) * 100));

  const statCards = [
    { label: 'Uploaded Documents', value: String(stats.totalDocuments), icon: FileText, color: 'text-blue-500' },
    { label: 'Quizzes Generated', value: String(stats.totalQuizzes), icon: BookOpen, color: 'text-violet-500' },
    { label: 'Questions Attempted', value: String(stats.questionsAttempted), icon: Target, color: 'text-cyan-500' },
    { label: 'Correct Answers', value: String(stats.correctAnswers), icon: CheckCircle2, color: 'text-emerald-500' },
    { label: 'Overall Accuracy', value: `${stats.overallAccuracy}%`, icon: TrendingUp, color: 'text-blue-400' },
    { label: 'Study Time', value: formatStudyTime(stats.studyTimeSeconds), icon: Clock, color: 'text-indigo-400' },
    { label: 'Learning Streak', value: `${stats.streakDays} Days`, icon: Flame, color: 'text-amber-500' },
    { label: `Level ${stats.level} XP`, value: `${stats.xp} XP`, icon: TrendingUp, color: 'text-emerald-400' },
  ];

  const cardMotionClass = reducedMotion
    ? ''
    : 'transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-xl';

  return (
    <div className="space-y-6">
      {/* Quick Action Banner */}
      <div className="glass-surface rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Your Personal AI Learning Laboratory
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Upload your syllabus PDFs and generate source-verified quizzes grounded strictly in your material.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('documents')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-sm font-semibold cursor-pointer"
          >
            <Upload className="w-4 h-4 text-blue-500" />
            <span>Upload PDF</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('generate')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold cursor-pointer"
          >
            <span>Generate Quiz</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Today's Study Goal Progress */}
      <div className="glass-surface rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-500 shrink-0" />
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Today&apos;s Study Goal
              </h3>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                ({dailyGoalMinutes} min/day target)
              </span>
            </div>
            <span className="font-mono text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {todaySolved}/{dailyGoalQuestions} questions ({goalPct}%)
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              style={{ width: `${goalPct}%` }}
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate(stats.totalDocuments > 0 ? 'practice' : 'documents')}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{goalPct >= 100 ? 'Goal Complete · Bonus Drill' : 'Daily Goal Drill'}</span>
        </button>
      </div>

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`glass-surface rounded-2xl p-4 sm:p-5 ${cardMotionClass}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {card.label}
                </span>
                <Icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <div className="mt-2 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                {card.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Weekly Progress & Subject Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-surface rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Weekly Progress
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Questions solved over the last 7 days from completed attempts
              </p>
            </div>
          </div>

          <div className="h-48 flex items-end justify-between gap-3 pt-4">
            {weeklyProgress.map((day) => {
              const barPct = Math.round((day.questionsSolved / maxWeeklyQuestions) * 100);
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                  <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                    {day.questionsSolved}
                  </span>
                  <div className="w-full max-w-[38px] h-32 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg flex items-end overflow-hidden">
                    <div
                      style={{ height: `${Math.max(day.questionsSolved > 0 ? 12 : 4, barPct)}%` }}
                      className="w-full bg-gradient-to-t from-blue-600 to-cyan-400 rounded-t-md transition-all"
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {day.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 glass-surface rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Subject-Wise Performance
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Calculated strictly from your answered questions
            </p>

            {subjectPerformance.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                Complete a quiz to see your real subject-wise accuracy breakdown.
              </div>
            ) : (
              <div className="space-y-4">
                {subjectPerformance.map((subj) => (
                  <div key={subj.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {subj.name}
                      </span>
                      <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                        {subj.accuracy}% ({subj.correct}/{subj.total})
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        style={{ width: `${subj.accuracy}%` }}
                        className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Quizzes & Weak Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-surface rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-bold">Recent Quizzes</h3>
            <button
              type="button"
              onClick={() => onNavigate('quizzes')}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              View all
            </button>
          </div>
          {recentQuizzes.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No quizzes generated yet. Upload a document and generate your first quiz.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('generate')}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold cursor-pointer"
              >
                Create First Quiz
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {recentQuizzes.map((quiz) => (
                <div key={quiz.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                      {quiz.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{quiz.subjectName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="tabular-nums">{quiz.questionCount} questions</span>
                      <span aria-hidden="true">·</span>
                      <span>{quiz.difficulty}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPlayQuiz(quiz.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 hover:bg-blue-600 hover:text-white text-xs font-semibold transition-colors shrink-0 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 glass-surface rounded-2xl p-6">
          <h3 className="font-display text-lg font-bold mb-1">Weak Topics &amp; Recent Files</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Chapters where you missed questions, ready for targeted practice
          </p>

          {weakTopics.length > 0 ? (
            <div className="space-y-3">
              {weakTopics.map((topic) => (
                <div
                  key={`${topic.documentId}-${topic.chapterTitle}`}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{topic.chapterTitle}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {topic.subjectName} · {topic.mistakes} missed of {topic.total}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onPracticeWeakTopic(topic.documentId, topic.chapterTitle, topic.subjectName)
                    }
                    className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-300 hover:bg-amber-500/25 text-xs font-semibold shrink-0 cursor-pointer"
                  >
                    Practice
                  </button>
                </div>
              ))}
            </div>
          ) : recentDocuments.length > 0 ? (
            <div className="space-y-2.5">
              {recentDocuments.map((d) => (
                <div
                  key={d.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm"
                >
                  <span className="truncate font-medium">{d.title}</span>
                  <span className="text-xs font-mono text-slate-500 tabular-nums shrink-0">
                    {d.pageCount} pg
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No weak topics flagged yet. Take a quiz to detect revision priorities.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
