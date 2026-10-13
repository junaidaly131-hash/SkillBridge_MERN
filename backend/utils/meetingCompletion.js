import Meeting from '../models/Meeting.js';
import User from '../models/User.js';
import SessionDispute from '../models/SessionDispute.js';
import { CreditTransaction } from '../models/Credit.js';
import { getOrCreateWallet, notifyIfCrossedLowBalance, spendCredits, addEarnedCredits } from './wallet.js';
import { CREDITS_PER_TEACHING_SESSION, CREDITS_PER_LEARNING_SESSION } from '../config/sessionCreditRates.js';
import { notifyUser } from './notify.js';

// How long either participant has to report a no-show before credits finalize.
const DISPUTE_WINDOW_MS = 24 * 60 * 60 * 1000;

// A learning goal's progress is auto-derived from completed sessions in that
// skill, not user-editable - this many percentage points per session, capped
// at 100 (i.e. 10 completed sessions = "mastered").
const PROGRESS_PER_SESSION = 10;

// A meeting's sessionType is always taken from the creator's own perspective
// at booking time (see frontend SchedulePanel.jsx). This is the single source
// of truth for "who is teaching vs learning" - reuse it everywhere instead of
// re-deriving it.
export function getSessionRoles(meeting) {
  const teacherId = meeting.sessionType === 'teaching'
    ? meeting.createdBy
    : meeting.participants.find((p) => String(p) !== String(meeting.createdBy));
  const learnerId = meeting.sessionType === 'learning'
    ? meeting.createdBy
    : meeting.participants.find((p) => String(p) !== String(meeting.createdBy));
  return { teacherId, learnerId };
}

/**
 * Hands a free trial back when the session it was booked for never happened
 * because the other side declined or never answered.
 *
 * The trial is claimed at booking time so two concurrent requests can't both
 * spend it. That is right for a session that goes ahead or is cancelled by the
 * person who booked it - but losing your one free trial because a teacher
 * ignored the request is not a cost you chose, and it is the single worst
 * moment to lose it, since the trial exists to get someone through their first
 * session at all.
 *
 * Only returns a trial that is still marked used, and clears the flag on the
 * meeting so a repeated sweep cannot hand out a second one.
 */
export async function releaseFreeTrialIfUnused(meeting) {
  if (!meeting.isFreeTrialSession) return;

  await User.findByIdAndUpdate(meeting.createdBy, { freeTrialSessionUsed: false });
  meeting.isFreeTrialSession = false;
  meeting.creditsProcessed = true;
  meeting.creditsNote = 'Session never took place - free trial returned.';
  await meeting.save();
}

export async function updateUserStatsForMeeting(meeting) {
  if (!meeting.skill) return;

  const { teacherId, learnerId } = getSessionRoles(meeting);

  if (teacherId) {
    const teacher = await User.findById(teacherId);
    if (teacher) {
      const skillIndex = teacher.skillsTeaching.findIndex(
        (s) => s.name.toLowerCase() === meeting.skill.toLowerCase()
      );
      if (skillIndex >= 0) {
        teacher.skillsTeaching[skillIndex].sessions += 1;
      }
      teacher.stats.sessionsTaught = (teacher.stats.sessionsTaught || 0) + 1;
      await teacher.save();
    }
  }

  if (learnerId) {
    const learner = await User.findById(learnerId);
    if (learner) {
      const skillIndex = learner.skillsLearning.findIndex(
        (s) => s.name.toLowerCase() === meeting.skill.toLowerCase()
      );
      if (skillIndex >= 0) {
        const sessions = (learner.skillsLearning[skillIndex].sessions || 0) + 1;
        learner.skillsLearning[skillIndex].sessions = sessions;
        learner.skillsLearning[skillIndex].progress = Math.min(100, sessions * PROGRESS_PER_SESSION);
      }
      learner.stats.sessionsLearned = (learner.stats.sessionsLearned || 0) + 1;
      await learner.save();
    }
  }
}

// Credits move only once a session actually completes (its scheduled end time
// has passed while it was still 'scheduled') - never at booking time. A
// cancelled meeting never reaches 'completed', so nothing is ever charged for
// it and no refund/reversal system is needed as a result.
export async function processCompletedMeetingCredits(meeting) {
  if (meeting.creditsProcessed) return;

  if (meeting.isFreeTrialSession) {
    // Free trial: student pays 0, teacher earns 0 - never touches either
    // wallet. Still goes through the normal completion/dispute flow up to
    // this point (see finalizeDueMeetingCredits), it just settles as a no-op.
    meeting.creditsProcessed = true;
    meeting.creditsNote = 'Free trial session - no credits were charged or earned.';
    await meeting.save();
    return;
  }

  const { teacherId, learnerId } = getSessionRoles(meeting);
  if (!teacherId || !learnerId) {
    meeting.creditsProcessed = true;
    await meeting.save();
    return;
  }

  const learnerWallet = await getOrCreateWallet(learnerId);

  if (learnerWallet.balance < CREDITS_PER_LEARNING_SESSION) {
    // The learner can't afford it even now that the session is over - no
    // credits move on either side. Mark processed so this doesn't retry
    // forever, and leave a visible note on the meeting.
    meeting.creditsProcessed = true;
    meeting.creditsNote = 'Learner had insufficient balance when the session completed; no credits were transferred.';
    await meeting.save();
    return;
  }

  const teacherWallet = await getOrCreateWallet(teacherId);

  const learnerBalanceBefore = learnerWallet.balance;
  // Draws from purchased credits first, then earned.
  spendCredits(learnerWallet, CREDITS_PER_LEARNING_SESSION);
  await learnerWallet.save();
  notifyIfCrossedLowBalance(learnerId, learnerBalanceBefore, learnerWallet.balance);

  // Teaching is the only thing that fills the cashable bucket.
  addEarnedCredits(teacherWallet, CREDITS_PER_TEACHING_SESSION);
  await teacherWallet.save();

  await CreditTransaction.create([
    {
      user: teacherId,
      type: 'teaching',
      amount: CREDITS_PER_TEACHING_SESSION,
      description: 'Teaching session completed',
      meeting: meeting._id,
      otherUser: learnerId,
    },
    {
      user: learnerId,
      type: 'learning',
      amount: -CREDITS_PER_LEARNING_SESSION,
      description: 'Learning session completed',
      meeting: meeting._id,
      otherUser: teacherId,
    },
  ]);

  meeting.creditsProcessed = true;
  await meeting.save();
}

// Step 1: marks any 'scheduled' meeting whose end time has passed as
// 'completed' and starts its 24h dispute window - does NOT touch credits.
// Global (not scoped to one user) so a periodic job can run it independently
// of anyone visiting their dashboard - relying only on a user's own GET
// /meetings call would mean a meeting between two people who never revisit
// the app never gets completed.
export async function markExpiredMeetingsCompleted() {
  const now = new Date();
  const candidates = await Meeting.find({ status: 'scheduled', startsAt: { $lte: now } });

  for (const meeting of candidates) {
    const endTime = new Date(meeting.startsAt.getTime() + (meeting.duration || 60) * 60 * 1000);
    if (now > endTime) {
      meeting.status = 'completed';
      meeting.completedAt = now;
      meeting.disputeDeadline = new Date(now.getTime() + DISPUTE_WINDOW_MS);
      await meeting.save();
      await updateUserStatsForMeeting(meeting);
    }
  }
}

// Step 2: for meetings whose dispute window has closed, finalizes credits -
// unless a dispute is still pending, in which case it's left untouched until
// an admin resolves it (see admin.controller.js reviewSessionDispute).
export async function finalizeDueMeetingCredits() {
  const now = new Date();
  const candidates = await Meeting.find({
    status: 'completed',
    creditsProcessed: false,
    disputeDeadline: { $lte: now },
  });

  for (const meeting of candidates) {
    const pendingDispute = await SessionDispute.findOne({ meeting: meeting._id, status: 'pending' });
    if (pendingDispute) continue;
    await processCompletedMeetingCredits(meeting);
  }
}

// Step 0: a session request nobody answered before its start time is over.
//
// It never became 'scheduled', so markExpiredMeetingsCompleted below never sees
// it and no credits were ever at stake - this exists to stop it sitting in the
// list as "pending" forever, and to give back a free trial that was spent on a
// session that never happened.
export async function expirePendingMeetings() {
  const now = new Date();
  const candidates = await Meeting.find({ status: 'pending', startsAt: { $lte: now } });

  for (const meeting of candidates) {
    meeting.status = 'expired';
    await meeting.save();
    await releaseFreeTrialIfUnused(meeting);

    for (const participantId of meeting.participants.map(String)) {
      notifyUser({
        userId: participantId,
        type: 'meeting_expired',
        title: 'Session request expired',
        body: `"${meeting.title}" was never accepted, so it did not go ahead.`,
        link: '/meetings/history',
      });
    }
  }
}

// Runs the steps in order - used both by the periodic cron job and as a
// fast-path when a user's own GET /meetings loads, so completion/finalization
// doesn't wait on the cron tick for the person actually looking at the page.
export async function runMeetingCompletionSweep() {
  await expirePendingMeetings();
  await markExpiredMeetingsCompleted();
  await finalizeDueMeetingCredits();
}
