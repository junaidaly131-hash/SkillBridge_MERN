import { useState } from "react";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import { Sparkles, X } from "lucide-react";

const DISMISS_KEY = "profileCompletionBannerDismissed";

// Shown to users who skipped (or never finished) the onboarding wizard. This is
// deliberately derived from the profile actually being empty rather than from a
// "was skipped" flag, so it disappears on its own once they fill things in.
function ProfileCompletionBanner() {
  const { profile } = useSelector((state) => state.profile);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "true";
    } catch {
      return false;
    }
  });

  if (dismissed || !profile) return null;
  // Don't compete with the wizard itself.
  if (profile.onboardingCompleted === false) return null;

  const noSkills =
    !(profile.skillsTeaching?.length > 0) && !(profile.skillsLearning?.length > 0);
  const noBio = !profile.bio?.trim();
  if (!noSkills && !noBio) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      // Private mode / blocked storage - banner just returns next reload.
    }
  };

  return (
    <div className="mb-6 bg-teal/5 border border-teal/20 rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-teal/10 flex items-center justify-center shrink-0">
        <Sparkles className="text-teal" size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-family-poppins text-sm font-semibold text-black">
          Complete your profile to get better matches
        </p>
        <p className="font-family-poppins text-xs text-gray">
          {noSkills
            ? "Add the skills you can teach or want to learn so we can recommend the right people."
            : "Add a short bio so people know who they're booking a session with."}
        </p>
      </div>
      <Link
        to="/profile"
        className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-4 py-2 rounded-lg hover:bg-teal-button-hover transition-all shrink-0"
      >
        Complete
      </Link>
      <button
        type="button"
        onClick={handleDismiss}
        className="p-1 text-gray hover:text-black transition-colors shrink-0"
        aria-label="Dismiss"
      >
        <X size={18} />
      </button>
    </div>
  );
}

export default ProfileCompletionBanner;
