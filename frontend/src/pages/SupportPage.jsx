import { useState } from "react";
import { LifeBuoy, Loader2, Mail, Send } from "lucide-react";
import apiClient from "../api/client";
import { useToast } from "../ui/Toast";

const MAX_MESSAGE = 4000;

const TOPICS = [
  "Payments and credits",
  "Sessions and scheduling",
  "Teacher verification",
  "Payouts",
  "Account or login",
  "Something else",
];

function SupportPage() {
  const { success, error: showError } = useToast();

  const [topic, setTopic] = useState(TOPICS[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const canSubmit = subject.trim() && message.trim() && !sending;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSending(true);
    try {
      // The topic rides along in the subject so it is visible in the inbox
      // without opening the message.
      const res = await apiClient.post("/support/ticket", {
        subject: `${topic}: ${subject.trim()}`,
        message: message.trim(),
      });
      success(res.data.message || "Your request has been sent.");
      setSubject("");
      setMessage("");
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't send your request. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-family-poppins text-2xl font-bold text-black mb-1">Support</h1>
        <p className="font-family-poppins text-sm text-gray">
          Tell us what's going on and we'll reply by email.
        </p>
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-6 p-3 bg-light-teal rounded-lg">
          <LifeBuoy className="text-teal shrink-0 mt-0.5" size={18} />
          <p className="font-family-poppins text-sm text-black">
            You'll hear back from{" "}
            <span className="font-medium">support@skill-bridge.me</span> at the email address on
            your account, so there's no need to include your contact details.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
            What is this about?
          </label>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal bg-white mb-4"
          >
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="A one-line summary"
            maxLength={150}
            className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal mb-4"
          />

          <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
            Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What happened, and what were you expecting instead?"
            rows={7}
            maxLength={MAX_MESSAGE}
            className="w-full p-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm resize-none outline-none focus:border-teal"
          />
          <p className="font-family-poppins text-xs text-gray mt-1 mb-5">
            {message.length}/{MAX_MESSAGE} characters
          </p>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={!canSubmit}
              className="flex items-center gap-2 font-family-poppins text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg hover:bg-teal-button-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={16} />}
              {sending ? "Sending..." : "Send request"}
            </button>

            <a
              href="mailto:support@skill-bridge.me"
              className="flex items-center gap-1.5 font-family-poppins text-sm text-gray hover:text-teal transition-colors"
            >
              <Mail size={16} />
              Or email support@skill-bridge.me
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SupportPage;
