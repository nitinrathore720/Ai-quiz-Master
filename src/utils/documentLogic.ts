export interface ExtractedPageInput {
  pageNumber: number;
  content: string;
}

export interface DetectedChapterInfo {
  id: string;
  title: string;
  startPage: number;
  endPage: number;
  topics: string[];
}

export interface DocumentChunkRecord {
  pageNumber: number;
  chapterTitle: string;
  chunkIndex: number;
  content: string;
}

export interface SufficiencyReport {
  sufficient: boolean;
  totalWords: number;
  explanatorySentenceCount: number;
  reason?: string;
}

const CHAPTER_KEYWORD_REGEX =
  /^(?:[Cc]hapter|CHAPTER|[Uu]nit|UNIT|[Mm]odule|MODULE|[Ss]ection|SECTION|[Pp]art|PART|[Ll]ecture|LECTURE)\s+\d+(?:[\s.:–-]+.*)?$/;
const NUMBERED_CHAPTER_REGEX = /^\d{1,2}\.?\s+[A-Z][A-Za-z0-9 ,:&()\-/]{3,80}$/;
const CALLOUT_NOISE_REGEX =
  /^(?:OUTPUT|EXAMPLE|NOTE|NOTES|HINT|SYNTAX|SOLUTION|ANSWER|EXERCISE|SUMMARY|PAGE|CHAPTER|UNIT|MODULE|QUESTION|PRACTICE|IMPORTANT|APPENDIX|INDEX|CONTENTS|TABLE OF CONTENTS)\s*:?$/i;

function isTocLeaderLine(line: string): boolean {
  return /\.{3,}\s*\d+$/.test(line) || /\s{3,}\d+$/.test(line);
}

function cleanTopicLabel(raw: string): string {
  return raw
    .replace(/\.{2,}\s*\d+$/, '')
    .replace(/\s+\d+$/, '')
    .replace(/^[-•*\u2022]+\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripTopicPrefix(label: string): string {
  return label
    .replace(/^(?:chapter|unit|module|section|part|topic)\s+\d+[\s.:–-]*/i, '')
    .replace(/^\d+(?:\.\d+)*[.):]?\s+/, '')
    .trim();
}

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function countWords(text: string): number {
  const cleaned = text.trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

export function detectChaptersFromPages(pages: ExtractedPageInput[]): {
  chapters: DetectedChapterInfo[];
  pageChapterMap: Map<number, string>;
  detectedSubject: string;
} {
  const chapters: DetectedChapterInfo[] = [];
  const pageChapterMap = new Map<number, string>();
  let currentChapter = 'General Overview';
  let detectedSubject = 'General';

  for (const page of pages) {
    const lines = page.content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (page.pageNumber === 1 && lines.length > 0) {
      const subjectMatch = lines
        .slice(0, 8)
        .find((line) => /^(?:subject|course|module|syllabus)\s*:\s*(.+)$/i.test(line));
      if (subjectMatch) {
        const extracted = subjectMatch.replace(/^(?:subject|course|module|syllabus)\s*:\s*/i, '').trim();
        if (extracted.length >= 2 && extracted.length <= 60) {
          detectedSubject = extracted;
        }
      }
    }

    let pageFoundHeading = false;
    for (const line of lines) {
      const isToc = isTocLeaderLine(line);
      const isAllCapsHeading =
        /^[A-Z][A-Z0-9 ,:&()\-/]{5,70}$/.test(line) &&
        !line.endsWith(':') &&
        line.split(/\s+/).length >= 2 &&
        line.split(/\s+/).length <= 8 &&
        !CALLOUT_NOISE_REGEX.test(line);

      const isChapterHeading =
        !isToc &&
        line.length >= 4 &&
        line.length <= 95 &&
        !CALLOUT_NOISE_REGEX.test(line) &&
        (CHAPTER_KEYWORD_REGEX.test(line) ||
          NUMBERED_CHAPTER_REGEX.test(line) ||
          /^(?:[Tt]opic|TOPIC)\s+\d+[\s.:–-]+/.test(line) ||
          isAllCapsHeading);

      if (isChapterHeading) {
        const cleanTitle = line.replace(/\s+/g, ' ').trim();
        if (!/^\d+$/.test(cleanTitle) && /[a-zA-Z]{3,}/.test(cleanTitle)) {
          if (chapters.length > 0) {
            const prev = chapters[chapters.length - 1];
            if (prev.title !== cleanTitle) {
              prev.endPage = Math.max(prev.startPage, page.pageNumber - (pageFoundHeading ? 0 : 1));
            }
          }
          const existing = chapters.find((c) => c.title.toLowerCase() === cleanTitle.toLowerCase());
          if (!existing) {
            chapters.push({
              id: `ch-${chapters.length + 1}`,
              title: cleanTitle,
              startPage: page.pageNumber,
              endPage: page.pageNumber,
              topics: [],
            });
          } else {
            existing.endPage = page.pageNumber;
          }
          currentChapter = cleanTitle;
          pageFoundHeading = true;
          continue;
        }
      }

      // Extract clean sub-topics inside current or overview chapter
      const isSubTopicBullet = /^(?:\d+\.\d+(?:\.\d+)?|[-•*])\s+([A-Za-z].{2,70})$/.test(line);
      const isLabeledTopic = /^(?:topic|subtopic|concept)\s*:\s*([A-Za-z].{2,65})$/i.test(line);
      const words = line.split(/\s+/).filter(Boolean);
      const isTitleCaseSubheading =
        !isToc &&
        line.length >= 4 &&
        line.length <= 58 &&
        words.length >= 2 &&
        words.length <= 6 &&
        !/[.!?;=(){}[\]<>]$/.test(line) &&
        !CALLOUT_NOISE_REGEX.test(line) &&
        /^[A-Z][a-zA-Z0-9-]+(?:\s+(?:and|or|of|in|to|for|with|the|a|an|[A-Z][a-zA-Z0-9-]*))+$/.test(line);

      if (isSubTopicBullet || isLabeledTopic || isTitleCaseSubheading) {
        const rawTopic = isLabeledTopic
          ? line.replace(/^(?:topic|subtopic|concept)\s*:\s*/i, '')
          : line.replace(/^(?:\d+\.\d+(?:\.\d+)?|[-•*])\s+/, '');
        const topic = cleanTopicLabel(rawTopic);
        if (topic.length >= 3 && topic.length <= 68 && /[a-zA-Z]{3,}/.test(topic)) {
          if (chapters.length === 0) {
            chapters.push({
              id: 'ch-1',
              title: currentChapter,
              startPage: page.pageNumber,
              endPage: page.pageNumber,
              topics: [],
            });
          }
          const latest = chapters[chapters.length - 1];
          const stripped = stripTopicPrefix(topic).toLowerCase();
          if (
            latest.topics.length < 12 &&
            topic.toLowerCase() !== latest.title.toLowerCase() &&
            !latest.topics.some((t) => stripTopicPrefix(t).toLowerCase() === stripped)
          ) {
            latest.topics.push(topic);
          }
        }
      }
    }

    pageChapterMap.set(page.pageNumber, currentChapter);
  }

  if (chapters.length === 0 && pages.length > 0) {
    chapters.push({
      id: 'ch-1',
      title: 'Full Document',
      startPage: pages[0].pageNumber,
      endPage: pages[pages.length - 1].pageNumber,
      topics: [],
    });
    for (const p of pages) {
      pageChapterMap.set(p.pageNumber, 'Full Document');
    }
  } else if (chapters.length > 0 && pages.length > 0) {
    chapters[chapters.length - 1].endPage = pages[pages.length - 1].pageNumber;
  }

  return { chapters, pageChapterMap, detectedSubject };
}

export function splitPagesIntoChunks(
  pages: ExtractedPageInput[],
  pageChapterMap: Map<number, string>,
  maxChunkChars = 1400,
  overlapChars = 180
): DocumentChunkRecord[] {
  const chunks: DocumentChunkRecord[] = [];
  let globalIndex = 0;

  for (const page of pages) {
    const clean = normalizeText(page.content);
    if (!clean) continue;
    const chapterTitle = pageChapterMap.get(page.pageNumber) || 'Full Document';

    if (clean.length <= maxChunkChars) {
      chunks.push({
        pageNumber: page.pageNumber,
        chapterTitle,
        chunkIndex: globalIndex++,
        content: clean,
      });
      continue;
    }

    let cursor = 0;
    while (cursor < clean.length) {
      let end = Math.min(cursor + maxChunkChars, clean.length);
      if (end < clean.length) {
        const lastPeriod = clean.lastIndexOf('. ', end);
        const lastNewline = clean.lastIndexOf('\n', end);
        const splitAt = Math.max(lastPeriod, lastNewline);
        if (splitAt > cursor + Math.floor(maxChunkChars * 0.5)) {
          end = splitAt + 1;
        }
      }
      const slice = clean.slice(cursor, end).trim();
      if (slice.length > 20) {
        chunks.push({
          pageNumber: page.pageNumber,
          chapterTitle,
          chunkIndex: globalIndex++,
          content: slice,
        });
      }
      if (end >= clean.length) break;
      cursor = Math.max(cursor + 1, end - overlapChars);
    }
  }

  return chunks;
}

export function assessDocumentSufficiency(pages: ExtractedPageInput[]): SufficiencyReport {
  const combined = pages.map((p) => p.content).join('\n').trim();
  const totalWords = countWords(combined);

  if (totalWords < 12) {
    return {
      sufficient: false,
      totalWords,
      explanatorySentenceCount: 0,
      reason:
        'Insufficient information in your uploaded document to generate this question. Please upload more study material.',
    };
  }

  // Count explanatory sentences (>= 7 words with a lowercase verb/predicate structure, not bare syllabus headings)
  const sentences = combined
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const explanatorySentences = sentences.filter((s) => {
    const words = s.split(/\s+/).filter(Boolean);
    const hasLowercaseWords = /[a-z]{2,}/.test(s);
    const endsLikeSentence = /[.!?]$/.test(s) || words.length >= 9;
    const isBareHeading = /^(?:chapter|unit|module|topic|section|syllabus)\s+\d+/i.test(s) && words.length < 8;
    return words.length >= 6 && hasLowercaseWords && endsLikeSentence && !isBareHeading;
  });

  if (totalWords < 35 || explanatorySentences.length < 2) {
    return {
      sufficient: false,
      totalWords,
      explanatorySentenceCount: explanatorySentences.length,
      reason:
        'Insufficient information in your uploaded document to generate this question. Please upload more study material.',
    };
  }

  return {
    sufficient: true,
    totalWords,
    explanatorySentenceCount: explanatorySentences.length,
  };
}

export interface ChunkSelectionOptions {
  maxChunks?: number;
  maxTotalChars?: number;
  rotationOffset?: number;
  prioritizeOrder?: boolean;
}

function isInformativeChunk(content: string): boolean {
  const words = countWords(content);
  if (words < 10) return false;
  // Filter out pure table-of-contents / dot-leader pages
  const nonTocLines = content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/\.{3,}\s*\d+$/.test(l) && !/^\d+$/.test(l));
  if (nonTocLines.length === 0) return false;
  return /[a-z]{3,}/.test(nonTocLines.join(' '));
}

export function selectDiverseChunks<T extends { pageNumber: number; content: string }>(
  chunks: T[],
  options: ChunkSelectionOptions = {}
): T[] {
  const maxChunks = Math.max(1, options.maxChunks ?? 12);
  const maxTotalChars = Math.max(1500, options.maxTotalChars ?? 16_000);
  const rotationOffset = Math.max(0, options.rotationOffset ?? 0);
  const prioritizeOrder = Boolean(options.prioritizeOrder);

  if (chunks.length === 0) return [];

  const informative = chunks.filter((c) => isInformativeChunk(c.content));
  const pool = informative.length >= Math.min(3, chunks.length) ? informative : chunks;

  if (prioritizeOrder) {
    const picked: T[] = [];
    let totalChars = 0;
    const windowOffset = pool.length > maxChunks ? rotationOffset % Math.max(1, pool.length - maxChunks + 1) : 0;
    for (let i = 0; i < pool.length && picked.length < maxChunks; i++) {
      const idx = (windowOffset + i) % pool.length;
      const candidate = pool[idx];
      if (picked.length > 0 && totalChars + candidate.content.length > maxTotalChars) continue;
      picked.push(candidate);
      totalChars += candidate.content.length;
    }
    return picked.length > 0 ? picked : [pool[0]];
  }

  if (pool.length <= maxChunks) {
    const picked: T[] = [];
    let chars = 0;
    const start = rotationOffset % pool.length;
    for (let i = 0; i < pool.length; i++) {
      const idx = (start + i) % pool.length;
      const item = pool[idx];
      if (picked.length > 0 && chars + item.content.length > maxTotalChars) continue;
      picked.push(item);
      chars += item.content.length;
    }
    return picked.length > 0 ? picked : [pool[0]];
  }

  // Spread evenly across the full document span with rotation offset so repeated runs cover new pages
  const selectedIndices = new Set<number>();
  const picked: T[] = [];
  let totalChars = 0;
  const stride = pool.length / maxChunks;
  const shift = (rotationOffset % Math.max(1, Math.floor(stride))) || 0;

  for (let slot = 0; slot < maxChunks * 2 && picked.length < maxChunks; slot++) {
    const rawIndex = Math.floor((slot * stride + shift) % pool.length);
    if (selectedIndices.has(rawIndex)) continue;
    const candidate = pool[rawIndex];
    if (picked.length > 0 && totalChars + candidate.content.length > maxTotalChars) {
      continue;
    }
    selectedIndices.add(rawIndex);
    picked.push(candidate);
    totalChars += candidate.content.length;
  }

  if (picked.length === 0) {
    picked.push(pool[rotationOffset % pool.length]);
  }

  // Keep original reading order so adjacent concepts stay coherent
  const orderMap = new Map<T, number>();
  pool.forEach((item, idx) => orderMap.set(item, idx));
  return [...picked].sort((a, b) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0));
}

const TOPIC_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'that',
  'this',
  'are',
  'was',
  'were',
  'using',
  'based',
  'introduction',
  'overview',
  'chapter',
  'unit',
  'module',
  'section',
  'topic',
]);

function normalizeAlphaNum(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function scoreTextAgainstTopics(
  content: string,
  chapterTitle: string | null | undefined,
  topicTerms: string[]
): number {
  if (topicTerms.length === 0) return 1;
  const lowerContent = content.toLowerCase();
  const lowerChapter = (chapterTitle || '').toLowerCase();
  const normContent = normalizeAlphaNum(content);
  const normChapter = normalizeAlphaNum(chapterTitle || '');

  let score = 0;
  for (const rawTerm of topicTerms) {
    const candidates = [rawTerm.trim(), stripTopicPrefix(rawTerm)]
      .map((s) => s.trim())
      .filter((s, idx, arr) => s.length >= 2 && arr.indexOf(s) === idx);

    let termScore = 0;
    for (const candidate of candidates) {
      const lowerTerm = candidate.toLowerCase();
      const normTerm = normalizeAlphaNum(candidate);

      if (lowerTerm && lowerContent.includes(lowerTerm)) {
        const occurrences = lowerContent.split(lowerTerm).length - 1;
        termScore = Math.max(termScore, 10 + Math.min(20, occurrences * 4));
      } else if (normTerm && normContent.includes(normTerm)) {
        termScore = Math.max(termScore, 10);
      }

      if (lowerTerm && lowerChapter.includes(lowerTerm)) {
        termScore = Math.max(termScore, 8);
      } else if (normTerm && normChapter.includes(normTerm)) {
        termScore = Math.max(termScore, 8);
      }

      if (termScore === 0 && normTerm) {
        const tokens = normTerm
          .split(/\s+/)
          .filter((t) => t.length >= 3 && !TOPIC_STOPWORDS.has(t));
        if (tokens.length >= 2) {
          const hits = tokens.filter((t) => normContent.includes(t) || normChapter.includes(t)).length;
          if (hits === tokens.length) {
            termScore = Math.max(termScore, 7);
          } else if (hits / tokens.length >= 0.65) {
            termScore = Math.max(termScore, 4);
          }
        }
      }
    }
    score += termScore;
  }

  return score;
}

export interface SourceFilterInput<
  P extends { documentId: number; pageNumber: number; chapterTitle: string | null; content: string },
  C extends { documentId: number; pageNumber: number; chapterTitle: string | null; chunkIndex: number; content: string },
> {
  docs: Array<{ id: number; detectedChapters?: DetectedChapterInfo[] }>;
  pages: P[];
  chunks: C[];
  selectedChapters?: string[];
  selectedTopics?: string[];
  topicFilter?: string;
  pageStart?: number;
  pageEnd?: number;
}

export function filterSourceBySelection<
  P extends { documentId: number; pageNumber: number; chapterTitle: string | null; content: string },
  C extends { documentId: number; pageNumber: number; chapterTitle: string | null; chunkIndex: number; content: string },
>(input: SourceFilterInput<P, C>): {
  filteredPages: P[];
  filteredChunks: C[];
  focusTopics: string[];
} {
  const {
    docs,
    pages,
    chunks,
    selectedChapters = [],
    selectedTopics = [],
    topicFilter = '',
    pageStart = 0,
    pageEnd = 0,
  } = input;

  const rawStart = Number(pageStart) || 0;
  const rawEnd = Number(pageEnd) || 0;
  const pStart = rawStart > 0 && rawEnd > 0 ? Math.min(rawStart, rawEnd) : rawStart;
  const pEnd = rawStart > 0 && rawEnd > 0 ? Math.max(rawStart, rawEnd) : rawEnd;

  const normalizedChapterSelections = selectedChapters
    .map((c) => c.trim())
    .filter((c) => c.length > 0 && c.toLowerCase() !== 'all chapters');

  const rawKeywordTerms = topicFilter
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chapterMatchNames = new Set<string>();
  const chapterMatchedSpans: Array<{ docId: number; startPage: number; endPage: number }> = [];
  const inferredTopicTerms: string[] = [];

  if (normalizedChapterSelections.length > 0) {
    for (const sel of normalizedChapterSelections) {
      const selLower = sel.toLowerCase();
      const selNorm = normalizeAlphaNum(sel);
      chapterMatchNames.add(selLower);
      if (selNorm) chapterMatchNames.add(selNorm);

      let matchedAsChapter = false;
      for (const doc of docs) {
        for (const ch of doc.detectedChapters || []) {
          const chLower = ch.title.trim().toLowerCase();
          const chNorm = normalizeAlphaNum(ch.title);
          if (chLower === selLower || (selNorm && chNorm === selNorm)) {
            matchedAsChapter = true;
            chapterMatchedSpans.push({
              docId: doc.id,
              startPage: ch.startPage,
              endPage: ch.endPage,
            });
          } else if (
            ch.topics?.some((t) => {
              const tLower = t.trim().toLowerCase();
              const tNorm = normalizeAlphaNum(t);
              return tLower === selLower || (selNorm && tNorm === selNorm);
            })
          ) {
            inferredTopicTerms.push(sel);
          }
        }
      }
      if (!matchedAsChapter && inferredTopicTerms.length === 0) {
        // Treat unmatched label as an additional topic phrase fallback
        inferredTopicTerms.push(sel);
      }
    }
  }

  const allTopicTerms = Array.from(
    new Set([...selectedTopics.map((t) => t.trim()).filter(Boolean), ...rawKeywordTerms, ...inferredTopicTerms])
  );

  const matchesChapterScope = (docId: number, pageNum: number, chTitle: string | null): boolean => {
    if (normalizedChapterSelections.length === 0) return true;
    // If selections were sub-topics inside detectedChapters rather than chapter headers, allow chapter scope + filter by topic terms
    if (chapterMatchedSpans.length === 0 && inferredTopicTerms.length > 0) return true;

    const titleLower = (chTitle || '').trim().toLowerCase();
    const titleNorm = normalizeAlphaNum(chTitle || '');
    if (chapterMatchNames.has(titleLower) || (titleNorm && chapterMatchNames.has(titleNorm))) {
      return true;
    }
    return chapterMatchedSpans.some(
      (span) => span.docId === docId && pageNum >= span.startPage && pageNum <= span.endPage
    );
  };

  // Step 1: Page-range + chapter scope filtering
  const scopedPages = pages.filter((p) => {
    if (pStart > 0 && p.pageNumber < pStart) return false;
    if (pEnd > 0 && p.pageNumber > pEnd) return false;
    return matchesChapterScope(p.documentId, p.pageNumber, p.chapterTitle);
  });

  const scopedChunks = chunks.filter((c) => {
    if (pStart > 0 && c.pageNumber < pStart) return false;
    if (pEnd > 0 && c.pageNumber > pEnd) return false;
    return matchesChapterScope(c.documentId, c.pageNumber, c.chapterTitle);
  });

  // Step 2: Specific topic / keyword matching & relevance ranking
  if (allTopicTerms.length > 0) {
    const pageScores = new Map<string, number>();
    const filteredPages = scopedPages.filter((p) => {
      const score = scoreTextAgainstTopics(p.content, p.chapterTitle, allTopicTerms);
      if (score > 0) {
        pageScores.set(`${p.documentId}:${p.pageNumber}`, score);
        return true;
      }
      return false;
    });

    const scoredChunks = scopedChunks
      .map((c) => ({
        chunk: c,
        score: scoreTextAgainstTopics(c.content, c.chapterTitle, allTopicTerms),
      }))
      .filter((entry) => entry.score > 0);

    // Sort highest relevance first so Gemini receives the strongest topical sections first
    scoredChunks.sort((a, b) => b.score - a.score || a.chunk.chunkIndex - b.chunk.chunkIndex);

    let filteredChunks = scoredChunks.map((entry) => entry.chunk);
    // If topic matched across a page boundary or multi-chunk page, fall back to scoped chunks on matched pages
    if (filteredChunks.length === 0 && filteredPages.length > 0) {
      const matchedPageKeys = new Set(filteredPages.map((p) => `${p.documentId}:${p.pageNumber}`));
      filteredChunks = scopedChunks
        .filter((c) => matchedPageKeys.has(`${c.documentId}:${c.pageNumber}`))
        .sort(
          (a, b) =>
            (pageScores.get(`${b.documentId}:${b.pageNumber}`) ?? 0) -
              (pageScores.get(`${a.documentId}:${a.pageNumber}`) ?? 0) ||
            a.chunkIndex - b.chunkIndex
        );
    }

    const focusTopics = Array.from(
      new Set(
        [...allTopicTerms, ...normalizedChapterSelections]
          .map((t) => stripTopicPrefix(t) || t)
          .filter(Boolean)
      )
    );

    return { filteredPages, filteredChunks, focusTopics };
  }

  const focusTopics = Array.from(
    new Set(normalizedChapterSelections.map((t) => stripTopicPrefix(t) || t).filter(Boolean))
  );

  return { filteredPages: scopedPages, filteredChunks: scopedChunks, focusTopics };
}

export function parseQuestionCountParam(
  rawValue: unknown,
  options: { min?: number; max?: number } = {}
): number | null {
  const min = options.min ?? 1;
  const max = options.max ?? 200;
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;
  const num = typeof rawValue === 'number' ? rawValue : Number(String(rawValue).trim());
  if (!Number.isInteger(num) || num < min || num > max) return null;
  return num;
}

export function resolvePlannerSessionQuestionCount(
  targetQuestions: number,
  completedQuestions = 0,
  mode: 'full' | 'remaining' = 'full',
  quizMax = 50
): number {
  const safeTarget = Math.max(1, Math.trunc(targetQuestions) || 1);
  if (mode === 'remaining') {
    const remaining = Math.max(1, safeTarget - Math.max(0, Math.trunc(completedQuestions) || 0));
    return Math.min(quizMax, remaining);
  }
  return Math.min(quizMax, safeTarget);
}

export interface StudyPlanProgressRecord {
  id: number;
  title?: string;
  documentId: number | null;
  subjectName: string;
  chapterTitle: string;
  targetQuestions: number;
  completedQuestions: number;
  status: string;
}

export interface CompletedQuizPlanContext {
  title?: string;
  subjectName: string;
  documentIds: number[];
  chapterFilter: string;
  answeredQuestions: Array<{
    documentId: number;
    subjectName: string;
    chapterTitle: string;
  }>;
}

export interface StudyPlanProgressUpdate {
  planId: number;
  title: string;
  addedQuestions: number;
  previousCompleted: number;
  completedQuestions: number;
  targetQuestions: number;
  status: 'in_progress' | 'completed';
}

function subjectsMatch(planSubject: string, candidateSubject: string): boolean {
  const a = planSubject.trim().toLowerCase();
  const b = candidateSubject.trim().toLowerCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  return false;
}

function chaptersOrTopicsMatch(planChapter: string, candidateChapter: string): boolean {
  const rawA = planChapter.trim().toLowerCase();
  const rawB = candidateChapter.trim().toLowerCase();
  if (!rawA || !rawB) return false;
  if (rawA === rawB) return true;

  const normA = normalizeAlphaNum(stripTopicPrefix(planChapter) || planChapter);
  const normB = normalizeAlphaNum(stripTopicPrefix(candidateChapter) || candidateChapter);
  if (!normA || !normB) return false;
  if (normA === normB) return true;
  if (normA.length >= 4 && normB.length >= 4 && (normA.includes(normB) || normB.includes(normA))) {
    return true;
  }
  return false;
}

export function computeStudyPlanProgressUpdates(
  plans: StudyPlanProgressRecord[],
  quizContext: CompletedQuizPlanContext
): StudyPlanProgressUpdate[] {
  const answered = quizContext.answeredQuestions || [];
  if (answered.length === 0 || plans.length === 0) return [];

  const quizChapters = (quizContext.chapterFilter || '')
    .split(/[,;\n]+/)
    .map((c) => c.trim())
    .filter(Boolean);

  const updates: StudyPlanProgressUpdate[] = [];

  for (const plan of plans) {
    const safeTarget = Math.max(1, Math.trunc(plan.targetQuestions) || 1);
    const prevCompleted = Math.max(0, Math.trunc(plan.completedQuestions) || 0);
    if (plan.status === 'completed' || prevCompleted >= safeTarget) continue;

    // 1. Scope answered questions to the plan's linked document or subject
    const scopedAnswered =
      plan.documentId !== null && plan.documentId !== undefined
        ? answered.filter((q) => q.documentId === plan.documentId)
        : answered.filter(
            (q) =>
              subjectsMatch(plan.subjectName, q.subjectName) ||
              subjectsMatch(plan.subjectName, quizContext.subjectName)
          );

    if (scopedAnswered.length === 0) continue;

    // 2. Scope by specific chapter / topic if the plan specifies one
    const planChapter = (plan.chapterTitle || '').trim();
    let matchedCount = 0;

    if (!planChapter || planChapter.toLowerCase() === 'all chapters') {
      matchedCount = scopedAnswered.length;
    } else {
      const quizTargetedPlanChapter = quizChapters.some((ch) =>
        chaptersOrTopicsMatch(planChapter, ch)
      );
      if (quizTargetedPlanChapter) {
        matchedCount = scopedAnswered.length;
      } else {
        matchedCount = scopedAnswered.filter((q) =>
          chaptersOrTopicsMatch(planChapter, q.chapterTitle)
        ).length;
      }
    }

    if (matchedCount <= 0) continue;

    const nextCompleted = Math.min(safeTarget, prevCompleted + matchedCount);
    const addedQuestions = nextCompleted - prevCompleted;
    if (addedQuestions <= 0) continue;

    const nextStatus: 'in_progress' | 'completed' =
      nextCompleted >= safeTarget ? 'completed' : 'in_progress';

    updates.push({
      planId: plan.id,
      title: plan.title || plan.subjectName,
      addedQuestions,
      previousCompleted: prevCompleted,
      completedQuestions: nextCompleted,
      targetQuestions: safeTarget,
      status: nextStatus,
    });
  }

  return updates;
}



