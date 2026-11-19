import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  achievements,
  documentChunks,
  documentPages,
  documents,
  flashcards,
  questions,
  quizAttempts,
  quizzes,
  studyPlans,
  subjects,
  subscriptions,
  systemConfig,
  userResponses,
  users,
} from '../db/schema.ts';
import { detectChaptersFromPages, splitPagesIntoChunks } from '../utils/documentLogic.ts';
import { hashPassword } from './auth.ts';

export const DEFAULT_PLANS_CONFIG = {
  plans: [
    {
      id: 'free',
      name: 'Free',
      audience: 'For individual learners getting started',
      priceMonthlyUsd: 0,
      maxDocuments: 10,
      maxQuizzesPerMonth: 25,
      features: [
        'Up to 10 uploaded study documents',
        'Up to 25 source-verified quizzes per month',
        'PDF, DOCX, PPTX, and TXT extraction',
        'Source-page citations & evidence highlights',
      ],
    },
    {
      id: 'pro',
      name: 'Pro',
      audience: 'For daily exam prep and multi-subject mastery',
      priceMonthlyUsd: 14,
      maxDocuments: 75,
      maxQuizzesPerMonth: 200,
      features: [
        'Up to 75 uploaded study documents',
        'Up to 200 source-verified quizzes per month',
        'Scanned PDF OCR + multi-chapter mixing',
        'Weak-topic drill generator & PDF/CSV exports',
      ],
    },
    {
      id: 'premium',
      name: 'Premium',
      audience: 'For intensive cohorts and full syllabus archives',
      priceMonthlyUsd: 29,
      maxDocuments: 500,
      maxQuizzesPerMonth: 1500,
      features: [
        'Up to 500 uploaded study documents',
        'Up to 1,500 source-verified quizzes per month',
        'Unlimited flashcards & adaptive revision decks',
        'Full performance breakdowns & priority processing',
      ],
    },
  ],
  features: {
    ocrFallbackEnabled: true,
    strictSourceVerification: true,
    hinglishSupported: true,
    allowSignups: true,
  },
};

export async function ensureSystemDefaults(): Promise<void> {
  await db
    .insert(systemConfig)
    .values({
      key: 'plans_and_features',
      value: DEFAULT_PLANS_CONFIG as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: systemConfig.key });
}

export async function getOrSeedDemoStudent(): Promise<typeof users.$inferSelect> {
  const demoEmail = 'alex@aiquizmaster.app';
  const existing = await db.select().from(users).where(eq(users.email, demoEmail)).limit(1);
  if (existing.length > 0) {
    return existing[0];
  }

  const [demoUser] = await db
    .insert(users)
    .values({
      uid: `demo_${crypto.randomUUID()}`,
      name: 'Alex Rivera',
      email: demoEmail,
      passwordHash: hashPassword('ScholarPass2026!'),
      role: 'student',
      emailVerified: true,
      xp: 280,
      level: 3,
      streakDays: 4,
      lastStudyDate: new Date().toISOString().slice(0, 10),
    })
    .returning();

  await db
    .insert(subscriptions)
    .values({
      userId: demoUser.id,
      plan: 'pro',
      status: 'active',
      maxDocuments: 75,
      maxQuizzesPerMonth: 200,
    })
    .onConflictDoNothing({ target: subscriptions.userId });

  const [bioSubject] = await db
    .insert(subjects)
    .values({
      userId: demoUser.id,
      name: 'Cellular Biology',
      color: '#3B82F6',
    })
    .returning();

  const samplePages = [
    {
      pageNumber: 1,
      content:
        'Subject: Cellular Biology\nChapter 1: Cellular Respiration & ATP Synthesis\nCellular respiration is the biochemical process by which cells oxidize glucose to produce adenosine triphosphate (ATP), the primary energy currency of the cell. The complete aerobic oxidation of one glucose molecule yields approximately 30 to 32 ATP molecules across three coordinated stages: glycolysis, the citric acid cycle, and oxidative phosphorylation.\nGlycolysis takes place in the cytosol and does not require oxygen. In this ten-step pathway, one six-carbon glucose molecule is cleaved into two three-carbon pyruvate molecules, generating a net gain of 2 ATP molecules via substrate-level phosphorylation and 2 NADH molecules.',
    },
    {
      pageNumber: 2,
      content:
        'Chapter 2: The Citric Acid Cycle and Electron Transport\nWhen oxygen is present, pyruvate enters the mitochondrial matrix and is converted into acetyl-CoA by the pyruvate dehydrogenase complex, releasing one molecule of carbon dioxide per pyruvate. Acetyl-CoA then enters the citric acid cycle (also called the Krebs cycle), which completes the breakdown of glucose derivatives into carbon dioxide while producing 3 NADH, 1 FADH2, and 1 GTP (or ATP) per turn of the cycle.\nDuring oxidative phosphorylation along the inner mitochondrial membrane, electrons from NADH and FADH2 pass through protein complexes I through IV, pumping protons into the intermembrane space. The resulting electrochemical proton gradient drives ATP synthase to phosphorylate ADP into ATP, with molecular oxygen serving as the final electron acceptor to form water.',
    },
  ];

  const { chapters, pageChapterMap } = detectChaptersFromPages(samplePages);
  const chunks = splitPagesIntoChunks(samplePages, pageChapterMap);

  const [doc] = await db
    .insert(documents)
    .values({
      userId: demoUser.id,
      subjectId: bioSubject.id,
      subjectName: 'Cellular Biology',
      folderName: 'Semester 1',
      title: 'Cellular Respiration Lecture Notes',
      fileName: 'cellular_respiration_notes.txt',
      fileType: 'txt',
      fileSize: 2140,
      pageCount: samplePages.length,
      status: 'ready',
      detectedChapters: chapters,
    })
    .returning();

  for (const p of samplePages) {
    await db.insert(documentPages).values({
      documentId: doc.id,
      userId: demoUser.id,
      pageNumber: p.pageNumber,
      chapterTitle: pageChapterMap.get(p.pageNumber) || 'Full Document',
      content: p.content,
      wordCount: p.content.split(/\s+/).length,
    });
  }

  for (const c of chunks) {
    await db.insert(documentChunks).values({
      documentId: doc.id,
      userId: demoUser.id,
      pageNumber: c.pageNumber,
      chapterTitle: c.chapterTitle,
      chunkIndex: c.chunkIndex,
      content: c.content,
    });
  }

  const [quiz] = await db
    .insert(quizzes)
    .values({
      userId: demoUser.id,
      title: 'Cellular Respiration Core Quiz',
      subjectName: 'Cellular Biology',
      documentIds: [doc.id],
      chapterFilter: 'All Chapters',
      difficulty: 'Mixed',
      questionTypes: ['mcq', 'true_false'],
      language: 'English',
      mode: 'practice',
      timeLimitSeconds: 300,
      marksPerQuestion: 1,
      negativeMarking: 0,
      questionCount: 3,
    })
    .returning();

  const seededQuestions = await db
    .insert(questions)
    .values([
      {
        quizId: quiz.id,
        userId: demoUser.id,
        documentId: doc.id,
        documentName: doc.fileName,
        subjectName: 'Cellular Biology',
        chapterTitle: 'Chapter 1: Cellular Respiration & ATP Synthesis',
        pageNumber: 1,
        questionType: 'mcq',
        difficulty: 'Easy',
        questionText: 'Where does glycolysis take place inside the cell?',
        options: ['Cytosol', 'Mitochondrial matrix', 'Inner mitochondrial membrane', 'Nucleus'],
        correctAnswer: 'Cytosol',
        explanation: 'Page 1 states that glycolysis takes place in the cytosol and does not require oxygen.',
        evidenceExcerpt: 'Glycolysis takes place in the cytosol and does not require oxygen.',
        verifiedSource: true,
        isBookmarked: true,
        bookmarkNote: 'Remember glycolysis happens outside mitochondria.',
      },
      {
        quizId: quiz.id,
        userId: demoUser.id,
        documentId: doc.id,
        documentName: doc.fileName,
        subjectName: 'Cellular Biology',
        chapterTitle: 'Chapter 1: Cellular Respiration & ATP Synthesis',
        pageNumber: 1,
        questionType: 'mcq',
        difficulty: 'Medium',
        questionText: 'What is the net ATP gain produced directly during glycolysis per glucose molecule?',
        options: ['2 ATP', '4 ATP', '30 ATP', '1 GTP'],
        correctAnswer: '2 ATP',
        explanation: 'Page 1 explains that glycolysis generates a net gain of 2 ATP molecules via substrate-level phosphorylation.',
        evidenceExcerpt: 'generating a net gain of 2 ATP molecules via substrate-level phosphorylation',
        verifiedSource: true,
      },
      {
        quizId: quiz.id,
        userId: demoUser.id,
        documentId: doc.id,
        documentName: doc.fileName,
        subjectName: 'Cellular Biology',
        chapterTitle: 'Chapter 2: The Citric Acid Cycle and Electron Transport',
        pageNumber: 2,
        questionType: 'true_false',
        difficulty: 'Medium',
        questionText: 'Molecular oxygen serves as the final electron acceptor in oxidative phosphorylation to form water.',
        options: ['True', 'False'],
        correctAnswer: 'True',
        explanation: 'Page 2 states that molecular oxygen serves as the final electron acceptor to form water.',
        evidenceExcerpt: 'with molecular oxygen serving as the final electron acceptor to form water.',
        verifiedSource: true,
      },
    ])
    .returning();

  const [attempt] = await db
    .insert(quizAttempts)
    .values({
      quizId: quiz.id,
      userId: demoUser.id,
      score: 2,
      maxScore: 3,
      percentage: 66.7,
      correctCount: 2,
      incorrectCount: 1,
      unansweredCount: 0,
      timeTakenSeconds: 112,
      xpEarned: 45,
      subjectBreakdown: [{ name: 'Cellular Biology', correct: 2, total: 3, accuracy: 67 }],
      chapterBreakdown: [
        { name: 'Chapter 1: Cellular Respiration & ATP Synthesis', correct: 1, total: 2, accuracy: 50 },
        { name: 'Chapter 2: The Citric Acid Cycle and Electron Transport', correct: 1, total: 1, accuracy: 100 },
      ],
      difficultyBreakdown: [
        { name: 'Easy', correct: 1, total: 1, accuracy: 100 },
        { name: 'Medium', correct: 1, total: 2, accuracy: 50 },
      ],
    })
    .returning();

  await db.insert(userResponses).values([
    {
      attemptId: attempt.id,
      questionId: seededQuestions[0].id,
      userId: demoUser.id,
      selectedAnswer: 'Cytosol',
      isCorrect: true,
      markedForReview: false,
      timeSpentSeconds: 30,
    },
    {
      attemptId: attempt.id,
      questionId: seededQuestions[1].id,
      userId: demoUser.id,
      selectedAnswer: '4 ATP',
      isCorrect: false,
      markedForReview: true,
      timeSpentSeconds: 45,
    },
    {
      attemptId: attempt.id,
      questionId: seededQuestions[2].id,
      userId: demoUser.id,
      selectedAnswer: 'True',
      isCorrect: true,
      markedForReview: false,
      timeSpentSeconds: 37,
    },
  ]);

  await db.insert(flashcards).values([
    {
      userId: demoUser.id,
      documentId: doc.id,
      documentName: doc.fileName,
      subjectName: 'Cellular Biology',
      pageNumber: 1,
      front: 'What is the primary energy currency produced by cellular respiration?',
      back: 'Adenosine triphosphate (ATP)',
      evidenceExcerpt: 'produce adenosine triphosphate (ATP), the primary energy currency of the cell.',
      difficultyRating: 'Easy',
      reviewCount: 2,
    },
    {
      userId: demoUser.id,
      documentId: doc.id,
      documentName: doc.fileName,
      subjectName: 'Cellular Biology',
      pageNumber: 2,
      front: 'Which enzyme complex converts pyruvate into acetyl-CoA?',
      back: 'The pyruvate dehydrogenase complex, releasing one CO2 per pyruvate.',
      evidenceExcerpt: 'converted into acetyl-CoA by the pyruvate dehydrogenase complex',
      difficultyRating: 'Medium',
      reviewCount: 1,
    },
  ]);

  await db.insert(studyPlans).values({
    userId: demoUser.id,
    documentId: doc.id,
    title: 'Master Glycolysis & Citric Acid Cycle',
    subjectName: 'Cellular Biology',
    chapterTitle: 'Chapter 1: Cellular Respiration & ATP Synthesis',
    targetDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
    targetQuestions: 15,
    completedQuestions: 3,
    status: 'in_progress',
  });

  await db.insert(achievements).values({
    userId: demoUser.id,
    badgeKey: 'first_quiz',
    title: 'First Quiz',
    description: 'Completed your first source-verified practice quiz.',
  });

  return demoUser;
}

export async function ensureAdminAccount(): Promise<void> {
  const adminEmail = 'admin@aiquizmaster.app';
  const existing = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existing.length === 0) {
    const [admin] = await db
      .insert(users)
      .values({
        uid: `admin_${crypto.randomUUID()}`,
        name: 'Platform Administrator',
        email: adminEmail,
        passwordHash: hashPassword('AdminMaster2026!'),
        role: 'admin',
        emailVerified: true,
      })
      .returning();
    await db
      .insert(subscriptions)
      .values({
        userId: admin.id,
        plan: 'premium',
        status: 'active',
        maxDocuments: 500,
        maxQuizzesPerMonth: 1500,
      })
      .onConflictDoNothing({ target: subscriptions.userId });
  }
}
