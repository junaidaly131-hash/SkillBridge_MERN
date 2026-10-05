import LegalLayout from '../components/Legal/LegalLayout';
import { usePageMeta } from '../hooks/usePageMeta';

function TermsPage() {
  usePageMeta({
    title: 'Terms & Conditions',
    description:
      'The terms that govern using SkillBridge: accounts, credits, sessions, payouts and acceptable use.',
    path: '/terms',
  });

  return (
    <LegalLayout title="Terms & Conditions" lastUpdated="September 4, 2026">
      <h2>1. About SkillBridge</h2>
      <p>
        SkillBridge ("we," "us," "the platform") is operated by Junaid Ali, a sole proprietor
        registered with the Federal Board of Revenue, Pakistan (NTN: 7150403888793), with a
        registered business address of po karimabad Altit faizabad tensil Aliabad District Hunza,
        Hunza Nagar, Hunza, Pakistan. SkillBridge is a peer-to-peer skill-exchange platform
        connecting students and teachers for tutoring sessions.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 13 years old to create an account. If you are under 18, you confirm
        that a parent or guardian is aware of and consents to your use of the platform. Users
        acting as teachers must be at least 18 years old.
      </p>

      <h2>3. How SkillBridge Works</h2>
      <p>
        Users may register as a student, a teacher, or both. Teachers offer sessions on skills
        they can teach; students purchase "SkillBridge Credits," a prepaid in-platform currency,
        to book sessions. Credits are used solely within the platform and hold no value outside
        it except as described in our Refund Policy.
      </p>

      <h2>4. Credits</h2>
      <ul>
        <li>
          Credits are purchased in fixed packs via our payment processor (Safepay) and are
          non-transferable between accounts.
        </li>
        <li>Credits do not expire unless your account is closed or terminated.</li>
        <li>
          Teachers may request payout of credits earned, subject to our minimum payout threshold
          and payout processing terms, as described in-app.
        </li>
      </ul>

      <h2>5. Verification</h2>
      <p>
        Teachers may voluntarily submit documents for verification. A "Verified" badge does not
        constitute a guarantee of teaching quality or credentials — it reflects that submitted
        documents were reviewed by our team.
      </p>

      <h2>6. User Conduct</h2>
      <p>
        You agree not to: use the platform for any unlawful purpose; harass, abuse, or
        discriminate against other users; misrepresent your identity or qualifications; attempt
        to circumvent the credit system to transact outside the platform.
      </p>

      <h2>7. Video Sessions</h2>
      <p>
        Sessions may take place via integrated video calling. Users are responsible for their own
        conduct during sessions. We do not record or store video/audio content from sessions.
      </p>

      <h2>8. Account Suspension &amp; Termination</h2>
      <p>
        We reserve the right to suspend or terminate accounts that violate these terms, including
        fraudulent payment activity, harassment, or misuse of the credit system.
      </p>

      <h2>9. Limitation of Liability</h2>
      <p>
        SkillBridge acts as a platform connecting students and teachers. We are not responsible
        for the quality, accuracy, or outcome of any tutoring session. Sessions occur between
        independent users; we do not employ teachers.
      </p>

      <h2>10. Governing Law</h2>
      <p>
        Our Terms and Conditions are governed by the laws of the Islamic Republic of Pakistan and
        you agree that the courts of Islamabad (including any consumer court) will have exclusive
        jurisdiction in any dispute that you have with us.
      </p>

      <h2>11. Changes to These Terms</h2>
      <p>
        We may update these terms from time to time. Continued use of the platform after changes
        constitutes acceptance.
      </p>

      <h2>12. Contact</h2>
      <p>
        For questions about these terms, contact us at{' '}
        <a href="mailto:support@skill-bridge.me">support@skill-bridge.me</a>.
      </p>
    </LegalLayout>
  );
}

export default TermsPage;
