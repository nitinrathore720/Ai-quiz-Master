import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileSearch,
  LayoutGrid,
  Layers,
  Loader2,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { DocumentItem, FlashcardItem } from '../../types';

interface FlashcardsViewProps {
  onViewSource: (docId: number, pageNumber: number, excerpt: string) => void;
}

export const FlashcardsView: React.FC<FlashcardsViewProps> = ({ onViewSource }) => {
  const [cards, setCards] = useState<FlashcardItem[]>([]);
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number>(0);
  const [flippedMap, setFlippedMap] = useState<Record<number, boolean>>({});
  const [viewMode, setViewMode] = useState<'grid' | 'deck'>('grid');
  const [difficultyFilter, setDifficultyFilter] = useState<string>('All');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [deckIndex, setDeckIndex] = useState(0);
  const [deckFlipped, setDeckFlipped] = useState(false);

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ flashcards: FlashcardItem[] }>('/api/flashcards'),
      apiFetch<{ documents: DocumentItem[] }>('/api/documents'),
    ])
      .then(([fcRes, docRes]) => {
        setCards(fcRes.flashcards);
        setDocs(docRes.documents);
        if (docRes.documents.length > 0) setSelectedDocId(docRes.documents[0].id);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load flashcards.');
      })
      .finally(() => setLoading(false));
  }, []);

  const subjects = ['All', ...Array.from(new Set(cards.map((c) => c.subjectName)))];
  const filteredCards = cards.filter((c) => {
    if (difficultyFilter !== 'All' && c.difficultyRating !== difficultyFilter) return false;
    if (subjectFilter !== 'All' && c.subjectName !== subjectFilter) return false;
    return true;
  });

  useEffect(() => {
    if (deckIndex >= filteredCards.length) {
      setDeckIndex(Math.max(0, filteredCards.length - 1));
    }
    setDeckFlipped(false);
  }, [filteredCards.length, difficultyFilter, subjectFilter]);

  const activeDeckCard = filteredCards[deckIndex];

  useEffect(() => {
    if (viewMode !== 'deck' || !activeDeckCard) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setDeckFlipped((f) => !f);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setDeckFlipped(false);
        setDeckIndex((i) => Math.min(filteredCards.length - 1, i + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setDeckFlipped(false);
        setDeckIndex((i) => Math.max(0, i - 1));
      } else if (e.key === '1') {
        handleRate(activeDeckCard, 'Easy');
      } else if (e.key === '2') {
        handleRate(activeDeckCard, 'Medium');
      } else if (e.key === '3') {
        handleRate(activeDeckCard, 'Difficult');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewMode, activeDeckCard, filteredCards.length]);

  const handleGenerate = async () => {
    if (!selectedDocId) return;
    setError(null);
    setGenerating(true);
    try {
      const res = await apiFetch<{ flashcards: FlashcardItem[] }>('/api/flashcards/generate', {
        method: 'POST',
        body: JSON.stringify({ documentId: selectedDocId, count: 6 }),
      });
      setCards((prev) => [...res.flashcards, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate flashcards.');
    } finally {
      setGenerating(false);
    }
  };

  const handleRate = async (card: FlashcardItem, rating: 'Easy' | 'Medium' | 'Difficult') => {
    try {
      const res = await apiFetch<{ flashcard: FlashcardItem }>(`/api/flashcards/${card.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ difficultyRating: rating, incrementReview: true }),
      });
      setCards((prev) => prev.map((c) => (c.id === card.id ? res.flashcard : c)));
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await apiFetch(`/api/flashcards/${id}`, { method: 'DELETE' });
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete flashcard.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="glass-surface rounded-2xl p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold">Source-Verified Flashcards</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Flip 3D cards generated strictly from your uploaded PDFs. Rate difficulty to prioritize revision.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {docs.length > 0 && (
              <select
                aria-label="Select document for flashcard generation"
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(Number(e.target.value))}
                className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs sm:text-sm"
              >
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              disabled={generating || !selectedDocId}
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs sm:text-sm font-semibold cursor-pointer"
            >
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{generating ? 'Generating...' : 'Generate Flashcards'}</span>
            </button>
          </div>
        </div>

        {cards.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              {(['All', 'Easy', 'Medium', 'Difficult'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setDifficultyFilter(lvl)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                    difficultyFilter === lvl
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {lvl}
                </button>
              ))}
              {subjects.length > 2 && (
                <select
                  aria-label="Filter flashcards by subject"
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                >
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s === 'All' ? 'All Subjects' : s}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="inline-flex rounded-xl border border-slate-300 dark:border-slate-700 p-0.5 bg-slate-100/70 dark:bg-slate-900/70">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('deck')}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  viewMode === 'deck' ? 'bg-blue-600 text-white' : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>3D Deck</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-sm text-amber-600 dark:text-amber-300"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="glass-surface rounded-2xl p-10 text-center text-sm text-slate-500">
          Loading flashcards...
        </div>
      ) : filteredCards.length === 0 ? (
        <div className="glass-surface rounded-2xl p-12 text-center space-y-3">
          <Layers className="w-8 h-8 text-blue-500 mx-auto" />
          <h3 className="font-display text-lg font-bold">
            {cards.length === 0 ? 'No flashcards yet' : 'No cards match this filter'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {cards.length === 0
              ? 'Select an uploaded document above and click Generate Flashcards.'
              : 'Reset the difficulty or subject filter to see your deck.'}
          </p>
        </div>
      ) : viewMode === 'deck' && activeDeckCard ? (
        <div className="max-w-2xl mx-auto space-y-5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-mono tabular-nums">
              Card {deckIndex + 1} of {filteredCards.length} · {activeDeckCard.subjectName} · p.{activeDeckCard.pageNumber}
            </span>
            <span>Keys: Space = Flip · ←/→ = Move · 1/2/3 = Rate</span>
          </div>

          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              style={{ width: `${Math.round(((deckIndex + 1) / filteredCards.length) * 100)}%` }}
              className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 transition-all"
            />
          </div>

          <div className="perspective-1000">
            <button
              type="button"
              onClick={() => setDeckFlipped((f) => !f)}
              className="w-full min-h-[260px] relative preserve-3d transition-transform duration-500 cursor-pointer text-left"
              style={{ transform: deckFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
            >
              <div className="absolute inset-0 backface-hidden glass-surface rounded-2xl p-8 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono uppercase tracking-wider text-blue-600 dark:text-cyan-400">
                    Prompt / Term
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    100% Based on Your Uploaded Material
                  </span>
                </div>
                <p className="font-display text-xl sm:text-2xl font-bold text-slate-900 dark:text-white leading-snug">
                  {activeDeckCard.front}
                </p>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <RotateCw className="w-3.5 h-3.5" />
                  Click or press Space to reveal verified answer
                </span>
              </div>

              <div
                className="absolute inset-0 backface-hidden glass-surface rounded-2xl p-8 flex flex-col justify-between border border-blue-500/40"
                style={{ transform: 'rotateY(180deg)' }}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    Verified Answer (Page {activeDeckCard.pageNumber})
                  </span>
                  <span className="font-mono text-slate-500">
                    Reviewed {activeDeckCard.reviewCount}×
                  </span>
                </div>
                <p className="text-base sm:text-lg text-slate-800 dark:text-slate-100 leading-relaxed">
                  {activeDeckCard.back}
                </p>
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <RotateCw className="w-3.5 h-3.5" />
                  Click or press Space to flip back
                </span>
              </div>
            </button>
          </div>

          <div className="glass-surface rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(['Easy', 'Medium', 'Difficult'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => handleRate(activeDeckCard, lvl)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    activeDeckCard.difficultyRating === lvl
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {activeDeckCard.documentId && (
                <button
                  type="button"
                  onClick={() =>
                    onViewSource(
                      activeDeckCard.documentId!,
                      activeDeckCard.pageNumber,
                      activeDeckCard.evidenceExcerpt
                    )
                  }
                  className="px-3 py-1.5 rounded-lg border border-blue-500/40 text-xs font-semibold text-blue-600 dark:text-cyan-400 inline-flex items-center gap-1 cursor-pointer"
                >
                  <FileSearch className="w-3.5 h-3.5" />
                  <span>View PDF Source</span>
                </button>
              )}
              <button
                type="button"
                disabled={deckIndex === 0}
                onClick={() => {
                  setDeckFlipped(false);
                  setDeckIndex((i) => Math.max(0, i - 1));
                }}
                className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
                aria-label="Previous flashcard"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={deckIndex >= filteredCards.length - 1}
                onClick={() => {
                  setDeckFlipped(false);
                  setDeckIndex((i) => Math.min(filteredCards.length - 1, i + 1));
                }}
                className="p-2 rounded-lg bg-blue-600 text-white disabled:opacity-40 cursor-pointer"
                aria-label="Next flashcard"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredCards.map((card) => {
            const flipped = Boolean(flippedMap[card.id]);
            return (
              <div key={card.id} className="glass-surface rounded-2xl p-5 flex flex-col justify-between gap-4">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="truncate font-medium">
                    {card.subjectName} · p.{card.pageNumber}
                  </span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Verified
                  </span>
                </div>

                <div className="perspective-1000">
                  <button
                    type="button"
                    onClick={() => setFlippedMap((prev) => ({ ...prev, [card.id]: !prev[card.id] }))}
                    className="w-full min-h-[145px] relative preserve-3d transition-transform duration-500 cursor-pointer text-left"
                    style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
                  >
                    <div className="absolute inset-0 backface-hidden p-4 rounded-xl bg-slate-100/80 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 flex flex-col justify-between hover:border-blue-500/60">
                      <span className="text-[11px] font-mono uppercase tracking-wide text-blue-600 dark:text-cyan-400">
                        Prompt / Term
                      </span>
                      <p className="text-sm font-medium text-slate-900 dark:text-white my-2 leading-relaxed line-clamp-3">
                        {card.front}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <RotateCw className="w-3 h-3" />
                        Click card to flip
                      </span>
                    </div>

                    <div
                      className="absolute inset-0 backface-hidden p-4 rounded-xl bg-blue-50/90 dark:bg-slate-900 border border-blue-500/40 flex flex-col justify-between"
                      style={{ transform: 'rotateY(180deg)' }}
                    >
                      <span className="text-[11px] font-mono uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                        Answer / Explanation
                      </span>
                      <p className="text-xs sm:text-sm font-medium text-slate-900 dark:text-white my-2 leading-relaxed overflow-y-auto">
                        {card.back}
                      </p>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                        <RotateCw className="w-3 h-3" />
                        Click to flip back
                      </span>
                    </div>
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-1.5">
                    {(['Easy', 'Medium', 'Difficult'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => handleRate(card, lvl)}
                        className={`flex-1 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                          card.difficultyRating === lvl
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                    {card.documentId ? (
                      <button
                        type="button"
                        onClick={() =>
                          onViewSource(card.documentId!, card.pageNumber, card.evidenceExcerpt)
                        }
                        className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-cyan-400 hover:underline cursor-pointer"
                      >
                        <FileSearch className="w-3.5 h-3.5" />
                        <span>View PDF Source</span>
                      </button>
                    ) : (
                      <span />
                    )}

                    <button
                      type="button"
                      aria-label="Delete flashcard"
                      onClick={() => handleDelete(card.id)}
                      className="text-slate-400 hover:text-red-500 cursor-pointer"
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
