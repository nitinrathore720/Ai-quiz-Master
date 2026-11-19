import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  FileSearch,
  FileText,
  Layers,
  ShieldCheck,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { HeroBrainCanvas } from './three/HeroBrainCanvas';
import { apiFetch } from '../lib/api';
import type { PlanConfig } from '../types';

interface LandingPageProps {
  onStartAuth: (initialMode?: 'signup' | 'login') => void;
  onDemoLogin: () => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
}

const DEMO_STEPS = [
  {
    id: 'upload',
    step: '01. Upload Your Syllabus',
    title: 'Student uploads lecture PDF',
    detail:
      'Drag and drop PDF, DOCX, PPTX, or TXT study notes. Pages, chapters, and headings are extracted locally on the server.',
    previewTitle: 'Cellular_Respiration_Notes.pdf · Page 1',
    previewBody:
      'Glycolysis takes place in the cytosol and does not require oxygen. One six-carbon glucose molecule is cleaved into two three-carbon pyruvate molecules, generating a net gain of 2 ATP molecules.',
    highlight: 'net gain of 2 ATP molecules',
  },
  {
    id: 'scan',
    step: '02. AI Scans Document',
    title: 'Page-level chunking & chapter mapping',
    detail:
      'Your material is split into searchable page-indexed chunks. No external search engines or outside internet articles are ever queried.',
    previewTitle: 'Indexed Chunks · Page 1 & Page 2',
    previewBody:
      'Detected Chapter 1: Cellular Respiration & ATP Synthesis (Pages 1–1) · Detected Chapter 2: Citric Acid Cycle (Pages 2–2).',
    highlight: 'Chapter 1: Cellular Respiration',
  },
  {
    id: 'verify',
    step: '03. Source-Verified Questions',
    title: 'PDF pages transform into verified question cards',
    detail:
      'Every generated question must pass a strict verbatim evidence check against your uploaded text before it reaches your screen.',
    previewTitle: 'Verified Question · 100% Based on Your Uploaded Material',
    previewBody:
      'Q: What is the net ATP gain produced directly during glycolysis per glucose molecule?  Options: A) 2 ATP  B) 4 ATP  C) 30 ATP  D) 1 GTP',
    highlight: 'Answer: 2 ATP (Page 1)',
  },
  {
    id: 'practice',
    step: '04. Practice & Analyze',
    title: 'Interactive 3D quiz, instant source citation & analytics',
    detail:
      'Click "View PDF Source" on any question to jump directly to the supporting page and track weak chapters over time.',
    previewTitle: 'Real-Time Analytics & Weak-Topic Revision',
    previewBody:
      'Accuracy: 88% · Chapter 1 Mastery: 92% · Chapter 2 Revision Queue: 2 Flashcards Ready.',
    highlight: 'View PDF Source · Page 1',
  },
];

const FAQS = [
  {
    q: 'Does AI QUIZ MASTER use internet knowledge or outside facts?',
    a: 'No. Every question, answer key, explanation, and flashcard is generated strictly from the text extracted from your uploaded documents. Any candidate whose verbatim evidence excerpt cannot be verified against your uploaded pages is automatically rejected.',
  },
  {
    q: 'What happens if I upload a bare syllabus listing only topic titles?',
    a: 'If your uploaded PDF only contains topic headings without explanations or definitions, our sufficiency check refuses to invent answers and notifies you to upload fuller study notes.',
  },
  {
    q: 'Which document formats and languages are supported?',
    a: 'You can upload PDF (including scanned PDFs via OCR), DOCX, PPTX, and TXT files. Quizzes can be generated in English, Hindi, or Hinglish.',
  },
  {
    q: 'Are my uploaded PDFs and quiz results private?',
    a: 'Yes. Every document, page chunk, quiz, and result is isolated to your authenticated user account with private server-side authorization checks on every request.',
  },
];

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartAuth,
  onDemoLogin,
  theme,
  onToggleTheme,
  reducedMotion,
  onToggleReducedMotion,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [plans, setPlans] = useState<PlanConfig[]>([]);
  const [selectedCardTopic, setSelectedCardTopic] = useState<string | null>(null);
  const [sampleChoice, setSampleChoice] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ plans: PlanConfig[] }>('/api/plans')
      .then((res) => setPlans(res.plans || []))
      .catch(() => {
        // fallback handled cleanly if plans request fails
      });
  }, []);

  const currentDemo = DEMO_STEPS[activeStep];
  const cardLiftClass = reducedMotion
    ? ''
    : 'transition-transform duration-200 hover:-translate-y-1 hover:shadow-2xl';

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 text-slate-900 dark:bg-[#050814] dark:text-slate-100">
      {/* Subtle ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 left-1/4 w-[540px] h-[540px] rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-[480px] h-[480px] rounded-full bg-violet-600/10 blur-3xl" />
      </div>

      {/* Top Navigation Bar: Strict 3-Zone Contract */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/90 dark:bg-[#050814]/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2 sm:gap-8">
          <a href="#top" className="whitespace-nowrap shrink-0">
            <BrandLogo />
          </a>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
            <a href="#how-it-works" className="hover:text-blue-600 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              How It Works
            </a>
            <a href="#features" className="hover:text-blue-600 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Features
            </a>
            <a href="#pricing" className="hover:text-blue-600 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              Pricing
            </a>
            <a href="#faq" className="hover:text-blue-600 dark:hover:text-white transition-colors whitespace-nowrap shrink-0">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onStartAuth('signup')}
              className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-600/25 transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              Start Learning for Free
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="relative z-10">
        {/* HERO SECTION */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-10 pb-16 lg:pt-14 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-6">
              <p className="text-sm font-semibold text-blue-600 dark:text-cyan-400 tracking-wide">
                Your Syllabus. Your AI. Your Success.
              </p>

              <h1
                style={{ textWrap: 'balance' }}
                className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.08] text-slate-900 dark:text-white"
              >
                Turn Your Syllabus Into Your Personal AI Quiz Master
              </h1>

              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
                Upload your PDF. Generate unlimited practice questions. Learn smarter. Score higher. Every question is verified word-for-word against your own study material.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => onStartAuth('signup')}
                  className="inline-flex items-center gap-2 px-6 py-3.5 text-sm sm:text-base font-semibold text-white bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-xl shadow-xl shadow-blue-600/25 transition-transform active:scale-[0.98] whitespace-nowrap cursor-pointer"
                >
                  <span>Start Learning for Free</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <a
                  href="#features"
                  className="inline-flex items-center gap-2 px-5 py-3.5 text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 hover:border-blue-500 rounded-xl transition-colors whitespace-nowrap"
                >
                  Explore Features
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={() => onStartAuth('login')}
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Already have an account? Sign in
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onDemoLogin}
                  className="font-medium text-slate-700 dark:text-slate-200 hover:text-blue-500 cursor-pointer"
                >
                  Try Demo Student Account
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onToggleTheme}
                  aria-label="Toggle color theme"
                  className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={onToggleReducedMotion}
                  className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  {reducedMotion ? 'Enable 3D Motion' : 'Reduce Motion'}
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 relative">
              <HeroBrainCanvas
                reducedMotion={reducedMotion}
                onCardClick={(topic) => setSelectedCardTopic(topic)}
              />
              {selectedCardTopic && (
                <div className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                  Selected 3D document node: <span className="font-semibold text-blue-500">{selectedCardTopic}</span> — upload your own PDFs inside the workspace.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* INTERACTIVE PIPELINE DEMO */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-4 sm:px-6 py-14 border-t border-slate-200/70 dark:border-slate-800/70">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
              How It Works: From Your PDF to Verified Mastery
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              Select each stage to inspect how AI QUIZ MASTER extracts your syllabus, verifies evidence spans, and builds interactive practice sessions.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-5 flex flex-col gap-3">
              {DEMO_STEPS.map((item, idx) => {
                const isActive = idx === activeStep;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveStep(idx)}
                    className={`text-left p-5 rounded-xl border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-blue-600/10 border-blue-500 shadow-lg shadow-blue-500/10'
                        : 'bg-white/60 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-semibold text-blue-600 dark:text-cyan-400">
                      {item.step}
                    </div>
                    <div className="mt-1 font-display text-lg font-semibold text-slate-900 dark:text-white">
                      {item.title}
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.detail}</p>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-7 glass-surface rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                  <span className="font-mono text-xs font-medium text-blue-600 dark:text-cyan-400">
                    {currentDemo.previewTitle}
                  </span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    100% Based on Your Uploaded Material
                  </span>
                </div>

                <motion.div
                  key={currentDemo.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="p-5 rounded-xl bg-slate-100/80 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <p className="text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-200">
                    {currentDemo.previewBody}
                  </p>
                  <div className="text-xs font-mono text-blue-600 dark:text-cyan-300 pt-2 border-t border-slate-200 dark:border-slate-800">
                    Verified Span: &ldquo;{currentDemo.highlight}&rdquo;
                  </div>
                </motion.div>

                {/* Interactive Try-It-Now Sample Question */}
                <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-blue-600 dark:text-cyan-400">
                      Try It Live — Sample Source-Verified Question
                    </span>
                    <span className="font-mono text-slate-500">Page 1 · Glycolysis</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    What is the net ATP gain produced directly during glycolysis per glucose molecule?
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['2 ATP', '4 ATP', '30 ATP', '1 GTP'].map((opt) => {
                      const picked = sampleChoice === opt;
                      const isCorrect = opt === '2 ATP';
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setSampleChoice(opt)}
                          className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                            picked
                              ? isCorrect
                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-500/20 border-amber-500 text-amber-700 dark:text-amber-300'
                              : 'border-slate-300 dark:border-slate-700 hover:border-blue-500 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                  {sampleChoice && (
                    <div className="text-xs text-slate-700 dark:text-slate-200 pt-1">
                      {sampleChoice === '2 ATP' ? (
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          Correct!{' '}
                        </span>
                      ) : (
                        <span className="font-semibold text-amber-600 dark:text-amber-400">
                          Not quite — the correct answer is 2 ATP.{' '}
                        </span>
                      )}
                      Verified in <span className="font-mono">Cellular_Respiration_Notes.pdf · Page 1</span>: &ldquo;generating a net gain of 2 ATP molecules.&rdquo;
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-[16/9]">
                <img
                  src="/src/assets/images/ai_learning_lab_1795015261196.jpg"
                  alt="AI QUIZ MASTER futuristic neural learning lab transforming syllabus documents into verified quizzes"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
          </div>
        </section>

        {/* CORE PILLARS & FEATURES BENTO */}
        <section id="features" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-200/70 dark:border-slate-800/70">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
              Built for Source Accuracy and Deep Retention
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              Every module works together around your private document vault—never inventing unsupported facts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-5">
            <div className={`md:col-span-3 glass-surface rounded-2xl p-6 space-y-3 ${cardLiftClass}`}>
              <FileText className="w-6 h-6 text-blue-500" />
              <h3 className="font-display text-xl font-bold">Upload Your Syllabus</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Supports PDF, DOCX, PPTX, and TXT files with automatic chapter detection, page-number preservation, and OCR fallback for scanned notes.
              </p>
            </div>

            <div className={`md:col-span-3 glass-surface rounded-2xl p-6 space-y-3 ${cardLiftClass}`}>
              <FileSearch className="w-6 h-6 text-violet-500" />
              <h3 className="font-display text-xl font-bold">Strict Source-Only AI Quiz Generation</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                External web search is disabled. Every question is validated against your extracted pages and ships with a &ldquo;View PDF Source&rdquo; button.
              </p>
            </div>

            <div className={`md:col-span-2 glass-surface rounded-2xl p-6 space-y-3 ${cardLiftClass}`}>
              <BookOpenCheck className="w-6 h-6 text-cyan-500" />
              <h3 className="font-display text-lg font-bold">Practice &amp; Exam Modes</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                MCQs, True/False, Fill in the Blanks, Short Answer, and Match pairs with timers, negative marking, and review flags.
              </p>
            </div>

            <div className={`md:col-span-2 glass-surface rounded-2xl p-6 space-y-3 ${cardLiftClass}`}>
              <BarChart3 className="w-6 h-6 text-emerald-500" />
              <h3 className="font-display text-lg font-bold">Performance Analytics</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Real subject, chapter, and difficulty accuracy charts computed strictly from your completed quiz attempts.
              </p>
            </div>

            <div className={`md:col-span-2 glass-surface rounded-2xl p-6 space-y-3 ${cardLiftClass}`}>
              <Layers className="w-6 h-6 text-amber-500" />
              <h3 className="font-display text-lg font-bold">Smart Revision &amp; Flashcards</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                3D flip flashcards, weak-topic drills, personal bookmarks, question bank exports (PDF/CSV), and daily study goals.
              </p>
            </div>
          </div>
        </section>

        {/* PRICING PLANS */}
        <section id="pricing" className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-200/70 dark:border-slate-800/70">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
              Transparent Study Plans
            </h2>
            <p className="mt-3 text-slate-600 dark:text-slate-300">
              Start free with full source verification. Upgrade limits can be configured by platform administrators.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(plans.length > 0
              ? plans
              : [
                  {
                    id: 'free',
                    name: 'Free',
                    audience: 'For individual learners getting started',
                    priceMonthlyUsd: 0,
                    maxDocuments: 10,
                    maxQuizzesPerMonth: 25,
                    features: [
                      'Up to 10 uploaded study documents',
                      'Up to 25 source-verified quizzes/month',
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
                      'Up to 200 source-verified quizzes/month',
                      'Scanned PDF OCR & weak-topic drills',
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
                      'Up to 1,500 source-verified quizzes/month',
                      'Unlimited flashcards & full analytics',
                    ],
                  },
                ]
            ).map((plan) => (
              <div
                key={plan.id}
                className={`glass-surface rounded-2xl p-6 flex flex-col justify-between ${cardLiftClass} ${
                  plan.id === 'pro' ? 'ring-2 ring-blue-500/70' : ''
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                      {plan.name}
                    </h3>
                    <span className="font-mono text-2xl font-bold tabular-nums text-blue-600 dark:text-cyan-400">
                      ${plan.priceMonthlyUsd}
                      <span className="text-xs font-normal text-slate-500">/mo</span>
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{plan.audience}</p>
                  <ul className="mt-5 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => onStartAuth('signup')}
                  className={`mt-6 w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                    plan.id === 'pro'
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'border border-slate-300 dark:border-slate-700 hover:border-blue-500 text-slate-800 dark:text-slate-100'
                  }`}
                >
                  {plan.priceMonthlyUsd === 0 ? 'Get Started Free' : 'Start Free Trial'}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ SECTION */}
        <section id="faq" className="max-w-4xl mx-auto px-4 sm:px-6 py-16 border-t border-slate-200/70 dark:border-slate-800/70">
          <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mb-8">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {FAQS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q} className="glass-surface rounded-xl overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 font-display font-semibold text-slate-900 dark:text-white cursor-pointer"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`w-4 h-4 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* QUIET FOOTER */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <BrandLogo compact />
            <span>AI QUIZ MASTER — Your Syllabus. Your AI. Your Success.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#how-it-works" className="hover:text-slate-900 dark:hover:text-white">How It Works</a>
            <a href="#features" className="hover:text-slate-900 dark:hover:text-white">Features</a>
            <a href="#pricing" className="hover:text-slate-900 dark:hover:text-white">Pricing</a>
            <button
              type="button"
              onClick={() => onStartAuth('login')}
              className="hover:text-slate-900 dark:hover:text-white cursor-pointer inline-flex items-center gap-1"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span>Student Portal</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
