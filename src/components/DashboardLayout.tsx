import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  Bookmark,
  BookOpen,
  Calendar,
  FileText,
  Flame,
  Layers,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  Moon,
  PlayCircle,
  Settings,
  Shield,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { BrandLogo } from './BrandLogo';
import { PdfSourceViewer } from './PdfSourceViewer';
import { OverviewView } from './dashboard/OverviewView';
import { DocumentsView } from './dashboard/DocumentsView';
import { GenerateQuizView } from './dashboard/GenerateQuizView';
import { MyQuizzesView } from './dashboard/MyQuizzesView';
import { QuizPlayerView } from './dashboard/QuizPlayerView';
import { ResultAnalysisView } from './dashboard/ResultAnalysisView';
import { FlashcardsView } from './dashboard/FlashcardsView';
import { QuestionBankView } from './dashboard/QuestionBankView';
import { RevisionAndPlannerView } from './dashboard/RevisionAndPlannerView';
import { PerformanceAndAchievementsView } from './dashboard/PerformanceAndAchievementsView';
import { SettingsView } from './dashboard/SettingsView';
import { AdminView } from './dashboard/AdminView';
import type {
  OverviewResponse,
  StudyPlanProgressUpdate,
  SubscriptionInfo,
  UserProfile,
} from '../types';

export type DashboardTab =
  | 'overview'
  | 'documents'
  | 'generate'
  | 'quizzes'
  | 'practice'
  | 'flashcards'
  | 'questions'
  | 'performance'
  | 'bookmarks'
  | 'planner'
  | 'achievements'
  | 'admin'
  | 'settings'
  | 'play'
  | 'result';

interface DashboardLayoutProps {
  user: UserProfile;
  subscription: SubscriptionInfo | null;
  verificationPreview?: string | null;
  theme: 'dark' | 'light';
  reducedMotion: boolean;
  onToggleTheme: () => void;
  onToggleReducedMotion: () => void;
  onUserUpdated: (u: UserProfile) => void;
  onLogout: () => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  user,
  subscription,
  verificationPreview,
  theme,
  reducedMotion,
  onToggleTheme,
  onToggleReducedMotion,
  onUserUpdated,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [overviewData, setOverviewData] = useState<OverviewResponse | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  const [preselectedDocId, setPreselectedDocId] = useState<number | null>(null);
  const [preselectedChapter, setPreselectedChapter] = useState<string | null>(null);
  const [preselectedSubject, setPreselectedSubject] = useState<string | null>(null);

  const [activeQuizId, setActiveQuizId] = useState<number | null>(null);
  const [activeAttemptId, setActiveAttemptId] = useState<number | null>(null);
  const [unlockedBadges, setUnlockedBadges] = useState<
    Array<{ badgeKey: string; title: string; description: string }>
  >([]);
  const [updatedStudyPlans, setUpdatedStudyPlans] = useState<StudyPlanProgressUpdate[]>([]);

  const [sourceViewer, setSourceViewer] = useState<{
    documentId: number;
    pageNumber: number;
    excerpt: string;
  } | null>(null);

  const fetchOverview = useCallback(() => {
    setOverviewLoading(true);
    apiFetch<OverviewResponse>('/api/dashboard/overview')
      .then((res) => setOverviewData(res))
      .catch(() => {
        // handled cleanly
      })
      .finally(() => setOverviewLoading(false));
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const navigate = (tab: DashboardTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const handleOpenQuiz = (quizId: number) => {
    setActiveQuizId(quizId);
    setActiveTab('play');
    setMobileMenuOpen(false);
  };

  const handleQuizCompleted = (
    attemptId: number,
    badges: Array<{ badgeKey: string; title: string; description: string }>,
    planUpdates: StudyPlanProgressUpdate[] = []
  ) => {
    setActiveAttemptId(attemptId);
    setUnlockedBadges(badges);
    setUpdatedStudyPlans(planUpdates);
    setActiveTab('result');
    fetchOverview();
  };

  const handleGenerateFromDoc = (docId: number) => {
    setPreselectedDocId(docId);
    setPreselectedChapter(null);
    setPreselectedSubject(null);
    navigate('generate');
  };

  const handlePracticeWeakTopic = (docId: number, chapter: string, subject: string) => {
    setPreselectedDocId(docId);
    setPreselectedChapter(chapter === 'Full Document' ? null : chapter);
    setPreselectedSubject(subject);
    navigate('generate');
  };

  const navItems: Array<{ id: DashboardTab; label: string; icon: React.FC<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'documents', label: 'My Documents', icon: FileText },
    { id: 'generate', label: 'Generate Quiz', icon: Sparkles },
    { id: 'quizzes', label: 'My Quizzes', icon: BookOpen },
    { id: 'practice', label: 'Practice Tests', icon: PlayCircle },
    { id: 'flashcards', label: 'Flashcards', icon: Layers },
    { id: 'questions', label: 'Question Bank', icon: Library },
    { id: 'performance', label: 'Performance', icon: BarChart3 },
    { id: 'bookmarks', label: 'Bookmarks', icon: Bookmark },
    { id: 'planner', label: 'Study Planner', icon: Calendar },
    { id: 'achievements', label: 'Achievements', icon: Award },
    ...(user.role === 'admin' ? [{ id: 'admin' as DashboardTab, label: 'Admin', icon: Shield }] : []),
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const tabTitles: Record<DashboardTab, string> = {
    overview: 'Dashboard Overview',
    documents: 'My Study Documents',
    generate: 'AI Quiz Generator',
    quizzes: 'My Saved Quizzes',
    practice: 'Practice Tests & Revision',
    flashcards: 'Flashcards',
    questions: 'Personal Question Bank',
    performance: 'Performance Analytics',
    bookmarks: 'Bookmarked Questions',
    planner: 'Study Planner',
    achievements: 'Achievements & XP',
    admin: 'Platform Administration',
    settings: 'Account Settings',
    play: 'Interactive Quiz Session',
    result: 'Quiz Result Analysis',
  };

  const avatarSrc =
    user.avatarUrl || '/src/assets/images/student_avatar_default_1795015261884.jpg';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#050814] dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-[#070B19]/90 sticky top-0 h-screen">
        <div className="h-16 px-5 flex items-center border-b border-slate-200 dark:border-slate-800/80">
          <BrandLogo />
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === 'generate') {
                    setPreselectedDocId(null);
                    setPreselectedChapter(null);
                    setPreselectedSubject(null);
                  }
                  navigate(item.id);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800/80">
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/70"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-50 w-72 max-w-[80vw] bg-white dark:bg-[#070B19] h-full flex flex-col border-r border-slate-200 dark:border-slate-800">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <BrandLogo />
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      if (item.id === 'generate') {
                        setPreselectedDocId(null);
                        setPreselectedChapter(null);
                        setPreselectedSubject(null);
                      }
                      navigate(item.id);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-red-500 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-[#050814]/85 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-display text-base sm:text-lg font-bold truncate">
              {tabTitles[activeTab]}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-300">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              <span className="tabular-nums">{overviewData?.stats.streakDays ?? user.streakDays}d</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">Lv.{overviewData?.stats.level ?? user.level}</span>
            </div>

            <button
              type="button"
              onClick={onToggleReducedMotion}
              className="hidden md:inline-flex px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium cursor-pointer"
            >
              {reducedMotion ? 'Motion: Off' : '3D: On'}
            </button>

            <button
              type="button"
              aria-label="Toggle theme"
              onClick={onToggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => navigate('settings')}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-800 hover:border-blue-500 cursor-pointer"
            >
              <img
                src={avatarSrc}
                alt={user.name}
                className="w-7 h-7 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
              <span className="hidden sm:inline text-xs font-semibold truncate max-w-[120px]">
                {user.name}
              </span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {!user.emailVerified && activeTab !== 'settings' && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-amber-700 dark:text-amber-300">
                Your email ({user.email}) is not verified yet.
                {verificationPreview ? ` Verification code: ${verificationPreview}` : ''}
              </span>
              <button
                type="button"
                onClick={() => navigate('settings')}
                className="font-semibold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
              >
                Verify in Settings
              </button>
            </div>
          )}

          {activeTab === 'overview' && (
            <OverviewView
              data={overviewData}
              loading={overviewLoading}
              dailyGoalQuestions={user.dailyGoalQuestions}
              dailyGoalMinutes={user.dailyGoalMinutes}
              reducedMotion={reducedMotion}
              onNavigate={(tab) => navigate(tab as DashboardTab)}
              onPlayQuiz={handleOpenQuiz}
              onPracticeWeakTopic={handlePracticeWeakTopic}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsView
              onGenerateFromDoc={handleGenerateFromDoc}
              onDocumentsChanged={fetchOverview}
            />
          )}

          {activeTab === 'generate' && (
            <GenerateQuizView
              preselectedDocId={preselectedDocId}
              preselectedChapter={preselectedChapter}
              preselectedSubject={preselectedSubject}
              onQuizGenerated={(quizId) => {
                fetchOverview();
                handleOpenQuiz(quizId);
              }}
              onGoToDocuments={() => navigate('documents')}
            />
          )}

          {activeTab === 'quizzes' && (
            <MyQuizzesView
              onPlayQuiz={handleOpenQuiz}
              onViewAttempt={(attemptId) => {
                setActiveAttemptId(attemptId);
                setUnlockedBadges([]);
                setUpdatedStudyPlans([]);
                navigate('result');
              }}
              onCreateNew={() => navigate('generate')}
            />
          )}

          {activeTab === 'practice' && (
            <RevisionAndPlannerView
              mode="practice"
              overviewData={overviewData}
              onPlayQuiz={handleOpenQuiz}
              onQuizGenerated={(quizId) => {
                fetchOverview();
                handleOpenQuiz(quizId);
              }}
              onGoToDocuments={() => navigate('documents')}
            />
          )}

          {activeTab === 'planner' && (
            <RevisionAndPlannerView
              mode="planner"
              overviewData={overviewData}
              onPlayQuiz={handleOpenQuiz}
              onQuizGenerated={(quizId) => {
                fetchOverview();
                handleOpenQuiz(quizId);
              }}
              onGoToDocuments={() => navigate('documents')}
            />
          )}

          {activeTab === 'flashcards' && (
            <FlashcardsView
              onViewSource={(documentId, pageNumber, excerpt) =>
                setSourceViewer({ documentId, pageNumber, excerpt })
              }
            />
          )}

          {(activeTab === 'questions' || activeTab === 'bookmarks') && (
            <QuestionBankView
              bookmarkedOnlyInitial={activeTab === 'bookmarks'}
              onViewSource={(documentId, pageNumber, excerpt) =>
                setSourceViewer({ documentId, pageNumber, excerpt })
              }
              onQuizCreated={(quizId) => {
                fetchOverview();
                handleOpenQuiz(quizId);
              }}
            />
          )}

          {(activeTab === 'performance' || activeTab === 'achievements') && (
            <PerformanceAndAchievementsView
              mode={activeTab}
              data={overviewData}
              loading={overviewLoading}
              onPracticeWeakTopic={handlePracticeWeakTopic}
              onViewAttempt={(attemptId) => {
                setActiveAttemptId(attemptId);
                setUnlockedBadges([]);
                setUpdatedStudyPlans([]);
                navigate('result');
              }}
            />
          )}

          {activeTab === 'admin' && user.role === 'admin' && <AdminView />}

          {activeTab === 'settings' && (
            <SettingsView
              user={user}
              subscription={subscription}
              verificationPreview={verificationPreview}
              onUserUpdated={onUserUpdated}
              onAccountDeleted={onLogout}
            />
          )}

          {activeTab === 'play' && activeQuizId && (
            <QuizPlayerView
              quizId={activeQuizId}
              onViewSource={(documentId, pageNumber, excerpt) =>
                setSourceViewer({ documentId, pageNumber, excerpt })
              }
              onCompleted={handleQuizCompleted}
              onExit={() => navigate('quizzes')}
            />
          )}

          {activeTab === 'result' && activeAttemptId && (
            <ResultAnalysisView
              attemptId={activeAttemptId}
              unlockedBadges={unlockedBadges}
              updatedStudyPlans={updatedStudyPlans}
              onRetakeQuiz={handleOpenQuiz}
              onGenerateAnother={() => navigate('generate')}
              onOpenPlanner={() => navigate('planner')}
              onViewSource={(documentId, pageNumber, excerpt) =>
                setSourceViewer({ documentId, pageNumber, excerpt })
              }
            />
          )}
        </main>
      </div>

      {sourceViewer && (
        <PdfSourceViewer
          documentId={sourceViewer.documentId}
          initialPage={sourceViewer.pageNumber}
          evidenceExcerpt={sourceViewer.excerpt}
          onClose={() => setSourceViewer(null)}
        />
      )}
    </div>
  );
};
