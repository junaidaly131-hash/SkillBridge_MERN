import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as Motion from "motion/react-m";
import { ArrowRight, Check } from "lucide-react";
import { fadeUp, inView } from "../../lib/motion";

// Every figure comes from GET /api/payments/packages, which serves
// config/creditPacks.js - the same source the checkout resolves a purchase
// against. Nothing here is written in by hand, so the page cannot advertise a
// price the checkout would not honour.
//
// No cash-out rate is shown. creditConversion.js has one (CREDITS_TO_PKR_RATE),
// but the packages endpoint does not expose it, and quoting a payout rate from
// a second source on a marketing page is how the two drift apart.
function CreditsExplained() {
  const [packs, setPacks] = useState(null);

  useEffect(() => {
    let cancelled = false;
    import("../../api/client").then(({ default: apiClient }) =>
      apiClient
        .get("/payments/packages")
        .then((res) => {
          if (!cancelled) setPacks(res.data.packages || []);
        })
        .catch(() => {
          if (!cancelled) setPacks([]);
        })
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // No packs, no section. A pricing block with no price is worse than none.
  if (!packs || packs.length === 0) return null;

  const points = [
    "Buy credits once, spend them with any teacher",
    "Credits are deducted after a session, never when you book",
    "Teachers earn credits by teaching, and can cash them out once verified",
    "Credits do not expire",
  ];

  return (
    <section className="py-20 bg-white font-family-poppins">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <Motion.div
          className="text-center mb-12"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          <h2 className="text-3xl md:text-4xl font-medium text-black mb-3">How credits work</h2>
          <p className="text-lg text-gray max-w-xl mx-auto">
            One currency for the whole platform, bought up front and spent per session.
          </p>
        </Motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <Motion.ul
            className="space-y-4"
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={inView}
          >
            {points.map((p) => (
              <li key={p} className="flex gap-3 text-base text-gray leading-relaxed">
                <span className="w-5 h-5 rounded-full bg-light-teal flex items-center justify-center shrink-0 mt-0.5">
                  <Check className="text-teal" size={12} />
                </span>
                {p}
              </li>
            ))}
          </Motion.ul>

          <Motion.div
            className="bg-light-bg border border-teal/20 rounded-xl p-8 text-center"
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={inView}
          >
            {packs.map((pack) => (
              <div key={pack.packId}>
                <p className="text-4xl font-semibold text-black mb-1">{pack.credits}</p>
                <p className="text-sm text-gray mb-5">credits</p>
                <p className="text-2xl font-medium text-teal mb-1">{pack.displayPrice}</p>
                <p className="text-xs text-gray mb-6">{pack.label}</p>
              </div>
            ))}

            <Link
              to="/signup"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg hover:bg-teal-button-hover transition-all"
            >
              Get started
              <ArrowRight size={16} />
            </Link>

            <p className="text-xs text-gray mt-4">
              Payment is handled by Safepay. See our{" "}
              <Link to="/refund-policy" className="text-teal hover:underline">
                Refund Policy
              </Link>
              .
            </p>
          </Motion.div>
        </div>
      </div>
    </section>
  );
}

export default CreditsExplained;
