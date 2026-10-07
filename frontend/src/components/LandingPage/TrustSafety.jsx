import { Link } from "react-router-dom";
import * as m from "motion/react-m";
import { Clock, CreditCard, ShieldCheck, Wallet } from "lucide-react";
import { fadeUp, inView, stagger } from "../../lib/motion";

// Four claims, each checked against the code rather than written to reassure:
//
//   verification  config/verificationPolicy.js describeMissingDocs - CNIC for
//                 everyone, plus one credential for anyone who teaches; an
//                 admin approves or rejects (admin.controller.js reviewVerification)
//   24 hours      utils/meetingCompletion.js DISPUTE_WINDOW_MS = 24h, and the
//                 comment above it: completion starts the window and does NOT
//                 move credits
//   card details  no card, cvv or pan field exists anywhere in
//                 config/safepay.js or payment.controller.js - the checkout is
//                 hosted by Safepay and we never receive them
//   credits       utils/meetingCompletion.js: "Credits move only once a session
//                 actually completes". Note the wording below says they stay in
//                 your wallet, NOT that they are held in escrow - there is no
//                 holding account anywhere in the code, and saying otherwise
//                 would be a claim the product does not make good on.
const items = [
  {
    icon: ShieldCheck,
    title: "Teachers are checked before they teach",
    body: "Everyone verifies their identity with a CNIC. Teachers also submit a credential - a degree, transcript, certificate or portfolio - and our team reviews it before they can take a session.",
  },
  {
    icon: Clock,
    title: "24 hours to report a session that didn't happen",
    body: "After a session's scheduled time passes, either side has 24 hours to report that it did not take place. If we confirm it, no credits change hands.",
  },
  {
    icon: Wallet,
    title: "Credits leave your wallet only after the session",
    body: "Booking costs nothing. Credits move when the session is marked complete, so cancelling beforehand never charges you.",
  },
  {
    icon: CreditCard,
    title: "Payments go through Safepay",
    body: "Checkout happens on Safepay's own page. Your card details go to them and never reach SkillBridge's servers.",
  },
];

function TrustSafety() {
  return (
    <section className="py-20 bg-light-bg font-family-poppins">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <m.div
          className="text-center mb-12"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          <h2 className="text-3xl md:text-4xl font-medium text-black mb-3">
            What protects you here
          </h2>
          <p className="text-lg text-gray max-w-xl mx-auto">
            The rules below are how the product actually behaves, not promises.
          </p>
        </m.div>

        <m.div
          className="grid grid-cols-1 md:grid-cols-2 gap-5"
          variants={stagger()}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <m.div
                key={item.title}
                variants={fadeUp}
                className="bg-white rounded-xl p-6 shadow-sm flex gap-4"
              >
                <div className="w-10 h-10 rounded-lg bg-light-teal flex items-center justify-center shrink-0">
                  <Icon className="text-teal" size={19} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-black mb-1.5">{item.title}</h3>
                  <p className="text-sm text-gray leading-relaxed">{item.body}</p>
                </div>
              </m.div>
            );
          })}
        </m.div>

        <m.p
          className="text-center text-sm text-gray mt-8"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          The full rules are in our{" "}
          <Link to="/terms" className="text-teal hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link to="/refund-policy" className="text-teal hover:underline">
            Refund Policy
          </Link>
          .
        </m.p>
      </div>
    </section>
  );
}

export default TrustSafety;
