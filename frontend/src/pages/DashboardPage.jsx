import { useEffect } from "react";
import { Star } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import { fetchWallet } from "../store/creditsSlice";
import { fetchMeetings } from "../store/meetingsSlice";
import { fetchProfile } from "../store/profileSlice";
import AIRecommendations from "../components/Dashboard/AIRecommendations";
import ProfileCompletionBanner from "../components/Dashboard/ProfileCompletionBanner";
import VerificationBanner from "../components/Dashboard/VerificationBanner";

function DashboardPage() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { wallet } = useSelector((state) => state.credits);
  const { meetings } = useSelector((state) => state.meetings);
  const { profile } = useSelector((state) => state.profile);

  useEffect(() => {
    // Admins have a separate platform-management area and should never load
    // end-user wallet, meeting, profile, verification, or recommendation UI.
    if (user?.role === "admin") return;

    dispatch(fetchWallet());
    dispatch(fetchMeetings());
    dispatch(fetchProfile());
  }, [dispatch, user?.role]);

  if (user?.role === "admin") {
    return <Navigate to="/admin/transactions" replace />;
  }

  const creditBalance = wallet?.balance ?? 0;
  const scheduledSessions = Array.isArray(meetings) ? meetings.length : 0;
  const averageRating = profile?.stats?.avgRating > 0 ? profile.stats.avgRating : "—";

  const stats = [
    {
      title: "Credit Balance",
      value: creditBalance,
      icon: "/assets/credit.svg",
      isImage: true,
    },
    {
      title: "Scheduled Sessions",
      value: scheduledSessions,
      icon: "/assets/sessions.svg",
      isImage: true,
    },
    {
      title: "Average Rating",
      value: averageRating,
      icon: Star,
      isImage: false,
      iconColor: "text-yellow-500 fill-yellow-500",
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-family-poppins text-3xl font-bold text-black mb-2">
          Welcome back, {user?.name || 'User'}!
        </h1>
        <p className="font-family-poppins text-gray">
          Here's an overview of your SkillBridge activity.
        </p>
      </div>

      {/* Verification first - it gates real functionality, profile completion
          is only a suggestion. */}
      <VerificationBanner />
      <ProfileCompletionBanner />

      {/* Quick Stats */}
      <div className="mb-8">
        <h2 className="font-family-poppins text-2xl font-medium text-black mb-4">
          Quick Stats
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.title}
                className="bg-white rounded-xl p-6 shadow-sm"
              >
                <p className="font-family-poppins text-sm text-gray mb-3">
                  {stat.title}
                </p>
                <div className="mb-3">
                  {stat.isImage ? (
                    <img src={stat.icon} alt={stat.title} className="w-8 h-8" />
                  ) : (
                    <div className={`w-10 h-10 flex items-center justify-center`}>
                      <Icon className={stat.iconColor} size={30} />
                    </div>
                  )}
                </div>
                <p className="font-family-poppins text-3xl font-medium text-black">
                  {stat.value}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* AI Recommended Matches */}
      <AIRecommendations />
    </div>
  );
}

export default DashboardPage;
