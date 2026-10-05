import LegalLayout from '../components/Legal/LegalLayout';
import { usePageMeta } from '../hooks/usePageMeta';

function RefundPolicyPage() {
  usePageMeta({
    title: 'Refund & Cancellation Policy',
    description:
      'When SkillBridge credit purchases and sessions can be refunded or cancelled, and how long a review takes.',
    path: '/refund-policy',
  });

  return (
    <LegalLayout title="Refund & Cancellation Policy" lastUpdated="September 5, 2026">
      <h2>1. Credit Purchases</h2>
      <p>
        Credits purchased on SkillBridge are generally non-refundable once used. However, you may
        request a refund on a completed, unused credit purchase by contacting us or using the
        "Request Refund" option on your Purchase History page.
      </p>

      <h2>2. Refund Review</h2>
      <p>
        Refund requests are reviewed by our team. We consider factors including whether the
        credits have already been spent on a session. Approved refunds are processed manually by
        our team through Safepay's dashboard.
      </p>
      <p>
        Refund processing typically takes 3-5 business days from the date of approval.
      </p>

      <h2>3. Partial Usage</h2>
      <p>
        If some of the credits from a purchase have already been spent before a refund is
        requested, we will note this during review — a refund may result in a proportionally
        adjusted credit deduction rather than a full reversal.
      </p>

      <h2>4. Session Cancellations</h2>
      <p>
        Credits are only deducted when a session is marked complete — not at the time of booking.
        This means cancelling a scheduled session before it takes place never results in a charge,
        and there is nothing to refund. You may cancel a scheduled session at any time before it
        starts, free of any credit impact.
      </p>

      <h2>5. No-Shows and Session Disputes</h2>
      <p>
        Sessions are automatically marked complete shortly after their scheduled time passes, and
        credits are transferred to the teacher approximately 24 hours later — unless a dispute is
        filed in that window.
      </p>
      <p>
        If a session did not actually take place as scheduled (for example, the other participant
        did not show up), either participant may report this within 24 hours of the session's
        scheduled end time, using the "Report an issue" option on their Session History page.
      </p>
      <p>
        Reported issues are reviewed by our team. If we confirm the session did not take place,
        credits are not transferred. If no dispute is filed within 24 hours, credits are
        transferred automatically, and this outcome is final.
      </p>

      <h2>6. Non-Refundable Situations</h2>
      <p>We do not issue refunds for:</p>
      <ul>
        <li>sessions already completed and rated;</li>
        <li>
          disputes over subjective teaching quality (though we encourage reporting serious issues
          to our support team);
        </li>
        <li>credits earned through teaching (these follow the Payout Terms instead).</li>
      </ul>

      <h2>7. Teacher Payouts</h2>
      <p>
        Once a payout request has been marked "paid" by our team, it cannot be reversed. Payout
        requests still "pending" or "approved" (not yet paid) may be cancelled by the teacher by
        contacting support.
      </p>

      <h2>8. Contact</h2>
      <p>
        To request a refund or ask about this policy, contact us at{' '}
        <a href="mailto:support@skill-bridge.me">support@skill-bridge.me</a>.
      </p>
    </LegalLayout>
  );
}

export default RefundPolicyPage;
