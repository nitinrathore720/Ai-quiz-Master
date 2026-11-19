export interface SourcePageText {
  documentId: number;
  documentName: string;
  pageNumber: number;
  content: string;
}

export interface GeneratedQuestionCandidate {
  documentId: number;
  documentName: string;
  subjectName: string;
  chapterTitle: string;
  pageNumber: number;
  questionType: 'mcq' | 'true_false' | 'fill_blank' | 'short_answer' | 'match';
  difficulty: 'Easy' | 'Medium' | 'Hard';
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  evidenceExcerpt: string;
}

export interface VerifiedQuestionResult {
  accepted: boolean;
  resolvedPageNumber: number;
  resolvedDocumentId: number;
  resolvedDocumentName: string;
  reason?: string;
}

export function normalizeForMatching(text: string): string {
  return text
    .replace(/-\s*\n\s*/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getBigrams(normalized: string): Set<string> {
  const words = normalized.split(' ').filter((w) => w.length > 1);
  const set = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    set.add(`${words[i]} ${words[i + 1]}`);
  }
  return set;
}

export function computeWordOverlap(needle: string, haystack: string): number {
  const normNeedle = normalizeForMatching(needle);
  const normHaystack = normalizeForMatching(haystack);

  if (!normNeedle || !normHaystack) return 0;
  if (normHaystack.includes(normNeedle)) return 1.0;

  const needleWords = normNeedle.split(' ').filter((w) => w.length > 2);
  if (needleWords.length === 0) return 0;

  const haystackWordSet = new Set(normHaystack.split(' '));
  let matchedWords = 0;
  for (const w of needleWords) {
    if (haystackWordSet.has(w)) matchedWords++;
  }
  const unigramScore = matchedWords / needleWords.length;

  const needleBigrams = getBigrams(normNeedle);
  const haystackBigrams = getBigrams(normHaystack);
  let bigramScore = unigramScore;
  if (needleBigrams.size > 0) {
    let matchedBigrams = 0;
    for (const bg of needleBigrams) {
      if (haystackBigrams.has(bg)) matchedBigrams++;
    }
    bigramScore = matchedBigrams / needleBigrams.size;
  }

  return unigramScore * 0.55 + bigramScore * 0.45;
}

export function verifyCandidateAgainstSource(
  candidate: GeneratedQuestionCandidate,
  sourcePages: SourcePageText[]
): VerifiedQuestionResult {
  const excerpt = (candidate.evidenceExcerpt || '').trim();
  if (excerpt.length < 12) {
    return {
      accepted: false,
      resolvedPageNumber: candidate.pageNumber,
      resolvedDocumentId: candidate.documentId,
      resolvedDocumentName: candidate.documentName,
      reason: 'Evidence excerpt is missing or too short.',
    };
  }

  if (!candidate.questionText?.trim() || !candidate.correctAnswer?.trim()) {
    return {
      accepted: false,
      resolvedPageNumber: candidate.pageNumber,
      resolvedDocumentId: candidate.documentId,
      resolvedDocumentName: candidate.documentName,
      reason: 'Question text or answer is empty.',
    };
  }

  if (candidate.questionType === 'mcq' && (!Array.isArray(candidate.options) || candidate.options.length < 4)) {
    return {
      accepted: false,
      resolvedPageNumber: candidate.pageNumber,
      resolvedDocumentId: candidate.documentId,
      resolvedDocumentName: candidate.documentName,
      reason: 'MCQ must have 4 options.',
    };
  }

  // First check the claimed document & page, then scan all selected user pages
  const sortedPages = [...sourcePages].sort((a, b) => {
    const aMatch = a.documentId === candidate.documentId && a.pageNumber === candidate.pageNumber ? 1 : 0;
    const bMatch = b.documentId === candidate.documentId && b.pageNumber === candidate.pageNumber ? 1 : 0;
    return bMatch - aMatch;
  });

  let bestScore = 0;
  let bestPage: SourcePageText | null = null;

  for (const page of sortedPages) {
    const score = computeWordOverlap(excerpt, page.content);
    if (score > bestScore) {
      bestScore = score;
      bestPage = page;
    }
    if (score >= 0.99) break;
  }

  if (!bestPage || bestScore < 0.72) {
    return {
      accepted: false,
      resolvedPageNumber: candidate.pageNumber,
      resolvedDocumentId: candidate.documentId,
      resolvedDocumentName: candidate.documentName,
      reason: `Evidence excerpt could not be verified in uploaded document (match=${bestScore.toFixed(2)}).`,
    };
  }

  // Also ensure the answer/key terms are not contradicting or absent for factual types
  if (candidate.questionType === 'fill_blank' || candidate.questionType === 'mcq') {
    const answerTokens = normalizeForMatching(candidate.correctAnswer)
      .split(' ')
      .filter((t) => t.length > 2);
    if (answerTokens.length > 0 && candidate.questionType === 'fill_blank') {
      const answerScore = computeWordOverlap(candidate.correctAnswer, bestPage.content);
      if (answerScore < 0.5) {
        return {
          accepted: false,
          resolvedPageNumber: bestPage.pageNumber,
          resolvedDocumentId: bestPage.documentId,
          resolvedDocumentName: bestPage.documentName,
          reason: 'Fill-in-the-blank answer not found in verified source page.',
        };
      }
    }
  }

  return {
    accepted: true,
    resolvedPageNumber: bestPage.pageNumber,
    resolvedDocumentId: bestPage.documentId,
    resolvedDocumentName: bestPage.documentName,
  };
}

export function isDuplicateQuestion(
  questionText: string,
  existingQuestionTexts: string[]
): boolean {
  const normCandidate = normalizeForMatching(questionText);
  if (!normCandidate) return true;

  for (const existing of existingQuestionTexts) {
    const normExisting = normalizeForMatching(existing);
    if (normCandidate === normExisting) return true;
    const overlap = computeWordOverlap(normCandidate, normExisting);
    const reverseOverlap = computeWordOverlap(normExisting, normCandidate);
    if (overlap >= 0.85 && reverseOverlap >= 0.85) return true;
  }
  return false;
}

export function buildRedactedSourceClue(
  evidenceExcerpt: string,
  correctAnswer: string
): string {
  const excerpt = (evidenceExcerpt || '').trim();
  if (!excerpt) return '';
  const answer = (correctAnswer || '').trim();
  if (answer.length < 2) return excerpt;

  const escaped = answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let masked = excerpt.replace(new RegExp(escaped, 'gi'), '[_____]');

  // Also mask multi-word answer key tokens (>3 chars) if exact phrase wasn't found
  if (masked === excerpt) {
    const tokens = answer
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((t) => t.length >= 4);
    for (const token of tokens) {
      const tokEscaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      masked = masked.replace(new RegExp(`\\b${tokEscaped}\\b`, 'gi'), '[_____]');
    }
  }

  return masked;
}

export function normalizeCandidateFormat(
  candidate: GeneratedQuestionCandidate
): GeneratedQuestionCandidate {
  const cleanOptions = Array.isArray(candidate.options)
    ? Array.from(
        new Set(
          candidate.options
            .map((o) => String(o || '').trim())
            .filter((o) => o.length > 0)
        )
      )
    : [];

  let normalizedAnswer = (candidate.correctAnswer || '').trim();

  if (candidate.questionType === 'true_false') {
    const lower = normalizedAnswer.toLowerCase();
    if (lower === 't' || lower === 'true' || lower === 'yes') {
      normalizedAnswer = 'True';
    } else if (lower === 'f' || lower === 'false' || lower === 'no') {
      normalizedAnswer = 'False';
    }
    return {
      ...candidate,
      options: ['True', 'False'],
      correctAnswer: normalizedAnswer || 'True',
      evidenceExcerpt: candidate.evidenceExcerpt.replace(/\s+/g, ' ').trim(),
    };
  }

  if (candidate.questionType === 'mcq' && cleanOptions.length > 0) {
    const letterMatch = normalizedAnswer.match(/^(?:option\s+)?([A-D1-4])(?:[).:\s]|$)/i);
    if (letterMatch) {
      const token = letterMatch[1].toUpperCase();
      const idx =
        token >= 'A' && token <= 'D'
          ? token.charCodeAt(0) - 65
          : Number(token) - 1;
      if (idx >= 0 && idx < cleanOptions.length) {
        normalizedAnswer = cleanOptions[idx];
      }
    }

    const exactOpt = cleanOptions.find(
      (opt) => opt.toLowerCase() === normalizedAnswer.toLowerCase()
    );
    if (exactOpt) {
      normalizedAnswer = exactOpt;
    } else if (cleanOptions.length >= 4) {
      // Ensure correctAnswer is always selectable if phrasing differed slightly
      const fuzzyOpt = cleanOptions.find(
        (opt) =>
          opt.toLowerCase().includes(normalizedAnswer.toLowerCase()) ||
          normalizedAnswer.toLowerCase().includes(opt.toLowerCase())
      );
      if (fuzzyOpt) {
        normalizedAnswer = fuzzyOpt;
      }
    }
  }

  return {
    ...candidate,
    options: cleanOptions,
    correctAnswer: normalizedAnswer,
    evidenceExcerpt: candidate.evidenceExcerpt.replace(/\s+/g, ' ').trim(),
  };
}


