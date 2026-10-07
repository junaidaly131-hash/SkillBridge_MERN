import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, Link } from "react-router-dom";
import { Sparkles, Search, Star, Monitor, MapPin, Clock, Brain, Loader2, AlertCircle, CalendarPlus, BadgeCheck, GraduationCap, BookOpen } from "lucide-react";
import Button from "../../ui/Button";
import Pagination from "../../ui/Pagination";
import { AnimatePresence } from "motion/react";
import * as Motion from "motion/react-m";
import { fadeUp, stagger } from "../../lib/motion";
import { createConversation } from "../../store/chatSlice";
import { fetchRecommendations } from "../../store/recommendationsSlice";
import { fetchUsers } from "../../store/usersSlice";

const ITEMS_PER_PAGE = 3;
const HIGHLY_RATED_MIN = 4;

// Everything that differs between the two tabs, in one place.
const DIRECTIONS = {
  learn: {
    tabLabel: "Teachers for You",
    // The skill array on MY profile this direction matches from.
    mySkillsField: "skillsLearning",
    // The skill array on THEIR profile that gets listed on the card.
    theirSkillsField: "skillsTeaching",
    noSkillsTitle: "Add skills you want to learn",
    noSkillsBody: "Tell us what you'd like to learn and we'll match you with teachers who can help.",
    noMatchesBody: "No teachers match your learning goals yet — check back soon as more people join.",
    searchEmpty: "No teachers found matching your search.",
    fallbackSkill: "Available for Teaching",
    // A teaching rating is meaningful here, so the filter applies.
    supportsRatingFilter: true,
  },
  teach: {
    tabLabel: "Students for You",
    mySkillsField: "skillsTeaching",
    theirSkillsField: "skillsLearning",
    noSkillsTitle: "Add skills you can teach",
    noSkillsBody: "Tell us what you can teach and we'll match you with students who want to learn it.",
    noMatchesBody: "No students are looking for your skills yet — check back soon as more people join.",
    searchEmpty: "No students found matching your search.",
    fallbackSkill: "Looking to learn",
    // Ratings on this platform come from teaching feedback, so filtering
    // students by one would be filtering on an unrelated number.
    supportsRatingFilter: false,
  },
};

const skillNames = (skills) => (skills || []).map((s) => (typeof s === "string" ? s : s.name)).filter(Boolean);

function AIRecommendations() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { user } = useSelector((state) => state.auth);
  const { profile } = useSelector((state) => state.profile);
  const recommendationsState = useSelector((state) => state.recommendations);
  const { users, loading: usersLoading } = useSelector((state) => state.users);

  const [direction, setDirection] = useState("learn");
  const [startingChatWith, setStartingChatWith] = useState(null);
  // Each tab keeps its own controls so switching back and forth doesn't reset
  // the other tab's search, page or filters.
  const [controls, setControls] = useState({
    learn: { viewMode: "recommended", search: "", page: 1, highlyRated: false },
    teach: { viewMode: "recommended", search: "", page: 1, highlyRated: false },
  });
  const hasDefaulted = useRef(false);

  const config = DIRECTIONS[direction];
  const ctrl = controls[direction];
  const setCtrl = (patch) =>
    setControls((c) => ({ ...c, [direction]: { ...c[direction], ...patch } }));

  const mySkills = skillNames(profile?.[config.mySkillsField]);
  const hasMySkills = mySkills.length > 0;

  const canLearn = (profile?.skillsLearning || []).length > 0;
  const canTeach = (profile?.skillsTeaching || []).length > 0;

  // Tabs follow the skills actually on the profile, not what was picked during
  // onboarding - so adding teaching skills from Edit Profile later makes the
  // students tab appear on its own, with no other setup.
  const tabs = useMemo(() => {
    const available = [
      ...(canLearn ? ["learn"] : []),
      ...(canTeach ? ["teach"] : []),
    ];
    // With no skills on either side there is nothing to gate on yet, so show
    // both and let each tab's "add skills" prompt do the guiding.
    return available.length > 0 ? available : ["learn", "teach"];
  }, [canLearn, canTeach]);

  // Keep the selection on a tab that still exists - a user who removes their
  // last learning skill shouldn't be left staring at a tab that's now gone.
  useEffect(() => {
    if (!tabs.includes(direction)) setDirection(tabs[0]);
  }, [tabs, direction]);

  useEffect(() => {
    if (hasDefaulted.current || !profile) return;
    hasDefaulted.current = true;

    // Someone with no skills on a side can still browse "All Users" there.
    setControls((c) => ({
      learn: { ...c.learn, viewMode: canLearn ? "recommended" : "all" },
      teach: { ...c.teach, viewMode: canTeach ? "recommended" : "all" },
    }));
  }, [profile, canLearn, canTeach]);

  useEffect(() => {
    dispatch(fetchUsers());
    // Fetch both directions up front - the API answers with an empty list and
    // a reason when a side has no skills, so this is safe either way.
    dispatch(fetchRecommendations({ limit: 10, direction: "learn" }));
    dispatch(fetchRecommendations({ limit: 10, direction: "teach" }));
  }, [dispatch]);

  const userMap = users.reduce((acc, u) => {
    acc[u.id || u._id] = u;
    return acc;
  }, {});

  const { recommendations, loading: recsLoading, error, method } = recommendationsState[direction];

  // "All Users" normalises everyone with skills on the relevant side into the
  // same shape the cards expect, minus an AI score (there isn't one).
  const allUsers = users
    .filter((u) => u.role !== "admin" && (u[config.theirSkillsField] || []).length > 0)
    .map((u) => ({
      teacher_id: u.id,
      name: u.name,
      subjects: skillNames(u[config.theirSkillsField]),
      expertise: [],
      score: null,
      average_rating: u.stats?.avgRating || 0,
      reason: null,
    }));

  const isRecommendedView = ctrl.viewMode === "recommended";
  const sourceList = isRecommendedView ? recommendations : allUsers;
  const loading = isRecommendedView ? recsLoading : usersLoading;
  const activeError = isRecommendedView ? error : null;

  const sorted = isRecommendedView ? [...sourceList].sort((a, b) => b.score - a.score) : sourceList;

  const filtered = sorted.filter((match) => {
    if (match.teacher_id === user?.userId || match.teacher_id === user?.id) return false;

    if (config.supportsRatingFilter && ctrl.highlyRated) {
      if (!(match.average_rating >= HIGHLY_RATED_MIN)) return false;
    }

    if (!ctrl.search) return true;
    const query = ctrl.search.toLowerCase();
    return (
      (match.name?.toLowerCase() || "").includes(query) ||
      (match.subjects?.join(" ").toLowerCase() || "").includes(query) ||
      (match.expertise?.join(" ").toLowerCase() || "").includes(query)
    );
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const startIndex = (ctrl.page - 1) * ITEMS_PER_PAGE;
  const paginated = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleMessage = async (targetId) => {
    try {
      setStartingChatWith(targetId);
      const result = await dispatch(createConversation(targetId)).unwrap();
      navigate("/chat", { state: { conversationId: result._id } });
    } catch (err) {
      console.error("Failed to create conversation:", err);
    } finally {
      setStartingChatWith(null);
    }
  };

  const handleSchedule = async (targetId) => {
    try {
      setStartingChatWith(targetId);
      const result = await dispatch(createConversation(targetId)).unwrap();
      navigate("/chat", { state: { conversationId: result._id, openSchedule: true } });
    } catch (err) {
      console.error("Failed to start scheduling:", err);
    } finally {
      setStartingChatWith(null);
    }
  };

  if (!profile) return null;

  // "You haven't set this up" is a different problem from "we have nothing for
  // you", and only the first one is actionable - so they get different states.
  const showNoSkillsState = isRecommendedView && !hasMySkills;

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="text-black" size={20} />
        <h2 className="font-family-poppins text-xl font-semibold text-black">
          AI Recommended Matches
        </h2>
      </div>

      {/* Direction tabs */}
      <div className="flex gap-1 border-b border-[#E5E5E5] mb-4">
        {tabs.map((key) => {
          const cfg = DIRECTIONS[key];
          const Icon = key === "learn" ? GraduationCap : BookOpen;
          const isActive = direction === key;
          return (
            <button
              key={key}
              onClick={() => setDirection(key)}
              // whitespace-nowrap so "Teachers for You" cannot break across
              // two lines, and tighter padding and type below sm so both tabs
              // still fit a 375px screen once they refuse to wrap.
              className={`flex items-center gap-1.5 sm:gap-2 whitespace-nowrap px-2.5 sm:px-4 py-2.5 font-family-poppins text-xs sm:text-sm font-medium border-b-2 -mb-px transition-all ${
                isActive
                  ? "border-teal text-teal"
                  : "border-transparent text-gray hover:text-black"
              }`}
            >
              <Icon size={16} className="shrink-0" />
              {cfg.tabLabel}
            </button>
          );
        })}
      </div>

      {/* Recommended / All Users toggle */}
      <div className="inline-flex w-fit rounded-lg bg-light-gray p-1 mb-4">
        <button
          onClick={() => setCtrl({ viewMode: "recommended", page: 1 })}
          className={`px-4 py-1.5 rounded-md font-family-poppins text-sm font-medium transition-all ${
            isRecommendedView ? "bg-white text-black shadow-sm" : "text-gray"
          }`}
        >
          Recommended
        </button>
        <button
          onClick={() => setCtrl({ viewMode: "all", page: 1 })}
          className={`px-4 py-1.5 rounded-md font-family-poppins text-sm font-medium transition-all ${
            !isRecommendedView ? "bg-white text-black shadow-sm" : "text-gray"
          }`}
        >
          All Users
        </button>
      </div>

      {/* Search and filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray" size={18} />
          <input
            type="text"
            placeholder="Search by skill or name..."
            value={ctrl.search}
            onChange={(e) => setCtrl({ search: e.target.value, page: 1 })}
            className="w-full pl-10 pr-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal transition-all"
          />
        </div>
        {config.supportsRatingFilter && (
          <button
            onClick={() => setCtrl({ highlyRated: !ctrl.highlyRated, page: 1 })}
            aria-pressed={ctrl.highlyRated}
            className={`px-4 py-2.5 border rounded-lg font-family-josefin font-bold text-sm transition-all ${
              ctrl.highlyRated
                ? "border-teal bg-light-teal text-teal"
                : "border-[#D0D0D0] text-gray hover:bg-gray-50"
            }`}
          >
            Highly Rated
          </button>
        )}
      </div>

      {isRecommendedView && !showNoSkillsState && (
        // rounded-2xl, not rounded-full: at 375px the descriptor wraps to a
        // second line, and a pill with fully round ends looks like a rendering
        // fault once it wraps. flex-wrap makes the wrap deliberate.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-6 px-3 py-2.5 border border-teal bg-light-teal rounded-2xl">
          <span className="flex items-center gap-1.5">
            <Brain className="text-teal" size={14} />
            <span className="font-family-poppins text-sm font-medium text-black">
              AI Match Score
            </span>
          </span>
          <span className="font-family-poppins text-sm text-gray">
            {method === "content-based" && "Based on Skills | Ratings | Feedbacks"}
            {method === "collaborative" && "Based on Similar Students"}
            {method === "hybrid" && "Based on Skills & Similar Students"}
          </span>
        </div>
      )}

      {/* You haven't added the skills this direction needs */}
      {showNoSkillsState && (
        <div className="text-center py-12">
          <div className="w-12 h-12 bg-teal/10 rounded-full flex items-center justify-center mx-auto mb-3">
            <Sparkles className="text-teal" size={22} />
          </div>
          <p className="font-family-poppins text-base font-semibold text-black mb-1">
            {config.noSkillsTitle}
          </p>
          <p className="font-family-poppins text-sm text-gray max-w-sm mx-auto mb-5">
            {config.noSkillsBody}
          </p>
          <Link
            to="/profile"
            className="inline-block font-family-poppins text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg hover:bg-teal-button-hover transition-all"
          >
            Update your profile
          </Link>
        </div>
      )}

      {!showNoSkillsState && loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-teal" />
        </div>
      )}

      {/* Laid out like the other empty states in this card rather than as a
          tinted alert box - the service being down is a dead end to route the
          user out of, not something they did wrong. The button does the routing
          instead of telling them to go and find it. */}
      {!showNoSkillsState && activeError && !loading && (
        <div className="text-center py-12">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="text-orange-500" size={22} />
          </div>
          <p className="font-family-poppins text-base font-semibold text-black mb-1">
            Recommendations are unavailable right now
          </p>
          <p className="font-family-poppins text-sm text-gray max-w-sm mx-auto mb-5">
            {activeError}
          </p>
          <button
            type="button"
            onClick={() => setCtrl({ viewMode: "all", page: 1 })}
            className="inline-block font-family-poppins text-sm font-semibold text-white bg-teal-button px-6 py-2.5 rounded-lg hover:bg-teal-button-hover transition-all"
          >
            Browse all users
          </button>
        </div>
      )}

      {/* We genuinely have nothing to show - distinct from the state above */}
      {!showNoSkillsState && !loading && !activeError && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="font-family-poppins text-gray">
            {ctrl.search
              ? config.searchEmpty
              : ctrl.highlyRated
              ? "No highly rated matches — try turning off the filter."
              : isRecommendedView
              ? config.noMatchesBody
              : "Nobody here yet — check back soon."}
          </p>
        </div>
      )}

      {!showNoSkillsState && !loading && !activeError && filtered.length > 0 && (
        <>
          {/* Keyed on the tab so switching cross-fades the whole list rather
              than swapping rows in place. Keyed on the page too, so paging
              re-runs the stagger instead of leaving the new rows static.
              AnimatePresence only governs how this list appears - the data is
              already in memory, so nothing refetches and the list does not
              jump. */}
          <AnimatePresence mode="wait" initial={false}>
          <Motion.div
            key={`${direction}-${ctrl.page}`}
            className="space-y-4"
            variants={stagger(0.06)}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
          >
            {paginated.map((match) => {
              const matchData = userMap[match.teacher_id];
              const theirSkills = match.subjects || [];

              // On the students tab, lead with the overlap between what they
              // want and what I teach - that's the reason they're here.
              const matched = direction === "teach"
                ? theirSkills.filter((s) =>
                    mySkills.some((mine) => mine.toLowerCase() === s.toLowerCase())
                  )
                : [];
              const headlineSkills = matched.length > 0 ? matched : theirSkills;
              const primarySkill = headlineSkills[0]
                ? headlineSkills.join(", ")
                : config.fallbackSkill;

              const sessionsLearned =
                matchData?.stats?.sessionsLearned ?? match.sessions_learned ?? 0;
              const sessionsTaught = matchData?.stats?.sessionsTaught || 0;

              return (
                <Motion.div
                  key={match.teacher_id}
                  variants={fadeUp}
                  className="border border-[#E5E5E5] rounded-xl p-5"
                >
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="w-14 h-14 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                      {matchData?.avatar ? (
                        <img
                          src={matchData.avatar}
                          alt={match.name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-gray text-xl font-medium">
                          {match.name?.charAt(0) || "U"}
                        </span>
                      )}
                    </div>

                    <div className="flex-1">
                      <h3 className="font-family-poppins text-lg font-semibold text-black flex items-center gap-1.5">
                        {match.name}
                        {matchData?.verificationStatus === "verified" && (
                          <BadgeCheck
                            className="text-blue-500 shrink-0"
                            size={18}
                            fill="currentColor"
                            stroke="white"
                            strokeWidth={2}
                            aria-label="Verified user"
                          />
                        )}
                      </h3>
                      <p className="font-family-poppins text-sm text-gray mb-2">
                        {direction === "teach" && matched.length > 0
                          ? `Wants to learn: ${primarySkill}`
                          : primarySkill}
                      </p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        {match.score !== null && (
                          <span className="flex items-center gap-1">
                            <Brain className="text-teal" size={14} />
                            <span className="font-family-poppins text-teal font-medium">
                              {Math.round(match.score)}% Match
                            </span>
                          </span>
                        )}

                        {/* Sessions: taught for teachers, learned for students.
                            The opposite figure would be meaningless here. */}
                        <span className="flex items-center gap-1">
                          <Monitor className="text-gray" size={14} />
                          <span className="font-family-poppins text-gray">
                            {direction === "teach"
                              ? `${sessionsLearned} ${sessionsLearned === 1 ? "Session" : "Sessions"} Learned`
                              : `${sessionsTaught} ${sessionsTaught === 1 ? "Session" : "Sessions"} Taught`}
                          </span>
                        </span>

                        {matchData?.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="text-gray" size={14} />
                            <span className="font-family-poppins text-gray">{matchData.location}</span>
                          </span>
                        )}

                        {matchData?.timezone && (
                          <span className="flex items-center gap-1">
                            <Clock className="text-gray" size={14} />
                            <span className="font-family-poppins text-gray">{matchData.timezone}</span>
                          </span>
                        )}

                        {/* Ratings come from teaching feedback, so they're only
                            shown when the card is actually about a teacher. */}
                        {direction === "learn" && (
                          <span className="flex items-center gap-1">
                            <Star className="text-yellow-500 fill-yellow-500" size={14} />
                            <span className="font-family-poppins text-gray">
                              {match.average_rating > 0
                                ? match.average_rating.toFixed(1)
                                : "No ratings yet"}
                            </span>
                          </span>
                        )}
                      </div>

                      {match.reason && (
                        <p className="font-family-poppins text-xs text-gray-500 italic mt-2">
                          {match.reason}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 mt-5">
                    <Button
                      variant="outline"
                      className="flex-1 py-2.5"
                      onClick={() => navigate(`/profile/${match.teacher_id}`)}
                    >
                      View Profile
                    </Button>
                    <Button
                      variant="primary"
                      className="flex-1 py-2.5"
                      onClick={() => handleMessage(match.teacher_id)}
                    >
                      {startingChatWith === match.teacher_id ? "Starting..." : "Message"}
                    </Button>
                    <button
                      onClick={() => handleSchedule(match.teacher_id)}
                      disabled={startingChatWith === match.teacher_id}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg font-family-poppins font-medium text-sm text-white bg-dark-blue hover:opacity-90 transition-all disabled:opacity-50 shrink-0"
                      aria-label="Schedule session"
                      title="Schedule session"
                    >
                      <CalendarPlus size={16} />
                      <span className="hidden sm:inline">Schedule</span>
                    </button>
                  </div>
                </Motion.div>
              );
            })}
          </Motion.div>
          </AnimatePresence>

          {totalPages > 1 && (
            <Pagination
              currentPage={ctrl.page}
              totalPages={totalPages}
              onPageChange={(p) => setCtrl({ page: p })}
            />
          )}
        </>
      )}
    </div>
  );
}

export default AIRecommendations;
