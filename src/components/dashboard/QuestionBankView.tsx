import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Bookmark,
  Download,
  Edit3,
  FileSearch,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { QuestionItem, QuizItem } from '../../types';

interface QuestionBankViewProps {
  bookmarkedOnlyInitial?: boolean;
  onViewSource: (docId: number, pageNumber: number, excerpt: string) => void;
  onQuizCreated?: (quizId: number) => void;
}

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  bookmarkedOnlyInitial = false,
  onViewSource,
  onQuizCreated,
}) => {
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(bookmarkedOnlyInitial);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQuestionText, setEditQuestionText] = useState('');
  const [editExplanation, setEditExplanation] = useState('');
  const [editNote, setEditNote] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [creatingQuiz, setCreatingQuiz] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBookmarkedOnly(bookmarkedOnlyInitial);
  }, [bookmarkedOnlyInitial]);

  const loadQuestions = () => {
    setLoading(true);
    apiFetch<{ questions: QuestionItem[] }>('/api/questions')
      .then((res) => setQuestions(res.questions))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load questions.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadQuestions();
  }, []);

  const subjects = Array.from(new Set(questions.map((q) => q.subjectName)));

  const filtered = questions.filter((q) => {
    if (bookmarkedOnly && !q.isBookmarked) return false;
    if (subjectFilter && q.subjectName !== subjectFilter) return false;
    if (difficultyFilter && q.difficulty !== difficultyFilter) return false;
    if (typeFilter && q.questionType !== typeFilter) return false;
    if (
      search.trim() &&
      !q.questionText.toLowerCase().includes(search.toLowerCase()) &&
      !q.chapterTitle.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const exportTarget =
    selectedIds.length > 0 ? filtered.filter((q) => selectedIds.includes(q.id)) : filtered;

  const exportCsv = () => {
    const header = ['Subject', 'Chapter', 'Page', 'Difficulty', 'Type', 'Question', 'Answer', 'Explanation', 'Source'];
    const rows = exportTarget.map((q) => [
      q.subjectName,
      q.chapterTitle,
      String(q.pageNumber),
      q.difficulty,
      q.questionType,
      q.questionText,
      q.correctAnswer,
      q.explanation,
      q.documentName,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ai_quiz_master_question_bank.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('AI QUIZ MASTER — Question Bank Export', 14, 18);
    let y = 30;
    exportTarget.forEach((q, idx) => {
      if (y > 265) {
        doc.addPage();
        y = 18;
      }
      doc.setFontSize(10);
      const qLines = doc.splitTextToSize(`${idx + 1}. [${q.subjectName} · p.${q.pageNumber}] ${q.questionText}`, 180);
      doc.text(qLines, 14, y);
      y += qLines.length * 5 + 2;
      doc.text(`Answer: ${q.correctAnswer}`, 14, y);
      y += 8;
    });
    doc.save('ai_quiz_master_question_bank.pdf');
  };

  const handleSaveEdit = async (qId: number) => {
    const cleanText = editQuestionText.trim();
    if (!cleanText) {
      setError('Question text cannot be empty.');
      return;
    }
    setBusyId(qId);
    setError(null);
    try {
      const res = await apiFetch<{ question: QuestionItem }>(`/api/questions/${qId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          questionText: cleanText,
          explanation: editExplanation.trim(),
          bookmarkNote: editNote,
        }),
      });
      setQuestions((prev) => prev.map((q) => (q.id === qId ? res.question : q)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRegenerate = async (qId: number) => {
    setBusyId(qId);
    setError(null);
    try {
      const res = await apiFetch<{ question: QuestionItem }>(`/api/questions/${qId}/regenerate`, {
        method: 'POST',
      });
      setQuestions((prev) => prev.map((q) => (q.id === qId ? res.question : q)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not regenerate from source.');
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleBookmark = async (q: QuestionItem) => {
    try {
      const res = await apiFetch<{ question: QuestionItem }>(`/api/questions/${q.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isBookmarked: !q.isBookmarked }),
      });
      setQuestions((prev) => prev.map((item) => (item.id === q.id ? res.question : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update bookmark.');
    }
  };

  const handleDelete = async (qId: number) => {
    try {
      await apiFetch(`/api/questions/${qId}`, { method: 'DELETE' });
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      setSelectedIds((prev) => prev.filter((id) => id !== qId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete question.');
    }
  };

  const handlePracticeSelected = async () => {
    const ids = exportTarget.map((q) => q.id).slice(0, 50);
    if (ids.length === 0) return;
    setCreatingQuiz(true);
    setError(null);
    try {
      const res = await apiFetch<{ quiz: QuizItem }>('/api/quizzes/from-questions', {
        method: 'POST',
        body: JSON.stringify({
          title: bookmarkedOnly
            ? `Bookmarked Revision Set (${ids.length} Qs)`
            : `Question Bank Practice (${ids.length} Qs)`,
          questionIds: ids,
          mode: 'practice',
        }),
      });
      onQuizCreated?.(res.quiz.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start custom practice quiz.');
    } finally {
      setCreatingQuiz(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="glass-surface rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">
              {bookmarkedOnly ? 'Bookmarked Questions & Notes' : 'Personal Question Bank'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search, edit, build custom revision quizzes from verified questions, or export to PDF and CSV
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(
                    selectedIds.length === filtered.length ? [] : filtered.map((q) => q.id)
                  )
                }
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                {selectedIds.length === filtered.length ? 'Clear Selection' : `Select All (${filtered.length})`}
              </button>
            )}
            {onQuizCreated && (
              <button
                type="button"
                onClick={handlePracticeSelected}
                disabled={creatingQuiz || exportTarget.length === 0}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>
                  {creatingQuiz
                    ? 'Starting...'
                    : selectedIds.length > 0
                      ? `Practice Selected (${selectedIds.length})`
                      : `Practice Filtered (${Math.min(50, filtered.length)})`}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={exportCsv}
              disabled={exportTarget.length === 0}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={exportTarget.length === 0}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions or chapters..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm"
            />
          </div>

          <select
            aria-label="Filter by subject"
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm"
          >
            <option value="">All Subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by difficulty"
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm"
          >
            <option value="">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>

          <div className="flex items-center gap-2">
            <select
              aria-label="Filter by question type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm"
            >
              <option value="">All Types</option>
              <option value="mcq">MCQ</option>
              <option value="true_false">True/False</option>
              <option value="fill_blank">Fill Blank</option>
              <option value="short_answer">Short Answer</option>
              <option value="match">Match</option>
            </select>
            <button
              type="button"
              onClick={() => setBookmarkedOnly((v) => !v)}
              aria-label="Filter bookmarked questions"
              className={`p-2 rounded-xl border cursor-pointer ${
                bookmarkedOnly
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'border-slate-300 dark:border-slate-700 text-slate-500'
              }`}
            >
              <Bookmark className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-500">
          {error}
        </div>
      )}

      {loading ? (
        <div className="glass-surface rounded-2xl p-10 text-center text-sm text-slate-500">
          Loading question bank...
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-surface rounded-2xl p-10 text-center text-sm text-slate-500">
          No matching questions found. Generate a quiz or clear your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((q) => {
            const isEditing = editingId === q.id;
            const isSelected = selectedIds.includes(q.id);
            return (
              <div key={q.id} className="glass-surface rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() =>
                        setSelectedIds((prev) =>
                          prev.includes(q.id) ? prev.filter((id) => id !== q.id) : [...prev, q.id]
                        )
                      }
                      aria-label={`Select question ${q.id}`}
                    />
                    <span className="font-semibold text-blue-600 dark:text-cyan-400">
                      {q.subjectName}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-slate-500">{q.chapterTitle}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-slate-500">Page {q.pageNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>{q.difficulty}</span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    100% Based on Your Uploaded Material
                  </span>
                </div>

                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={editQuestionText}
                      onChange={(e) => setEditQuestionText(e.target.value)}
                      rows={2}
                      className="w-full p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                    />
                    <textarea
                      value={editExplanation}
                      onChange={(e) => setEditExplanation(e.target.value)}
                      rows={2}
                      placeholder="Explanation"
                      className="w-full p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                    />
                    <input
                      type="text"
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Personal study note..."
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === q.id}
                        onClick={() => handleSaveEdit(q.id)}
                        className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                      >
                        Save Changes
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-display font-semibold text-base text-slate-900 dark:text-white">
                      {q.questionText}
                    </p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">
                      Answer: <span className="font-semibold">{q.correctAnswer}</span>
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">{q.explanation}</p>
                    {q.bookmarkNote && (
                      <p className="text-xs text-violet-600 dark:text-violet-300 italic">
                        Personal Note: {q.bookmarkNote}
                      </p>
                    )}
                  </>
                )}

                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onViewSource(q.documentId, q.pageNumber, q.evidenceExcerpt)}
                    className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
                  >
                    <FileSearch className="w-3.5 h-3.5" />
                    <span>View PDF Source</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleBookmark(q)}
                      className={`px-2.5 py-1 rounded-lg border text-xs cursor-pointer inline-flex items-center gap-1 ${
                        q.isBookmarked
                          ? 'bg-violet-500/20 border-violet-500/40 text-violet-600 dark:text-violet-300'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      <Bookmark className="w-3 h-3" />
                      <span>{q.isBookmarked ? 'Saved' : 'Bookmark'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(q.id);
                        setEditQuestionText(q.questionText);
                        setEditExplanation(q.explanation);
                        setEditNote(q.bookmarkNote || '');
                      }}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyId === q.id}
                      onClick={() => handleRegenerate(q.id)}
                      className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${busyId === q.id ? 'animate-spin' : ''}`} />
                      <span>Regenerate</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete question ${q.id}`}
                      onClick={() => handleDelete(q.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
