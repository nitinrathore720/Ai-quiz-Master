import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { assessDocumentSufficiency, selectDiverseChunks } from '../utils/documentLogic.ts';
import {
  isDuplicateQuestion,
  normalizeCandidateFormat,
  verifyCandidateAgainstSource,
  type GeneratedQuestionCandidate,
  type SourcePageText,
} from '../utils/sourceVerification.ts';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface SourceChunkContext {
  documentId: number;
  documentName: string;
  pageNumber: number;
  chapterTitle: string;
  content: string;
}

export interface QuizGenerationParams {
  subjectName: string;
  questionCount: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Mixed';
  questionTypes: Array<'mcq' | 'true_false' | 'fill_blank' | 'short_answer' | 'match'>;
  language: 'English' | 'Hindi' | 'Hinglish';
  chunks: SourceChunkContext[];
  sourcePages: SourcePageText[];
  existingQuestionTexts: string[];
  focusTopics?: string[];
  prioritizeTopChunks?: boolean;
  onStage?: (stage: string, detail?: string) => void;
}

export interface QuizGenerationResult {
  questions: Array<GeneratedQuestionCandidate & { verifiedSource: boolean }>;
  rejectedCount: number;
  insufficientReason?: string;
  tokensUsed: number;
}

export interface FlashcardGenerationResult {
  cards: Array<{
    documentId: number;
    documentName: string;
    subjectName: string;
    pageNumber: number;
    front: string;
    back: string;
    evidenceExcerpt: string;
  }>;
  insufficientReason?: string;
  tokensUsed: number;
}

const INSUFFICIENT_MSG =
  'Insufficient information in your uploaded document to generate this question. Please upload more study material.';

function extractFriendlyGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error?.message) {
      return String(parsed.error.message);
    }
  } catch {
    // not raw JSON
  }
  if (/503|high demand|UNAVAILABLE|overloaded/i.test(raw)) {
    return 'AI service is experiencing temporary high demand across models. Please click Try Again in a few seconds.';
  }
  return raw || 'AI generation service is temporarily busy. Please try again in a moment.';
}

function parseStructuredJson<T>(rawText: string): T {
  const cleaned = (rawText || '{}')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned || '{}') as T;
}

const MODEL_FALLBACK_CHAIN: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
  { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
  { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
  { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
  { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
  { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
  { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
];

async function callGeminiWithRetry<T>(
  fn: (
    model: string,
    thinkingLevel: ThinkingLevel,
    signal: AbortSignal,
    attemptIndex: number
  ) => Promise<T>,
  onRetry?: (detail: string) => void
): Promise<T> {
  let lastErr: unknown;
  for (let idx = 0; idx < MODEL_FALLBACK_CHAIN.length; idx++) {
    const { model, thinkingLevel } = MODEL_FALLBACK_CHAIN[idx];
    try {
      return await fn(model, thinkingLevel, AbortSignal.timeout(24_000), idx);
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
      const isTransient =
        /500|502|503|504|429|UNAVAILABLE|INTERNAL|RESOURCE_EXHAUSTED|high demand|overloaded|ETIMEDOUT|ECONNRESET|ECONNABORTED|fetch failed|socket hang up|TimeoutError|AbortError|timed out|aborted|SyntaxError|JSON/i.test(
          msg
        );
      if (!isTransient || idx === MODEL_FALLBACK_CHAIN.length - 1) {
        throw new Error(extractFriendlyGeminiError(err));
      }
      const jitter = Math.floor(Math.random() * 450);
      const delayMs = Math.min(4500, 650 * Math.pow(1.45, idx) + jitter);
      const nextModel = MODEL_FALLBACK_CHAIN[idx + 1]?.model || model;
      onRetry?.(
        `Switching to ${nextModel.includes('flash-lite') ? 'Gemini Flash-Lite' : 'Gemini 4'} (retry ${idx + 2}/${MODEL_FALLBACK_CHAIN.length})...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(extractFriendlyGeminiError(lastErr));
}

async function generateQuizBatch(params: {
  subjectName: string;
  batchCount: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Mixed';
  questionTypes: Array<'mcq' | 'true_false' | 'fill_blank' | 'short_answer' | 'match'>;
  language: 'English' | 'Hindi' | 'Hinglish';
  chunks: SourceChunkContext[];
  sourcePages: SourcePageText[];
  seenTexts: string[];
  rotationOffset: number;
  focusTopics?: string[];
  prioritizeTopChunks?: boolean;
  onRetry?: (detail: string) => void;
}): Promise<{
  candidates: GeneratedQuestionCandidate[];
  tokensUsed: number;
}> {
  const {
    subjectName,
    batchCount,
    difficulty,
    questionTypes,
    language,
    chunks,
    sourcePages,
    seenTexts,
    rotationOffset,
    focusTopics = [],
    prioritizeTopChunks = false,
    onRetry,
  } = params;

  const topicFocusClause =
    focusTopics.length > 0
      ? `\n8. MANDATORY SELECTED TOPIC FOCUS: Every generated question MUST specifically test and relate to these user-selected topic(s)/chapter(s): ${focusTopics.join(', ')}. Ignore unrelated topics even if they appear nearby on the same page.`
      : '';

  const systemInstruction = `You are a strict source-grounded academic examiner for AI QUIZ MASTER.
CRITICAL MANDATORY RULES — NEVER VIOLATE THESE:
1. Use ONLY facts, definitions, formulas, dates, examples, and concepts explicitly written in the PROVIDED SOURCE CHUNKS below.
2. NEVER use outside knowledge, internet knowledge, or pretrained facts not present in the PROVIDED SOURCE CHUNKS.
3. If the provided source chunks only list topic headings, syllabus outlines, or lack factual explanations needed to answer a question, set "insufficientSource": true and return an empty "questions" array.
4. Do NOT invent answers, distractors that contradict the source, or unsupported explanations.
5. Every single question MUST include:
   - "documentId": exact numeric DOC_ID from the chunk header
   - "documentName": exact DOC_NAME
   - "pageNumber": exact numeric PAGE from the chunk header
   - "chapterTitle": exact CHAPTER from the chunk header
   - "evidenceExcerpt": a verbatim, word-for-word continuous quote copied directly from the PROVIDED SOURCE CHUNKS (15 to 45 words) that proves the correctAnswer!
   - "explanation": grounded strictly in the source chunk, citing the page number.
6. Write questions and explanations in ${language}. If language is Hinglish, use natural Hindi+English Roman script while keeping exact verbatim English quotes inside evidenceExcerpt.
7. Never duplicate any of these existing questions: ${seenTexts.slice(-15).join(' | ') || 'None'}.${topicFocusClause}`;

  const response = await callGeminiWithRetry(async (model, thinkingLevel, abortSignal, attemptIdx) => {
    // On retry attempts 2+, reduce context footprint to sail through high-demand spikes
    const maxChunks = attemptIdx >= 2 ? 7 : 12;
    const maxTotalChars = attemptIdx >= 2 ? 9_000 : 15_500;
    const sampled = selectDiverseChunks(chunks, {
      maxChunks,
      maxTotalChars,
      rotationOffset: rotationOffset + attemptIdx * 3,
      prioritizeOrder: prioritizeTopChunks,
    });

    const formattedContext = sampled
      .map(
        (c) =>
          `[DOC_ID:${c.documentId} | DOC_NAME:"${c.documentName}" | PAGE:${c.pageNumber} | CHAPTER:"${c.chapterTitle}"]\n${c.content}`
      )
      .join('\n\n---\n\n');

    const promptFocusLine =
      focusTopics.length > 0
        ? `Selected Topic(s) to Focus On Exclusively: ${focusTopics.join(', ')}\n`
        : '';

    const prompt = `Subject: ${subjectName}
${promptFocusLine}Requested Question Count: ${batchCount}
Target Difficulty: ${difficulty}
Allowed Question Types: ${questionTypes.join(', ')}

Question Type Formats:
- "mcq": Provide exactly 4 distinct options in "options" array, and set "correctAnswer" to the exact option string (not just letter A/B/C/D).
- "true_false": Provide options ["True", "False"], and set "correctAnswer" to "True" or "False".
- "fill_blank": Put "_____" in questionText for a key term from the source, options = [], and "correctAnswer" = exact missing term from the source.
- "short_answer": options = [], "correctAnswer" = concise factual answer directly from the source.
- "match": Provide 3 or 4 pairs in "options" formatted as "Left Item => Right Match", and "correctAnswer" = concise summary of the matching pairs.

PROVIDED SOURCE CHUNKS:
${formattedContext}

Generate up to ${batchCount} strictly source-verified questions${focusTopics.length > 0 ? ` focused specifically on: ${focusTopics.join(', ')}` : ''}. If the text only supports fewer questions (or 0 questions), ONLY generate what is 100% explicitly supported and set "insufficientSource": true if 0 can be grounded.`;

    const res = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        abortSignal,
        systemInstruction,
        thinkingConfig: { thinkingLevel },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            insufficientSource: {
              type: Type.BOOLEAN,
              description: 'True if the source lacks detailed explanatory material to support questions.',
            },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  documentId: { type: Type.INTEGER },
                  documentName: { type: Type.STRING },
                  pageNumber: { type: Type.INTEGER },
                  chapterTitle: { type: Type.STRING },
                  questionType: { type: Type.STRING },
                  difficulty: { type: Type.STRING },
                  questionText: { type: Type.STRING },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  correctAnswer: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                  evidenceExcerpt: { type: Type.STRING },
                },
                required: [
                  'documentId',
                  'documentName',
                  'pageNumber',
                  'chapterTitle',
                  'questionType',
                  'difficulty',
                  'questionText',
                  'options',
                  'correctAnswer',
                  'explanation',
                  'evidenceExcerpt',
                ],
              },
            },
          },
          required: ['insufficientSource', 'questions'],
        },
      },
    });

    const parsed = parseStructuredJson<{
      insufficientSource?: boolean;
      questions?: Array<Partial<GeneratedQuestionCandidate>>;
    }>(res.text || '{}');

    const rawList = Array.isArray(parsed.questions) ? parsed.questions : [];
    const mapped: GeneratedQuestionCandidate[] = rawList.map((item) => {
      const allowedType = questionTypes.includes(
        item.questionType as QuizGenerationParams['questionTypes'][number]
      )
        ? (item.questionType as QuizGenerationParams['questionTypes'][number])
        : questionTypes[0];

      const normalizedDifficulty: 'Easy' | 'Medium' | 'Hard' =
        item.difficulty === 'Easy' || item.difficulty === 'Medium' || item.difficulty === 'Hard'
          ? item.difficulty
          : difficulty === 'Mixed'
            ? 'Medium'
            : difficulty;

      return normalizeCandidateFormat({
        documentId: Number(item.documentId) || sourcePages[0]?.documentId || 0,
        documentName: String(item.documentName || sourcePages[0]?.documentName || ''),
        subjectName,
        chapterTitle: String(item.chapterTitle || 'Full Document'),
        pageNumber: Number(item.pageNumber) || 1,
        questionType: allowedType,
        difficulty: normalizedDifficulty,
        questionText: String(item.questionText || '').trim(),
        options: Array.isArray(item.options) ? item.options.map((o) => String(o)) : [],
        correctAnswer: String(item.correctAnswer || '').trim(),
        explanation: String(item.explanation || '').trim(),
        evidenceExcerpt: String(item.evidenceExcerpt || '').trim(),
      });
    });

    return {
      candidates: mapped,
      tokensUsed: res.usageMetadata?.totalTokenCount || 0,
    };
  }, onRetry);

  return response;
}

export async function generateSourceVerifiedQuiz(
  params: QuizGenerationParams
): Promise<QuizGenerationResult> {
  const {
    subjectName,
    questionCount,
    difficulty,
    questionTypes,
    language,
    chunks,
    sourcePages,
    existingQuestionTexts,
    focusTopics = [],
    prioritizeTopChunks = false,
    onStage,
  } = params;

  onStage?.('Reading your document', `Inspecting ${sourcePages.length} extracted source pages.`);

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  // Step 1: Deterministic sufficiency gate BEFORE calling LLM
  const sufficiency = assessDocumentSufficiency(
    sourcePages.map((p) => ({ pageNumber: p.pageNumber, content: p.content }))
  );
  const focusedMinAllowable =
    focusTopics.length > 0 &&
    sufficiency.totalWords >= 22 &&
    sufficiency.explanatorySentenceCount >= 1;
  if (!sufficiency.sufficient && !focusedMinAllowable) {
    return {
      questions: [],
      rejectedCount: 0,
      insufficientReason: INSUFFICIENT_MSG,
      tokensUsed: 0,
    };
  }

  onStage?.(
    'Understanding chapters',
    focusTopics.length > 0
      ? `Focusing on selected topic(s): ${focusTopics.slice(0, 4).join(', ')}`
      : `Analyzing ${chunks.length} verified study chunks across all pages.`
  );
  onStage?.('Finding relevant information', 'Selecting matching document sections and verifiable evidence.');

  const verifiedQuestions: Array<GeneratedQuestionCandidate & { verifiedSource: boolean }> = [];
  const seenTexts = [...existingQuestionTexts];
  let rejectedCount = 0;
  let totalTokens = 0;

  // Split large quiz sizes (>10 questions) into batches of up to 10 so JSON generation stays fast & reliable
  const batchTargetSize = 10;
  const maxBatches = Math.min(8, Math.ceil(questionCount / batchTargetSize) + 2);
  let lastBatchError: unknown = null;

  for (let batchIdx = 0; batchIdx < maxBatches && verifiedQuestions.length < questionCount; batchIdx++) {
    const remaining = questionCount - verifiedQuestions.length;
    const askCount = Math.min(batchTargetSize, remaining + (remaining > 3 ? 2 : 1));

    onStage?.(
      'Creating questions',
      maxBatches > 1
        ? `Generating batch ${batchIdx + 1} (${verifiedQuestions.length}/${questionCount} verified so far)...`
        : `Generating up to ${questionCount} source-grounded questions.`
    );

    try {
      const batch = await generateQuizBatch({
        subjectName,
        batchCount: askCount,
        difficulty,
        questionTypes,
        language,
        chunks,
        sourcePages,
        seenTexts,
        rotationOffset: existingQuestionTexts.length + batchIdx * 7,
        focusTopics,
        prioritizeTopChunks,
        onRetry: (detail) => onStage?.('Creating questions', detail),
      });

      totalTokens += batch.tokensUsed;
      onStage?.('Checking answers against the PDF', 'Cross-checking generated answers and explanations.');

      for (const candidate of batch.candidates) {
        if (verifiedQuestions.length >= questionCount) break;

        if (isDuplicateQuestion(candidate.questionText, seenTexts)) {
          rejectedCount += 1;
          continue;
        }

        const check = verifyCandidateAgainstSource(candidate, sourcePages);
        if (!check.accepted) {
          rejectedCount += 1;
          continue;
        }

        seenTexts.push(candidate.questionText);
        verifiedQuestions.push({
          ...candidate,
          documentId: check.resolvedDocumentId,
          documentName: check.resolvedDocumentName,
          pageNumber: check.resolvedPageNumber,
          verifiedSource: true,
        });
      }
    } catch (err) {
      lastBatchError = err;
      if (verifiedQuestions.length > 0) {
        // Keep the verified questions we already generated rather than failing the entire quiz
        break;
      }
      if (batchIdx === maxBatches - 1) {
        throw err;
      }
    }
  }

  onStage?.('Verifying source references', 'Validating verbatim evidence excerpts against extracted pages.');
  onStage?.('Preparing your quiz', `Verified ${verifiedQuestions.length} source-backed questions.`);

  if (verifiedQuestions.length === 0) {
    if (lastBatchError instanceof Error) {
      throw lastBatchError;
    }
    return {
      questions: [],
      rejectedCount,
      insufficientReason: INSUFFICIENT_MSG,
      tokensUsed: totalTokens,
    };
  }

  return {
    questions: verifiedQuestions,
    rejectedCount,
    tokensUsed: totalTokens,
  };
}

export async function generateSourceVerifiedFlashcards(params: {
  subjectName: string;
  count: number;
  chunks: SourceChunkContext[];
  sourcePages: SourcePageText[];
}): Promise<FlashcardGenerationResult> {
  const { subjectName, count, chunks, sourcePages } = params;

  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }

  const sufficiency = assessDocumentSufficiency(
    sourcePages.map((p) => ({ pageNumber: p.pageNumber, content: p.content }))
  );
  if (!sufficiency.sufficient) {
    return {
      cards: [],
      insufficientReason: INSUFFICIENT_MSG,
      tokensUsed: 0,
    };
  }

  const { parsed, tokensUsed } = await callGeminiWithRetry(
    async (model, thinkingLevel, abortSignal, attemptIdx) => {
      const sampled = selectDiverseChunks(chunks, {
        maxChunks: attemptIdx >= 2 ? 7 : 12,
        maxTotalChars: attemptIdx >= 2 ? 9_000 : 14_500,
        rotationOffset: attemptIdx * 3,
      });

      const formattedContext = sampled
        .map(
          (c) =>
            `[DOC_ID:${c.documentId} | DOC_NAME:"${c.documentName}" | PAGE:${c.pageNumber}]\n${c.content}`
        )
        .join('\n\n---\n\n');

      const response = await ai.models.generateContent({
        model,
        contents: `Create up to ${count} study flashcards for subject "${subjectName}" strictly from the provided source chunks. Each flashcard must have front (question or term), back (answer or explanation strictly from source), documentId, documentName, pageNumber, and a verbatim 12-40 word evidenceExcerpt from the source.\n\n${formattedContext}`,
        config: {
          abortSignal,
          systemInstruction:
            'Use ONLY facts in the provided source chunks. Never use external knowledge. Every flashcard must include a verbatim evidenceExcerpt copied directly from the source.',
          thinkingConfig: { thinkingLevel },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              cards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    documentId: { type: Type.INTEGER },
                    documentName: { type: Type.STRING },
                    pageNumber: { type: Type.INTEGER },
                    front: { type: Type.STRING },
                    back: { type: Type.STRING },
                    evidenceExcerpt: { type: Type.STRING },
                  },
                  required: ['documentId', 'documentName', 'pageNumber', 'front', 'back', 'evidenceExcerpt'],
                },
              },
            },
            required: ['cards'],
          },
        },
      });

      const json = parseStructuredJson<{
        cards?: Array<{
          documentId: number;
          documentName: string;
          pageNumber: number;
          front: string;
          back: string;
          evidenceExcerpt: string;
        }>;
      }>(response.text || '{}');

      return {
        parsed: json,
        tokensUsed: response.usageMetadata?.totalTokenCount || 0,
      };
    }
  );

  const verifiedCards: FlashcardGenerationResult['cards'] = [];
  for (const card of parsed.cards || []) {
    const check = verifyCandidateAgainstSource(
      {
        documentId: Number(card.documentId) || sourcePages[0]?.documentId || 0,
        documentName: String(card.documentName || sourcePages[0]?.documentName || ''),
        subjectName,
        chapterTitle: 'Flashcards',
        pageNumber: Number(card.pageNumber) || 1,
        questionType: 'short_answer',
        difficulty: 'Medium',
        questionText: card.front,
        options: [],
        correctAnswer: card.back,
        explanation: card.back,
        evidenceExcerpt: card.evidenceExcerpt,
      },
      sourcePages
    );
    if (check.accepted) {
      verifiedCards.push({
        documentId: check.resolvedDocumentId,
        documentName: check.resolvedDocumentName,
        subjectName,
        pageNumber: check.resolvedPageNumber,
        front: card.front.trim(),
        back: card.back.trim(),
        evidenceExcerpt: card.evidenceExcerpt.trim(),
      });
    }
  }

  if (verifiedCards.length === 0) {
    return {
      cards: [],
      insufficientReason: INSUFFICIENT_MSG,
      tokensUsed,
    };
  }

  return { cards: verifiedCards, tokensUsed };
}

