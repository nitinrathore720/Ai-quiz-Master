import React from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  Flame,
  Lock,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Result3DRing } from '../three/Result3DRing';
import type { OverviewResponse } from '../../types';

interface PerformanceAndAchievementsViewProps {
  mode: 'performance' | 'achievements';
  data: OverviewResponse | null;
  loading: boolean;
  onPracticeWeakTopic: (documentId: number, chapterTitle: string, subjectName: string) => void;
  onViewAttempt: (attemptId: number) => void;
}

const ALL_BADGES = [
  {
    badgeKey: 'first_quiz',
    title: 'First Quiz',
    description: 'Completed your first source-verified practice quiz.',
  },
  {
    badgeKey: 'quiz_master',
    title: 'Quiz Master',
    description: 'Completed 5 or more quizzes from your study materials.',
  },
  {
    badgeKey: 'hundred_solved',
    title: '100 Questions Solved',
    description: 'Answered at least 100 source-verified questions.',
  },
  {
    badgeKey: 'seven_day_streak',
    title: '7-Day Streak',
    description: 'Maintained a 7-day continuous study streak.',
  },
  {
    badgeKey: 'accuracy_champion',
    title: 'Accuracy Champion',
    description: 'Scored 90% or higher on a quiz attempt.',
  },
];

export const PerformanceAndAchievementsView: React.FC<PerformanceAndAchievementsViewProps> = ({
  mode,
  data,
  loading,
  onPracticeWeakTopic,
  onViewAttempt,
}) => {
  if (loading || !data) {
    return (
      <div className="glass-surface rounded-2xl p-10 text-center text-sm text-slate-500">
        Loading {mode === 'performance' ? 'performance analytics' : 'achievements & XP'}...
      </div>
    );
  }

  const { stats, weeklyProgress, subjectPerformance, weakTopics, recentAttempts, achievements } = data;

  if (mode === 'achievements') {
    const unlockedKeys = new Set(achievements.map((a) => a.badgeKey));
    const currentLevelXpBase = (stats.level - 1) * 150;
    const xpIntoLevel = Math.max(0, stats.xp - currentLevelXpBase);
    const levelPct = Math.min(100, Math.round((xpIntoLevel / 150) * 100));

    const weeklySolved = weeklyProgress.reduce((acc, d) => acc + d.questionsSolved, 0);
    const weeklyTarget = 50;
    const challengePct = Math.min(100, Math.round((weeklySolved / weeklyTarget) * 100));

    return (
      <div className="space-y-6 max-w-5xl">
        {/* Level, XP & Streak Hero */}
        <div className="glass-surface rounded-2xl p-6 sm:p-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-4">
            <Result3DRing percentage={levelPct} />
          </div>

          <div className="md:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  Scholar Level {stats.level}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Earn XP by completing source-verified quizzes from your uploaded study notes
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-300 text-xs font-bold">
                <Flame className="w-4 h-4" />
                <span>{stats.streakDays}-Day Streak</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">XP Progress to Level {stats.level + 1}</span>
                <span className="font-mono tabular-nums">
                  {xpIntoLevel}/150 XP ({stats.xp} Total XP)
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  style={{ width: `${levelPct}%` }}
                  className="h-full bg-gradient-to-r from-blue-600 to-violet-500 rounded-full"
                />
              </div>
            </div>

            {/* Weekly Challenge */}
            <div className="p-4 rounded-xl bg-slate-100/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-cyan-500" />
                  Weekly Challenge: Solve 50 Source-Verified Questions
                </span>
                <span className="font-mono tabular-nums">
                  {weeklySolved}/{weeklyTarget}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  style={{ width: `${challengePct}%` }}
                  className="h-full bg-cyan-500 rounded-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Badges Grid */}
        <div className="glass-surface rounded-2xl p-6 space-y-4">
          <h3 className="font-display text-lg font-bold">Achievement Badges</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ALL_BADGES.map((badge) => {
              const unlocked = unlockedKeys.has(badge.badgeKey);
              const earnedRow = achievements.find((a) => a.badgeKey === badge.badgeKey);
              return (
                <div
                  key={badge.badgeKey}
                  className={`p-5 rounded-xl border transition-all space-y-2 ${
                    unlocked
                      ? 'bg-blue-600/10 border-blue-500/40'
                      : 'bg-slate-100/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    {unlocked ? (
                      <Award className="w-6 h-6 text-amber-400" />
                    ) : (
                      <Lock className="w-5 h-5 text-slate-400" />
                    )}
                    <span
                      className={`text-[11px] font-semibold ${
                        unlocked ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                      }`}
                    >
                      {unlocked ? 'Unlocked' : 'Locked'}
                    </span>
                  </div>
                  <div className="font-display font-bold text-base">{badge.title}</div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">{badge.description}</p>
                  {earnedRow && (
                    <div className="text-[11px] font-mono text-slate-500 pt-1">
                      Unlocked {new Date(earnedRow.unlockedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Performance Analytics View
  const maxQ = Math.max(5, ...weeklyProgress.map((w) => w.questionsSolved));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-surface rounded-2xl p-5">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Overall Accuracy</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="font-display text-2xl font-bold mt-2 tabular-nums">
            {stats.overallAccuracy}%
          </div>
        </div>
        <div className="glass-surface rounded-2xl p-5">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Correct / Attempted</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="font-display text-2xl font-bold mt-2 tabular-nums">
            {stats.correctAnswers}/{stats.questionsAttempted}
          </div>
        </div>
        <div className="glass-surface rounded-2xl p-5">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Total Study Time</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="font-display text-2xl font-bold mt-2 tabular-nums">
            {Math.round(stats.studyTimeSeconds / 60)}m
          </div>
        </div>
        <div className="glass-surface rounded-2xl p-5">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Total Quizzes</span>
            <Sparkles className="w-4 h-4 text-violet-500" />
          </div>
          <div className="font-display text-2xl font-bold mt-2 tabular-nums">
            {stats.totalQuizzes}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-surface rounded-2xl p-6">
          <h3 className="font-display text-lg font-bold">7-Day Study Activity</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            Real questions solved and daily accuracy percentage
          </p>
          <div className="h-48 flex items-end justify-between gap-3">
            {weeklyProgress.map((day) => {
              const heightPct = Math.round((day.questionsSolved / maxQ) * 100);
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="font-mono text-[11px] tabular-nums text-slate-500">
                    {day.questionsSolved > 0 ? `${day.accuracy}%` : '—'}
                  </span>
                  <div className="w-full max-w-[38px] h-32 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg flex items-end overflow-hidden">
                    <div
                      style={{ height: `${Math.max(day.questionsSolved > 0 ? 12 : 4, heightPct)}%` }}
                      className="w-full bg-gradient-to-t from-blue-600 to-cyan-400 rounded-t-md"
                    />
                  </div>
                  <span className="text-xs font-medium">{day.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5 glass-surface rounded-2xl p-6 space-y-4">
          <h3 className="font-display text-lg font-bold">Subject Mastery</h3>
          {subjectPerformance.length === 0 ? (
            <p className="text-sm text-slate-500">
              Complete a quiz to view subject accuracy breakdowns.
            </p>
          ) : (
            <div className="space-y-3">
              {subjectPerformance.map((s) => (
                <div key={s.name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span>{s.name}</span>
                    <span className="font-mono tabular-nums">
                      {s.accuracy}% ({s.correct}/{s.total})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div
                      style={{ width: `${s.accuracy}%` }}
                      className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Attempts & Weak Topics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-surface rounded-2xl p-6 space-y-3">
          <h3 className="font-display text-lg font-bold">Recent Quiz Attempts</h3>
          {recentAttempts.length === 0 ? (
            <p className="text-sm text-slate-500">No completed quiz attempts recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {recentAttempts.map((att) => (
                <div key={att.id} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <div className="font-semibold tabular-nums">
                      Score: {att.score}/{att.maxScore} ({att.percentage}%)
                    </div>
                    <div className="text-xs text-slate-500">
                      {new Date(att.completedAt).toLocaleString()} · +{att.xpEarned} XP
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewAttempt(att.id)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Inspect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-surface rounded-2xl p-6 space-y-3">
          <h3 className="font-display text-lg font-bold">Priority Revision Chapters</h3>
          {weakTopics.length === 0 ? (
            <p className="text-sm text-slate-500">No missed chapters detected yet.</p>
          ) : (
            <div className="space-y-2.5">
              {weakTopics.map((wt) => (
                <div
                  key={`${wt.documentId}-${wt.chapterTitle}`}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-semibold text-sm">{wt.chapterTitle}</div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {wt.subjectName} · {wt.mistakes}/{wt.total} missed
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPracticeWeakTopic(wt.documentId, wt.chapterTitle, wt.subjectName)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-pointer"
                  >
                    Practice
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
