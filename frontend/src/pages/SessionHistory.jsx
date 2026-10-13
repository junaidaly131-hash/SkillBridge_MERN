import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { AlertTriangle, Clock, ShieldAlert } from "lucide-react";
import { fetchMeetingHistory, reportMeetingIssue } from "../store/meetingsSlice";
import { useToast } from "../ui/Toast";
import Pagination from "../ui/Pagination";

const formatDate = (dateString) =>
  new Date(dateString).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

const STATUS_STYLES = {
  completed: "bg-teal/10 text-teal",
  cancelled: "bg-gray-100 text-gray",
  scheduled: "bg-orange-100 text-orange-600",
  // A session now has to be accepted before it runs, so a request can sit
  // unanswered, be turned down, or run out of time without ever happening.
  pending: "bg-amber-100 text-amber-700",
  declined: "bg-red-50 text-red-600",
  expired: "bg-gray-100 text-gray",
};

// "pending" on its own reads as "in progress"; these say what is actually true.
const STATUS_LABELS = {
  pending: "Awaiting acceptance",
  declined: "Declined",
  expired: "Not accepted in time",
};

function DisputeBadge({ dispute }) {
  if (dispute.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 font-family-poppins text-xs font-medium text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg">
        <Clock size={14} />
        Issue reported - under review
      </span>
    );
  }
  if (dispute.status === "upheld") {
    return (
      <span className="inline-flex items-center gap-1.5 font-family-poppins text-xs font-medium text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">
        <ShieldAlert size={14} />
        No-show confirmed - no credits transferred
      </span>
    );
  }
  return (
    <span className="font-family-poppins text-xs text-gray bg-gray-50 px-3 py-1.5 rounded-lg">
      Issue reviewed - session stands
    </span>
  );
}

function SessionHistory() {
  const dispatch = useDispatch();
  const toast = useToast();
  const { history, historyLoading, historyPage, historyTotalPages } = useSelector((s) => s.meetings);
  const { user } = useSelector((s) => s.auth);
  const [page, setPage] = useState(1);
  const [reportingId, setReportingId] = useState(null);
  const [reason, setReason] = useState("");
  const [submittingId, setSubmittingId] = useState(null);

  useEffect(() => {
    dispatch(fetchMeetingHistory({ page, limit: 10 }));
  }, [dispatch, page]);

  const handleSubmitReport = async (meetingId) => {
    if (!reason.trim()) return;
    setSubmittingId(meetingId);
    try {
      await dispatch(reportMeetingIssue({ meetingId, reason: reason.trim() })).unwrap();
      toast.success("Issue reported. An admin will review it before credits are finalized.");
      setReportingId(null);
      setReason("");
    } catch (err) {
      toast.error(err || "Failed to report issue");
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-family-poppins text-2xl font-bold text-black mb-1">
          Session History
        </h1>
        <p className="font-family-poppins text-sm text-gray">
          Your past and upcoming sessions. Completed sessions can be disputed within 24 hours.
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        {historyLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        )}

        {!historyLoading && history.length === 0 && (
          <p className="font-family-poppins text-sm text-gray text-center py-8">
            No sessions yet.
          </p>
        )}

        {!historyLoading && history.length > 0 && (
          <div className="space-y-4">
            {history.map((m) => {
              const other = (m.participants || []).find(
                (p) => String(p._id || p.id) !== String(user?.id)
              );
              const withinWindow = m.disputeDeadline && new Date() < new Date(m.disputeDeadline);
              const canReport =
                m.status === "completed" && !m.creditsProcessed && withinWindow && !m.dispute;

              return (
                <div key={m._id} className="border border-[#E5E5E5] rounded-xl p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-family-poppins font-semibold text-black">{m.title}</h3>
                        <span
                          className={`font-family-poppins text-xs px-2 py-0.5 rounded-full capitalize ${
                            STATUS_STYLES[m.status] || "bg-gray-100 text-gray"
                          }`}
                        >
                          {STATUS_LABELS[m.status] || m.status}
                        </span>
                      </div>
                      <p className="font-family-poppins text-xs text-gray">
                        With {other?.name || "Participant"} - {formatDate(m.startsAt)}
                      </p>
                      {m.skill && (
                        <p className="font-family-poppins text-xs text-teal mt-1">{m.skill}</p>
                      )}
                      {m.creditsNote && (
                        <p className="font-family-poppins text-xs text-gray mt-1 italic">{m.creditsNote}</p>
                      )}
                    </div>

                    <div className="shrink-0">
                      {m.dispute ? (
                        <DisputeBadge dispute={m.dispute} />
                      ) : canReport ? (
                        <button
                          onClick={() => {
                            setReportingId(reportingId === m._id ? null : m._id);
                            setReason("");
                          }}
                          className="flex items-center gap-1.5 font-family-poppins text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-all"
                        >
                          <AlertTriangle size={14} />
                          Report an issue
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {reportingId === m._id && (
                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="What happened? (e.g. the other person never joined)"
                        className="flex-1 font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:border-teal"
                      />
                      <button
                        onClick={() => handleSubmitReport(m._id)}
                        disabled={!reason.trim() || submittingId === m._id}
                        className="font-family-poppins text-sm font-semibold text-white bg-red-600 px-4 py-2 rounded-lg disabled:opacity-50"
                      >
                        {submittingId === m._id ? "Submitting..." : "Submit Report"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!historyLoading && history.length > 0 && historyTotalPages > 1 && (
          <Pagination currentPage={historyPage} totalPages={historyTotalPages} onPageChange={setPage} />
        )}
      </div>
    </div>
  );
}

export default SessionHistory;
