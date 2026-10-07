import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import apiClient from "../api/client";
import Pagination from "../ui/Pagination";
import { useToast } from "../ui/Toast";

const formatDate = (dateString) =>
  new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

function AdminSessionDisputes() {
  const { success, error: showError } = useToast();

  const [disputes, setDisputes] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [decidingId, setDecidingId] = useState(null);
  const [decisionPromptId, setDecisionPromptId] = useState(null); // { id, decision }
  const [adminNote, setAdminNote] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchDisputes = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`/admin/session-disputes?status=pending&page=${page}&limit=10`);
        if (cancelled) return;
        setDisputes(res.data.disputes || []);
        setTotalPages(res.data.totalPages || 1);
      } catch {
        if (!cancelled) setError("Unable to load session disputes. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDisputes();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const removeFromList = (id) => {
    setDisputes((prev) => prev.filter((d) => d.id !== id));
  };

  const handleDecide = async (id, decision) => {
    if (!adminNote.trim()) return;
    setDecidingId(id);
    try {
      await apiClient.patch(`/admin/session-disputes/${id}/review`, {
        decision,
        adminNote: adminNote.trim(),
      });
      success(
        decision === "upheld"
          ? "Dispute upheld - no credits transferred for this session."
          : "Dispute rejected - credits processed as normal."
      );
      removeFromList(id);
      setDecisionPromptId(null);
      setAdminNote("");
    } catch (err) {
      showError(err.response?.data?.message || "Unable to record decision.");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-family-poppins text-2xl font-bold text-black mb-1">
          Session Disputes
        </h1>
        <p className="font-family-poppins text-sm text-gray">
          Review reported no-shows before their session's credits finalize. Both outcomes need a note - it's shown to both participants.
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="font-family-poppins text-sm text-gray text-center py-8">{error}</p>
        )}

        {!loading && !error && disputes.length === 0 && (
          <p className="font-family-poppins text-sm text-gray text-center py-8">
            No pending session disputes.
          </p>
        )}

        {!loading && !error && disputes.length > 0 && (
          <>
            <div className="space-y-4">
              {disputes.map((d) => (
                <div key={d.id} className="border border-[#E5E5E5] rounded-xl p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                      <p className="font-family-poppins font-semibold text-black">
                        {d.meeting?.title || "Session"}
                      </p>
                      <p className="font-family-poppins text-xs text-gray mb-2">
                        {formatDate(d.meeting?.startsAt)} - {d.meeting?.duration} min
                        {d.meeting?.skill ? ` - ${d.meeting.skill}` : ""}
                      </p>
                      <p className="font-family-poppins text-xs text-gray">
                        Participants:{" "}
                        {(d.meeting?.participants || []).map((p) => p.name).join(", ")}
                      </p>
                      <p className="font-family-poppins text-sm text-black mt-2">
                        <span className="text-gray">Reported by {d.reportedBy?.name}: </span>
                        {d.reason}
                      </p>
                      <p className="font-family-poppins text-xs text-gray mt-1">
                        Reported {formatDate(d.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setDecisionPromptId({ id: d.id, decision: "upheld" });
                          setAdminNote("");
                        }}
                        disabled={decidingId === d.id}
                        className="flex items-center gap-1 font-family-poppins text-sm font-semibold text-red-600 border border-red-200 px-3 py-2 rounded-lg disabled:opacity-50"
                      >
                        <Check size={16} />
                        Uphold (no-show)
                      </button>
                      <button
                        onClick={() => {
                          setDecisionPromptId({ id: d.id, decision: "rejected" });
                          setAdminNote("");
                        }}
                        disabled={decidingId === d.id}
                        className="flex items-center gap-1 font-family-poppins text-sm font-semibold text-teal border border-teal/30 px-3 py-2 rounded-lg disabled:opacity-50"
                      >
                        <X size={16} />
                        Reject (session stood)
                      </button>
                    </div>
                  </div>

                  {decisionPromptId?.id === d.id && (
                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder={`Note explaining this decision (shown to both participants)...`}
                        className="flex-1 font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:border-teal"
                      />
                      <button
                        onClick={() => handleDecide(d.id, decisionPromptId.decision)}
                        disabled={!adminNote.trim() || decidingId === d.id}
                        className={`font-family-poppins text-sm font-semibold text-white px-4 py-2 rounded-lg disabled:opacity-50 ${
                          decisionPromptId.decision === "upheld" ? "bg-red-600" : "bg-teal-button"
                        }`}
                      >
                        Confirm {decisionPromptId.decision === "upheld" ? "Uphold" : "Reject"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default AdminSessionDisputes;
