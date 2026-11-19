import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  CheckCircle2,
  Loader2,
  Play,
  Plus,
  Shuffle,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import { apiFetch, generateQuizStream } from '../../lib/api';
import {
  parseQuestionCountParam,
  resolvePlannerSessionQuestionCount,
} from '../../utils/documentLogic';
import type {
  DocumentItem,
  OverviewResponse,
  QuizItem,
  StudyPlanItem,
} from '../../types';

interface RevisionAndPlannerViewProps {
  mode: 'practice' | 'planner';
  overviewData: OverviewResponse | null;
  onPlayQuiz: (quizId: number) => void;
  onQuizGenerated: (quizId: number) => void;
  onGoToDocuments: () => void;
}

export const RevisionAndPlannerView: React.FC<RevisionAndPlannerViewProps> = ({
  mode,
  overviewData,
  onPlayQuiz,
  onQuizGenerated,
  onGoToDocuments,
}) => {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [plans, setPlans] = useState<StudyPlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyMode, setBusyMode] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Quick Revision / Chapter Revision controls
  const [selectedDocId, setSelectedDocId] = useState<number>(0);
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [practiceQuestionCount, setPracticeQuestionCount] = useState<string>('10');

  // Study Planner form
  const [planTitle, setPlanTitle] = useState('');
  const [planSubject, setPlanSubject] = useState('');
  const [planChapter, setPlanChapter] = useState('All Chapters');
  const [planDate, setPlanDate] = useState(() =>
    new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  );
  const [planTargetQuestions, setPlanTargetQuestions] = useState<string>('15');
  const [planDocId, setPlanDocId] = useState<number>(0);
  const [creatingPlan, setCreatingPlan] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [docRes, quizRes, planRes] = await Promise.all([
        apiFetch<{ documents: DocumentItem[] }>('/api/documents'),
        apiFetch<{ quizzes: QuizItem[] }>('/api/quizzes'),
        apiFetch<{ studyPlans: StudyPlanItem[] }>('/api/study-plans'),
      ]);
      setDocs(docRes.documents);
      setQuizzes(quizRes.quizzes);
      setPlans(planRes.studyPlans);
      if (docRes.documents.length > 0 && selectedDocId === 0) {
        setSelectedDocId(docRes.documents[0].id);
        setPlanDocId(docRes.documents[0].id);
        setPlanSubject(docRes.documents[0].subjectName);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load revision workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [mode]);

  const selectedDoc = docs.find((d) => d.id === selectedDocId) || docs[0];
  const docChapters = Array.from(
    new Set(
      (selectedDoc?.detectedChapters || []).flatMap((c) => [c.title, ...(c.topics || [])])
    )
  );
  const selectedPlanDoc = docs.find((d) => d.id === planDocId) || null;
  const planDocChapters = Array.from(
    new Set(
      (selectedPlanDoc?.detectedChapters || []).flatMap((c) => [c.title, ...(c.topics || [])])
    )
  );

  const runTargetedDrill = async (
    drillKey: string,
    payload: Record<string, unknown>
  ) => {
    setError(null);
    setBusyMode(drillKey);
    setStatusNote('Preparing source-verified revision test...');
    try {
      let generatedId: number | null = null;
      await generateQuizStream(payload, (ev) => {
        if (ev.type === 'stage' && ev.stage) {
          setStatusNote(ev.detail || ev.stage);
        } else if (ev.type === 'error') {
          setError(
            ev.error ||
              'Insufficient information in your uploaded document to generate this question. Please upload more study material.'
          );
        } else if (ev.type === 'complete' && ev.quiz) {
          generatedId = (ev.quiz as QuizItem).id;
        }
      });
      if (generatedId) {
        onQuizGenerated(generatedId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start revision quiz.');
    } finally {
      setBusyMode(null);
      setStatusNote('');
    }
  };

  const resolvePlanDocumentIds = (docId: number | null, subjName: string): number[] => {
    if (docId && docs.some((d) => d.id === docId)) {
      return [docId];
    }
    const subjectMatches = docs
      .filter((d) => d.subjectName.toLowerCase() === subjName.trim().toLowerCase())
      .map((d) => d.id);
    if (subjectMatches.length > 0) return subjectMatches.slice(0, 5);
    return docs.slice(0, 5).map((d) => d.id);
  };

  const createPlanRecord = async (launchQuizAfter: boolean) => {
    setError(null);
    if (!planTitle.trim() || !planSubject.trim() || !planDate) {
      setError('Goal title, subject, and target date are required.');
      return;
    }
    const parsedTarget = parseQuestionCountParam(planTargetQuestions, { min: 1, max: 200 });
    if (parsedTarget === null) {
      setError('Please enter a valid whole number of questions between 1 and 200.');
      return;
    }
    if (launchQuizAfter && docs.length === 0) {
      setError('Upload at least one study document before launching a study session quiz.');
      return;
    }

    setCreatingPlan(true);
    try {
      const res = await apiFetch<{ studyPlan: StudyPlanItem }>('/api/study-plans', {
        method: 'POST',
        body: JSON.stringify({
          title: planTitle.trim(),
          subjectName: planSubject.trim(),
          chapterTitle: planChapter || 'All Chapters',
          targetDate: planDate,
          targetQuestions: parsedTarget,
          documentId: planDocId || null,
        }),
      });
      setPlans((prev) => [res.studyPlan, ...prev]);
      const created = res.studyPlan;
      setPlanTitle('');

      if (launchQuizAfter) {
        const targetDocIds = resolvePlanDocumentIds(created.documentId, created.subjectName);
        const sessionCount = resolvePlannerSessionQuestionCount(created.targetQuestions, 0, 'full', 50);
        await runTargetedDrill(`plan-${created.id}`, {
          title: `${created.title} (${sessionCount} Qs)`,
          subjectName: created.subjectName,
          documentIds: targetDocIds,
          selectedChapters:
            created.chapterTitle && created.chapterTitle !== 'All Chapters'
              ? [created.chapterTitle]
              : [],
          questionCount: sessionCount,
          difficulty: 'Mixed',
          questionTypes: ['mcq', 'true_false'],
          mode: 'practice',
          showExplanationsImmediate: true,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create study plan.');
    } finally {
      setCreatingPlan(false);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    await createPlanRecord(false);
  };

  const parsedFormQuestionCount = parseQuestionCountParam(planTargetQuestions, {
    min: 1,
    max: 200,
  });
  const formLaunchQuizCount =
    parsedFormQuestionCount !== null ? Math.min(50, parsedFormQuestionCount) : null;

  const getValidPracticeCount = (): number | null => {
    const parsed = parseQuestionCountParam(practiceQuestionCount, { min: 1, max: 50 });
    if (parsed === null) {
      setError('Please enter a valid number of questions between 1 and 50.');
      return null;
    }
    return parsed;
  };

  const handleDeletePlan = async (id: number) => {
    try {
      await apiFetch(`/api/study-plans/${id}`, { method: 'DELETE' });
      setPlans((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete study plan.');
    }
  };

  if (loading) {
    return (
      <div className="glass-surface rounded-2xl p-10 text-center text-sm text-slate-500">
        Loading {mode === 'practice' ? 'practice & revision modes' : 'study planner'}...
      </div>
    );
  }

  if (mode === 'planner') {
    return (
      <div className="space-y-6 max-w-5xl">
        <div className="glass-surface rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-display text-xl font-bold">Study Planner &amp; Daily Targets</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Schedule chapter milestones and question targets. Progress and completion update automatically as you answer and submit quizzes.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-500">
              {error}
            </div>
          )}

          <form onSubmit={handleCreatePlan} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div className="lg:col-span-2">
                <label htmlFor="plan-title" className="block text-xs font-semibold text-slate-500 mb-1">
                  Goal Title
                </label>
                <input
                  id="plan-title"
                  type="text"
                  required
                  value={planTitle}
                  onChange={(e) => setPlanTitle(e.target.value)}
                  placeholder="e.g. Master Organic Reaction Mechanisms"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor="plan-subject" className="block text-xs font-semibold text-slate-500 mb-1">
                  Subject
                </label>
                <input
                  id="plan-subject"
                  type="text"
                  required
                  value={planSubject}
                  onChange={(e) => setPlanSubject(e.target.value)}
                  placeholder="Biology"
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label htmlFor="plan-date" className="block text-xs font-semibold text-slate-500 mb-1">
                  Target Date
                </label>
                <input
                  id="plan-date"
                  type="date"
                  required
                  value={planDate}
                  onChange={(e) => setPlanDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
              <div>
                <label htmlFor="plan-doc" className="block text-xs font-semibold text-slate-500 mb-1">
                  Linked Document (optional)
                </label>
                <select
                  id="plan-doc"
                  value={planDocId}
                  onChange={(e) => {
                    const nextId = Number(e.target.value);
                    setPlanDocId(nextId);
                    setPlanChapter('All Chapters');
                    const found = docs.find((d) => d.id === nextId);
                    if (found) setPlanSubject(found.subjectName);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                >
                  <option value={0}>Any Uploaded Document</option>
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="plan-chapter" className="block text-xs font-semibold text-slate-500 mb-1">
                  Chapter / Topic Focus
                </label>
                <select
                  id="plan-chapter"
                  value={planChapter}
                  onChange={(e) => setPlanChapter(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                >
                  <option value="All Chapters">All Chapters</option>
                  {planDocChapters.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="plan-qty" className="block text-xs font-semibold text-slate-500 mb-1">
                  No. of Questions (1–200)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="plan-qty"
                    type="number"
                    min={1}
                    max={200}
                    required
                    value={planTargetQuestions}
                    onChange={(e) => setPlanTargetQuestions(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm tabular-nums"
                  />
                  {[5, 10, 20, 30, 50].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPlanTargetQuestions(String(preset))}
                      className={`px-2 py-1.5 rounded-lg text-xs font-semibold tabular-nums shrink-0 cursor-pointer ${
                        planTargetQuestions === String(preset)
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={creatingPlan || Boolean(busyMode)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  {creatingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>Add Plan</span>
                </button>
                <button
                  type="button"
                  disabled={creatingPlan || Boolean(busyMode) || docs.length === 0 || formLaunchQuizCount === null}
                  onClick={() => createPlanRecord(true)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 shrink-0" />
                  <span>Start {formLaunchQuizCount ?? '—'} Qs</span>
                </button>
              </div>
            </div>
          </form>
        </div>

        {busyMode && (
          <div className="glass-surface rounded-2xl p-5 flex items-center gap-3 border border-blue-500/40">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500 shrink-0" />
            <div>
              <div className="font-display font-bold text-sm">Generating Study Plan Quiz</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{statusNote}</div>
            </div>
          </div>
        )}

        {plans.length === 0 ? (
          <div className="glass-surface rounded-2xl p-10 text-center space-y-2">
            <Calendar className="w-8 h-8 text-blue-500 mx-auto" />
            <h3 className="font-display text-lg font-bold">No study plans scheduled</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Create your first study milestone above to organize daily exam preparation.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plans.map((plan) => {
              const pct = Math.min(
                100,
                Math.round((plan.completedQuestions / Math.max(1, plan.targetQuestions)) * 100)
              );
              const isDone = plan.status === 'completed';
              const targetDocIds = resolvePlanDocumentIds(plan.documentId, plan.subjectName);
              const fullSessionCount = resolvePlannerSessionQuestionCount(
                plan.targetQuestions,
                plan.completedQuestions,
                'full',
                50
              );
              const remainingSessionCount = resolvePlannerSessionQuestionCount(
                plan.targetQuestions,
                plan.completedQuestions,
                'remaining',
                50
              );
              const hasPartialProgress =
                plan.completedQuestions > 0 && plan.completedQuestions < plan.targetQuestions;

              return (
                <div key={plan.id} className="glass-surface rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display font-bold text-base text-slate-900 dark:text-white">
                        {plan.title}
                      </h3>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {plan.subjectName} · {plan.chapterTitle} · Target: {plan.targetDate}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete ${plan.title}`}
                      onClick={() => handleDeletePlan(plan.id)}
                      className="text-slate-400 hover:text-red-500 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">
                        Status: <span className="capitalize">{plan.status.replace('_', ' ')}</span>
                      </span>
                      <span className="font-mono tabular-nums">
                        {plan.completedQuestions} / {plan.targetQuestions} Questions ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <div
                        style={{ width: `${pct}%` }}
                        className={`h-full rounded-full ${
                          isDone ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {!isDone ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          {targetDocIds.length > 0 && (
                            <button
                              type="button"
                              disabled={Boolean(busyMode)}
                              onClick={() =>
                                runTargetedDrill(`plan-${plan.id}`, {
                                  title: `${plan.title} (${fullSessionCount} Qs)`,
                                  subjectName: plan.subjectName,
                                  documentIds: targetDocIds,
                                  selectedChapters:
                                    plan.chapterTitle && plan.chapterTitle !== 'All Chapters'
                                      ? [plan.chapterTitle]
                                      : [],
                                  questionCount: fullSessionCount,
                                  difficulty: 'Mixed',
                                  questionTypes: ['mcq', 'true_false'],
                                  mode: 'practice',
                                  showExplanationsImmediate: true,
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Practice {fullSessionCount} Qs</span>
                            </button>
                          )}
                          {targetDocIds.length > 0 &&
                            hasPartialProgress &&
                            remainingSessionCount !== fullSessionCount && (
                              <button
                                type="button"
                                disabled={Boolean(busyMode)}
                                onClick={() =>
                                  runTargetedDrill(`plan-rem-${plan.id}`, {
                                    title: `${plan.title} — Remaining (${remainingSessionCount} Qs)`,
                                    subjectName: plan.subjectName,
                                    documentIds: targetDocIds,
                                    selectedChapters:
                                      plan.chapterTitle && plan.chapterTitle !== 'All Chapters'
                                        ? [plan.chapterTitle]
                                        : [],
                                    questionCount: remainingSessionCount,
                                    difficulty: 'Mixed',
                                    questionTypes: ['mcq', 'true_false'],
                                    mode: 'practice',
                                    showExplanationsImmediate: true,
                                  })
                                }
                                className="px-3 py-1.5 rounded-lg border border-violet-500/40 text-violet-600 dark:text-violet-300 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Play className="w-3.5 h-3.5" />
                                <span>Remaining ({remainingSessionCount} Qs)</span>
                              </button>
                            )}
                        </div>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Auto-tracked from quizzes
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          Goal reached through quiz attempts
                        </span>
                        <span className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Completed</span>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Practice Tests & Revision Mode
  const weakTopics = overviewData?.weakTopics || [];

  return (
    <div className="space-y-6 max-w-5xl">
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {busyMode && (
        <div className="glass-surface rounded-2xl p-5 flex items-center gap-3 border border-blue-500/40">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500 shrink-0" />
          <div>
            <div className="font-display font-bold text-sm">Building Source-Verified Practice Set</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{statusNote}</div>
          </div>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="glass-surface rounded-2xl p-10 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-blue-500 mx-auto" />
          <h3 className="font-display text-lg font-bold">Upload Study Material for Practice Tests</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Practice tests and revision drills are generated strictly from your uploaded syllabus notes.
          </p>
          <button
            type="button"
            onClick={onGoToDocuments}
            className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold cursor-pointer"
          >
            Upload Document
          </button>
        </div>
      ) : (
        <>
          {/* Smart Revision Modes */}
          <div className="glass-surface rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-bold">Practice Tests &amp; Smart Revision</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Choose your target document, number of questions, and revision mode grounded strictly in your notes.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <label htmlFor="practice-qty" className="text-xs font-semibold text-slate-500">
                    Questions:
                  </label>
                  <input
                    id="practice-qty"
                    type="number"
                    min={1}
                    max={50}
                    value={practiceQuestionCount}
                    onChange={(e) => setPracticeQuestionCount(e.target.value)}
                    className="w-16 px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm tabular-nums"
                  />
                  {[5, 10, 20].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setPracticeQuestionCount(String(preset))}
                      className={`px-2 py-1.5 rounded-lg text-xs font-semibold tabular-nums cursor-pointer ${
                        practiceQuestionCount === String(preset)
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <select
                  aria-label="Target document for revision"
                  value={selectedDocId}
                  onChange={(e) => {
                    setSelectedDocId(Number(e.target.value));
                    setSelectedChapter('');
                  }}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm"
                >
                  {docs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title} ({d.subjectName})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Quick Revision */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <Sparkles className="w-5 h-5 text-blue-500" />
                  <h3 className="font-display font-bold text-base">
                    Quick Revision ({parseQuestionCountParam(practiceQuestionCount, { min: 1, max: 50 }) ?? '—'} Qs)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Targeted practice check with immediate explanations and source citations.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyMode) || !selectedDoc}
                  onClick={() => {
                    const count = getValidPracticeCount();
                    if (count === null) return;
                    runTargetedDrill('quick', {
                      title: `${selectedDoc.title} — Quick Revision (${count} Qs)`,
                      subjectName: selectedDoc.subjectName,
                      documentIds: [selectedDoc.id],
                      questionCount: count,
                      difficulty: 'Mixed',
                      questionTypes: ['mcq', 'true_false'],
                      mode: 'practice',
                      showExplanationsImmediate: true,
                    });
                  }}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  Start Quick Revision
                </button>
              </div>

              {/* Chapter Revision */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <Target className="w-5 h-5 text-violet-500" />
                  <h3 className="font-display font-bold text-base">
                    Chapter Revision ({parseQuestionCountParam(practiceQuestionCount, { min: 1, max: 50 }) ?? '—'} Qs)
                  </h3>
                  <select
                    aria-label="Select chapter to revise"
                    value={selectedChapter}
                    onChange={(e) => setSelectedChapter(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                  >
                    <option value="">All Detected Chapters</option>
                    {docChapters.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyMode) || !selectedDoc}
                  onClick={() => {
                    const count = getValidPracticeCount();
                    if (count === null) return;
                    runTargetedDrill('chapter', {
                      title: `${selectedChapter || selectedDoc.title} — Chapter Drill (${count} Qs)`,
                      subjectName: selectedDoc.subjectName,
                      documentIds: [selectedDoc.id],
                      selectedChapters: selectedChapter ? [selectedChapter] : [],
                      questionCount: count,
                      difficulty: 'Medium',
                      questionTypes: ['mcq', 'fill_blank'],
                      mode: 'practice',
                      showExplanationsImmediate: true,
                    });
                  }}
                  className="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  Practice Selected Chapter
                </button>
              </div>

              {/* Random Practice Exam */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-4">
                <div className="space-y-1.5">
                  <Shuffle className="w-5 h-5 text-cyan-500" />
                  <h3 className="font-display font-bold text-base">
                    Random Mixed Exam ({parseQuestionCountParam(practiceQuestionCount, { min: 1, max: 50 }) ?? '—'} Qs)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Randomized questions across your uploaded materials in timed exam mode.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busyMode) || docs.length === 0}
                  onClick={() => {
                    const count = getValidPracticeCount();
                    if (count === null) return;
                    runTargetedDrill('random', {
                      title: `Mixed Syllabus Practice Test (${count} Qs)`,
                      subjectName: docs[0].subjectName,
                      documentIds: docs.slice(0, 3).map((d) => d.id),
                      questionCount: count,
                      difficulty: 'Mixed',
                      questionTypes: ['mcq', 'true_false', 'short_answer'],
                      mode: 'exam',
                      timeLimitSeconds: Math.max(300, count * 60),
                      randomizeQuestions: true,
                      randomizeOptions: true,
                    });
                  }}
                  className="w-full py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-semibold cursor-pointer"
                >
                  Launch Timed Mock Exam
                </button>
              </div>
            </div>
          </div>

          {/* Weak Topic Drills */}
          <div className="glass-surface rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="font-display text-lg font-bold">Weak Topic Practice Drills</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chapters where you answered incorrectly in previous attempts
              </p>
            </div>

            {weakTopics.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No weak chapters flagged yet. Missed questions from completed tests will appear here automatically.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {weakTopics.map((wt) => (
                  <div
                    key={`${wt.documentId}-${wt.chapterTitle}`}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{wt.chapterTitle}</div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {wt.subjectName} · {wt.mistakes} missed out of {wt.total}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(busyMode)}
                      onClick={() => {
                        const count = getValidPracticeCount();
                        if (count === null) return;
                        runTargetedDrill(`weak-${wt.chapterTitle}`, {
                          title: `Weak Topic Drill: ${wt.chapterTitle} (${count} Qs)`,
                          subjectName: wt.subjectName,
                          documentIds: [wt.documentId],
                          selectedChapters: wt.chapterTitle === 'Full Document' ? [] : [wt.chapterTitle],
                          questionCount: count,
                          difficulty: 'Easy',
                          questionTypes: ['mcq'],
                          mode: 'practice',
                          showExplanationsImmediate: true,
                        });
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold shrink-0 cursor-pointer"
                    >
                      Drill Topic
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saved Practice Quizzes */}
          {quizzes.length > 0 && (
            <div className="glass-surface rounded-2xl p-6 space-y-3">
              <h3 className="font-display text-lg font-bold">Ready-to-Take Practice Tests</h3>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {quizzes.map((q) => (
                  <div key={q.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-sm">{q.title}</div>
                      <div className="text-xs text-slate-500">
                        {q.subjectName} · {q.questionCount} Qs · {q.mode}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onPlayQuiz(q.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Start</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
