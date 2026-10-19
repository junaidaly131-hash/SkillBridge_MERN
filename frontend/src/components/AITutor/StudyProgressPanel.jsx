import { useEffect, useState } from "react";
import { BarChart3, Layers3, Loader2, RotateCcw } from "lucide-react";
import apiClient from "../../api/client";
import { useToast } from "../../ui/Toast";

export default function StudyProgressPanel() {
  const { error: showError } = useToast();
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    apiClient.get(`/ai-tutor/study-progress?timezone=${encodeURIComponent(timezone)}`)
      .then((response) => { if (active) setProgress(response.data); })
      .catch((error) => { if (active) showError(error.response?.data?.message || "Couldn't load study progress."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [showError]);

  if (loading) return <div className="grid flex-1 place-items-center"><Loader2 className="animate-spin text-teal" size={28} /></div>;
  if (!progress) return <div className="p-6 text-center text-sm text-gray">Study progress is unavailable.</div>;
  const cards = progress.flashcards;
  const metrics = [
    ["Saved decks", cards.totalDecks], ["Saved cards", cards.totalCards],
    ["Never reviewed", cards.neverReviewed], ["Currently due", cards.currentlyDue],
  ];
  return <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar bg-light-bg p-3 sm:p-6"><div className="mx-auto max-w-4xl space-y-4"><section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-6"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-light-teal text-teal"><BarChart3 size={22} /></div><div><h2 className="font-bold text-black">Study progress</h2><p className="text-xs text-gray">Activity dates use {progress.timezone}. Scheduling always uses server UTC time.</p></div></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="rounded-xl bg-light-bg p-3"><p className="text-xl font-bold text-black">{value}</p><p className="text-xs text-gray">{label}</p></div>)}</div></section><section className="grid gap-4 sm:grid-cols-2"><div className="rounded-2xl border border-[#E5E5E5] bg-white p-4"><h3 className="flex items-center gap-2 font-bold text-black"><Layers3 size={18} className="text-teal" />Scheduled reviews</h3><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-light-teal p-3"><p className="text-xl font-bold text-teal">{cards.scheduledCompleted7Days}</p><p className="text-xs text-gray">Last 7 days</p></div><div className="rounded-xl bg-light-teal p-3"><p className="text-xl font-bold text-teal">{cards.scheduledCompleted30Days}</p><p className="text-xs text-gray">Last 30 days</p></div></div></div><div className="rounded-2xl border border-[#E5E5E5] bg-white p-4"><h3 className="flex items-center gap-2 font-bold text-black"><RotateCcw size={18} className="text-teal" />Extra practice</h3><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-light-bg p-3"><p className="text-xl font-bold text-black">{cards.extraPractice7Days}</p><p className="text-xs text-gray">Last 7 days</p></div><div className="rounded-xl bg-light-bg p-3"><p className="text-xl font-bold text-black">{cards.extraPractice30Days}</p><p className="text-xs text-gray">Last 30 days</p></div></div></div></section><section className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-6"><h3 className="font-bold text-black">Recent quiz attempts</h3>{progress.recentQuizAttempts.length ? <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="text-xs text-gray"><tr><th className="py-2">Attempt</th><th>Questions</th><th>Score</th><th>Date</th></tr></thead><tbody>{progress.recentQuizAttempts.map((attempt) => <tr key={attempt.id} className="border-t border-[#E5E5E5]"><td className="py-3">{attempt.isRetake ? `Retake ${attempt.attemptNumber}` : "First attempt"}</td><td>{attempt.questionCount}</td><td className="font-semibold">{attempt.score}%</td><td>{new Date(attempt.submittedAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <p className="mt-4 text-sm text-gray">No submitted quiz attempts yet.</p>}<p className="mt-4 text-xs leading-5 text-gray">{progress.note}</p></section></div></div>;
}
