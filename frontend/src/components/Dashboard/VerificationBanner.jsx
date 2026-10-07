import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { Clock, ShieldAlert, ShieldCheck } from "lucide-react";
import Badge from "../../ui/Badge";

// Unlike ProfileCompletionBanner this one is NOT dismissible. It isn't a
// suggestion - until it clears, the account can't teach, can't book past the
// free trial and can't cash out. Hiding that behind a close button would only
// move the surprise to the moment someone tries.
//
// It disappears on its own the moment the status turns 'verified'.
//
// Styled as a plain white card like every other card on the dashboard, with the
// state carried by the icon tile and the status pill - the same way CreditStats
// does it. An accent strip down one edge was tried and read as a rendering
// glitch, because the rounded corner bends it.
function VerificationBanner() {
  const { profile } = useSelector((state) => state.profile);

  if (!profile) return null;
  // The wizard owns the screen while it's running.
  if (profile.onboardingCompleted === false) return null;

  const status = profile.verificationStatus || "unverified";
  if (status === "verified") return null;

  const teaches = (profile.skillsTeaching?.length || 0) > 0;

  const variants = {
    unverified: {
      icon: ShieldAlert,
      card: "bg-white",
      iconTone: "bg-light-teal text-teal",
      title: "Verify your identity",
      // Says what it costs them, not just what to do - that is what makes
      // someone actually go and find their CNIC.
      body: teaches
        ? "Upload your CNIC and one credential. Until that's approved you can't take teaching sessions or cash out your earnings."
        : "Upload your CNIC. Your free trial session works without it, but booking anything after that needs verification.",
      cta: "Verify now",
    },
    pending: {
      icon: Clock,
      card: "bg-white",
      iconTone: "bg-orange-100 text-orange-500",
      title: "Documents under review",
      body: "We'll email you as soon as an admin has checked them. Nothing needed from you right now.",
      cta: "View",
    },
    rejected: {
      icon: ShieldAlert,
      // The one state that earns a tint - it's a failure the user has to act
      // on, and it matches how a rejection already reads on the profile page.
      card: "bg-red/5",
      iconTone: "bg-red/10 text-red",
      title: "Verification wasn't approved",
      body:
        profile.verificationRejectionReason?.trim() ||
        "Your documents couldn't be verified. Please upload clearer copies and submit again.",
      cta: "Submit again",
    },
  };

  const variant = variants[status] || variants.unverified;
  const Icon = variant.icon;

  return (
    <div
      className={`mb-6 ${variant.card} rounded-xl shadow-sm p-5 flex flex-col sm:flex-row sm:items-center gap-4`}
    >
      <div
        className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${variant.iconTone}`}
      >
        <Icon size={20} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 mb-1">
          <h3 className="font-family-poppins text-base font-semibold text-black">
            {variant.title}
          </h3>
          <Badge status={status} />
        </div>
        <p className="font-family-poppins text-sm text-gray leading-relaxed">{variant.body}</p>
      </div>

      <Link
        to="/profile#verification"
        className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-5 py-2.5 rounded-lg hover:bg-teal-button-hover transition-all shrink-0 inline-flex items-center justify-center gap-2"
      >
        <ShieldCheck size={16} />
        {variant.cta}
      </Link>
    </div>
  );
}

export default VerificationBanner;
