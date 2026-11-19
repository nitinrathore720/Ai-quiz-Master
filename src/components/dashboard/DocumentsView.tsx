import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Edit3,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiFetch, getAuthHeaders } from '../../lib/api';
import { Upload3DPdf } from '../three/Upload3DPdf';
import type { DocumentItem, DocumentPageItem } from '../../types';

interface DocumentsViewProps {
  onGenerateFromDoc: (docId: number) => void;
  onDocumentsChanged: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const DocumentsView: React.FC<DocumentsViewProps> = ({
  onGenerateFromDoc,
  onDocumentsChanged,
}) => {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [subjectInput, setSubjectInput] = useState('');
  const [folderInput, setFolderInput] = useState('Semester 1');
  const [selectedFolderFilter, setSelectedFolderFilter] = useState('All');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [previewDoc, setPreviewDoc] = useState<DocumentItem | null>(null);
  const [previewPages, setPreviewPages] = useState<DocumentPageItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedPreviewPage, setSelectedPreviewPage] = useState(1);
  const [previewSearch, setPreviewSearch] = useState('');

  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editFolder, setEditFolder] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ documents: DocumentItem[] }>('/api/documents');
      setDocs(res.documents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const uploadFile = async (file: File) => {
    setError(null);
    setSuccessMsg(null);
    if (file.size > 10 * 1024 * 1024) {
      setError('File exceeds the 10 MB upload limit. Please compress or split the document.');
      return;
    }
    setUploading(true);
    setUploadProgress(15);

    const authHeaders = await getAuthHeaders();

    const formData = new FormData();
    formData.append('file', file);
    if (subjectInput.trim()) formData.append('subjectName', subjectInput.trim());
    if (folderInput.trim()) formData.append('folderName', folderInput.trim());

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/documents/upload');
    xhr.withCredentials = true;
    for (const [key, value] of Object.entries(authHeaders)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = Math.min(75, Math.round((ev.loaded / ev.total) * 75));
        setUploadProgress(pct);
      }
    };

    xhr.onload = () => {
      setUploadProgress(100);
      setUploading(false);
      try {
        const parsed = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          const uploadedDoc = parsed.document as DocumentItem;
          const uploadedPages = Array.isArray(parsed.pages)
            ? (parsed.pages as DocumentPageItem[])
            : [];
          setSuccessMsg(
            `Processed "${uploadedDoc.fileName}" (${uploadedDoc.pageCount} page${uploadedDoc.pageCount === 1 ? '' : 's'})`
          );
          setSubjectInput('');
          if (uploadedPages.length > 0) {
            setPreviewDoc(uploadedDoc);
            setPreviewPages(uploadedPages);
            setSelectedPreviewPage(uploadedPages[0].pageNumber || 1);
          } else {
            openPreview(uploadedDoc.id);
          }
          loadDocuments();
          onDocumentsChanged();
        } else {
          setError(parsed.error || 'Upload failed.');
        }
      } catch {
        setError('Unexpected response during document upload.');
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setError('Network error while uploading document.');
    };

    xhr.send(formData);
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    uploadFile(files[0]);
  };

  const openPreview = async (docId: number) => {
    setPreviewLoading(true);
    try {
      const res = await apiFetch<{ document: DocumentItem; pages: DocumentPageItem[] }>(
        `/api/documents/${docId}`
      );
      setPreviewDoc(res.document);
      setPreviewPages(res.pages);
      setSelectedPreviewPage(res.pages[0]?.pageNumber || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to preview document.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDelete = async (docId: number, title: string) => {
    setError(null);
    try {
      await apiFetch(`/api/documents/${docId}`, { method: 'DELETE' });
      setDocs((prev) => prev.filter((d) => d.id !== docId));
      if (previewDoc?.id === docId) {
        setPreviewDoc(null);
        setPreviewPages([]);
      }
      setSuccessMsg(`Deleted "${title}".`);
      onDocumentsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document.');
    }
  };

  const handleSaveDocMetadata = async (docId: number) => {
    const cleanTitle = editTitle.trim();
    const cleanSubject = editSubject.trim();
    const cleanFolder = editFolder.trim() || 'Root';
    if (!cleanTitle || !cleanSubject) {
      setError('Document title and subject cannot be empty.');
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      const res = await apiFetch<{ document: DocumentItem }>(`/api/documents/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: cleanTitle,
          subjectName: cleanSubject,
          folderName: cleanFolder,
        }),
      });
      setDocs((prev) => prev.map((d) => (d.id === docId ? res.document : d)));
      if (previewDoc?.id === docId) {
        setPreviewDoc(res.document);
      }
      setEditingDocId(null);
      setSuccessMsg(`Updated "${res.document.title}".`);
      onDocumentsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update document.');
    } finally {
      setSavingEdit(false);
    }
  };

  const folders = ['All', ...Array.from(new Set(docs.map((d) => d.folderName || 'Root')))];
  useEffect(() => {
    if (selectedFolderFilter !== 'All' && !folders.includes(selectedFolderFilter)) {
      setSelectedFolderFilter('All');
    }
  }, [docs, selectedFolderFilter]);

  const filteredDocs =
    selectedFolderFilter === 'All'
      ? docs
      : docs.filter((d) => (d.folderName || 'Root') === selectedFolderFilter);

  const activePreviewPage =
    previewPages.find((p) => p.pageNumber === selectedPreviewPage) || previewPages[0];
  const totalWords = previewPages.reduce((acc, p) => acc + (p.wordCount || 0), 0);
  const searchLower = previewSearch.trim().toLowerCase();
  const matchingPages = searchLower
    ? previewPages.filter((p) => p.content.toLowerCase().includes(searchLower))
    : [];

  const renderHighlightedPreview = (text: string) => {
    if (!searchLower) return text;
    const escaped = searchLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, idx) =>
      part.toLowerCase() === searchLower ? (
        <mark key={idx} className="bg-amber-400/35 text-slate-900 dark:text-amber-200 px-1 rounded">
          {part}
        </mark>
      ) : (
        <React.Fragment key={idx}>{part}</React.Fragment>
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFileSelect(e.dataTransfer.files);
        }}
        className={`glass-surface rounded-2xl p-6 sm:p-8 border-2 border-dashed transition-colors ${
          dragOver
            ? 'border-blue-500 bg-blue-500/10'
            : 'border-slate-300 dark:border-slate-700'
        }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-3">
            <Upload3DPdf />
          </div>

          <div className="lg:col-span-9 space-y-4">
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Upload Your Syllabus, PDF Notes, DOCX, PPTX, or TXT
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                Pages, chapters, and headings are extracted into your private vault. Scanned PDFs automatically run OCR.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="doc-subject" className="block text-xs font-medium text-slate-500 mb-1">
                  Subject (optional — auto-detected if present)
                </label>
                <input
                  id="doc-subject"
                  type="text"
                  value={subjectInput}
                  onChange={(e) => setSubjectInput(e.target.value)}
                  placeholder="e.g. Organic Chemistry"
                  className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                />
              </div>
              <div>
                <label htmlFor="doc-folder" className="block text-xs font-medium text-slate-500 mb-1">
                  Folder
                </label>
                <input
                  id="doc-folder"
                  type="text"
                  value={folderInput}
                  onChange={(e) => setFolderInput(e.target.value)}
                  placeholder="e.g. Semester 1"
                  className="w-full px-3.5 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.pptx,.txt"
                onChange={(e) => {
                  handleFileSelect(e.target.files);
                  e.target.value = '';
                }}
                className="hidden"
                aria-label="Upload study document file"
              />
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span>{uploading ? 'Extracting Document...' : 'Browse & Upload File'}</span>
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Or drag and drop here · Max 10 MB · PDF, DOCX, PPTX, TXT
              </span>
            </div>

            {uploading && (
              <div className="space-y-1">
                <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <div
                    style={{ width: `${uploadProgress}%` }}
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all"
                  />
                </div>
                <p className="text-xs font-mono text-slate-500 tabular-nums">
                  {uploadProgress}% · Extracting pages &amp; indexing chapters...
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-600 dark:text-red-300 flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-700 dark:text-emerald-300">
          {successMsg}
        </div>
      )}

      {/* Folder Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {folders.map((folder) => (
          <button
            key={folder}
            type="button"
            onClick={() => setSelectedFolderFilter(folder)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              selectedFolderFilter === folder
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>{folder}</span>
          </button>
        ))}
      </div>

      {/* Document Grid + Extracted Preview Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className={`${previewDoc ? 'lg:col-span-6' : 'lg:col-span-12'} space-y-3`}>
          {loading ? (
            <div className="glass-surface rounded-2xl p-8 text-center text-sm text-slate-500">
              Loading your private documents...
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="glass-surface rounded-2xl p-10 text-center space-y-2">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <h3 className="font-display text-lg font-bold">No documents uploaded yet</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Upload a PDF, DOCX, PPTX, or TXT syllabus file above to begin.
              </p>
            </div>
          ) : (
            filteredDocs.map((doc) => {
              const isEditingThis = editingDocId === doc.id;
              return (
                <div
                  key={doc.id}
                  className={`glass-surface rounded-2xl p-4 sm:p-5 space-y-3 ${
                    previewDoc?.id === doc.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500 shrink-0" />
                        <h3 className="font-display font-bold text-base truncate text-slate-900 dark:text-white">
                          {doc.title}
                        </h3>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                        <span>{doc.fileName}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{formatBytes(doc.fileSize)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{doc.pageCount} pages</span>
                        <span aria-hidden="true">·</span>
                        <span>{doc.subjectName}</span>
                        <span aria-hidden="true">·</span>
                        <span>{doc.folderName || 'Root'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{doc.detectedChapters?.length || 1} chapters</span>
                      </div>
                      {doc.warningMessage && (
                        <p className="text-xs text-amber-600 dark:text-amber-300 flex items-center gap-1.5 pt-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>{doc.warningMessage}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => openPreview(doc.id)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview Text</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Organize ${doc.title}`}
                        onClick={() => {
                          if (isEditingThis) {
                            setEditingDocId(null);
                          } else {
                            setEditingDocId(doc.id);
                            setEditTitle(doc.title);
                            setEditSubject(doc.subjectName);
                            setEditFolder(doc.folderName || 'Root');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onGenerateFromDoc(doc.id)}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Create Quiz</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${doc.title}`}
                        onClick={() => handleDelete(doc.id, doc.title)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-500/10 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {isEditingThis && (
                    <div className="pt-3 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Title</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 mb-1">Subject</label>
                        <input
                          type="text"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="block text-[11px] font-semibold text-slate-500 mb-1">Folder</label>
                          <input
                            type="text"
                            value={editFolder}
                            onChange={(e) => setEditFolder(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={() => handleSaveDocMetadata(doc.id)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          {savingEdit ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Extracted Text & Chapters Preview */}
        {previewDoc && (
          <div className="lg:col-span-6 glass-surface rounded-2xl p-5 space-y-4 max-h-[680px] flex flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-display font-bold text-base">
                  Extracted Content: {previewDoc.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {previewDoc.detectedChapters.length} detected chapters · {previewPages.length} extracted pages · {totalWords.toLocaleString()} words
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewDoc(null);
                  setPreviewPages([]);
                  setPreviewSearch('');
                }}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            {previewLoading ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={previewSearch}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPreviewSearch(val);
                      const firstMatch = previewPages.find((p) =>
                        p.content.toLowerCase().includes(val.trim().toLowerCase())
                      );
                      if (firstMatch && val.trim()) {
                        setSelectedPreviewPage(firstMatch.pageNumber);
                      }
                    }}
                    placeholder="Search inside extracted pages..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs"
                  />
                </div>

                {searchLower && (
                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                    <span>
                      {matchingPages.length} matching page{matchingPages.length === 1 ? '' : 's'}:
                    </span>
                    {matchingPages.map((mp, idx) => (
                      <button
                        key={mp.id ?? `match-${mp.pageNumber}-${idx}`}
                        type="button"
                        onClick={() => setSelectedPreviewPage(mp.pageNumber)}
                        className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono cursor-pointer"
                      >
                        p.{mp.pageNumber}
                      </button>
                    ))}
                  </div>
                )}

                {previewDoc.detectedChapters.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {previewDoc.detectedChapters.map((ch, idx) => (
                      <button
                        key={ch.id || `ch-${ch.startPage}-${idx}`}
                        type="button"
                        onClick={() => setSelectedPreviewPage(ch.startPage)}
                        className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 text-xs font-medium hover:bg-blue-500/20 cursor-pointer"
                      >
                        {ch.title} (p.{ch.startPage})
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {previewPages.map((p, idx) => (
                    <button
                      key={p.id ?? `page-${p.pageNumber}-${idx}`}
                      type="button"
                      onClick={() => setSelectedPreviewPage(p.pageNumber)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono shrink-0 cursor-pointer ${
                        selectedPreviewPage === p.pageNumber
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Page {p.pageNumber}
                    </button>
                  ))}
                </div>

                {activePreviewPage ? (
                  <div className="flex-1 overflow-y-auto p-4 rounded-xl bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 text-sm leading-relaxed whitespace-pre-wrap">
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 dark:text-cyan-400 mb-2">
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>{activePreviewPage.chapterTitle || 'Document Content'}</span>
                    </div>
                    {renderHighlightedPreview(activePreviewPage.content)}
                  </div>
                ) : (
                  <p className="text-sm text-amber-500">
                    No extractable text pages available for preview.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
