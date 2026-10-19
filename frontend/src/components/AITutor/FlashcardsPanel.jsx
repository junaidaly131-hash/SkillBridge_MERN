import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, Eye, FileText, Layers3, Loader2, RotateCcw, Trash2 } from "lucide-react";
import apiClient from "../../api/client";
import ConfirmModal from "../Modal/ConfirmModal";
import { useToast } from "../../ui/Toast";
import TutorMarkdown from "./TutorMarkdown";

const LANGUAGES = [["english", "English"], ["urdu", "Urdu"], ["roman-urdu", "Roman Urdu"]];

function requestId(prefix) {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}

function Select({ label, value, onChange, children }) {
  return <label className="text-xs font-semibold text-gray"><span className="mb-1.5 block">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-[#D8D8D8] bg-white px-3 py-2.5 text-sm text-black outline-none focus:border-teal">{children}</select></label>;
}

export default function FlashcardsPanel({ documentId, decks, quotaExhausted, onUsage, onRefresh, onSource }) {
  const toast = useToast();
  const [count, setCount] = useState("10");
  const [language, setLanguage] = useState("english");
  const [working, setWorking] = useState(false);
  const [session, setSession] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const ratingRef = useRef(null);
  const matchingDeck = decks?.find(
    (deck) => deck.requestedCount === Number(count) && deck.language === language
  );

  useEffect(() => {
    if (revealed) ratingRef.current?.focus();
  }, [revealed]);

  const generate = async () => {
    setWorking(true);
    try {
      const response = await apiClient.post(`/ai-tutor/documents/${documentId}/flashcard-decks`, {
        clientRequestId: requestId("deck"), count: Number(count), language,
      });
      onUsage(response.data.usage);
      await onRefresh();
      toast.success(`${response.data.deck.cardCount} grounded flashcards saved.`);
    } catch (error) {
      if (error.response?.data?.usage) onUsage(error.response.data.usage);
      toast.error(error.response?.data?.message || "Couldn't generate flashcards.");
    } finally { setWorking(false); }
  };

  const start = async (deckId, mode) => {
    setWorking(true);
    try {
      const response = await apiClient.post(`/ai-tutor/flashcard-decks/${deckId}/review-sessions`, { mode });
      setSession(response.data.session);
      setRevealed(false);
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't start this review.");
    } finally { setWorking(false); }
  };

  const reveal = async () => {
    try {
      const response = await apiClient.post(`/ai-tutor/flashcard-review-sessions/${session.id}/reveal`, {});
      setSession(response.data.session);
      setRevealed(true);
    } catch (error) { toast.error(error.response?.data?.message || "Couldn't reveal this answer."); }
  };

  const rate = async (rating) => {
    setWorking(true);
    try {
      const response = await apiClient.post(`/ai-tutor/flashcard-review-sessions/${session.id}/rate`, {
        eventId: requestId("review"),
        rating,
        expectedStateVersion: session.currentCard.stateVersion,
        expectedSessionVersion: session.version,
      });
      setSession(response.data.session);
      setRevealed(false);
      await onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.message || "Couldn't save that rating.");
    } finally { setWorking(false); }
  };

  const removeDeck = async () => {
    if (!deleteTarget) return;
    setWorking(true);
    try {
      await apiClient.delete(`/ai-tutor/flashcard-decks/${deleteTarget.id}`);
      if (session?.deck?.id === deleteTarget.id) setSession(null);
      setDeleteTarget(null);
      await onRefresh();
      toast.success("Flashcard deck deleted.");
    } catch (error) { toast.error(error.response?.data?.message || "Couldn't delete that deck."); }
    finally { setWorking(false); }
  };

  if (session) {
    if (session.status === "completed") {
      return <section className="mx-auto max-w-2xl rounded-2xl border border-[#E5E5E5] bg-white p-6 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-light-teal text-teal"><BookOpenCheck size={24} /></div><h2 className="text-lg font-bold text-black">Review complete</h2><p className="mt-2 text-sm text-gray">You reviewed {session.totalCards} cards in this finite {session.mode === "extra" ? "extra-practice" : "scheduled"} session.</p><p className="mt-1 text-xs text-gray">Self-ratings guide revision timing; they are not a mastery score.</p><button type="button" onClick={() => setSession(null)} className="mt-5 rounded-xl bg-dark-blue px-4 py-2.5 text-sm font-semibold text-white">Back to saved decks</button></section>;
    }
    const card = session.currentCard;
    const rtl = session.deck.language === "urdu";
    return <section className="mx-auto max-w-3xl" aria-live="polite"><div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray"><span>{session.mode === "extra" ? "Extra practice — schedule unchanged" : "Scheduled review"}</span><span>Card {session.currentIndex + 1} of {session.totalCards}</span></div><div className="rounded-2xl border border-[#E5E5E5] bg-white p-5 sm:p-8" dir={rtl ? "rtl" : "ltr"}><p className="text-xs font-semibold uppercase tracking-wide text-teal">Question</p><h2 className="mt-3 text-lg font-bold leading-8 text-black">{card.prompt}</h2>{revealed && card.answer !== undefined ? <div className="mt-6 border-t border-[#E5E5E5] pt-5"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-teal">Answer</p><TutorMarkdown>{card.answer}</TutorMarkdown>{card.explanation && <div className="mt-4 rounded-xl bg-light-bg p-4 text-sm text-gray"><TutorMarkdown>{card.explanation}</TutorMarkdown></div>}<div className="mt-4 flex flex-wrap gap-2" aria-label="Card sources">{card.sources?.map((source) => <button type="button" key={source.chunkId} onClick={() => onSource(`/ai-tutor/flashcard-decks/${session.deck.id}/cards/${card.id}/sources/${source.chunkId}`, source)} className="inline-flex items-center gap-1.5 rounded-full border border-teal/30 bg-light-teal px-2.5 py-1 text-[11px] font-semibold text-teal"><FileText size={12} />{source.sourceId} - {source.label}</button>)}</div></div> : <button type="button" onClick={reveal} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-dark-blue px-5 py-3 text-sm font-semibold text-white"><Eye size={17} />Reveal answer</button>}</div>{revealed && <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Rate this card"><button ref={ratingRef} type="button" disabled={working} onClick={() => rate("again")} className="rounded-xl border border-[#D8D8D8] bg-white px-4 py-3 text-sm font-semibold text-black focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-50">Again · 10 min</button><button type="button" disabled={working} onClick={() => rate("hard")} className="rounded-xl border border-[#D8D8D8] bg-white px-4 py-3 text-sm font-semibold text-black focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-50">Hard · 1 day</button><button type="button" disabled={working} onClick={() => rate("remembered")} className="rounded-xl bg-teal-button px-4 py-3 text-sm font-semibold text-white focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-50">Remembered</button></div>}</section>;
  }

  return <><section className="rounded-2xl border border-[#E5E5E5] bg-white p-4"><div className="grid gap-3 sm:grid-cols-2"><Select label="Cards" value={count} onChange={setCount}><option value="10">10 cards</option><option value="20">20 cards</option></Select><Select label="Language" value={language} onChange={setLanguage}>{LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>{matchingDeck && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-light-teal p-3 text-xs text-gray"><span>A matching {matchingDeck.cardCount}-card deck is already saved. Open it free, or generate a separate deck.</span><button type="button" disabled={working} onClick={() => start(matchingDeck.id, matchingDeck.dueCount || matchingDeck.newCount ? "scheduled" : "extra")} className="rounded-lg border border-teal/30 bg-white px-3 py-2 font-semibold text-teal disabled:opacity-45">Open saved deck</button></div>}<button type="button" onClick={generate} disabled={working || quotaExhausted} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-dark-blue px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-45">{working ? <Loader2 className="animate-spin" size={16} /> : <Layers3 size={16} />}Generate new deck</button><p className="mt-2 text-[11px] text-gray">Generation uses one AI Tutor turn. Opening and reviewing saved decks is free.</p></section><section className="mt-4 rounded-2xl border border-[#E5E5E5] bg-white p-4"><h2 className="font-bold text-black">Saved decks</h2>{decks?.length ? <div className="mt-3 space-y-3">{decks.map((deck) => <article key={deck.id} className="rounded-xl bg-light-bg p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-black">{deck.cardCount} cards · <span className="capitalize">{deck.language.replace("-", " ")}</span></p><p className="mt-1 text-xs text-gray">{deck.dueCount} due · {deck.newCount} new{deck.insufficientReason ? ` · Generated fewer: ${deck.insufficientReason}` : ""}</p></div><button type="button" aria-label="Delete flashcard deck" onClick={() => setDeleteTarget(deck)} className="rounded-lg p-2 text-gray hover:bg-white hover:text-red-600"><Trash2 size={16} /></button></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={working || (!deck.dueCount && !deck.newCount)} onClick={() => start(deck.id, "scheduled")} className="rounded-lg bg-teal-button px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><BookOpenCheck className="mr-1 inline" size={14} />Review / resume due & new</button><button type="button" disabled={working} onClick={() => start(deck.id, "extra")} className="rounded-lg border border-[#D8D8D8] bg-white px-3 py-2 text-xs font-semibold text-dark-blue"><RotateCcw className="mr-1 inline" size={14} />Extra practice / resume</button></div></article>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-teal/30 p-8 text-center text-sm text-gray">Generate a grounded deck to start reviewing.</div>}</section><ConfirmModal isOpen={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} onConfirm={removeDeck} title="Delete flashcard deck?" message="This permanently removes the deck, review schedule, and resumable sessions." confirmLabel="Delete deck" confirmingLabel="Deleting..." isConfirming={working} /></>;
}
