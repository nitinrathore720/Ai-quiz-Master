import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Loader2, ShieldCheck, X } from 'lucide-react';
import { apiFetch, getAuthHeaders } from '../lib/api';
import type { DocumentItem, DocumentPageItem } from '../types';

interface PdfSourceViewerProps {
  documentId: number;
  initialPage: number;
  evidenceExcerpt: string;
  onClose: () => void;
}

function highlightExcerpt(content: string, excerpt: string): React.ReactNode {
  if (!excerpt || excerpt.length < 8) return content;
  const idx = content.toLowerCase().indexOf(excerpt.toLowerCase());
  if (idx >= 0) {
    const before = content.slice(0, idx);
    const match = content.slice(idx, idx + excerpt.length);
    const after = content.slice(idx + excerpt.length);
    return (
      <>
        {before}
        <mark className="bg-blue-500/25 text-blue-900 dark:bg-cyan-400/25 dark:text-cyan-200 px-1 py-0.5 rounded font-medium">
          {match}
        </mark>
        {after}
      </>
    );
  }

  // Fallback sentence highlight using key words from excerpt
  const keywords = excerpt
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 6);
  if (keywords.length === 0) return content;

  const sentences = content.split(/(?<=[.!?])\s+/);
  return sentences.map((sentence, i) => {
    const lower = sentence.toLowerCase();
    const hits = keywords.filter((kw) => lower.includes(kw)).length;
    const isMatch = hits >= Math.min(3, keywords.length);
    return (
      <span key={i}>
        {isMatch ? (
          <mark className="bg-blue-500/25 text-blue-900 dark:bg-cyan-400/25 dark:text-cyan-200 px-1 py-0.5 rounded">
            {sentence}
          </mark>
        ) : (
          sentence
        )}{' '}
      </span>
    );
  });
}

export const PdfSourceViewer: React.FC<PdfSourceViewerProps> = ({
  documentId,
  initialPage,
  evidenceExcerpt,
  onClose,
}) => {
  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [pages, setPages] = useState<DocumentPageItem[]>([]);
  const [currentPage, setCurrentPage] = useState(Math.max(1, initialPage));
  const [viewMode, setViewMode] = useState<'highlighted' | 'pdf'>('highlighted');
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiFetch<{ document: DocumentItem; pages: DocumentPageItem[] }>(`/api/documents/${documentId}`)
      .then((res) => {
        if (!active) return;
        setDoc(res.document);
        setPages(res.pages);
        setCurrentPage(Math.max(1, Math.min(initialPage, res.pages.length || 1)));
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to load source document.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [documentId, initialPage]);

  useEffect(() => {
    if (viewMode !== 'pdf' || !doc?.hasPdfBinary) return;
    let active = true;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/documents/${doc.id}/file`, {
          credentials: 'include',
          headers,
        });
        if (!res.ok) return;
        const blob = await res.blob();
        createdUrl = URL.createObjectURL(blob);
        if (active) setPdfBlobUrl(createdUrl);
      } catch {
        // fallback cleanly
      }
    })();
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [viewMode, doc?.id, doc?.hasPdfBinary]);

  const activePageData = pages.find((p) => p.pageNumber === currentPage) || pages[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verified PDF Source Viewer"
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-4xl max-h-[90vh] glass-surface rounded-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>100% Based on Your Uploaded Material</span>
            </div>
            <h3 className="font-display text-base sm:text-lg font-bold truncate text-slate-900 dark:text-white mt-0.5">
              {doc ? `${doc.title} (${doc.fileName})` : 'Loading Source Document...'}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close source viewer"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Supporting Evidence Banner */}
        {evidenceExcerpt && (
          <div className="px-5 py-3 bg-blue-500/10 border-b border-blue-500/20 text-xs sm:text-sm">
            <span className="font-semibold text-blue-700 dark:text-cyan-300">
              Supporting Evidence (Page {initialPage}):{' '}
            </span>
            <span className="text-slate-700 dark:text-slate-200 italic">&ldquo;{evidenceExcerpt}&rdquo;</span>
          </div>
        )}

        {/* Controls Bar */}
        <div className="px-5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/50">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev Page
            </button>
            <span className="font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
              Page {currentPage} / {Math.max(1, pages.length)}
            </span>
            <button
              type="button"
              disabled={currentPage >= pages.length}
              onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1 cursor-pointer"
            >
              Next Page
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {doc?.hasPdfBinary && (
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('highlighted')}
                className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  viewMode === 'highlighted'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Highlighted Text
              </button>
              <button
                type="button"
                onClick={() => setViewMode('pdf')}
                className={`px-3 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  viewMode === 'pdf'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Original PDF
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="text-sm">Opening verified source page...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-500">
              {error}
            </div>
          ) : viewMode === 'pdf' && doc?.hasPdfBinary ? (
            pdfBlobUrl ? (
              <iframe
                title="Original PDF Page"
                src={`${pdfBlobUrl}#page=${currentPage}`}
                className="w-full h-[60vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
              />
            ) : (
              <div className="py-12 flex items-center justify-center text-sm text-slate-500 gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                <span>Loading original PDF...</span>
              </div>
            )
          ) : activePageData ? (
            <div className="space-y-3">
              {activePageData.chapterTitle && (
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                  <FileText className="w-4 h-4" />
                  <span>{activePageData.chapterTitle}</span>
                </div>
              )}
              <div className="p-5 rounded-xl bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-sm leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                {highlightExcerpt(activePageData.content, evidenceExcerpt)}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No extracted text available for this page.</p>
          )}
        </div>
      </div>
    </div>
  );
};
