import LegalLayout from '../components/Legal/LegalLayout';
import { usePageMeta } from '../hooks/usePageMeta';

function PrivacyPage() {
  usePageMeta({
    title: 'Privacy Policy',
    description:
      'What SkillBridge collects, why it is collected, how long it is kept, and the choices you have over your data.',
    path: '/privacy',
  });

  return (
    <LegalLayout title="Privacy Policy" lastUpdated="October 7, 2026">
      <h2>1. Information We Collect</h2>
      <ul>
        <li>
          <strong>Account information:</strong> name, email address, password (stored securely
          hashed, never in plain text).
        </li>
        <li>
          <strong>Profile information:</strong> skills offered/wanted, bio, profile picture
          (optional).
        </li>
        <li>
          <strong>Verification documents:</strong> verification is required to teach, to book
          beyond your free trial session, and to cash out. We collect and store the documents you
          upload for it — a national ID, and for teachers a credential such as a degree,
          transcript or certificate — via our secure storage provider.
        </li>
        <li>
          <strong>Payment information:</strong> when you purchase credits, payment is processed
          entirely by our payment processor, Safepay. We do not receive, see, or store your full
          card or bank account numbers.
        </li>
        <li>
          <strong>Payout information:</strong> if you request a payout as a teacher, we collect
          the bank/mobile-wallet account details you provide, used solely to process that payout.
        </li>
        <li>
          <strong>Usage data:</strong> messages, session history, and credit transaction history
          within the platform, used to operate the service and for AI-based teacher
          recommendations.
        </li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <ul>
        <li>
          To operate and improve the platform (matching teachers/students, processing payments,
          enabling video sessions).
        </li>
        <li>To communicate with you about your account, sessions, and transactions.</li>
        <li>To detect and prevent fraud or misuse.</li>
        <li>We do not sell your personal information to third parties.</li>
      </ul>

      <h2>3. Third-Party Services</h2>
      <p>We use the following third-party services, each with their own privacy practices:</p>
      <ul>
        <li>
          <strong>Safepay</strong> — payment processing
        </li>
        <li>
          <strong>Cloudinary</strong> — file/image storage
        </li>
        <li>
          <strong>8x8 (JaaS)</strong> — video calling
        </li>
        <li>
          <strong>Email provider</strong> — transactional email
        </li>
      </ul>

      <h2>4. Data Retention</h2>
      <p>
        We retain your account and transaction data for as long as your account is active, and as
        required by applicable financial record-keeping regulations after account closure.
      </p>

      <h2>5. Your Rights</h2>
      <p>
        You may request access to, correction of, or deletion of your personal data by contacting
        us at <a href="mailto:support@skill-bridge.me">support@skill-bridge.me</a>. Note that
        transaction records may be retained as required by law even after a deletion request.
      </p>

      <h2>6. Data Security</h2>
      <p>
        We take reasonable technical and organizational measures to protect your data, including
        encrypted password storage and secure payment processing through a licensed payment
        processor.
      </p>

      <h2>7. Children's Privacy</h2>
      <p>
        SkillBridge is not intended for children under 13. If you believe a child under 13 has
        created an account, contact us for removal.
      </p>

      <h2>8. Changes to This Policy</h2>
      <p>
        We may update this policy from time to time. Material changes will be communicated via
        the platform or email.
      </p>

      <h2>9. Contact</h2>
      <p>
        For privacy questions, contact us at{' '}
        <a href="mailto:support@skill-bridge.me">support@skill-bridge.me</a>.
      </p>
    </LegalLayout>
  );
}

export default PrivacyPage;
