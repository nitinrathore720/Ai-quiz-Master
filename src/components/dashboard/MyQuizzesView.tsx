import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { BarChart3, BookOpen, Download, Play, Plus, Search, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { QuestionItem, QuizItem } from '../../types';

interface MyQuizzesViewProps {
  onPlayQuiz: (quizId: number) => void;
  onViewAttempt: (attemptId: number) => void;
  onCreateNew: () => void;
}

export const MyQuizzesView: React.FC<MyQuizzesViewProps> = ({
  onPlayQuiz,
  onViewAttempt,
  onCreateNew,
}) => {
  const [quizzes, setQuizzes] = useState<QuizItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [exportingId, setExportingId] = useState<number | null>(null);

  const loadQuizzes = () => {
    setLoading(true);
    apiFetch<{ quizzes: QuizItem[] }>('/api/quizzes')
      .then((res) => setQuizzes(res.quizzes))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load quizzes.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadQuizzes();
  }, []);

  const handleDelete = async (quizId: number) => {
    try {
      await apiFetch(`/api/quizzes/${quizId}`, { method: 'DELETE' });
      setQuizzes((prev) => prev.filter((q) => q.id !== quizId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete quiz.');
    }
  };

  const handleExportQuizPdf = async (quiz: QuizItem) => {
    setExportingId(quiz.id);
    setError(null);
    try {
      const res = await apiFetch<{ quiz: QuizItem; questions: QuestionItem[] }>(`/api/quizzes/${quiz.id}`);
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(res.quiz.title, 14, 18);
      doc.setFontSize(10);
      doc.text(
        `Subject: ${res.quiz.subjectName} | Difficulty: ${res.quiz.difficulty} | ${res.questions.length} Questions`,
        14,
        26
      );

      let y = 36;
      res.questions.forEach((q, idx) => {
        if (y > 255) {
          doc.addPage();
          y = 18;
        }
        doc.setFontSize(11);
        const qLines = doc.splitTextToSize(`${idx + 1}. ${q.questionText}`, 180);
        doc.text(qLines, 14, y);
        y += qLines.length * 5.5 + 2;

        doc.setFontSize(9.5);
        if (Array.isArray(q.options) && q.options.length > 0) {
          q.options.forEach((opt, oIdx) => {
            if (y > 272) {
              doc.addPage();
              y = 18;
            }
            const optLines = doc.splitTextToSize(`   ${String.fromCharCode(65 + oIdx)}) ${opt}`, 174);
            doc.text(optLines, 14, y);
            y += optLines.length * 4.5 + 1;
          });
        }
        y += 4;
      });

      doc.addPage();
      doc.setFontSize(14);
      doc.text('Source-Verified Answer Key', 14, 18);
      y = 28;
      res.questions.forEach((q, idx) => {
        if (y > 265) {
          doc.addPage();
          y = 18;
        }
        doc.setFontSize(10);
        const aLines = doc.splitTextToSize(
          `${idx + 1}. ${q.correctAnswer} — ${q.explanation} (${q.documentName}, Page ${q.pageNumber})`,
          180
        );
        doc.text(aLines, 14, y);
        y += aLines.length * 5 + 3;
      });

      doc.save(`${quiz.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_worksheet.pdf`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export quiz PDF.');
    } finally {
      setExportingId(null);
    }
  };

  const subjects = Array.from(new Set(quizzes.map((q) => q.subjectName)));
  const filtered = quizzes.filter((q) => {
    if (subjectFilter && q.subjectName !== subjectFilter) return false;
    if (modeFilter && q.mode !== modeFilter) return false;
    if (
      search.trim() &&
      !q.title.toLowerCase().includes(search.toLowerCase()) &&
      !q.subjectName.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="glass-surface rounded-2xl p-10 text-center text-sm text-slate-500">
        Loading your saved quizzes...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">My Saved Quizzes</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            All quizzes generated strictly from your uploaded syllabus documents
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateNew}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Quiz</span>
        </button>
      </div>

      {quizzes.length > 0 && (
        <div className="glass-surface rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quizzes..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm"
            />
          </div>
          <select
            aria-label="Filter quizzes by subject"
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
            aria-label="Filter quizzes by mode"
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm"
          >
            <option value="">All Modes</option>
            <option value="practice">Practice Mode</option>
            <option value="exam">Exam Mode</option>
          </select>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-500">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="glass-surface rounded-2xl p-12 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-blue-500 mx-auto" />
          <h3 className="font-display text-lg font-bold">
            {quizzes.length === 0 ? 'No quizzes yet' : 'No matching quizzes'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {quizzes.length === 0
              ? 'Generate your first source-verified quiz from any uploaded document.'
              : 'Try clearing your search or subject filter.'}
          </p>
          {quizzes.length === 0 && (
            <button
              type="button"
              onClick={onCreateNew}
              className="px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold cursor-pointer"
            >
              Generate Quiz
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((quiz) => (
            <div key={quiz.id} className="glass-surface rounded-2xl p-5 flex flex-col justify-between gap-4">
              <div className="space-y-1.5">
                <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  {quiz.title}
                </h3>
                <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                  <span>{quiz.subjectName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{quiz.questionCount} questions</span>
                  <span aria-hidden="true">·</span>
                  <span>{quiz.difficulty}</span>
                  <span aria-hidden="true">·</span>
                  <span>{quiz.mode === 'exam' ? 'Exam' : 'Practice'}</span>
                </div>
                {quiz.latestAttempt && (
                  <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 pt-1 tabular-nums">
                    Latest Score: {quiz.latestAttempt.score}/{quiz.latestAttempt.maxScore} (
                    {quiz.latestAttempt.percentage}%)
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onPlayQuiz(quiz.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>{quiz.latestAttempt ? 'Retake' : 'Start Quiz'}</span>
                  </button>
                  {quiz.latestAttempt && (
                    <button
                      type="button"
                      onClick={() => onViewAttempt(quiz.latestAttempt!.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>Last Result</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={exportingId === quiz.id}
                    onClick={() => handleExportQuizPdf(quiz)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{exportingId === quiz.id ? 'Exporting...' : 'PDF'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  aria-label={`Delete ${quiz.title}`}
                  onClick={() => handleDelete(quiz.id)}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
