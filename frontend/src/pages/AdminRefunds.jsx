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

const formatCurrency = (amount, currency) => {
  if ((currency || "PKR") === "PKR") {
    return `Rs. ${(amount || 0).toLocaleString("en-US")}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount || 0);
};

function AdminRefunds() {
  const { success, error: showError } = useToast();

  const [requests, setRequests] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [decidingId, setDecidingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [adminNote, setAdminNote] = useState("");

  useEffect(() => {
    let cancelled = false;

    const fetchRequests = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`/admin/refund-requests?status=pending&page=${page}&limit=10`);
        if (cancelled) return;
        setRequests(res.data.requests || []);
        setTotalPages(res.data.totalPages || 1);
      } catch {
        if (!cancelled) setError("Unable to load refund requests. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRequests();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const removeFromList = (id) => {
    setRequests((prev) => prev.filter((r) => r.id !== id));
  };

  const handleApprove = async (id) => {
    setDecidingId(id);
    try {
      const res = await apiClient.patch(`/admin/refund-requests/${id}`, { decision: "approved" });
      if (res.data.warning) {
        // Approval succeeded, but a follow-up DB update failed - this needs
        // the admin's attention even though the request is no longer "pending".
        showError(res.data.warning, 15000);
      } else {
        success("Refund approved. Remember to process the payment refund manually via the Safepay dashboard.");
      }
      removeFromList(id);
    } catch (err) {
      showError(err.response?.data?.message || "Unable to approve refund.");
    } finally {
      setDecidingId(null);
    }
  };

  const handleReject = async (id) => {
    if (!adminNote.trim()) return;
    setDecidingId(id);
    try {
      await apiClient.patch(`/admin/refund-requests/${id}`, {
        decision: "rejected",
        adminNote: adminNote.trim(),
      });
      success("Refund request rejected.");
      removeFromList(id);
      setRejectingId(null);
      setAdminNote("");
    } catch (err) {
      showError(err.response?.data?.message || "Unable to reject refund.");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-family-poppins text-2xl font-bold text-black mb-1">
          Refund Requests
        </h1>
        <p className="font-family-poppins text-sm text-gray">
          Review pending refund requests. Approving reverses the user's credits - the payment refund itself must be issued manually via the Safepay dashboard.
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="font-family-poppins text-sm text-gray text-center py-8">{error}</p>
        )}

        {!loading && !error && requests.length === 0 && (
          <p className="font-family-poppins text-sm text-gray text-center py-8">
            No pending refund requests.
          </p>
        )}

        {!loading && !error && requests.length > 0 && (
          <>
            <div className="space-y-4">
              {requests.map((r) => (
                <div key={r.id} className="border border-[#E5E5E5] rounded-xl p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                      <p className="font-family-poppins font-semibold text-black">{r.user?.name}</p>
                      <p className="font-family-poppins text-xs text-gray mb-2">{r.user?.email}</p>
                      <p className="font-family-poppins text-sm text-black">
                        {formatCurrency(r.transaction?.amountPaid, r.transaction?.currency)} -{" "}
                        {r.transaction?.creditsGranted} credits
                      </p>
                      <p className="font-family-poppins text-xs text-gray">
                        Purchased {formatDate(r.transaction?.createdAt)}
                      </p>
                      <p className="font-family-poppins text-sm text-black mt-2">
                        <span className="text-gray">Reason: </span>
                        {r.reason}
                      </p>
                      <p className="font-family-poppins text-xs text-gray mt-1">
                        Requested {formatDate(r.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(r.id)}
                        disabled={decidingId === r.id}
                        className="flex items-center gap-1 font-family-poppins text-sm font-semibold text-white bg-teal-button px-3 py-2 rounded-lg disabled:opacity-50"
                      >
                        <Check size={16} />
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setRejectingId(rejectingId === r.id ? null : r.id);
                          setAdminNote("");
                        }}
                        disabled={decidingId === r.id}
                        className="flex items-center gap-1 font-family-poppins text-sm font-semibold text-red border border-red/30 px-3 py-2 rounded-lg disabled:opacity-50"
                      >
                        <X size={16} />
                        Reject
                      </button>
                    </div>
                  </div>

                  {rejectingId === r.id && (
                    <div className="mt-4 flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder="Note for rejecting this refund..."
                        className="flex-1 font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:border-teal"
                      />
                      <button
                        onClick={() => handleReject(r.id)}
                        disabled={!adminNote.trim() || decidingId === r.id}
                        className="font-family-poppins text-sm font-semibold text-white bg-red px-4 py-2 rounded-lg disabled:opacity-50"
                      >
                        Confirm Reject
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

export default AdminRefunds;
