import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Star, Loader2 } from "lucide-react";
import Button from "../ui/Button";
import { useToast } from "../ui/Toast";
import {
  fetchFeedbackReceived,
  fetchFeedbackGiven,
  fetchPendingSessions,
  submitFeedback,
  clearFeedbackError,
} from "../store/feedbackSlice";

// Day plus time. The date alone is not enough to tell two sessions apart when
// they are with the same person, for the same skill, on the same day - which is
// exactly what the picker was showing.
function sessionWhen(s) {
  if (!s?.startsAt) return s?.date || "";
  const d = new Date(s.startsAt);
  if (Number.isNaN(d.getTime())) return s.date || "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function FeedbackPage() {
  const dispatch = useDispatch();
  const { showSuccess, showError, showInfo } = useToast();
  const { feedbackReceived, feedbackGiven, pendingSessions, loading, submitting, error } =
    useSelector((state) => state.feedback);

  const [rating, setRating] = useState(5);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [activeTab, setActiveTab] = useState("received");
  const [selectedSession, setSelectedSession] = useState(null);
  // Guards against React StrictMode's dev-only double-invocation of this
  // effect, which was firing the load (and its toasts) twice per mount.
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    const loadFeedbackData = async () => {
      try {
        const results = await Promise.all([
          dispatch(fetchFeedbackReceived()).unwrap(),
          dispatch(fetchFeedbackGiven()).unwrap(),
          dispatch(fetchPendingSessions()).unwrap(),
        ]);

        if (results[2] && results[2].length === 0) {
          showInfo("No completed sessions found. Complete a session to provide feedback.");
        }
      } catch (err) {
        console.error("Failed to load feedback data:", err);
        showError("Failed to load feedback data. Please refresh the page.");
      }
    };
    loadFeedbackData();
  }, [dispatch, showError, showInfo]);

  // Auto-select first pending session if available
  useEffect(() => {
    if (pendingSessions.length > 0 && !selectedSession) {
      setSelectedSession(pendingSessions[0]);
      showInfo(`You have ${pendingSessions.length} session${pendingSessions.length > 1 ? 's' : ''} waiting for feedback.`);
    }
  }, [pendingSessions, selectedSession, showInfo]);

  const handleSubmit = async () => {
    if (!selectedSession) {
      showError("Please select a session to provide feedback for");
      return;
    }

    if (!rating || rating < 1 || rating > 5) {
      showError("Please select a rating between 1 and 5");
      return;
    }

    try {
      await dispatch(
        submitFeedback({
          toUserId: selectedSession.otherUserId,
          meetingId: selectedSession.meetingId,
          skill: selectedSession.skill,
          rating,
          comment: feedbackText,
        })
      ).unwrap();

      // Reset form
      setRating(5);
      setFeedbackText("");
      setSelectedSession(null);
      
      // Refresh feedback lists
      dispatch(fetchFeedbackReceived());
      dispatch(fetchFeedbackGiven());
      dispatch(fetchPendingSessions());
      
      showSuccess("Feedback submitted successfully!");
    } catch (err) {
      showError(err || "Failed to submit feedback");
    }
  };

  const session = selectedSession || {
    person: "No pending sessions",
    skill: "Select a session",
    date: "",
    avatar: null,
  };

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-family-poppins text-2xl font-bold text-black">
          Feedback & Ratings
        </h1>
      </div>

      {/* Feedback Card */}
      {pendingSessions.length > 0 ? (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          {/* Section Title */}
          <h2 className="font-family-poppins text-xl font-bold text-black mb-2">
            Provide Feedback
          </h2>
          <p className="font-family-poppins text-sm text-gray mb-6">
            {pendingSessions.length > 1
              ? `You have ${pendingSessions.length} sessions waiting for feedback.`
              : "Rate your recent session."}
          </p>

          {/* Session Selector */}
          {pendingSessions.length > 1 && (
            <div className="mb-4">
              <label className="font-family-poppins text-sm font-medium text-black mb-2 block">
                Select Session
              </label>
              <select
                value={selectedSession?.meetingId || ""}
                onChange={(e) => {
                  const session = pendingSessions.find(
                    (s) => s.meetingId === e.target.value
                  );
                  setSelectedSession(session);
                  setRating(5);
                  setFeedbackText("");
                }}
                className="w-full px-4 py-2.5 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal"
              >
                <option value="">Select a session...</option>
                {pendingSessions.map((s) => (
                  <option key={s.meetingId} value={s.meetingId}>
                    {s.person} - {s.skill} ({sessionWhen(s)})
                  </option>
                ))}
              </select>
            </div>
          )}

        <hr className="border-[#E5E5E5] mb-6" />

        {/* Session Info Card */}
        <div className="border border-[#E5E5E5] rounded-xl p-5 mb-6">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
              {session.avatar ? (
                <img
                  src={session.avatar}
                  alt={session.person}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <span className="text-gray text-xl font-medium">
                  {session.person?.charAt(0)?.toUpperCase() || "?"}
                </span>
              )}
            </div>

            {/* Info */}
            <div>
              <h3 className="font-family-poppins text-base font-semibold text-black">
                {session.person}
              </h3>
              <p className="font-family-poppins text-sm text-gray">
                {session.skill} - {session.date}
              </p>
            </div>
          </div>
        </div>

        {/* Rating Section */}
        <div className="mb-6">
          <h3 className="font-family-poppins text-base font-semibold text-black mb-3">
            Your Rating
          </h3>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="p-1 transition-transform hover:scale-110"
              >
                <Star
                  size={28}
                  className={`${
                    star <= (hoveredRating || rating)
                      ? "text-yellow-500 fill-yellow-500"
                      : "text-gray-300"
                  } transition-colors`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Detailed Feedback */}
        <div className="mb-6">
          <h3 className="font-family-poppins text-base font-semibold text-black mb-3">
            Detailed Feedback
          </h3>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Share your detailed feedback on the session experience, what went well, and areas for improvement..."
            className="w-full px-4 py-3 border border-[#D0D0D0] rounded-xl font-family-poppins text-sm outline-none focus:border-teal resize-none h-32"
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button
            variant="herobtn"
            className="px-6 py-2.5"
            onClick={handleSubmit}
            disabled={submitting || !selectedSession}
          >
            {submitting ? "Submitting..." : "Submit Feedback"}
          </Button>
        </div>
      </div>
      ) : (
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="text-center py-8">
            <p className="font-family-poppins text-gray mb-2">
              No completed sessions found.
            </p>
            <p className="font-family-poppins text-sm text-gray-400">
              Sessions that have ended will appear here for you to provide feedback.
            </p>
          </div>
        </div>
      )}

      {/* Feedback History Section */}
      <div className="mt-8">
        <h2 className="font-family-poppins text-xl font-bold text-black mb-6">
          Feedback History
        </h2>

        {/* Tabs */}
        <div className="flex justify-center max-w-88 mx-auto px-1 py-1.5 bg-light-teal rounded-lg items-center gap-2 mb-6">
          <button
            onClick={() => setActiveTab("received")}
            className={`px-5 py-3 rounded-lg font-family-poppins text-sm font-medium transition-all ${
              activeTab === "received"
                ? "bg-dark-blue text-white"
                : "text-black "
            }`}
          >
            Feedback Received
          </button>
          <button
            onClick={() => setActiveTab("given")}
            className={`px-5 py-3 rounded-lg font-family-poppins text-sm font-medium transition-all ${
              activeTab === "given"
                ? "bg-dark-blue text-white"
                : "text-black "
            }`}
          >
            Feedback Given
          </button>
        </div>

        {/* Feedback Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-teal" />
          </div>
        ) : (
          <div className="space-y-4">
            {(activeTab === "received" ? feedbackReceived : feedbackGiven).length === 0 ? (
              <div className="bg-white rounded-xl p-6 shadow-sm text-center">
                <p className="font-family-poppins text-gray">
                  No {activeTab === "received" ? "feedback received" : "feedback given"} yet.
                </p>
              </div>
            ) : (
              (activeTab === "received" ? feedbackReceived : feedbackGiven).map(
                (item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl p-6 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center shrink-0">
                      {item.avatar ? (
                        <img
                          src={item.avatar}
                          alt={item.name}
                          className="w-full h-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-gray text-lg font-medium">
                          {item.name?.charAt(0)?.toUpperCase() || "?"}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div>
                      <h3 className="font-family-poppins text-base font-semibold text-black">
                        {item.name}
                      </h3>
                      <p className="font-family-poppins text-xs text-gray">
                        {item.type}
                      </p>
                    </div>
                  </div>

                  {/* Rating and Date */}
                  <div className="text-right">
                    <div className="flex items-center gap-0.5 justify-end mb-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={18}
                          className={`${
                            star <= item.rating
                              ? "text-yellow-500 fill-yellow-500"
                              : "text-gray-300"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="font-family-poppins text-xs text-gray">
                      {item.date}
                    </p>
                  </div>
                </div>

                {/* Comment */}
                <p className="font-family-poppins text-sm text-gray mb-4">
                  {item.comment}
                </p>

                {/* Skill Tag */}
                <span className="inline-block px-4 py-2 bg-light-teal rounded-full font-family-poppins text-xs text-gray">
                  {item.skill}
                </span>
              </div>
                )
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default FeedbackPage;
