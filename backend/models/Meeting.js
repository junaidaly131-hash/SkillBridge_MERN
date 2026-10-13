import mongoose from 'mongoose';

const meetingSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    title: {
      type: String,
      trim: true,
      required: true,
    },
    startsAt: {
      type: Date,
      required: true,
    },
    // Duration in minutes (default 60 minutes)
    duration: {
      type: Number,
      default: 60,
    },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
    },
    provider: {
      type: String,
      enum: ['jitsi'],
      default: 'jitsi',
    },
    roomName: {
      type: String,
      required: true,
      trim: true,
    },
    joinUrl: {
      type: String,
      required: true,
      trim: true,
    },
    // Session type: teaching or learning (from creator's perspective)
    sessionType: {
      type: String,
      enum: ['teaching', 'learning'],
      required: true,
    },
    // Skill being taught/learned
    skill: {
      type: String,
      trim: true,
      default: null,
    },
    // Set at booking time (never inferred later, since eligibility could
    // change by completion time) - when true, credit-finalization skips both
    // the student deduction and the teacher award for this meeting entirely.
    isFreeTrialSession: {
      type: Boolean,
      default: false,
    },
    // Lifecycle:
    //   pending   - created, waiting for the OTHER participant to agree
    //   scheduled - both sides agreed; this is the only state that can run
    //   completed - its end time passed while scheduled
    //   declined  - the invitee said no
    //   expired   - nobody responded before it was due to start
    //   cancelled - called off by a participant after being agreed
    //
    // Acceptance lives here rather than in a separate `acceptance` field on
    // purpose. Everything that acts on a real booking - the completion sweep,
    // the reminder job, the overlap check - already filters on
    // status: 'scheduled', so a meeting nobody agreed to is excluded from all
    // of them by construction. With a parallel field, every one of those
    // queries would have to remember to check it, and the cost of forgetting
    // is credits moving for a session the other person never agreed to.
    status: {
      type: String,
      enum: ['pending', 'scheduled', 'completed', 'cancelled', 'declined', 'expired'],
      default: 'pending',
    },
    // Who responded to the invitation, and when. Always the participant who
    // did NOT create the meeting - see POST /meetings/:id/respond.
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    respondedAt: {
      type: Date,
      default: null,
    },
    // Rating given by the learner (1-5)
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    // Set once the meeting-reminder cron job has notified participants, so it
    // doesn't send the same reminder again on its next run.
    reminderSent: {
      type: Boolean,
      default: false,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    // When the completion cron detected the scheduled time had passed and set
    // status to 'completed'. Credits are NOT processed at this moment - see
    // disputeDeadline below and utils/meetingCompletion.js.
    completedAt: {
      type: Date,
      default: null,
    },
    // completedAt + 24h. Either participant can file a SessionDispute any
    // time before this passes; credits only finalize once it has passed AND
    // there's no pending dispute (or an admin resolves one, which finalizes
    // - or permanently blocks - credits immediately regardless of this).
    disputeDeadline: {
      type: Date,
      default: null,
    },
    // Set once credits have been finalized for this meeting - either
    // transferred, explicitly skipped (e.g. insufficient learner balance), or
    // permanently blocked by an upheld no-show dispute. Never processed twice.
    creditsProcessed: {
      type: Boolean,
      default: false,
    },
    // Explains why creditsProcessed is true without a transfer actually
    // happening (insufficient balance at completion, or an upheld dispute).
    creditsNote: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

meetingSchema.index({ participants: 1, startsAt: 1 });
meetingSchema.index({ status: 1, startsAt: 1 });

export default mongoose.model('Meeting', meetingSchema);


