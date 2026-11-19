import mammoth from 'mammoth';
import JSZip from 'jszip';
import { GoogleGenAI } from '@google/genai';
import {
  countWords,
  detectChaptersFromPages,
  normalizeText,
  splitPagesIntoChunks,
  type DetectedChapterInfo,
  type DocumentChunkRecord,
  type ExtractedPageInput,
} from '../utils/documentLogic.ts';

export interface DocumentExtractionOutcome {
  status: 'ready' | 'warning' | 'error';
  warningMessage: string | null;
  pageCount: number;
  pages: Array<{
    pageNumber: number;
    chapterTitle: string;
    content: string;
    wordCount: number;
  }>;
  chunks: DocumentChunkRecord[];
  detectedChapters: DetectedChapterInfo[];
  detectedSubject: string;
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function extractPdfTextPages(buffer: Buffer): Promise<{
  pages: ExtractedPageInput[];
  needsOcr: boolean;
  errorReason?: string;
}> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
      verbosity: 0,
    });
    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const pages: ExtractedPageInput[] = [];
    let totalChars = 0;

    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();
      const lines: Array<{ y: number; text: string }> = [];
      let currentY: number | null = null;
      let currentParts: string[] = [];

      for (const rawItem of textContent.items) {
        const item = rawItem as { str?: string; transform?: number[] };
        const str = item.str ?? '';
        if (!str) continue;
        const y = Array.isArray(item.transform) ? Math.round(item.transform[5]) : 0;
        if (currentY === null || Math.abs(y - currentY) <= 4) {
          currentParts.push(str);
          if (currentY === null) currentY = y;
        } else {
          lines.push({ y: currentY, text: currentParts.join(' ').trim() });
          currentY = y;
          currentParts = [str];
        }
      }
      if (currentParts.length > 0) {
        lines.push({ y: currentY ?? 0, text: currentParts.join(' ').trim() });
      }

      const pageText = normalizeText(lines.map((l) => l.text).join('\n'));
      totalChars += pageText.length;
      pages.push({ pageNumber: i, content: pageText });
    }

    await loadingTask.destroy();
    const needsOcr = totalChars < 30 && numPages > 0;
    return { pages, needsOcr };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/password/i.test(msg)) {
      return {
        pages: [],
        needsOcr: false,
        errorReason: 'This PDF is password-protected. Please unlock or unprotect it before uploading.',
      };
    }
    return {
      pages: [],
      needsOcr: false,
      errorReason: 'The PDF file appears corrupted or unreadable. Please verify the file and try again.',
    };
  }
}

async function runGeminiPdfOcr(buffer: Buffer, fallbackPageCount: number): Promise<ExtractedPageInput[]> {
  if (!process.env.GEMINI_API_KEY) {
    return [];
  }
  const base64 = buffer.toString('base64');
  const models = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
  let text = '';

  for (let i = 0; i < models.length; i++) {
    try {
      const response = await ai.models.generateContent({
        model: models[i],
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64,
              },
            },
            {
              text:
                'Perform strict OCR transcription of every readable page in this PDF. ' +
                'Do not summarize, do not add external information, and do not invent missing text. ' +
                'Prefix each page with ===PAGE N=== (starting at 1). If pages are blank or illegible, output ===UNREADABLE===.',
            },
          ],
        },
        config: {
          abortSignal: AbortSignal.timeout(30_000),
        },
      });
      text = (response.text || '').trim();
      if (text) break;
    } catch {
      if (i < models.length - 1) {
        await new Promise((r) => setTimeout(r, 900 * (i + 1)));
      }
    }
  }

  if (!text || text.includes('===UNREADABLE===')) {
    return [];
  }

  const pageMatches = text.split(/===PAGE\s+(\d+)===/i);
  if (pageMatches.length >= 3) {
    const parsed: ExtractedPageInput[] = [];
    for (let i = 1; i < pageMatches.length; i += 2) {
      const pageNum = parseInt(pageMatches[i], 10) || parsed.length + 1;
      const body = normalizeText(pageMatches[i + 1] || '');
      if (body) parsed.push({ pageNumber: pageNum, content: body });
    }
    return parsed;
  }

  const normalized = normalizeText(text);
  if (!normalized) return [];
  return Array.from({ length: Math.max(1, fallbackPageCount) }, (_, idx) => ({
    pageNumber: idx + 1,
    content: idx === 0 ? normalized : '',
  })).filter((p) => p.content.length > 0);
}

function paginatePlainText(rawText: string, wordsPerPage = 420): ExtractedPageInput[] {
  const clean = normalizeText(rawText);
  if (!clean) return [];

  if (clean.includes('\f')) {
    return clean
      .split('\f')
      .map((part, idx) => ({ pageNumber: idx + 1, content: normalizeText(part) }))
      .filter((p) => p.content.length > 0);
  }

  const paragraphs = clean.split(/\n\n+/);
  const pages: ExtractedPageInput[] = [];
  let current: string[] = [];
  let wordTally = 0;

  for (const para of paragraphs) {
    const w = countWords(para);
    if (wordTally > 0 && wordTally + w > wordsPerPage) {
      pages.push({ pageNumber: pages.length + 1, content: current.join('\n\n') });
      current = [para];
      wordTally = w;
    } else {
      current.push(para);
      wordTally += w;
    }
  }
  if (current.length > 0) {
    pages.push({ pageNumber: pages.length + 1, content: current.join('\n\n') });
  }
  return pages;
}

async function extractPptxSlides(buffer: Buffer): Promise<ExtractedPageInput[]> {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      return numA - numB;
    });

  const pages: ExtractedPageInput[] = [];
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async('string');
    const matches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g));
    const slideText = normalizeText(
      matches
        .map((m) =>
          m[1]
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
        )
        .join(' ')
    );
    pages.push({ pageNumber: i + 1, content: slideText });
  }
  return pages.filter((p) => p.content.length > 0);
}

export async function extractDocumentContent(
  buffer: Buffer,
  fileName: string,
  fileType: 'pdf' | 'docx' | 'pptx' | 'txt'
): Promise<DocumentExtractionOutcome> {
  let rawPages: ExtractedPageInput[] = [];
  let warningMessage: string | null = null;

  if (fileType === 'pdf') {
    const pdfResult = await extractPdfTextPages(buffer);
    if (pdfResult.errorReason) {
      return {
        status: 'error',
        warningMessage: pdfResult.errorReason,
        pageCount: 0,
        pages: [],
        chunks: [],
        detectedChapters: [],
        detectedSubject: 'General',
      };
    }

    if (pdfResult.needsOcr) {
      try {
        const ocrPages = await runGeminiPdfOcr(buffer, pdfResult.pages.length || 1);
        if (ocrPages.length === 0) {
          return {
            status: 'warning',
            warningMessage:
              'This PDF appears to contain scanned images that could not be extracted accurately via OCR. Please upload a clearer scan or selectable-text PDF.',
            pageCount: pdfResult.pages.length || 1,
            pages: [],
            chunks: [],
            detectedChapters: [],
            detectedSubject: 'General',
          };
        }
        rawPages = ocrPages;
        warningMessage = 'Processed scanned PDF pages via OCR. Review extracted text before generating quizzes.';
      } catch {
        return {
          status: 'warning',
          warningMessage:
            'This scanned PDF could not be processed with OCR right now. Please upload a text-based PDF or TXT/DOCX file.',
          pageCount: pdfResult.pages.length || 1,
          pages: [],
          chunks: [],
          detectedChapters: [],
          detectedSubject: 'General',
        };
      }
    } else {
      rawPages = pdfResult.pages.filter((p) => p.content.trim().length > 0);
    }
  } else if (fileType === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer });
      rawPages = paginatePlainText(result.value || '');
    } catch {
      return {
        status: 'error',
        warningMessage: `Could not parse DOCX file "${fileName}". Ensure it is a valid Word document.`,
        pageCount: 0,
        pages: [],
        chunks: [],
        detectedChapters: [],
        detectedSubject: 'General',
      };
    }
  } else if (fileType === 'pptx') {
    try {
      rawPages = await extractPptxSlides(buffer);
    } catch {
      return {
        status: 'error',
        warningMessage: `Could not parse PPTX file "${fileName}". Ensure it is a valid PowerPoint file.`,
        pageCount: 0,
        pages: [],
        chunks: [],
        detectedChapters: [],
        detectedSubject: 'General',
      };
    }
  } else {
    rawPages = paginatePlainText(buffer.toString('utf8'));
  }

  if (rawPages.length === 0) {
    return {
      status: 'warning',
      warningMessage: 'No readable text was found in this document.',
      pageCount: 0,
      pages: [],
      chunks: [],
      detectedChapters: [],
      detectedSubject: 'General',
    };
  }

  const { chapters, pageChapterMap, detectedSubject } = detectChaptersFromPages(rawPages);
  const chunks = splitPagesIntoChunks(rawPages, pageChapterMap);

  const enrichedPages = rawPages.map((p) => ({
    pageNumber: p.pageNumber,
    chapterTitle: pageChapterMap.get(p.pageNumber) || 'Full Document',
    content: p.content,
    wordCount: countWords(p.content),
  }));

  return {
    status: warningMessage ? 'warning' : 'ready',
    warningMessage,
    pageCount: enrichedPages.length,
    pages: enrichedPages,
    chunks,
    detectedChapters: chapters,
    detectedSubject,
  };
}
