import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../api/client";
import Pagination from "../ui/Pagination";
import Badge from "../ui/Badge";
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

const formatAmount = (amount, currency) => {
  if (amount == null) return "-";
  if ((currency || "PKR") === "PKR") {
    return `Rs. ${amount.toLocaleString("en-US")}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
};

function PurchaseHistory() {
  const { success, error: showError } = useToast();
  const [transactions, setTransactions] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refundOpenFor, setRefundOpenFor] = useState(null);
  const [refundReason, setRefundReason] = useState("");
  const [submittingRefund, setSubmittingRefund] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchTransactions = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get(`/payments/transactions?page=${page}&limit=10`);
        if (cancelled) return;
        setTransactions(res.data.transactions || []);
        setTotalPages(res.data.totalPages || 1);
      } catch {
        if (!cancelled) setError("Unable to load purchase history. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchTransactions();
    return () => {
      cancelled = true;
    };
  }, [page]);

  const handleSubmitRefund = async (transactionId) => {
    if (!refundReason.trim()) return;
    setSubmittingRefund(true);
    try {
      await apiClient.post(`/payments/transactions/${transactionId}/refund-request`, {
        reason: refundReason.trim(),
      });
      success("Refund request submitted.");
      setTransactions((prev) =>
        prev.map((t) => (t.id === transactionId ? { ...t, refundRequestStatus: "pending" } : t))
      );
      setRefundOpenFor(null);
      setRefundReason("");
    } catch (err) {
      showError(err.response?.data?.message || "Unable to submit refund request.");
    } finally {
      setSubmittingRefund(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-family-poppins text-2xl font-bold text-black mb-1">
          Purchase History
        </h1>
        <p className="font-family-poppins text-sm text-gray">
          All your credit purchases in one place
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="font-family-poppins text-sm text-gray text-center py-8">{error}</p>
        )}

        {!loading && !error && transactions.length === 0 && (
          <div className="text-center py-10">
            <p className="font-family-poppins text-sm text-gray mb-3">No purchases yet</p>
            <Link
              to="/credits"
              className="font-family-poppins text-sm text-teal font-semibold hover:underline"
            >
              Buy Credits
            </Link>
          </div>
        )}

        {!loading && !error && transactions.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left">
                <thead>
                  <tr className="border-b border-[#E5E5E5]">
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Date</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Credits</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Amount Paid</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Status</th>
                    <th className="font-family-poppins text-xs text-gray font-medium pb-3">Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <Fragment key={t.id}>
                      <tr className="border-b border-[#F0F0F0] last:border-0">
                        <td className="font-family-poppins text-sm text-black py-3">
                          {formatDate(t.createdAt)}
                        </td>
                        <td className="font-family-poppins text-sm text-black py-3">
                          {t.creditsGranted}
                        </td>
                        <td className="font-family-poppins text-sm text-black py-3">
                          {formatAmount(t.amountPaid, t.currency)}
                        </td>
                        <td className="py-3">
                          <Badge status={t.status} />
                        </td>
                        <td className="py-3">
                          {t.status !== "completed" ? (
                            <span className="text-gray text-xs">-</span>
                          ) : t.refundRequestStatus ? (
                            <Badge status={t.refundRequestStatus} />
                          ) : (
                            <button
                              onClick={() => {
                                setRefundOpenFor(refundOpenFor === t.id ? null : t.id);
                                setRefundReason("");
                              }}
                              className="font-family-poppins text-xs font-semibold text-teal hover:underline"
                            >
                              Request Refund
                            </button>
                          )}
                        </td>
                      </tr>
                      {refundOpenFor === t.id && (
                        <tr className="border-b border-[#F0F0F0] last:border-0">
                          <td colSpan={5} className="pb-4">
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                value={refundReason}
                                onChange={(e) => setRefundReason(e.target.value)}
                                placeholder="Why are you requesting a refund?"
                                className="flex-1 font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:border-teal"
                              />
                              <button
                                onClick={() => handleSubmitRefund(t.id)}
                                disabled={!refundReason.trim() || submittingRefund}
                                className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-4 py-2 rounded-lg disabled:opacity-50"
                              >
                                {submittingRefund ? "Submitting..." : "Submit"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
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

export default PurchaseHistory;
