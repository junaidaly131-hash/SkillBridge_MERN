import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchProfile } from "../../store/profileSlice";
import OnboardingWizard from "./OnboardingWizard";

// Decides whether a signed-in user still needs the post-signup wizard.
function OnboardingGate() {
  const dispatch = useDispatch();
  const { profile, loading, error } = useSelector((state) => state.profile);
  const authUser = useSelector((state) => state.auth.user);
  // Escape hatch so a failing profile fetch can never become a dead end.
  const [bypassed, setBypassed] = useState(false);

  useEffect(() => {
    // `error` belongs in this guard: a rejected fetch flips loading back to
    // false while profile stays null, so without it this would re-dispatch on
    // every render and spin forever against a server that's already failing.
    if (!profile && !loading && !error) dispatch(fetchProfile());
  }, [profile, loading, error, dispatch]);

  // Once the profile is here it's the authoritative answer.
  if (profile) {
    // Strictly `=== false`: an older cached profile (or a backend that hasn't
    // restarted with the new field yet) leaves this undefined, and that must
    // not be read as "needs onboarding" for someone already using the app.
    if (profile.onboardingCompleted !== false) return null;
    return <OnboardingWizard profile={profile} />;
  }

  // No profile yet. The login/verify response carries the same flag, so a
  // brand-new signup is known to need onboarding on the very first render -
  // hold the screen instead of letting the dashboard paint for a moment first.
  // Anyone who doesn't need the wizard falls straight through to their page,
  // even if this fetch fails.
  if (authUser?.onboardingCompleted !== false || bypassed) return null;

  if (error) {
    return (
      <div className="fixed inset-0 z-60 bg-light-bg flex flex-col items-center justify-center gap-4 px-4 text-center">
        <img src="/assets/logo.png" alt="SkillBridge" className="h-10" />
        <div>
          <p className="font-family-poppins text-base font-semibold text-black mb-1">
            We couldn't load your profile
          </p>
          <p className="font-family-poppins text-sm text-gray max-w-sm">
            Check your connection and try again.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => dispatch(fetchProfile())}
            className="font-family-poppins text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg hover:bg-teal-button-hover transition-all"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => setBypassed(true)}
            className="font-family-poppins text-sm font-medium text-gray hover:text-black transition-colors"
          >
            Continue to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-60 bg-light-bg flex flex-col items-center justify-center gap-4">
      <img src="/assets/logo.png" alt="SkillBridge" className="h-12 animate-pulse" />
      <div className="w-8 h-8 border-4 border-light-teal border-t-teal rounded-full animate-spin" />
    </div>
  );
}

export default OnboardingGate;
