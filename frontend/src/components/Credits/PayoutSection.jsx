import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";
import apiClient from "../../api/client";
import Badge from "../../ui/Badge";
import { useToast } from "../../ui/Toast";

const PAYOUT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "jazzcash", label: "JazzCash" },
  { value: "easypaisa", label: "Easypaisa" },
];

const formatDate = (dateString) =>
  new Date(dateString).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

const formatPKR = (amount) =>
  new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 }).format(amount || 0);

// `balance` here is the EARNED bucket only - purchased credits are not
// cashable, so they must never widen this cap.
function PayoutSection({ balance, onBalanceChange }) {
  const { success, error: showError } = useToast();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [credits, setCredits] = useState("");
  const [method, setMethod] = useState("bank_transfer");
  const [accountTitle, setAccountTitle] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");

  const hasInFlightRequest = requests.some((r) => r.status === "pending" || r.status === "approved");

  const loadRequests = () => {
    setLoading(true);
    apiClient
      .get("/payouts/my-requests?limit=10")
      .then((res) => setRequests(res.data.requests || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const resetForm = () => {
    setCredits("");
    setMethod("bank_transfer");
    setAccountTitle("");
    setAccountNumber("");
    setBankName("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiClient.post("/payouts/request", {
        creditsRequested: Number(credits),
        payoutMethod: method,
        payoutDetails: {
          accountTitle: accountTitle.trim(),
          accountNumber: accountNumber.trim(),
          bankName: method === "bank_transfer" ? bankName.trim() : undefined,
        },
      });
      success("Payout request submitted.");
      onBalanceChange?.(res.data.newBalance);
      resetForm();
      setShowForm(false);
      loadRequests();
    } catch (err) {
      showError(err.response?.data?.message || "Unable to submit payout request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Banknote className="text-teal" size={20} />
          <h2 className="font-family-poppins text-lg font-semibold text-black">
            Cash Out Credits
          </h2>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            disabled={hasInFlightRequest}
            className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Request Payout
          </button>
        )}
      </div>

      {hasInFlightRequest && !showForm && (
        <p className="font-family-poppins text-sm text-gray mb-4">
          You have a payout request in progress. You can request another once it's resolved.
        </p>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 mb-6 border border-[#E5E5E5] rounded-lg p-4">
          <div>
            <label className="font-family-poppins text-xs text-gray block mb-1">
              Credits to cash out (earned: {balance})
            </label>
            <input
              type="number"
              min={1}
              max={balance}
              value={credits}
              onChange={(e) => setCredits(e.target.value)}
              required
              className="w-full font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:border-teal"
            />
          </div>

          <div>
            <label className="font-family-poppins text-xs text-gray block mb-1">Payout method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:border-teal"
            >
              {PAYOUT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="font-family-poppins text-xs text-gray block mb-1">
              {method === "bank_transfer" ? "Account title" : "Account holder name"}
            </label>
            <input
              type="text"
              value={accountTitle}
              onChange={(e) => setAccountTitle(e.target.value)}
              required
              className="w-full font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:border-teal"
            />
          </div>

          <div>
            <label className="font-family-poppins text-xs text-gray block mb-1">
              {method === "bank_transfer" ? "Account number" : "Mobile number"}
            </label>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              required
              className="w-full font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:border-teal"
            />
          </div>

          {method === "bank_transfer" && (
            <div>
              <label className="font-family-poppins text-xs text-gray block mb-1">Bank name</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                required
                className="w-full font-family-poppins text-sm border border-[#D0D0D0] rounded-lg px-3 py-2 focus:outline-none focus:border-teal"
              />
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-4 py-2 rounded-lg disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="font-family-poppins text-sm font-semibold text-gray border border-[#D0D0D0] px-4 py-2 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <p className="font-family-poppins text-sm text-gray text-center py-4">
          No payout requests yet.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 border border-[#F0F0F0] rounded-lg">
              <div>
                <p className="font-family-poppins text-sm font-medium text-black">
                  {r.creditsRequested} credits - {formatPKR(r.amountPKR)}
                </p>
                <p className="font-family-poppins text-xs text-gray">
                  {formatDate(r.createdAt)}
                </p>
                {r.status === "rejected" && r.adminNote && (
                  <p className="font-family-poppins text-xs text-red mt-0.5">{r.adminNote}</p>
                )}
                {r.status === "paid" && r.paymentReference && (
                  <p className="font-family-poppins text-xs text-gray mt-0.5">
                    Ref: {r.paymentReference}
                  </p>
                )}
              </div>
              <Badge status={r.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default PayoutSection;
