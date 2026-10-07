import { useEffect, useState } from "react";
import { Sparkles, Search, Star, Monitor, MapPin, Clock, Brain, Loader2, Globe, BadgeCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import Button from "../../ui/Button";
import { createConversation } from "../../store/chatSlice";
import { fetchUsers } from "../../store/usersSlice";

// Helper to calculate AI match score based on user data
function calculateMatchScore(user) {
  let score = 70; // Base score

  // Add points for having skills
  if (user.skillsTeaching?.length > 0) score += 5;
  if (user.skillsTeaching?.length > 2) score += 5;

  // Add points for rating
  if (user.stats?.avgRating > 0) {
    score += Math.min(user.stats.avgRating * 2, 10);
  }

  // Add points for sessions taught
  if (user.stats?.sessionsTaught > 0) {
    score += Math.min(user.stats.sessionsTaught, 10);
  }

  // Cap at 99%
  return Math.min(score, 99);
}

function AIRecommendedMatches() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { loading: chatLoading } = useSelector((state) => state.chat);
  const { users, loading: usersLoading } = useSelector((state) => state.users);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  // Filter users based on search query and exclude admin users
  const filteredUsers = users.filter((user) => {
    // Exclude admin users
    if (user.role === 'admin') return false;
    
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const name = user.name?.toLowerCase() || "";
    const skills = user.skillsTeaching?.map((s) => 
      typeof s === 'string' ? s.toLowerCase() : s.name?.toLowerCase()
    ).join(" ") || "";
    return name.includes(query) || skills.includes(query);
  });

  const handleMessage = async (userId) => {
    try {
      const result = await dispatch(createConversation(userId)).unwrap();
      navigate('/chat', { state: { conversationId: result._id } });
    } catch (error) {
      console.error('Failed to create conversation:', error);
      alert('Failed to start conversation. Please try again.');
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="text-black" size={20} />
          <h2 className="font-family-poppins text-xl font-semibold text-black">
            AI Recommended Matches
          </h2>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray" size={18} />
          <input
            type="text"
            placeholder="Search by skill or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal transition-all"
          />
        </div>
        <button className="px-4 py-2.5 border border-[#D0D0D0] rounded-lg font-family-josefin font-bold text-sm text-gray hover:bg-gray-50 transition-all">
          Highly Rated
        </button>
      </div>

      {/* AI Match Score Badge */}
      <div className="flex items-center gap-2 mb-6 px-2 py-3 border border-teal bg-light-teal rounded-full">
        <span className="flex items-center gap-1.5 px-3 py-1.5 ">
          <Brain className="text-teal" size={14} />
          <span className="font-family-poppins text-sm font-medium text-black">
            AI Match Score
          </span>
        </span>
        <span className="font-family-poppins text-sm text-gray">
          Based on Skills | Ratings | Feedbacks
        </span>
      </div>

      {/* Match Cards */}
      {usersLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-teal" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12">
          <p className="font-family-poppins text-gray">
            {searchQuery ? "No users found matching your search." : "No other users available."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredUsers.map((user) => {
            // Get primary skill being taught
            const primarySkill = user.skillsTeaching?.[0]
              ? (typeof user.skillsTeaching[0] === 'string'
                  ? user.skillsTeaching[0]
                  : user.skillsTeaching[0].name)
              : "Available for Teaching";

            // Calculate AI match score
            const matchScore = calculateMatchScore(user);

            return (
              <div
                key={user.id}
                className="border border-[#E5E5E5] rounded-xl p-5"
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Avatar */}
                  <div className="w-14 h-14 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-gray text-xl font-medium">
                        {user.name?.charAt(0) || 'U'}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <h3 className="font-family-poppins text-lg font-semibold text-black flex items-center gap-1.5">
                      {user.name}
                      {user.verificationStatus === "verified" && (
                        <BadgeCheck className="text-blue-500 shrink-0" size={18} fill="currentColor" stroke="white" strokeWidth={2} aria-label="Verified teacher" />
                      )}
                    </h3>
                    <p className="font-family-poppins text-sm text-gray mb-2">
                      {primarySkill}
                    </p>
                    {/* Stats */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                      
                      {/* AI Match Score */}
                      <span className="flex items-center gap-1">
                        <Brain className="text-teal" size={14} />
                        <span className="font-family-poppins text-teal font-medium">
                          {matchScore}% Match
                        </span>
                      </span>

                      {/* Sessions Taught */}
                      <span className="flex items-center gap-1">
                        <Monitor className="text-gray" size={14} />
                        <span className="font-family-poppins text-gray">
                          {user.stats?.sessionsTaught || 0} Sessions Taught
                        </span>
                      </span>

                      {/* Location */}
                      {user.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="text-gray" size={14} />
                          <span className="font-family-poppins text-gray">{user.location}</span>
                        </span>
                      )}

                      {/* Timezone */}
                      {user.timezone && (
                        <span className="flex items-center gap-1">
                          <Clock className="text-gray" size={14} />
                          <span className="font-family-poppins text-gray">{user.timezone}</span>
                        </span>
                      )}

                      {/* Rating */}
                      <span className="flex items-center gap-1">
                        <Star className="text-yellow-500 fill-yellow-500" size={14} />
                        <span className="font-family-poppins text-gray">
                          {user.stats?.avgRating > 0 ? user.stats.avgRating : "New"}
                        </span>
                      </span>

                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 sm:gap-3 mt-5">
                  <Button
                    variant="outline"
                    className="flex-1 min-w-0 py-2.5 whitespace-nowrap"
                    onClick={() => navigate(`/profile/${user.id}`)}
                  >
                    <span className="sm:hidden">Profile</span>
                    <span className="hidden sm:inline">View Profile</span>
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1 min-w-0 py-2.5 whitespace-nowrap"
                    onClick={() => handleMessage(user.id)}
                    disabled={chatLoading}
                  >
                    {chatLoading ? 'Starting...' : 'Message'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AIRecommendedMatches;
