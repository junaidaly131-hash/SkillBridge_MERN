import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useToast } from "../../ui/Toast";
import { createMeeting, fetchMeetings } from "../../store/meetingsSlice";
import { fetchWallet } from "../../store/creditsSlice";
import { fetchProfile } from "../../store/profileSlice";

// Mirrors backend/config/sessionCreditRates.js - keep in sync if those change.
const CREDITS_PER_LEARNING_SESSION = 25;

// Rounds up to the next 15-minute mark so the default doesn't land in the past.
function getDefaultDateTime() {
  const d = new Date();
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function ScheduleSessionModal({ isOpen, onClose, selectedChat }) {
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [sessionRole, setSessionRole] = useState("teaching");
  const [selectedSkill, setSelectedSkill] = useState("");
  const [useFreeTrial, setUseFreeTrial] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const dispatch = useDispatch();
  const toast = useToast();
  const { profile } = useSelector((s) => s.profile);
  const { conversations } = useSelector((s) => s.chat);
  const { user } = useSelector((s) => s.auth);
  const { wallet } = useSelector((s) => s.credits);

  const contacts = useMemo(() => {
    const meId = user?.id;
    return (conversations || []).map((c) => {
      const other = (c.participants || []).find((p) => String(p._id || p.id) !== String(meId));
      return {
        conversationId: c._id,
        otherUserId: other?._id || other?.id,
        name: other?.name || "Conversation",
        avatar: other?.avatar || null,
        acceptsFreeTrialSessions: Boolean(other?.acceptsFreeTrialSessions),
      };
    }).filter((c) => c.otherUserId);
  }, [conversations, user]);

  const recipient = contacts.find((c) => c.otherUserId === recipientId);

  const trialEligible =
    sessionRole === "learning" &&
    profile &&
    !profile.freeTrialSessionUsed &&
    Boolean(recipient?.acceptsFreeTrialSessions);

  // Default to using the trial whenever it becomes available - it's strictly
  // better than paying, and resetting on every relevant change means it can
  // never stay "on" for a role/recipient combo where it's no longer valid.
  useEffect(() => {
    setUseFreeTrial(trialEligible);
  }, [trialEligible]);

  // Reset the form defaults (including current-time-based date/time) every
  // time the modal opens, and pre-fill the recipient if one was pre-selected.
  useEffect(() => {
    if (!isOpen) return;
    const { date, time } = getDefaultDateTime();
    setSelectedDate(date);
    setSelectedTime(time);
    setRecipientId(selectedChat?.otherUserId || "");
    dispatch(fetchWallet());
    dispatch(fetchProfile());
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen, selectedChat, dispatch]);

  const availableSkills = useMemo(() => {
    if (!profile) return [];
    if (sessionRole === "teaching") {
      return (profile.skillsTeaching || []).map((s) => s.name);
    }
    return (profile.skillsLearning || []).map((s) => (typeof s === "string" ? s : s.name));
  }, [profile, sessionRole]);

  useEffect(() => {
    setSelectedSkill(availableSkills[0] || "");
  }, [sessionRole, availableSkills]);

  const handleClose = () => {
    if (isSubmitting) return;
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const hasEnoughCreditsToLearn =
    sessionRole !== "learning" || useFreeTrial || (wallet?.balance ?? 0) >= CREDITS_PER_LEARNING_SESSION;

  const handlePropose = async () => {
    if (!recipient) {
      toast.warning("Choose who to schedule this session with.");
      return;
    }
    if (!hasEnoughCreditsToLearn) {
      toast.warning(`You need at least ${CREDITS_PER_LEARNING_SESSION} credits to schedule a learning session.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const startsAt = new Date(`${selectedDate}T${selectedTime}:00`).toISOString();
      const roleLabel = sessionRole === "teaching" ? "Teaching" : "Learning";
      const skillLabel = selectedSkill ? ` - ${selectedSkill}` : "";
      const title = `${roleLabel}${skillLabel} with ${recipient.name}`;

      await dispatch(
        createMeeting({
          conversationId: recipient.conversationId,
          otherUserId: recipient.otherUserId,
          title,
          startsAt,
          sessionType: sessionRole,
          skill: selectedSkill || null,
          duration: 60,
          useFreeTrialSession: trialEligible && useFreeTrial,
        })
      ).unwrap();

      dispatch(fetchWallet());
      dispatch(fetchProfile());
      dispatch(fetchMeetings());
      toast.success(
        trialEligible && useFreeTrial
          ? "Free trial session scheduled! No credits will be charged."
          : "Session scheduled! Credits are exchanged once the session is completed."
      );
      handleClose();
    } catch (err) {
      toast.error(err || "Failed to schedule session");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${
        isClosing ? "modal-overlay-exit" : "modal-overlay-enter"
      }`}
    >
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div
        className={`relative bg-white shadow-xl rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-hide ${
          isClosing ? "modal-content-exit" : "modal-content-enter"
        }`}
      >
        <div className="p-6 pb-4 border-b border-[#E5E5E5] flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
          <h2 className="font-family-poppins text-xl font-bold text-black">
            Schedule Session
          </h2>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-all"
            disabled={isSubmitting}
          >
            <X className="text-gray" size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="font-family-poppins text-xs text-gray mb-2 block">
              Schedule with:
            </label>
            {contacts.length > 0 ? (
              <div className="flex gap-3 overflow-x-auto py-1 -mx-1 px-1">
                {contacts.map((c) => {
                  const isSelected = c.otherUserId === recipientId;
                  return (
                    <button
                      key={c.otherUserId}
                      type="button"
                      onClick={() => setRecipientId(c.otherUserId)}
                      className="flex flex-col items-center gap-1 shrink-0 w-16"
                    >
                      <div
                        className={`w-14 h-14 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden transition-all ${
                          isSelected ? "ring-2 ring-teal ring-offset-2" : "hover:ring-2 hover:ring-gray-300 hover:ring-offset-2"
                        }`}
                      >
                        {c.avatar ? (
                          <img src={c.avatar} alt={c.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-gray text-lg font-medium">
                            {c.name?.charAt(0) || "U"}
                          </span>
                        )}
                      </div>
                      <span
                        className={`font-family-poppins text-xs text-center truncate w-full ${
                          isSelected ? "text-teal font-semibold" : "text-gray"
                        }`}
                      >
                        {c.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="font-family-poppins text-xs text-orange-500 p-2 bg-orange-50 rounded-lg">
                Start a conversation first to schedule a session with someone.
              </p>
            )}
          </div>

          <div>
            <label className="font-family-poppins text-xs text-gray mb-2 block">
              I want to:
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSessionRole("teaching")}
                className={`flex-1 py-2 px-3 rounded-lg font-family-poppins text-sm transition-all ${
                  sessionRole === "teaching"
                    ? "bg-teal-button text-white"
                    : "bg-gray-100 text-gray hover:bg-gray-200"
                }`}
              >
                Teach (+25)
              </button>
              <button
                type="button"
                onClick={() => setSessionRole("learning")}
                className={`flex-1 py-2 px-3 rounded-lg font-family-poppins text-sm transition-all ${
                  sessionRole === "learning"
                    ? "bg-orange-500 text-white"
                    : "bg-gray-100 text-gray hover:bg-gray-200"
                }`}
              >
                Learn {trialEligible ? "(free trial)" : "(-25)"}
              </button>
            </div>
          </div>

          {trialEligible && (
            <label className="flex items-start gap-2.5 p-3 bg-teal/10 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={useFreeTrial}
                onChange={(e) => setUseFreeTrial(e.target.checked)}
                className="mt-0.5 accent-teal"
              />
              <span className="font-family-poppins text-xs text-black">
                <span className="font-semibold">Use my free trial session</span> - {recipient.name}{" "}
                accepts free trial bookings. This is your one and only free session as a student;
                no credits will be charged.
              </span>
            </label>
          )}

          <div>
            <label className="font-family-poppins text-xs text-gray mb-2 block">
              {sessionRole === "teaching" ? "Skill to teach:" : "Skill to learn:"}
            </label>
            {availableSkills.length > 0 ? (
              <select
                value={selectedSkill}
                onChange={(e) => setSelectedSkill(e.target.value)}
                className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal bg-white"
              >
                {availableSkills.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
            ) : (
              <p className="font-family-poppins text-xs text-orange-500 p-2 bg-orange-50 rounded-lg">
                No {sessionRole === "teaching" ? "teaching" : "learning"} skills added.{" "}
                <a href="/profile" className="underline text-teal">
                  Add skills in your profile
                </a>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-family-poppins text-xs text-gray mb-2 block">Date</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal"
              />
            </div>
            <div>
              <label className="font-family-poppins text-xs text-gray mb-2 block">Time</label>
              <input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                className="w-full px-4 py-3 border border-[#D0D0D0] rounded-lg font-family-poppins text-sm outline-none focus:border-teal"
              />
            </div>
          </div>

          {trialEligible && useFreeTrial ? (
            <p className="font-family-poppins text-xs text-teal bg-teal/10 rounded-lg p-2.5">
              This session is free - no credits will be charged to you or paid to {recipient.name}.
            </p>
          ) : hasEnoughCreditsToLearn ? (
            <p className="font-family-poppins text-xs text-gray bg-gray-50 rounded-lg p-2.5">
              Credits are only exchanged once the session actually completes - not at booking time.
            </p>
          ) : (
            <p className="font-family-poppins text-xs text-red-600 bg-red-50 rounded-lg p-2.5">
              You have {wallet?.balance ?? 0} credits, but a learning session costs {CREDITS_PER_LEARNING_SESSION}.{" "}
              <a href="/credits" className="underline font-medium">
                Buy more credits
              </a>{" "}
              to schedule this session.
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="font-family-poppins font-medium px-6 py-2.5 rounded-lg transition-all border border-gray text-black hover:bg-dark-blue hover:text-white disabled:opacity-50 disabled:pointer-events-none"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePropose}
              disabled={isSubmitting || availableSkills.length === 0 || !recipient || !hasEnoughCreditsToLearn}
              className="font-family-poppins font-medium px-6 py-2.5 rounded-lg transition-all bg-dark-blue text-white hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isSubmitting ? "Scheduling..." : "Propose New Session"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScheduleSessionModal;
