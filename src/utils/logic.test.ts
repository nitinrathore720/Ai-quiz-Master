import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessDocumentSufficiency,
  computeStudyPlanProgressUpdates,
  detectChaptersFromPages,
  filterSourceBySelection,
  parseQuestionCountParam,
  resolvePlannerSessionQuestionCount,
  selectDiverseChunks,
  splitPagesIntoChunks,
} from './documentLogic.ts';
import {
  buildRedactedSourceClue,
  isDuplicateQuestion,
  normalizeCandidateFormat,
  verifyCandidateAgainstSource,
  type GeneratedQuestionCandidate,
} from './sourceVerification.ts';
import { calculateQuizResults } from './quizScoring.ts';

test('assessDocumentSufficiency rejects bare syllabus topic heading', () => {
  const report = assessDocumentSufficiency([
    {
      pageNumber: 1,
      content: 'Chapter 1: Quantum Computing\nTopic 1.1: Qubits\nTopic 1.2: Entanglement',
    },
  ]);
  assert.equal(report.sufficient, false);
  assert.ok(report.reason?.includes('Insufficient information'));
});

test('assessDocumentSufficiency accepts detailed study notes', () => {
  const report = assessDocumentSufficiency([
    {
      pageNumber: 1,
      content:
        'Chapter 1: Cellular Respiration\nCellular respiration is the metabolic pathway that converts glucose into adenosine triphosphate (ATP) inside mitochondria. During glycolysis, one six-carbon glucose molecule is split into two three-carbon pyruvate molecules in the cytoplasm, yielding a net gain of two ATP molecules.',
    },
  ]);
  assert.equal(report.sufficient, true);
  assert.ok(report.totalWords >= 35);
});

test('detectChaptersFromPages preserves chapter boundaries and splits chunks with page numbers', () => {
  const pages = [
    {
      pageNumber: 1,
      content: 'Subject: Biology\nChapter 1: Photosynthesis\nPhotosynthesis converts light energy into chemical energy inside chloroplasts.',
    },
    {
      pageNumber: 2,
      content: 'Chapter 2: Mitosis\nMitosis divides a single parent cell into two genetically identical daughter cells.',
    },
  ];
  const { chapters, pageChapterMap, detectedSubject } = detectChaptersFromPages(pages);
  assert.equal(detectedSubject, 'Biology');
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].title, 'Chapter 1: Photosynthesis');
  assert.equal(chapters[1].title, 'Chapter 2: Mitosis');

  const chunks = splitPagesIntoChunks(pages, pageChapterMap);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].pageNumber, 1);
  assert.equal(chunks[1].pageNumber, 2);
});

test('filterSourceBySelection strictly isolates selected sub-topics, chapters, and comma keywords', () => {
  const pages = [
    {
      documentId: 10,
      pageNumber: 1,
      chapterTitle: 'Chapter 1: Python Data Structures',
      content:
        'Chapter 1: Python Data Structures\n1.1 Python Lists\nLists are ordered mutable collections.\n1.2 Python Dictionaries\nDictionaries store key-value pairs using hash tables for O(1) lookup.',
    },
    {
      documentId: 10,
      pageNumber: 2,
      chapterTitle: 'Chapter 2: Functions and Decorators',
      content:
        'Chapter 2: Functions and Decorators\n2.1 Decorators and Closures\nDecorators wrap callable functions with @wrapper syntax to extend behavior dynamically.',
    },
    {
      documentId: 10,
      pageNumber: 3,
      chapterTitle: 'Chapter 3: File I/O',
      content:
        'Chapter 3: File I/O\nContext managers using the with statement automatically close opened file handles.',
    },
  ];
  const { chapters, pageChapterMap } = detectChaptersFromPages(pages);
  assert.ok(chapters.length >= 3);
  assert.ok(chapters[0].topics.length >= 2, 'Should extract sub-topics like Python Dictionaries');

  const chunks = splitPagesIntoChunks(pages, pageChapterMap).map((c) => ({
    ...c,
    documentId: 10,
  }));

  // 1) Selecting a specific extracted topic ("Python Dictionaries") isolates only Page 1 & ranks it top
  const dictFilter = filterSourceBySelection({
    docs: [{ id: 10, detectedChapters: chapters }],
    pages,
    chunks,
    selectedTopics: ['Python Dictionaries'],
  });
  assert.equal(dictFilter.filteredPages.length, 1);
  assert.equal(dictFilter.filteredPages[0].pageNumber, 1);
  assert.ok(dictFilter.focusTopics.includes('Python Dictionaries'));

  // 2) Selecting multiple comma-separated keywords in topicFilter matches Page 1 & Page 2 only
  const multiFilter = filterSourceBySelection({
    docs: [{ id: 10, detectedChapters: chapters }],
    pages,
    chunks,
    topicFilter: 'Dictionaries, Decorators',
  });
  assert.deepEqual(
    multiFilter.filteredPages.map((p) => p.pageNumber),
    [1, 2]
  );

  // 3) Passing a sub-topic name inside selectedChapters (like Study Planner chapter drill) still matches
  const subTopicAsChapter = filterSourceBySelection({
    docs: [{ id: 10, detectedChapters: chapters }],
    pages,
    chunks,
    selectedChapters: ['Decorators and Closures'],
  });
  assert.equal(subTopicAsChapter.filteredPages.length, 1);
  assert.equal(subTopicAsChapter.filteredPages[0].pageNumber, 2);
});

test('selectDiverseChunks covers full 142-page PDFs evenly, filters TOC noise, and rotates sections', () => {
  const pages = Array.from({ length: 142 }, (_, idx) => {
    const pageNum = idx + 1;
    if (pageNum <= 3) {
      return {
        pageNumber: pageNum,
        chapterTitle: 'Table of Contents',
        chunkIndex: idx,
        content: `Chapter 1 .......... 4\nChapter 2 .......... 25\nChapter 3 .......... 90`,
      };
    }
    return {
      pageNumber: pageNum,
      chapterTitle: `Chapter ${Math.ceil(pageNum / 20)}`,
      chunkIndex: idx,
      content: `On page ${pageNum}, Python programming explains data structures, iterators, generators, exception handling, and object-oriented polymorphism with concrete syntax examples.`,
    };
  });

  const sampleA = selectDiverseChunks(pages, { maxChunks: 12, maxTotalChars: 15_000, rotationOffset: 0 });
  const sampleB = selectDiverseChunks(pages, { maxChunks: 12, maxTotalChars: 15_000, rotationOffset: 5 });

  assert.equal(sampleA.length, 12);
  assert.ok(sampleA.every((c) => c.pageNumber > 3), 'Should skip pure TOC pages');
  assert.ok(sampleA[0].pageNumber < 20 && sampleA[sampleA.length - 1].pageNumber > 110, 'Should span early to late pages');
  assert.notDeepEqual(
    sampleA.map((c) => c.pageNumber),
    sampleB.map((c) => c.pageNumber),
    'Rotation offset should select different pages across repeated quiz generations'
  );
});

test('normalizeCandidateFormat resolves letter answers and true/false variants cleanly', () => {
  const mcq = normalizeCandidateFormat({
    documentId: 1,
    documentName: 'python.pdf',
    subjectName: 'Python',
    chapterTitle: 'Lists',
    pageNumber: 5,
    questionType: 'mcq',
    difficulty: 'Easy',
    questionText: 'Which method appends an element to the end of a Python list?',
    options: ['append()', 'pop()', 'remove()', 'clear()'],
    correctAnswer: 'A',
    explanation: 'append() adds an element to the end of a list.',
    evidenceExcerpt: 'The append() method adds a single element to the end of a Python list.',
  });
  assert.equal(mcq.correctAnswer, 'append()');

  const tf = normalizeCandidateFormat({
    documentId: 1,
    documentName: 'python.pdf',
    subjectName: 'Python',
    chapterTitle: 'Tuples',
    pageNumber: 8,
    questionType: 'true_false',
    difficulty: 'Easy',
    questionText: 'Python tuples are immutable sequences.',
    options: ['true', 'false'],
    correctAnswer: 'true',
    explanation: 'Tuples cannot be modified after creation.',
    evidenceExcerpt: 'Python tuples are immutable sequences whose elements cannot be reassigned.',
  });
  assert.deepEqual(tf.options, ['True', 'False']);
  assert.equal(tf.correctAnswer, 'True');
});

test('verifyCandidateAgainstSource accepts verified evidence (even hyphen-wrapped) and rejects hallucinated evidence', () => {
  const sourcePages = [
    {
      documentId: 10,
      documentName: 'biology.pdf',
      pageNumber: 4,
      content:
        'Photosynthesis takes place inside chloro-\nplasts containing chlorophyll, which absorbs red and blue wavelengths of light to synthesize glucose from carbon dioxide and water.',
    },
  ];

  const valid = verifyCandidateAgainstSource(
    {
      documentId: 10,
      documentName: 'biology.pdf',
      subjectName: 'Biology',
      chapterTitle: 'Chapter 1',
      pageNumber: 4,
      questionType: 'mcq',
      difficulty: 'Easy',
      questionText: 'Where does photosynthesis take place?',
      options: ['Chloroplasts', 'Mitochondria', 'Ribosomes', 'Nucleus'],
      correctAnswer: 'Chloroplasts',
      explanation: 'According to page 4, photosynthesis occurs inside chloroplasts.',
      evidenceExcerpt: 'Photosynthesis takes place inside chloroplasts containing chlorophyll',
    },
    sourcePages
  );
  assert.equal(valid.accepted, true);
  assert.equal(valid.resolvedPageNumber, 4);

  const fabricated = verifyCandidateAgainstSource(
    {
      documentId: 10,
      documentName: 'biology.pdf',
      subjectName: 'Biology',
      chapterTitle: 'Chapter 1',
      pageNumber: 4,
      questionType: 'mcq',
      difficulty: 'Medium',
      questionText: 'Who discovered DNA double helix?',
      options: ['Watson and Crick', 'Mendel', 'Darwin', 'Pasteur'],
      correctAnswer: 'Watson and Crick',
      explanation: 'Watson and Crick discovered DNA in 1953.',
      evidenceExcerpt: 'Watson and Crick discovered the double helix structure of DNA in 1953.',
    },
    sourcePages
  );
  assert.equal(fabricated.accepted, false);
});

test('isDuplicateQuestion catches near-identical questions', () => {
  assert.equal(
    isDuplicateQuestion('What is the powerhouse of the cell?', [
      'What is the powerhouse of the cell',
    ]),
    true
  );
  assert.equal(
    isDuplicateQuestion('How many ATP molecules are produced in glycolysis?', [
      'What is the powerhouse of the cell?',
    ]),
    false
  );
});

test('calculateQuizResults computes exact score, negative marking, and breakdowns', () => {
  const questions = [
    {
      id: 1,
      subjectName: 'Physics',
      chapterTitle: 'Kinematics',
      difficulty: 'Easy',
      questionType: 'mcq',
      correctAnswer: '9.8 m/s^2',
    },
    {
      id: 2,
      subjectName: 'Physics',
      chapterTitle: 'Dynamics',
      difficulty: 'Hard',
      questionType: 'mcq',
      correctAnswer: 'F = ma',
    },
    {
      id: 3,
      subjectName: 'Physics',
      chapterTitle: 'Dynamics',
      difficulty: 'Hard',
      questionType: 'true_false',
      correctAnswer: 'True',
    },
  ];
  const result = calculateQuizResults(
    questions,
    [
      { questionId: 1, selectedAnswer: '9.8 m/s^2' },
      { questionId: 2, selectedAnswer: 'F = mv' },
      { questionId: 3, selectedAnswer: null },
    ],
    2,
    0.5
  );

  assert.equal(result.correctCount, 1);
  assert.equal(result.incorrectCount, 1);
  assert.equal(result.unansweredCount, 1);
  assert.equal(result.score, 1.5);
  assert.equal(result.maxScore, 6);
  assert.equal(result.percentage, 25);
});

test('buildRedactedSourceClue masks the correct answer inside the source excerpt', () => {
  const clue = buildRedactedSourceClue(
    'During glycolysis, one six-carbon glucose molecule generates a net gain of 2 ATP molecules.',
    '2 ATP'
  );
  assert.ok(clue.includes('[_____]'));
  assert.equal(clue.includes('2 ATP'), false);

  const tokenClue = buildRedactedSourceClue(
    'Photosynthesis converts light energy inside chloroplasts.',
    'inside chloroplast organelles'
  );
  assert.ok(tokenClue.includes('[_____]'));
});

test('1200-iteration random-topic quiz generation & scoring pipeline stress test', () => {
  const randomTopics = [
    {
      subject: 'Python Programming',
      fact: 'Python dictionaries store unordered key-value pairs indexed by hashable immutable keys.',
      keyTerm: 'hashable immutable keys',
      distractors: ['mutable linked indices', 'sequential byte offsets', 'floating pointers'],
    },
    {
      subject: 'Macroeconomics',
      fact: 'Gross Domestic Product measures the total market value of final goods produced within domestic borders.',
      keyTerm: 'final goods',
      distractors: ['raw intermediate inventory', 'offshore transfer payments', 'barter services'],
    },
    {
      subject: 'Organic Chemistry',
      fact: 'Alkanes are saturated hydrocarbons containing exclusively single covalent sigma bonds between carbon atoms.',
      keyTerm: 'single covalent sigma bonds',
      distractors: ['triple ionic pi bridges', 'aromatic delocalized rings', 'metallic lattice bonds'],
    },
    {
      subject: 'Quantum Physics',
      fact: 'The Heisenberg uncertainty principle bounds the simultaneous precision of position and momentum measurements.',
      keyTerm: 'position and momentum',
      distractors: ['charge and spin parity', 'mass and thermal entropy', 'wavelength and amplitude'],
    },
    {
      subject: 'Cellular Biology',
      fact: 'Ribosomes translate messenger RNA codons into polypeptide chains during protein synthesis inside cells.',
      keyTerm: 'polypeptide chains',
      distractors: ['phospholipid bilayers', 'glycogen granules', 'nucleotide monomers'],
    },
    {
      subject: 'Constitutional Law',
      fact: 'Judicial review empowers courts to invalidate statutes that conflict with fundamental constitutional provisions.',
      keyTerm: 'Judicial review',
      distractors: ['Executive privilege', 'Legislative immunity', 'Administrative decree'],
    },
    {
      subject: 'Computer Networks',
      fact: 'Transmission Control Protocol establishes reliable ordered byte delivery using a three-way handshake.',
      keyTerm: 'three-way handshake',
      distractors: ['stateless datagram broadcast', 'token ring polling', 'circuit multiplex switch'],
    },
    {
      subject: 'World History',
      fact: 'The printing press accelerated the European Renaissance by reducing the cost of reproducing scholarly texts.',
      keyTerm: 'printing press',
      distractors: ['steam turbine', 'telegraph relay', 'magnetic compass'],
    },
    {
      subject: 'Machine Learning',
      fact: 'Gradient descent iteratively updates model weights opposite to the loss function gradient to minimize error.',
      keyTerm: 'Gradient descent',
      distractors: ['Principal clustering', 'Spectral hashing', 'Symbolic unification'],
    },
    {
      subject: 'Human Anatomy',
      fact: 'Alveoli facilitate pulmonary gas exchange by diffusing oxygen into surrounding capillary blood.',
      keyTerm: 'Alveoli',
      distractors: ['Bronchioles', 'Nephrons', 'Platelets'],
    },
  ];

  const difficulties: Array<'Easy' | 'Medium' | 'Hard'> = ['Easy', 'Medium', 'Hard'];
  const qTypes: Array<GeneratedQuestionCandidate['questionType']> = [
    'mcq',
    'true_false',
    'fill_blank',
    'short_answer',
    'match',
  ];

  let deterministicSeed = 1337;
  const nextRand = () => {
    deterministicSeed = (deterministicSeed * 1664525 + 1013904223) >>> 0;
    return deterministicSeed / 4294967296;
  };

  for (let iter = 0; iter < 1200; iter++) {
    const topic = randomTopics[Math.floor(nextRand() * randomTopics.length)];
    const pageCount = 1 + Math.floor(nextRand() * 160); // 1 to 160 pages (covers 142-page PDF case!)
    const targetPage = 1 + Math.floor(nextRand() * pageCount);
    const sampleCount = Math.min(pageCount, 24);
    const pageNumbers = Array.from({ length: sampleCount }, (_, idx) =>
      idx === sampleCount - 1 && targetPage > sampleCount ? targetPage : idx + 1
    );

    const pages = pageNumbers.map((pageNum) => ({
      pageNumber: pageNum,
      content: `Chapter ${1 + (pageNum % 8)}: ${topic.subject} Core Concepts\n${topic.fact} Additional context on page ${pageNum} clarifies terminology, underlying formulas, boundary conditions, and practical applications for students studying ${topic.subject}. Reviewing these worked examples helps reinforce mastery before examinations.`,
    }));

    const { chapters, pageChapterMap } = detectChaptersFromPages(pages);
    assert.ok(chapters.length >= 1);

    const chunks = splitPagesIntoChunks(pages, pageChapterMap);
    assert.ok(chunks.length >= 1);

    const sufficiency = assessDocumentSufficiency(pages);
    assert.equal(sufficiency.sufficient, true, `Sufficiency failed at iteration ${iter}`);

    const sampled = selectDiverseChunks(chunks, {
      maxChunks: 12,
      maxTotalChars: 15_500,
      rotationOffset: iter,
    });
    assert.ok(sampled.length >= 1 && sampled.length <= 12);

    const qType = qTypes[iter % qTypes.length];
    const difficulty = difficulties[iter % difficulties.length];

    const rawCandidate: GeneratedQuestionCandidate = {
      documentId: iter + 1,
      documentName: `${topic.subject.toLowerCase().replace(/\s+/g, '_')}.pdf`,
      subjectName: topic.subject,
      chapterTitle: pageChapterMap.get(targetPage) || 'Full Document',
      pageNumber: targetPage,
      questionType: qType,
      difficulty,
      questionText:
        qType === 'fill_blank'
          ? `Iteration ${iter}: In ${topic.subject}, _____ plays the core role described on page ${targetPage}.`
          : `Iteration ${iter}: Which concept in ${topic.subject} is verified on page ${targetPage}?`,
      options:
        qType === 'mcq'
          ? [topic.keyTerm, ...topic.distractors]
          : qType === 'true_false'
            ? ['true', 'false']
            : qType === 'match'
              ? [`${topic.subject} => ${topic.keyTerm}`, 'Concept B => Value B', 'Concept C => Value C']
              : [],
      correctAnswer:
        qType === 'mcq'
          ? ['A', 'B', 'C', 'D'][iter % 4] === 'A'
            ? 'A'
            : topic.keyTerm
          : qType === 'true_false'
            ? 'true'
            : topic.keyTerm,
      explanation: `Verified directly from page ${targetPage} of ${topic.subject}.`,
      evidenceExcerpt: topic.fact,
    };

    const normalized = normalizeCandidateFormat(rawCandidate);
    const verification = verifyCandidateAgainstSource(
      normalized,
      pages.map((p) => ({
        documentId: iter + 1,
        documentName: rawCandidate.documentName,
        pageNumber: p.pageNumber,
        content: p.content,
      }))
    );
    assert.equal(
      verification.accepted,
      true,
      `Source verification rejected valid candidate at iter ${iter}: ${verification.reason}`
    );

    const scoreRes = calculateQuizResults(
      [
        {
          id: 1,
          subjectName: topic.subject,
          chapterTitle: normalized.chapterTitle,
          difficulty,
          questionType: qType,
          correctAnswer: normalized.correctAnswer,
        },
      ],
      [{ questionId: 1, selectedAnswer: normalized.correctAnswer }],
      1,
      0.25
    );
    assert.equal(scoreRes.correctCount, 1);
    assert.equal(scoreRes.percentage, 100);
  }
});

test('parseQuestionCountParam strictly validates bounds and rejects empty/non-integer values', () => {
  assert.equal(parseQuestionCountParam(7, { min: 1, max: 50 }), 7);
  assert.equal(parseQuestionCountParam(' 18 ', { min: 1, max: 200 }), 18);
  assert.equal(parseQuestionCountParam('1', { min: 1, max: 50 }), 1);
  assert.equal(parseQuestionCountParam(200, { min: 1, max: 200 }), 200);

  // Reject empty, nullish, decimals, zero/negative, out-of-bounds, and non-numeric strings (no silent fallback)
  assert.equal(parseQuestionCountParam('', { min: 1, max: 50 }), null);
  assert.equal(parseQuestionCountParam('   ', { min: 1, max: 50 }), null);
  assert.equal(parseQuestionCountParam(null, { min: 1, max: 50 }), null);
  assert.equal(parseQuestionCountParam(undefined, { min: 1, max: 50 }), null);
  assert.equal(parseQuestionCountParam(0, { min: 1, max: 50 }), null);
  assert.equal(parseQuestionCountParam(-3, { min: 1, max: 50 }), null);
  assert.equal(parseQuestionCountParam(51, { min: 1, max: 50 }), null);
  assert.equal(parseQuestionCountParam(201, { min: 1, max: 200 }), null);
  assert.equal(parseQuestionCountParam(4.5, { min: 1, max: 50 }), null);
  assert.equal(parseQuestionCountParam('abc', { min: 1, max: 50 }), null);
});

test('resolvePlannerSessionQuestionCount honors explicit Study Planner question counts without fixed defaults', () => {
  assert.equal(resolvePlannerSessionQuestionCount(7, 0, 'full', 50), 7);
  assert.equal(resolvePlannerSessionQuestionCount(23, 0, 'full', 50), 23);
  assert.equal(resolvePlannerSessionQuestionCount(80, 0, 'full', 50), 50);

  assert.equal(resolvePlannerSessionQuestionCount(18, 6, 'remaining', 50), 12);
  assert.equal(resolvePlannerSessionQuestionCount(12, 12, 'remaining', 50), 1);
  assert.equal(resolvePlannerSessionQuestionCount(90, 10, 'remaining', 50), 50);
});

test('computeStudyPlanProgressUpdates automatically increments and completes plans strictly from answered quiz questions', () => {
  const plans = [
    {
      id: 1,
      title: 'Bio Ch1 Plan',
      documentId: 3,
      subjectName: 'Cellular Biology',
      chapterTitle: 'Chapter 1: Glycolysis',
      targetQuestions: 5,
      completedQuestions: 0,
      status: 'pending',
    },
    {
      id: 2,
      title: 'Any Physics Plan',
      documentId: null,
      subjectName: 'Physics',
      chapterTitle: 'All Chapters',
      targetQuestions: 10,
      completedQuestions: 2,
      status: 'in_progress',
    },
    {
      id: 3,
      title: 'Already Done Plan',
      documentId: 3,
      subjectName: 'Cellular Biology',
      chapterTitle: 'All Chapters',
      targetQuestions: 4,
      completedQuestions: 4,
      status: 'completed',
    },
  ];

  // Unanswered quiz submission (0 answered) produces zero updates
  assert.deepEqual(
    computeStudyPlanProgressUpdates(plans, {
      subjectName: 'Cellular Biology',
      documentIds: [3],
      chapterFilter: 'Glycolysis',
      answeredQuestions: [],
    }),
    []
  );

  // Answering 2 Bio questions advances Bio Ch1 Plan to 2/5 (in_progress), skips Physics & Already Done
  const step1 = computeStudyPlanProgressUpdates(plans, {
    subjectName: 'Cellular Biology',
    documentIds: [3],
    chapterFilter: 'Glycolysis',
    answeredQuestions: [
      { documentId: 3, subjectName: 'Cellular Biology', chapterTitle: 'Chapter 1: Glycolysis' },
      { documentId: 3, subjectName: 'Cellular Biology', chapterTitle: 'Chapter 1: Glycolysis' },
    ],
  });
  assert.equal(step1.length, 1);
  assert.equal(step1[0].planId, 1);
  assert.equal(step1[0].completedQuestions, 2);
  assert.equal(step1[0].status, 'in_progress');

  // Answering 4 more Bio questions completes Bio Ch1 Plan (capped at 5/5 -> status 'completed')
  const updatedPlans = plans.map((p) =>
    p.id === 1 ? { ...p, completedQuestions: 2, status: 'in_progress' } : p
  );
  const step2 = computeStudyPlanProgressUpdates(updatedPlans, {
    subjectName: 'Cellular Biology',
    documentIds: [3],
    chapterFilter: 'All Chapters',
    answeredQuestions: [
      { documentId: 3, subjectName: 'Cellular Biology', chapterTitle: 'Chapter 1: Glycolysis' },
      { documentId: 3, subjectName: 'Cellular Biology', chapterTitle: 'Chapter 1: Glycolysis' },
      { documentId: 3, subjectName: 'Cellular Biology', chapterTitle: 'Chapter 1: Glycolysis' },
      { documentId: 3, subjectName: 'Cellular Biology', chapterTitle: 'Chapter 2: Unrelated' },
    ],
  });
  assert.equal(step2.length, 1);
  assert.equal(step2[0].addedQuestions, 3);
  assert.equal(step2[0].completedQuestions, 5);
  assert.equal(step2[0].status, 'completed');
});




