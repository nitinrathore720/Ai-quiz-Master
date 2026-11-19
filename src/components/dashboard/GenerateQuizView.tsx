import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { apiFetch, generateQuizStream } from '../../lib/api';
import { Processing3DCanvas } from '../three/Processing3DCanvas';
import type { DocumentItem, QuizItem } from '../../types';

interface GenerateQuizViewProps {
  preselectedDocId?: number | null;
  preselectedChapter?: string | null;
  preselectedSubject?: string | null;
  onQuizGenerated: (quizId: number) => void;
  onGoToDocuments: () => void;
}

const PROCESSING_STAGES = [
  'Reading your document',
  'Understanding chapters',
  'Finding relevant information',
  'Creating questions',
  'Checking answers against the PDF',
  'Verifying source references',
  'Preparing your quiz',
];

export const GenerateQuizView: React.FC<GenerateQuizViewProps> = ({
  preselectedDocId,
  preselectedChapter,
  preselectedSubject,
  onQuizGenerated,
  onGoToDocuments,
}) => {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  const [selectedDocIds, setSelectedDocIds] = useState<number[]>(
    preselectedDocId ? [preselectedDocId] : []
  );
  const [subjectName, setSubjectName] = useState(preselectedSubject || '');
  const [quizTitle, setQuizTitle] = useState('');
  const [selectedChapters, setSelectedChapters] = useState<string[]>(
    preselectedChapter ? [preselectedChapter] : []
  );
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [pageStart, setPageStart] = useState('');
  const [pageEnd, setPageEnd] = useState('');
  const [topicFilter, setTopicFilter] = useState('');

  const [questionCount, setQuestionCount] = useState<number>(5);
  const [customCount, setCustomCount] = useState('');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Mixed'>('Mixed');
  const [questionTypes, setQuestionTypes] = useState<string[]>(['mcq']);
  const [language, setLanguage] = useState<'English' | 'Hindi' | 'Hinglish'>('English');
  const [mode, setMode] = useState<'practice' | 'exam'>('practice');
  const [randomizeQuestions, setRandomizeQuestions] = useState(false);
  const [randomizeOptions, setRandomizeOptions] = useState(false);
  const [showExplanationsImmediate, setShowExplanationsImmediate] = useState(true);
  const [timedMinutes, setTimedMinutes] = useState(0);
  const [negativeMarking, setNegativeMarking] = useState(0);
  const [marksPerQuestion, setMarksPerQuestion] = useState(1);

  const [generating, setGenerating] = useState(false);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [stageDetail, setStageDetail] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ documents: DocumentItem[] }>('/api/documents')
      .then((res) => {
        setDocs(res.documents);
        if (preselectedDocId) {
          setSelectedDocIds([preselectedDocId]);
          const found = res.documents.find((d) => d.id === preselectedDocId);
          if (found && !preselectedSubject) setSubjectName(found.subjectName);
        } else if (res.documents.length > 0) {
          setSelectedDocIds((prev) => {
            if (prev.length > 0) return prev;
            setSubjectName(res.documents[0].subjectName);
            return [res.documents[0].id];
          });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load your documents.');
      })
      .finally(() => setLoadingDocs(false));
  }, [preselectedDocId, preselectedSubject]);

  const toggleDoc = (doc: DocumentItem) => {
    setSelectedDocIds((prev) => {
      const next = prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id];
      const nextDocs = docs.filter((d) => next.includes(d.id));
      const nextChapters = new Set(
        nextDocs.flatMap((d) => d.detectedChapters?.map((c) => c.title) || [])
      );
      const nextTopics = new Set(
        nextDocs.flatMap((d) => d.detectedChapters?.flatMap((c) => c.topics || []) || [])
      );
      setSelectedChapters((curr) => curr.filter((ch) => nextChapters.has(ch)));
      setSelectedTopics((curr) => curr.filter((tp) => nextTopics.has(tp)));
      if (next.length === 1) {
        const onlyDoc = docs.find((d) => d.id === next[0]);
        if (onlyDoc) setSubjectName(onlyDoc.subjectName);
      } else if (next.length > 0 && !subjectName) {
        setSubjectName(doc.subjectName);
      }
      return next;
    });
  };

  const toggleType = (typeKey: string) => {
    setQuestionTypes((prev) => {
      if (prev.includes(typeKey)) {
        return prev.length > 1 ? prev.filter((t) => t !== typeKey) : prev;
      }
      return [...prev, typeKey];
    });
  };

  const selectedDocs = docs.filter((d) => selectedDocIds.includes(d.id));
  const availableChapterInfos = selectedDocs.flatMap((d) => d.detectedChapters || []);
  const availableChapters = Array.from(new Set(availableChapterInfos.map((c) => c.title)));
  const availableTopics = Array.from(
    new Set(
      availableChapterInfos
        .filter(
          (c) =>
            selectedChapters.length === 0 ||
            selectedChapters.includes(c.title)
        )
        .flatMap((c) => c.topics || [])
    )
  );

  const runGeneration = async () => {
    setError(null);

    if (selectedDocIds.length === 0) {
      setError('Please select at least one uploaded document.');
      return;
    }

    const finalCount = customCount.trim()
      ? Math.min(50, Math.max(1, parseInt(customCount, 10) || 5))
      : questionCount;

    setGenerating(true);
    setActiveStageIndex(0);
    setStageDetail('Initializing strict document-grounded verification pipeline...');

    try {
      let createdQuizId: number | null = null;
      await generateQuizStream(
        {
          title: quizTitle.trim() || undefined,
          subjectName: subjectName.trim() || undefined,
          documentIds: selectedDocIds,
          selectedChapters,
          selectedTopics,
          pageStart: pageStart ? Number(pageStart) : 0,
          pageEnd: pageEnd ? Number(pageEnd) : 0,
          topicFilter: topicFilter.trim() || undefined,
          questionCount: finalCount,
          difficulty,
          questionTypes,
          language,
          mode,
          randomizeQuestions,
          randomizeOptions,
          showExplanationsImmediate,
          timeLimitSeconds: timedMinutes > 0 ? timedMinutes * 60 : 0,
          negativeMarking,
          marksPerQuestion,
        },
        (ev) => {
          if (ev.type === 'stage' && ev.stage) {
            const idx = PROCESSING_STAGES.findIndex(
              (s) => s.toLowerCase() === ev.stage?.toLowerCase()
            );
            if (idx >= 0) setActiveStageIndex(idx);
            if (ev.detail) setStageDetail(ev.detail);
          } else if (ev.type === 'error') {
            setError(
              ev.error ||
                'Insufficient information in your uploaded document to generate this question. Please upload more study material.'
            );
          } else if (ev.type === 'complete' && ev.quiz) {
            const q = ev.quiz as QuizItem;
            createdQuizId = q.id;
          }
        }
      );

      if (createdQuizId) {
        onQuizGenerated(createdQuizId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quiz generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    await runGeneration();
  };

  if (loadingDocs) {
    return (
      <div className="glass-surface rounded-2xl p-10 text-center text-sm text-slate-500">
        Loading your study documents...
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="glass-surface rounded-2xl p-10 text-center space-y-4">
        <FileText className="w-10 h-10 text-blue-500 mx-auto" />
        <h2 className="font-display text-xl font-bold">Upload Study Material First</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          AI QUIZ MASTER generates questions strictly from your own uploaded PDF, DOCX, PPTX, or TXT notes.
        </p>
        <button
          type="button"
          onClick={onGoToDocuments}
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold cursor-pointer"
        >
          Go to My Documents
        </button>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="glass-surface rounded-2xl p-8 sm:p-10 max-w-2xl mx-auto text-center space-y-6">
        <Processing3DCanvas stageIndex={activeStageIndex} />

        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
            <ShieldCheck className="w-4 h-4" />
            <span>100% Based on Your Uploaded Material</span>
          </div>
          <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            {PROCESSING_STAGES[activeStageIndex]}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{stageDetail}</p>
        </div>

        <div className="space-y-2 text-left max-w-md mx-auto">
          {PROCESSING_STAGES.map((stage, i) => {
            const done = i < activeStageIndex;
            const current = i === activeStageIndex;
            return (
              <div
                key={stage}
                className={`flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium ${
                  current
                    ? 'bg-blue-500/15 text-blue-700 dark:text-cyan-300 border border-blue-500/30'
                    : done
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : current ? (
                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-full border border-current shrink-0" />
                )}
                <span>{stage}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleGenerate} className="space-y-6 max-w-5xl">
      <div className="glass-surface rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h2 className="font-display text-xl font-bold">Configure Source-Verified Quiz</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Questions are created exclusively from your selected documents and verified against exact page excerpts.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            100% Based on Your Uploaded Material
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-sm text-amber-700 dark:text-amber-300 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={runGeneration}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-semibold shrink-0 cursor-pointer"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Document Selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            1. Select Uploaded Documents
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {docs.map((doc) => {
              const selected = selectedDocIds.includes(doc.id);
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => toggleDoc(doc)}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    selected
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                  }`}
                >
                  <div className="font-semibold text-sm truncate text-slate-900 dark:text-white">
                    {doc.title}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {doc.subjectName} · {doc.pageCount} pages · {doc.fileName}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Subject, Quiz Title, Chapter, Page Range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="quiz-subject" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Subject
            </label>
            <input
              id="quiz-subject"
              type="text"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="Auto-detected"
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
            />
          </div>

          <div>
            <label htmlFor="quiz-title" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Quiz Title (optional)
            </label>
            <input
              id="quiz-title"
              type="text"
              value={quizTitle}
              onChange={(e) => setQuizTitle(e.target.value)}
              placeholder="e.g. Midterm Chapter 1"
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
            />
          </div>

          <div>
            <label htmlFor="page-start" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Start Page (optional)
            </label>
            <input
              id="page-start"
              type="number"
              min={1}
              value={pageStart}
              onChange={(e) => setPageStart(e.target.value)}
              placeholder="1"
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm tabular-nums"
            />
          </div>

          <div>
            <label htmlFor="page-end" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              End Page (optional)
            </label>
            <input
              id="page-end"
              type="number"
              min={1}
              value={pageEnd}
              onChange={(e) => setPageEnd(e.target.value)}
              placeholder="All"
              className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm tabular-nums"
            />
          </div>
        </div>

        {/* Chapters & Topics Found in Material */}
        {availableChapters.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                2. Chapters &amp; Sections in Your Material (leave empty for All)
              </label>
              {selectedChapters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedChapters([])}
                  className="text-xs font-medium text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  Clear chapters ({selectedChapters.length})
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {availableChapters.map((ch) => {
                const active = selectedChapters.includes(ch);
                const info = availableChapterInfos.find((c) => c.title === ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    onClick={() =>
                      setSelectedChapters((prev) =>
                        prev.includes(ch) ? prev.filter((x) => x !== ch) : [...prev, ch]
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-blue-400'
                    }`}
                  >
                    <span>{ch}</span>
                    {info && info.endPage >= info.startPage && (
                      <span className={`ml-1.5 text-[10px] ${active ? 'text-blue-100' : 'text-slate-400'}`}>
                        p.{info.startPage === info.endPage ? info.startPage : `${info.startPage}-${info.endPage}`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {availableTopics.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Topics Detected in Selected Material (select specific topics to focus quiz)
              </label>
              <div className="flex items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedTopics(availableTopics)}
                  className="font-medium text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
                >
                  Select all
                </button>
                {selectedTopics.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedTopics([])}
                    className="font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline cursor-pointer"
                  >
                    Clear ({selectedTopics.length})
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {availableTopics.map((topic) => {
                const active = selectedTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    type="button"
                    onClick={() =>
                      setSelectedTopics((prev) =>
                        prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic]
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-violet-400'
                    }`}
                  >
                    {topic}
                  </button>
                );
              })}
            </div>
            {selectedTopics.length > 0 && (
              <p className="text-xs text-violet-600 dark:text-violet-300 font-medium">
                Quiz will focus strictly on: {selectedTopics.join(', ')}
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor="topic-filter" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
            Additional Topic Keyword(s) (optional — comma-separated)
          </label>
          <input
            id="topic-filter"
            type="text"
            value={topicFilter}
            onChange={(e) => setTopicFilter(e.target.value)}
            placeholder="e.g. Dictionaries, Generators, Decorators"
            className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
          />
        </div>

        {/* Count, Difficulty, Language, Mode */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              Question Count
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {[5, 10, 20, 30, 50].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => {
                    setQuestionCount(cnt);
                    setCustomCount('');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold tabular-nums cursor-pointer ${
                    !customCount && questionCount === cnt
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {cnt}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={50}
                value={customCount}
                onChange={(e) => setCustomCount(e.target.value)}
                placeholder="Custom"
                aria-label="Custom question count"
                className="w-20 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
              Difficulty
            </label>
            <div className="flex flex-wrap gap-2">
              {(['Easy', 'Medium', 'Hard', 'Mixed'] as const).map((diff) => (
                <button
                  key={diff}
                  type="button"
                  onClick={() => setDifficulty(diff)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    difficulty === diff
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {diff}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Question Types */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2">
            Question Types
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'mcq', label: 'MCQs' },
              { id: 'true_false', label: 'True / False' },
              { id: 'fill_blank', label: 'Fill in the Blanks' },
              { id: 'short_answer', label: 'Short Answer' },
              { id: 'match', label: 'Match the Following' },
            ].map((qt) => {
              const active = questionTypes.includes(qt.id);
              return (
                <button
                  key={qt.id}
                  type="button"
                  onClick={() => toggleType(qt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {qt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Language, Mode, Marks & Timers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="quiz-lang" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Language
            </label>
            <select
              id="quiz-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value as 'English' | 'Hindi' | 'Hinglish')}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
            >
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Hinglish">Hinglish</option>
            </select>
          </div>

          <div>
            <label htmlFor="quiz-mode" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Quiz Mode
            </label>
            <select
              id="quiz-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as 'practice' | 'exam')}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
            >
              <option value="practice">Practice Mode (Instant)</option>
              <option value="exam">Exam Mode (Submit First)</option>
            </select>
          </div>

          <div>
            <label htmlFor="quiz-timer" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
              Timer (Minutes, 0 = Untimed)
            </label>
            <input
              id="quiz-timer"
              type="number"
              min={0}
              max={180}
              value={timedMinutes}
              onChange={(e) => setTimedMinutes(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm tabular-nums"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="marks-per-q" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Marks / Q
              </label>
              <input
                id="marks-per-q"
                type="number"
                step="0.5"
                min={0.5}
                value={marksPerQuestion}
                onChange={(e) => setMarksPerQuestion(Number(e.target.value) || 1)}
                className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm tabular-nums"
              />
            </div>
            <div>
              <label htmlFor="neg-mark" className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Neg. Mark
              </label>
              <input
                id="neg-mark"
                type="number"
                step="0.25"
                min={0}
                value={negativeMarking}
                onChange={(e) => setNegativeMarking(Number(e.target.value) || 0)}
                className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap items-center gap-6 pt-1 text-sm">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={randomizeQuestions}
              onChange={(e) => setRandomizeQuestions(e.target.checked)}
              className="rounded border-slate-400"
            />
            <span>Randomize questions</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={randomizeOptions}
              onChange={(e) => setRandomizeOptions(e.target.checked)}
              className="rounded border-slate-400"
            />
            <span>Randomize answer options</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showExplanationsImmediate}
              onChange={(e) => setShowExplanationsImmediate(e.target.checked)}
              className="rounded border-slate-400"
            />
            <span>Show explanations after each question (Practice mode)</span>
          </label>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white font-display font-bold tracking-wide text-sm shadow-xl shadow-blue-600/25 cursor-pointer"
          >
            GENERATE MY QUIZ
          </button>
        </div>
      </div>
    </form>
  );
};
