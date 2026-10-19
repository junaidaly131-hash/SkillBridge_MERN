import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, FileText, Loader2, RefreshCcw } from "lucide-react";
import apiClient from "../../api/client";
import { useToast } from "../../ui/Toast";
import TutorMarkdown from "./TutorMarkdown";
import FlashcardsPanel from "./FlashcardsPanel";
import StudyProgressPanel from "./StudyProgressPanel";

const LANGUAGES = [
  ["english", "English"],
  ["urdu", "Urdu"],
  ["roman-urdu", "Roman Urdu"],
];

function requestId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `study_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function Select({ label, value, onChange, children }) {
  return (
    <label className="text-xs font-semibold text-gray">
      <span className="block mb-1.5">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-[#D8D8D8] bg-white px-3 py-2.5 text-sm text-black outline-none focus:border-teal"
      >
        {children}
      </select>
    </label>
  );
}

function SourceButtons({ sources, onSource }) {
  if (!sources?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2" aria-label="Document sources">
      {sources.map((source) => (
        <button
          type="button"
          key={`${source.sourceId}-${source.chunkId}`}
          onClick={() => onSource(source)}
          className="inline-flex items-center gap-1.5 rounded-full border border-teal/30 bg-light-teal px-2.5 py-1 text-[11px] font-semibold text-teal hover:border-teal"
        >
          <FileText size={12} /> {source.sourceId} - {source.label}
        </button>
      ))}
    </div>
  );
}

function SummaryView({ summary, onSource }) {
  if (!summary) return null;
  return (
    <article className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-black capitalize">{summary.length} summary</h2>
          <p className="text-xs text-gray capitalize">{summary.language.replace("-", " ")}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${summary.coverage?.status === "full" ? "bg-light-teal text-teal" : "bg-light-gray text-dark-blue"}`}>
          {summary.coverage?.status === "full" ? "Full document coverage" : "Partial document coverage"}
        </span>
      </div>
      <TutorMarkdown>{summary.overview}</TutorMarkdown>
      {summary.keyConcepts?.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 text-sm font-bold text-black">Key concepts</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-black">
            {summary.keyConcepts.map((concept) => <li key={concept}>{concept}</li>)}
          </ul>
        </section>
      )}
      {summary.importantTerms?.length > 0 && (
        <section className="mt-5">
          <h3 className="mb-2 text-sm font-bold text-black">Important terms</h3>
          <dl className="space-y-2">
            {summary.importantTerms.map((item) => (
              <div key={`${item.term}-${item.definition}`} className="rounded-xl bg-light-bg p-3 text-sm">
                <dt className="font-semibold text-black">{item.term}</dt>
                <dd className="mt-1 text-gray">{item.definition}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {summary.coverage?.note && <p className="mt-4 text-xs leading-5 text-gray">{summary.coverage.note}</p>}
      <SourceButtons sources={summary.sources} onSource={onSource} />
    </article>
  );
}

export default function StudyToolsPanel({ mode, documentId, enabled, quotaExhausted, onUsage, onSource }) {
  const { error: showError } = useToast();
  const [workspace, setWorkspace] = useState({ summaries: [], quizzes: [], attempts: [], decks: [] });
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [language, setLanguage] = useState("english");
  const [summaryLength, setSummaryLength] = useState("short");
  const [activeSummary, setActiveSummary] = useState(null);
  const [quizCount, setQuizCount] = useState("5");
  const [difficulty, setDifficulty] = useState("beginner");
  const [attempt, setAttempt] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const loadWorkspace = useCallback(async () => {
    if (!enabled || !documentId) return;
    setLoading(true);
    try {
      const response = await apiClient.get(`/ai-tutor/documents/${documentId}/study`);
      setWorkspace(response.data);
      setActiveSummary((current) => current || response.data.summaries?.[0] || null);
    } catch (requestError) {
      showError(requestError.response?.data?.message || "Couldn't load document study tools.");
    } finally {
      setLoading(false);
    }
  }, [documentId, enabled, showError]);

  useEffect(() => {
    setActiveSummary(null);
    setAttempt(null);
    setQuestionIndex(0);
    loadWorkspace();
  }, [loadWorkspace]);

  const generateSummary = async (regenerate = false) => {
    setWorking(true);
    try {
      const response = await apiClient.post(`/ai-tutor/documents/${documentId}/summaries`, {
        clientRequestId: requestId(), language, length: summaryLength, regenerate,
      });
      setActiveSummary(response.data.summary);
      onUsage(response.data.usage);
      await loadWorkspace();
      setActiveSummary(response.data.summary);
    } catch (requestError) {
      showError(requestError.response?.data?.message || "Couldn't generate that summary.");
      if (requestError.response?.data?.usage) onUsage(requestError.response.data.usage);
    } finally {
      setWorking(false);
    }
  };

  const generateQuiz = async () => {
    setWorking(true);
    try {
      const response = await apiClient.post(`/ai-tutor/documents/${documentId}/quizzes`, {
        clientRequestId: requestId(), count: Number(quizCount), difficulty, language,
      });
      onUsage(response.data.usage);
      await loadWorkspace();
      await startAttempt(response.data.quiz.id);
    } catch (requestError) {
      showError(requestError.response?.data?.message || "Couldn't generate that quiz.");
      if (requestError.response?.data?.usage) onUsage(requestError.response.data.usage);
    } finally {
      setWorking(false);
    }
  };

  const startAttempt = async (quizId) => {
    setWorking(true);
    try {
      const response = await apiClient.post(`/ai-tutor/quizzes/${quizId}/attempts`, {});
      setAttempt(response.data.attempt);
      setQuestionIndex(0);
    } catch (requestError) {
      showError(requestError.response?.data?.message || "Couldn't start this quiz.");
    } finally {
      setWorking(false);
    }
  };

  const openAttempt = async (attemptId) => {
    setWorking(true);
    try {
      const response = await apiClient.get(`/ai-tutor/quiz-attempts/${attemptId}`);
      setAttempt(response.data.attempt);
      setQuestionIndex(0);
    } catch (requestError) {
      showError(requestError.response?.data?.message || "Couldn't open this quiz attempt.");
    } finally {
      setWorking(false);
    }
  };

  const chooseAnswer = async (selectedOptionIndex) => {
    if (!attempt || attempt.status === "submitted") return;
    const previous = attempt;
    const answers = [...(attempt.answers || []).filter((item) => item.questionIndex !== questionIndex), { questionIndex, selectedOptionIndex }];
    setAttempt({ ...attempt, answers });
    try {
      const response = await apiClient.patch(`/ai-tutor/quiz-attempts/${attempt.id}/answers`, { questionIndex, selectedOptionIndex });
      setAttempt(response.data.attempt);
    } catch (requestError) {
      setAttempt(previous);
      showError(requestError.response?.data?.message || "Couldn't save that answer.");
    }
  };

  const submitAttempt = async () => {
    setWorking(true);
    setConfirmSubmit(false);
    try {
      const response = await apiClient.post(`/ai-tutor/quiz-attempts/${attempt.id}/submit`, {});
      setAttempt(response.data.attempt);
      await loadWorkspace();
    } catch (requestError) {
      showError(requestError.response?.data?.message || "Couldn't submit this quiz.");
    } finally {
      setWorking(false);
    }
  };

  const answers = useMemo(() => new Map((attempt?.answers || []).map((item) => [item.questionIndex, item.selectedOptionIndex])), [attempt]);
  const currentQuestion = attempt?.quiz?.questions?.[questionIndex];
  const unanswered = attempt ? attempt.totalQuestions - answers.size : 0;

  if (!enabled) {
    return <div className="flex-1 grid place-items-center p-6 text-center text-sm text-gray">Document study tools are not enabled for this deployment.</div>;
  }
  if (loading) {
    return <div className="flex-1 grid place-items-center"><Loader2 className="animate-spin text-teal" size={28} /></div>;
  }

  if (mode === "progress") return <StudyProgressPanel />;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-light-bg p-3 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        {mode === "summary" && (
          <>
            <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Language" value={language} onChange={setLanguage}>{LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
                <Select label="Length" value={summaryLength} onChange={setSummaryLength}><option value="short">Short</option><option value="detailed">Detailed</option></Select>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => generateSummary(false)} disabled={working || quotaExhausted} className="inline-flex items-center gap-2 rounded-xl bg-dark-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45">
                  {working ? <Loader2 className="animate-spin" size={16} /> : <BookOpen size={16} />} Generate or open saved summary
                </button>
                {activeSummary && <button type="button" onClick={() => generateSummary(true)} disabled={working || quotaExhausted} className="inline-flex items-center gap-2 rounded-xl border border-[#D8D8D8] px-4 py-2.5 text-sm font-semibold text-dark-blue disabled:opacity-45"><RefreshCcw size={15} /> Regenerate</button>}
              </div>
              <p className="mt-2 text-[11px] text-gray">Opening a saved summary is free. Generate and regenerate each use one daily AI Tutor turn.</p>
            </section>
            {workspace.summaries?.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Saved summaries">
                {workspace.summaries.map((summary) => <button type="button" key={summary.id} onClick={() => setActiveSummary(summary)} className={`shrink-0 rounded-xl border px-3 py-2 text-left text-xs ${activeSummary?.id === summary.id ? "border-teal bg-light-teal text-teal" : "border-[#E5E5E5] bg-white text-gray"}`}><span className="block font-semibold capitalize">{summary.length} · {summary.language.replace("-", " ")}</span><span>{summary.coverage?.status} coverage</span></button>)}
              </div>
            )}
            {activeSummary ? (
              <SummaryView
                summary={activeSummary}
                onSource={(source) =>
                  onSource(`/ai-tutor/summaries/${activeSummary.id}/sources/${source.chunkId}`, source)
                }
              />
            ) : (
              <div className="mx-auto flex min-h-48 w-full max-w-2xl flex-col items-center justify-center rounded-2xl border border-dashed border-teal/30 bg-white px-6 py-10 text-center sm:min-h-56">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-light-teal text-teal">
                  <BookOpen size={22} />
                </div>
                <h2 className="text-base font-bold text-black">No summary yet</h2>
                <p className="mt-1.5 max-w-md text-sm leading-6 text-gray">
                  Choose a language and length above, then generate a grounded document summary.
                </p>
              </div>
            )}
          </>
        )}

        {mode === "quiz" && (
          <>
            {!attempt && (
              <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Select label="Questions" value={quizCount} onChange={setQuizCount}><option value="5">5 questions</option><option value="10">10 questions</option></Select>
                  <Select label="Difficulty" value={difficulty} onChange={setDifficulty}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></Select>
                  <Select label="Language" value={language} onChange={setLanguage}>{LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
                </div>
                <button type="button" onClick={generateQuiz} disabled={working || quotaExhausted} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-dark-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45">{working && <Loader2 className="animate-spin" size={16} />} Generate practice quiz</button>
                <p className="mt-2 text-[11px] text-gray">Generating a quiz uses one daily AI Tutor turn. Attempts, review, and retakes are free.</p>
              </section>
            )}

            {!attempt && (workspace.quizzes?.length > 0 || workspace.attempts?.length > 0) && (
              <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4">
                <h2 className="mb-3 font-bold text-black">Saved quizzes</h2>
                <div className="space-y-2">
                  {workspace.quizzes.map((quiz) => {
                    const quizAttempts = workspace.attempts.filter((item) => item.quizId === quiz.id);
                    return <div key={quiz.id} className="rounded-xl bg-light-bg p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-black capitalize">{quiz.questionCount} questions · {quiz.difficulty}</p><p className="text-xs text-gray capitalize">{quiz.language.replace("-", " ")}</p></div><button type="button" onClick={() => startAttempt(quiz.id)} className="rounded-lg bg-dark-blue px-3 py-2 text-xs font-semibold text-white">{quizAttempts.length ? "Retake" : "Start"}</button></div>{quizAttempts.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Attempt history">{quizAttempts.map((item, index) => <button type="button" key={item.id} onClick={() => openAttempt(item.id)} className="rounded-lg border border-[#D8D8D8] bg-white px-3 py-2 text-xs font-semibold text-dark-blue">{item.status === "submitted" ? `Attempt ${quizAttempts.length - index}: ${item.score}%` : `Attempt ${quizAttempts.length - index}: Resume`}</button>)}</div>}</div>;
                  })}
                </div>
              </section>
            )}

            {attempt && currentQuestion && (
              <section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-xs font-semibold text-teal">Question {questionIndex + 1} of {attempt.totalQuestions}</p><p className="text-xs text-gray capitalize">{attempt.quiz.difficulty} · {attempt.quiz.language.replace("-", " ")}</p></div>
                  {attempt.status === "submitted" && <span className="rounded-full bg-light-teal px-3 py-1 text-sm font-bold text-teal">Score: {attempt.score}%</span>}
                </div>
                <h2 className="text-base font-bold leading-7 text-black">{currentQuestion.question}</h2>
                <div className="mt-4 space-y-2">
                  {currentQuestion.options.map((option, index) => {
                    const selected = answers.get(questionIndex) === index;
                    const correct = attempt.status === "submitted" && currentQuestion.correctIndex === index;
                    const wrong = attempt.status === "submitted" && selected && !correct;
                    return <button type="button" key={`${index}-${option}`} onClick={() => chooseAnswer(index)} disabled={attempt.status === "submitted"} className={`w-full rounded-xl border p-3 text-left text-sm transition-colors ${correct ? "border-teal bg-light-teal text-black" : wrong ? "border-red-300 bg-red-50 text-red-700" : selected ? "border-dark-blue bg-dark-blue/5 text-black" : "border-[#E5E5E5] text-black hover:border-teal"}`}><span className="mr-2 font-bold">{String.fromCharCode(65 + index)}.</span>{option}</button>;
                  })}
                </div>
                {attempt.status === "submitted" && <div className="mt-4 rounded-xl bg-light-bg p-4"><p className="flex items-center gap-2 text-sm font-semibold text-black"><CheckCircle2 size={16} className="text-teal" />Explanation</p><p className="mt-2 text-sm leading-6 text-gray">{currentQuestion.explanation}</p><SourceButtons sources={currentQuestion.sources} onSource={(source) => onSource(`/ai-tutor/quiz-attempts/${attempt.id}/sources/${questionIndex}/${source.chunkId}`, source)} /></div>}
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => setQuestionIndex((value) => Math.max(0, value - 1))} disabled={questionIndex === 0} className="rounded-lg border border-[#D8D8D8] px-3 py-2 text-xs font-semibold disabled:opacity-40">Previous</button>
                  <div className="flex flex-wrap justify-center gap-1">{attempt.quiz.questions.map((_, index) => <button type="button" key={index} onClick={() => setQuestionIndex(index)} aria-label={`Go to question ${index + 1}`} className={`h-8 w-8 rounded-lg text-xs font-semibold ${questionIndex === index ? "bg-dark-blue text-white" : answers.has(index) ? "bg-light-teal text-teal" : "bg-light-gray text-gray"}`}>{index + 1}</button>)}</div>
                  {questionIndex < attempt.totalQuestions - 1 ? <button type="button" onClick={() => setQuestionIndex((value) => value + 1)} className="rounded-lg bg-dark-blue px-3 py-2 text-xs font-semibold text-white">Next</button> : attempt.status === "in_progress" ? <button type="button" onClick={() => unanswered ? setConfirmSubmit(true) : submitAttempt()} disabled={working} className="rounded-lg bg-teal-button px-3 py-2 text-xs font-semibold text-white">Submit quiz</button> : <button type="button" onClick={() => { setAttempt(null); setConfirmSubmit(false); }} className="rounded-lg bg-dark-blue px-3 py-2 text-xs font-semibold text-white">Back to quizzes</button>}
                </div>
                {confirmSubmit && <div role="alert" className="mt-4 rounded-xl border border-[#D8D8D8] bg-light-bg p-3 text-sm text-black"><p>{unanswered} unanswered {unanswered === 1 ? "question will" : "questions will"} be marked incorrect. Submit now?</p><div className="mt-3 flex gap-2"><button type="button" onClick={submitAttempt} className="rounded-lg bg-dark-blue px-3 py-2 text-xs font-semibold text-white">Submit</button><button type="button" onClick={() => setConfirmSubmit(false)} className="rounded-lg border border-[#D8D8D8] px-3 py-2 text-xs font-semibold">Keep answering</button></div></div>}
              </section>
            )}
          </>
        )}

        {mode === "flashcards" && (
          <FlashcardsPanel
            documentId={documentId}
            decks={workspace.decks || []}
            quotaExhausted={quotaExhausted}
            onUsage={onUsage}
            onRefresh={loadWorkspace}
            onSource={onSource}
          />
        )}
      </div>
    </div>
  );
}
