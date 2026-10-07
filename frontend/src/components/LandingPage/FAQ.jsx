import { useEffect, useId, useState } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import apiClient from "../../api/client";
import { EASE, fadeUp, inView, stagger } from "../../lib/motion";

// Every answer here is checked against /terms and /refund-policy. If one of
// those pages changes, this has to change with it - a FAQ that contradicts the
// policy it summarises is worse than no FAQ.
//
// `pack` arrives from the API rather than being written in, so the price can
// never drift from what is actually charged.
function buildFaqs(pack) {
  return [
    {
      q: "How do credits work?",
      a:
        `Credits are SkillBridge's in-platform currency. You buy them in a pack` +
        (pack ? ` - currently ${pack.credits} credits for ${pack.displayPrice}` : "") +
        `, then spend them to book sessions. They are deducted only when a session is marked complete, never when you book, and they do not expire.`,
    },
    {
      q: "Can I be both a teacher and a student?",
      a: "Yes, and most people are. You list the skills you can teach and the ones you want to learn on the same profile. Matching runs in both directions, so you can be earning credits from one skill while spending them on another.",
    },
    {
      q: "How are teachers verified?",
      a: "Teachers submit identity documents and at least one credential - a degree, transcript, certificate or portfolio. Our team reviews them before the teacher can take sessions or cash out. The verified badge means those documents were reviewed; it is not a guarantee of teaching quality.",
    },
    {
      q: "What if a session doesn't happen?",
      a: "If the other person does not show up, either side can report it within 24 hours of the session's scheduled end time, using 'Report an issue' on the Session History page. If we confirm the session did not take place, no credits change hands. If nobody reports it within 24 hours, credits transfer automatically and that outcome is final.",
    },
    {
      q: "What happens if I cancel a booked session?",
      a: "Nothing is charged. Credits move only when a session is marked complete, so cancelling before it starts never costs you anything and there is nothing to refund.",
    },
    {
      q: "How do I cash out what I've earned?",
      a: "Only credits earned by teaching can be cashed out - credits you bought cannot. Once you have earned enough to meet the minimum shown on your Credits page, you can request a payout to a bank account, JazzCash or Easypaisa. Our team processes payouts manually.",
    },
    {
      q: "Is my payment secure?",
      a: "Payments are processed by Safepay. Your card details go to them directly and never reach SkillBridge's servers.",
    },
    {
      q: "Can I get a refund on credits I bought?",
      a: "You can request a refund on an unused credit purchase from your Purchase History page. Requests are reviewed by our team, and approved refunds are processed within 3-5 business days. Credits already spent on a session are not refundable.",
    },
  ];
}

function FaqItem({ faq, isOpen, onToggle, index }) {
  const id = useId();
  const panelId = `faq-panel-${id}`;
  const buttonId = `faq-button-${id}`;

  return (
    <m.div variants={fadeUp} className="border-b border-[#E5E5E5] last:border-b-0">
      <h3>
        <button
          id={buttonId}
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="w-full flex items-center justify-between gap-4 text-left py-5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 rounded-lg"
        >
          <span className="text-base sm:text-lg font-medium text-black group-hover:text-teal transition-colors">
            {faq.q}
          </span>
          {/* Rotation only - the icon never changes size or position. */}
          <m.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="shrink-0 text-teal"
          >
            <ChevronDown size={20} />
          </m.span>
        </button>
      </h3>

      {/* The panel mounts and unmounts rather than animating its height.
          Height is a layout property; animating it would re-run layout for
          everything below on every frame. The resulting jump is instant and
          user-initiated, so it does not count against CLS. */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <m.div
            key="panel"
            id={panelId}
            role="region"
            aria-labelledby={buttonId}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <p className="text-sm sm:text-base text-gray leading-relaxed pb-5 pr-8">{faq.a}</p>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  );
}

function FAQ() {
  const [pack, setPack] = useState(null);
  const [openIndex, setOpenIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get("/payments/packages")
      .then((res) => {
        if (!cancelled) setPack(res.data.packages?.[0] || null);
      })
      .catch(() => {
        // Leave the price out rather than guess at it.
        if (!cancelled) setPack(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const faqs = buildFaqs(pack);

  // Built from the same array that renders above, so the structured data can
  // never describe a question the page doesn't show - which is exactly what
  // Google penalises FAQ markup for.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <section className="py-20 bg-light-bg font-family-poppins">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <m.div
          className="text-center mb-10"
          variants={fadeUp}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          <h2 className="text-3xl md:text-4xl font-medium text-black mb-3">
            Questions people ask
          </h2>
          <p className="text-base text-gray">
            More detail in our{" "}
            <Link to="/terms" className="text-teal hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link to="/refund-policy" className="text-teal hover:underline">
              Refund Policy
            </Link>
            .
          </p>
        </m.div>

        <m.div
          className="bg-white rounded-xl px-6 shadow-sm"
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="visible"
          viewport={inView}
        >
          {faqs.map((faq, i) => (
            <FaqItem
              key={faq.q}
              faq={faq}
              index={i}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
            />
          ))}
        </m.div>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </section>
  );
}

export default FAQ;
