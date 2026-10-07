import { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useDispatch } from "react-redux";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import apiClient from "../api/client";
import { fetchWallet } from "../store/creditsSlice";

const POLL_INTERVAL_MS = 2500;
// Stop polling after this long even if the webhook never arrives, so the
// user isn't stuck on a spinner forever - Safepay's redirect can beat their
// webhook delivery by a few seconds under normal conditions.
const MAX_POLL_MS = 60000;

function CreditsSuccess() {
  const [searchParams] = useSearchParams();
  // redirect_url is sent to Safepay with NO query string of our own (see
  // payment.controller.js) - if it had one, Safepay appends its own params by
  // plain concatenation, landing as a second `?` instead of `&` and garbling
  // everything into one value (confirmed live: "<id>?order_id=<id>"). So the
  // transaction id comes from Safepay's own `order_id` param instead, which
  // is just an echo of the `orderId` we gave them (our transaction id).
  const transactionId = searchParams.get("order_id");
  // tracker: Safepay's redirect doesn't include a signature, so the backend
  // uses this to look up the payment's real status directly via Safepay's
  // API. Everything else is forwarded too so the server can log it if param
  // names ever differ.
  const redirectParams = Object.fromEntries(searchParams.entries());
  const dispatch = useDispatch();
  // pending | completed | failed | timeout - no transactionId is a failure
  // state from the start, not something to transition into via an effect.
  const [status, setStatus] = useState(() => (transactionId ? "pending" : "failed"));
  const [transaction, setTransaction] = useState(null);
  const startedAtRef = useRef(null);
  // Guards against React StrictMode's dev-only double-invocation of this
  // effect, which fired two concurrent /payments/confirm calls for the same
  // transaction - the loser hit a Mongoose version conflict and 500'd.
  const hasRunRef = useRef(false);

  useEffect(() => {
    if (!transactionId) return;
    if (hasRunRef.current) return;
    hasRunRef.current = true;

    startedAtRef.current = Date.now();
    let timeoutId;

    // No "cancelled" flag here on purpose: React StrictMode's dev-only
    // mount -> cleanup -> mount cycle would run this cleanup right after the
    // first (real) run starts, and a cancelled flag set there would poison
    // that in-flight run - the confirm POST would succeed but `poll()` would
    // never fire because `!cancelled` had already gone false, leaving the UI
    // stuck on "Confirming payment..." forever even though the payment had
    // completed (confirmed live). `hasRunRef` above already guarantees this
    // effect body only truly runs once, so there's nothing left to cancel.
    const poll = async () => {
      try {
        const res = await apiClient.get(`/payments/transactions/${transactionId}`);
        const t = res.data.transaction;
        setTransaction(t);

        if (t.status === "completed") {
          setStatus("completed");
          dispatch(fetchWallet());
          return;
        }
        if (t.status === "failed") {
          setStatus("failed");
          return;
        }

        if (Date.now() - startedAtRef.current > MAX_POLL_MS) {
          setStatus("timeout");
          return;
        }
        timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        setStatus("failed");
      }
    };

    const run = async () => {
      // Hand the tracker to the backend first - it looks up the real status
      // directly from Safepay, so a successful payment can be confirmed
      // immediately instead of waiting for the next poll tick. If it can't
      // be confirmed this way yet, we still fall through to polling.
      try {
        await apiClient.post("/payments/confirm", { ...redirectParams, transactionId });
      } catch {
        // Non-fatal - polling below is the fallback.
      }
      poll();
    };

    run();
    return () => {
      clearTimeout(timeoutId);
    };
    // redirectParams is derived from the URL, which is fixed for this page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId, dispatch]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-white rounded-xl p-8 shadow-sm max-w-md w-full text-center">
        {status === "pending" && (
          <>
            <Loader2 className="w-12 h-12 text-teal animate-spin mx-auto mb-4" />
            <h1 className="font-family-poppins text-xl font-bold text-black mb-2">
              Confirming payment...
            </h1>
            <p className="font-family-poppins text-sm text-gray">
              This usually takes just a few seconds.
            </p>
          </>
        )}

        {status === "completed" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-teal mx-auto mb-4" />
            <h1 className="font-family-poppins text-xl font-bold text-black mb-2">
              Payment successful!
            </h1>
            <p className="font-family-poppins text-sm text-gray mb-6">
              {transaction?.creditsGranted} credits have been added to your wallet.
            </p>
            <Link
              to="/credits"
              className="inline-block font-family-poppins text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg"
            >
              Go to Credits
            </Link>
          </>
        )}

        {(status === "failed" || status === "timeout") && (
          <>
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="font-family-poppins text-xl font-bold text-black mb-2">
              {status === "timeout" ? "Still confirming..." : "Payment could not be confirmed"}
            </h1>
            <p className="font-family-poppins text-sm text-gray mb-6">
              {status === "timeout"
                ? "This is taking longer than usual. Check your Purchase History in a moment - if credits don't show up, contact support."
                : "If you were charged, please contact support with your transaction reference."}
            </p>
            <Link
              to="/credits"
              className="inline-block font-family-poppins text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg"
            >
              Back to Credits
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default CreditsSuccess;
