import { useState } from "react";
import { Loader2, Mail, MapPin, MessageSquare, Send } from "lucide-react";
import { usePageMeta } from "../hooks/usePageMeta";
import Header from "../components/LandingPage/Header";
import Footer from "../components/LandingPage/Footer";
import apiClient from "../api/client";

const MAX_MESSAGE = 4000;

function ContactPage() {
  usePageMeta({
    title: "Contact Us",
    description:
      "Get in touch with the SkillBridge team. Send us a message and we'll reply by email, usually within one working day.",
    path: "/contact",
  });

  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  // Public page, so there's no toast provider here - feedback is inline.
  const [result, setResult] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const canSubmit =
    form.name.trim() && form.email.trim() && form.subject.trim() && form.message.trim() && !sending;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSending(true);
    setResult(null);
    try {
      const res = await apiClient.post("/support/contact", form);
      setResult({ ok: true, message: res.data.message || "Thanks - we'll be in touch." });
      setForm({ name: "", email: "", subject: "", message: "" });
    } catch (err) {
      setResult({
        ok: false,
        message: err.response?.data?.message || "Couldn't send your message. Please try again.",
      });
    } finally {
      setSending(false);
    }
  };

  const inputClass =
    "w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal";

  return (
    <div className="min-h-screen bg-light-bg flex flex-col">
      <Header />

      <main className="grow">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-10 text-center">
            <h1 className="font-family-poppins text-3xl font-bold text-black mb-2">Contact us</h1>
            <p className="font-family-poppins text-sm text-gray max-w-xl mx-auto">
              Questions about SkillBridge, partnerships, or anything else — send us a message and
              we'll get back to you.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Details */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl p-5 shadow-sm">
                <div className="w-9 h-9 bg-teal/10 rounded-lg flex items-center justify-center mb-3">
                  <Mail className="text-teal" size={18} />
                </div>
                <p className="font-family-poppins text-sm font-semibold text-black mb-1">
                  General enquiries
                </p>
                <a
                  href="mailto:info@skill-bridge.me"
                  className="font-family-poppins text-sm text-teal hover:underline break-all"
                >
                  info@skill-bridge.me
                </a>
              </div>

              <div className="bg-white rounded-xl p-5 shadow-sm">
                <div className="w-9 h-9 bg-teal/10 rounded-lg flex items-center justify-center mb-3">
                  <MessageSquare className="text-teal" size={18} />
                </div>
                <p className="font-family-poppins text-sm font-semibold text-black mb-1">
                  Already have an account?
                </p>
                <p className="font-family-poppins text-sm text-gray">
                  Use the Support page inside the app, or email{" "}
                  <a
                    href="mailto:support@skill-bridge.me"
                    className="text-teal hover:underline break-all"
                  >
                    support@skill-bridge.me
                  </a>
                </p>
              </div>

              <div className="bg-white rounded-xl p-5 shadow-sm">
                <div className="w-9 h-9 bg-teal/10 rounded-lg flex items-center justify-center mb-3">
                  <MapPin className="text-teal" size={18} />
                </div>
                <p className="font-family-poppins text-sm font-semibold text-black mb-1">Address</p>
                <p className="font-family-poppins text-sm text-gray">
                  po karimabad Altit faizabad tensil Aliabad District Hunza, Hunza Nagar, Hunza,
                  Pakistan
                </p>
              </div>
            </div>

            {/* Form */}
            <div className="lg:col-span-2">
              <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
                      Your name
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={set("name")}
                      maxLength={100}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={set("email")}
                      className={inputClass}
                    />
                  </div>
                </div>

                <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
                  Subject
                </label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={set("subject")}
                  maxLength={150}
                  className={`${inputClass} mb-4`}
                />

                <label className="font-family-poppins text-sm font-medium text-gray block mb-2">
                  Message
                </label>
                <textarea
                  value={form.message}
                  onChange={set("message")}
                  rows={7}
                  maxLength={MAX_MESSAGE}
                  className="w-full p-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm resize-none outline-none focus:border-teal"
                />
                <p className="font-family-poppins text-xs text-gray mt-1 mb-5">
                  {form.message.length}/{MAX_MESSAGE} characters
                </p>

                {result && (
                  <p
                    className={`font-family-poppins text-sm mb-4 ${
                      result.ok ? "text-teal" : "text-red-500"
                    }`}
                  >
                    {result.message}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="flex items-center gap-2 font-family-poppins text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg hover:bg-teal-button-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send size={16} />}
                  {sending ? "Sending..." : "Send message"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default ContactPage;
