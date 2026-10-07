import { useEffect, useState } from "react";
import { Check, X, Banknote } from "lucide-react";
import apiClient from "../api/client";
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

const formatPKR = (amount) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(amount || 0);

const METHOD_LABELS = {
  bank_transfer: "Bank Transfer",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
};

function PayoutDetails({ r }) {
  return (
    <div className="font-family-poppins text-xs text-gray mt-1">
      <p>{METHOD_LABELS[r.payoutMethod] || r.payoutMethod}</p>
      <p>{r.payoutDetails?.accountTitle} - {r.payoutDetails?.accountNumber}</p>
      {r.payoutDetails?.bankName && <p>{r.payoutDetails.bankName}</p>}
    </div>
  );
}

function AdminPayouts() {
  const { success, error: showError } = useToast();

  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [decidingId, setDecidingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [adminNote, setAdminNote] = useState("");
  const [markingPaidId, setMarkingPaidId] = useState(null);
  const [paymentReference, setPaymentReference] = useState("");

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        apiClient.get("/admin/payout-requests?status=pending&limit=20"),
        apiClient.get("/admin/payout-requests?status=approved&limit=20"),
      ]);
      setPending(pendingRes.data.requests || []);
      setApproved(approvedRes.data.requests || []);
    } catch {
      setError("Unable to load payout requests. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleApprove = async (id) => {
    setDecidingId(id);
    try {
      await apiClient.patch(`/admin/payout-requests/${id}/review`, { decision: "approved" });
      success("Payout approved. Send the money, then mark it paid.");
      loadRequests();
    } catch (err) {
      showError(err.response?.data?.message || "Unable to approve payout.");
    } finally {
      setDecidingId(null);
    }
  };

  const handleReject = async (id) => {
    if (!adminNote.trim()) return;
    setDecidingId(id);
    try {
      await apiClient.patch(`/admin/payout-requests/${id}/review`, {
        decision: "rejected",
        adminNote: adminNote.trim(),
      });
      success("Payout request rejected. Credits returned to the teacher.");
      setRejectingId(null);
      setAdminNote("");
      loadRequests();
    } catch (err) {
      showError(err.response?.data?.message || "Unable to reject payout.");
    } finally {
      setDecidingId(null);
    }
  };

  const handleMarkPaid = async (id) => {
    if (!paymentReference.trim()) return;
    setDecidingId(id);
    try {
      await apiClient.patch(`/admin/payout-requests/${id}/mark-paid`, {
        paymentReference: paymentReference.trim(),
      });
      success("Payout marked as paid.");
      setMarkingPaidId(null);
      setPaymentReference("");
      loadRequests();
    } catch (err) {
      showError(err.response?.data?.message || "Unable to mark payout as paid.");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-family-poppins text-2xl font-bold text-black mb-1">
          Teacher Payouts
        </h1>
        <p className="font-family-poppins text-sm text-gray">
          Review payout requests and confirm manual transfers
        </p>
      </div>

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

      {!loading && !error && (
        <>
          {/* Pending requests */}
          <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
            <h2 className="font-family-poppins text-lg font-semibold text-black mb-4">
              Pending Review
            </h2>

            {pending.length === 0 ? (
              <p className="font-family-poppins text-sm text-gray text-center py-8">
                No pending payout requests.
              </p>
            ) : (
              <div className="space-y-4">
                {pending.map((r) => (
                  <div key={r.id} className="border border-[#E5E5E5] rounded-xl p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div>
                        <p className="font-family-poppins font-semibold text-black">{r.teacher?.name}</p>
                        <p className="font-family-poppins text-xs text-gray mb-2">{r.teacher?.email}</p>
                        <p className="font-family-poppins text-sm text-black">
                          {r.creditsRequested} credits - {formatPKR(r.amountPKR)}
                        </p>
                        <PayoutDetails r={r} />
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
                          placeholder="Note for rejecting this payout..."
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
            )}
          </div>

          {/* Approved, not yet paid */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Banknote className="text-teal" size={18} />
              <h2 className="font-family-poppins text-lg font-semibold text-black">
                Approved - Awaiting Payment
              </h2>
            </div>

            {approved.length === 0 ? (
              <p className="font-family-poppins text-sm text-gray text-center py-8">
                No approved payouts awaiting payment.
              </p>
            ) : (
              <div className="space-y-4">
                {approved.map((r) => (
                  <div key={r.id} className="border border-[#E5E5E5] rounded-xl p-5">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div>
                        <p className="font-family-poppins font-semibold text-black">{r.teacher?.name}</p>
                        <p className="font-family-poppins text-xs text-gray mb-2">{r.teacher?.email}</p>
                        <p className="font-family-poppins text-sm text-black">
                          {r.creditsRequested} credits - {formatPKR(r.amountPKR)}
                        </p>
                        <PayoutDetails r={r} />
                      </div>

                      <button
                        onClick={() => {
                          setMarkingPaidId(markingPaidId === r.id ? null : r.id);
                          setPaymentReference("");
                        }}
                        disabled={decidingId === r.id}
                        className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-3 py-2 rounded-lg disabled:opacity-50 shrink-0"
                      >
                        Mark as Paid
                      </button>
                    </div>

                    {markingPaidId === r.id && (
                      <div className="mt-4 flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          value={paymentReference}
                          onChange={(e) => setPaymentReference(e.target.value)}
                          placeholder="Payment reference (bank transaction ID, etc.)..."
                          className="flex-1 font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:border-teal"
                        />
                        <button
                          onClick={() => handleMarkPaid(r.id)}
                          disabled={!paymentReference.trim() || decidingId === r.id}
                          className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-4 py-2 rounded-lg disabled:opacity-50"
                        >
                          Confirm Paid
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default AdminPayouts;
