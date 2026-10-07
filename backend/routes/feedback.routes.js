import express from 'express';
import Feedback from '../models/Feedback.js';
import Meeting from '../models/Meeting.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get feedback received by current user
router.get('/received', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const feedbacks = await Feedback.find({ toUser: userId })
      .populate('fromUser', 'name email avatar')
      .populate('meeting', 'title startsAt')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      feedbacks: feedbacks.map((f) => ({
        id: f._id,
        name: f.fromUser?.name || 'Unknown',
        avatar: f.fromUser?.avatar || null,
        type: 'Rated you',
        rating: f.rating,
        date: f.createdAt.toISOString().split('T')[0],
        comment: f.comment,
        skill: f.skill,
        meetingId: f.meeting?._id || null,
        meetingTitle: f.meeting?.title || null,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get feedback received by a specific user (public reviews shown on their profile)
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ toUser: req.params.userId })
      .populate('fromUser', 'name email avatar')
      .populate('meeting', 'title startsAt')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      feedbacks: feedbacks.map((f) => ({
        id: f._id,
        name: f.fromUser?.name || 'Unknown',
        avatar: f.fromUser?.avatar || null,
        rating: f.rating,
        date: f.createdAt.toISOString().split('T')[0],
        comment: f.comment,
        skill: f.skill,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get feedback given by current user
router.get('/given', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const feedbacks = await Feedback.find({ fromUser: userId })
      .populate('toUser', 'name email avatar')
      .populate('meeting', 'title startsAt')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      feedbacks: feedbacks.map((f) => ({
        id: f._id,
        name: f.toUser?.name || 'Unknown',
        avatar: f.toUser?.avatar || null,
        type: 'You rated',
        rating: f.rating,
        date: f.createdAt.toISOString().split('T')[0],
        comment: f.comment,
        skill: f.skill,
        meetingId: f.meeting?._id || null,
        meetingTitle: f.meeting?.title || null,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get pending sessions (meetings that have passed and don't have feedback yet)
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const now = new Date();

    // Get meetings where user is a participant
    const allMeetings = await Meeting.find({
      participants: userId,
    })
      .populate('participants', 'name email avatar')
      .sort({ startsAt: -1 })
      .limit(50);

    // Filter meetings that have ended (startsAt + duration has passed)
    const pastMeetings = allMeetings.filter((m) => {
      const meetingEndTime = new Date(m.startsAt.getTime() + (m.duration || 60) * 60 * 1000);
      return meetingEndTime < now;
    });

    // Get feedback already given by this user
    const givenFeedback = await Feedback.find({ fromUser: userId }).select('meeting');
    const feedbackMeetingIds = new Set(givenFeedback.map((f) => String(f.meeting)));

    // Filter out meetings that already have feedback
    const pending = pastMeetings
      .filter((m) => !feedbackMeetingIds.has(String(m._id)))
      .map((m) => {
        const other = m.participants.find((p) => String(p._id) !== String(userId));
        return {
          meetingId: m._id,
          person: other?.name || 'Unknown',
          avatar: other?.avatar || null,
          // The meeting's own skill, not its title. A title reads
          // "Teaching - React with JUNAID ALI", so sending it as the skill put
          // the other person's name in twice - once here and once inside the
          // title - and made the session picker too long to fit a phone.
          // Older meetings were booked without a skill, so the title is the
          // fallback rather than an empty label.
          skill: m.skill || m.title,
          date: m.startsAt.toISOString().split('T')[0],
          // The full instant as well as the day. Two sessions with the same
          // person and skill on the same date produced two identical options
          // in the feedback picker, with no way to tell which was which. The
          // client formats this in the viewer's own timezone.
          startsAt: m.startsAt,
          otherUserId: other?._id || null,
        };
      });

    res.json({ success: true, pending });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Submit feedback
router.post('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { toUserId, meetingId, skill, rating, comment } = req.body;

    if (!toUserId) return res.status(400).json({ message: 'toUserId is required' });
    if (!skill?.trim()) return res.status(400).json({ message: 'skill is required' });
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'rating must be between 1 and 5' });
    }

    // Verify toUser exists
    const toUser = await User.findById(toUserId).select('_id');
    if (!toUser) return res.status(404).json({ message: 'User not found' });

    // If meetingId provided, verify it exists and user is a participant
    let meeting = null;
    if (meetingId) {
      meeting = await Meeting.findById(meetingId);
      if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
      if (!meeting.participants.map(String).includes(String(userId))) {
        return res.status(403).json({ message: 'Not allowed' });
      }
      if (!meeting.participants.map(String).includes(String(toUserId))) {
        return res.status(400).json({ message: 'User is not a participant in this meeting' });
      }

      // Check if feedback already exists for this meeting
      const existing = await Feedback.findOne({
        fromUser: userId,
        toUser: toUserId,
        meeting: meetingId,
      });
      if (existing) {
        return res.status(400).json({ message: 'Feedback already submitted for this meeting' });
      }
    }

    // Create feedback
    const feedback = await Feedback.create({
      fromUser: userId,
      toUser: toUserId,
      meeting: meetingId || null,
      skill: skill.trim(),
      rating,
      comment: comment?.trim() || '',
    });

    // Update user stats (average rating, sessions taught/learned, and individual skill ratings)
    await updateUserStats(toUserId, skill.trim(), rating);

    const populated = await Feedback.findById(feedback._id)
      .populate('fromUser', 'name email avatar')
      .populate('toUser', 'name email avatar')
      .populate('meeting', 'title startsAt');

    res.status(201).json({ success: true, feedback: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Feedback already submitted for this meeting' });
    }
    res.status(500).json({ message: error.message });
  }
});

// Helper function to update user stats
async function updateUserStats(userId, skillName, newRating) {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    // Get all feedbacks for this user
    const feedbacks = await Feedback.find({ toUser: userId });
    const ratings = feedbacks.map((f) => f.rating);
    const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

    // Count unique meetings as sessions
    const uniqueMeetings = new Set(feedbacks.filter((f) => f.meeting).map((f) => String(f.meeting)));
    const sessionsTaught = uniqueMeetings.size;

    // Update overall stats
    user.stats.avgRating = Math.round(avgRating * 10) / 10;
    user.stats.sessionsTaught = sessionsTaught;

    // Update individual skill rating and session count in skillsTeaching
    if (skillName) {
      // Extract base skill name (remove "Teaching - " or "Learning - " prefix if present)
      let baseSkillName = skillName;
      if (skillName.includes(' - ')) {
        const parts = skillName.split(' - ');
        baseSkillName = parts.length > 1 ? parts[1].split(' with ')[0].trim() : skillName;
      }

      // Find the skill in skillsTeaching array
      const skillIndex = user.skillsTeaching.findIndex(
        (s) => s.name.toLowerCase() === baseSkillName.toLowerCase()
      );

      if (skillIndex !== -1) {
        // Skill exists - calculate average rating for this specific skill
        const skillFeedbacks = feedbacks.filter((f) => {
          const fSkillName = f.skill.includes(' - ') 
            ? f.skill.split(' - ')[1].split(' with ')[0].trim()
            : f.skill;
          return fSkillName.toLowerCase() === baseSkillName.toLowerCase();
        });

        const skillRatings = skillFeedbacks.map((f) => f.rating);
        const skillAvgRating = skillRatings.length > 0 
          ? skillRatings.reduce((a, b) => a + b, 0) / skillRatings.length 
          : 0;

        // Count unique meetings for this skill
        const skillMeetings = new Set(
          skillFeedbacks.filter((f) => f.meeting).map((f) => String(f.meeting))
        );

        user.skillsTeaching[skillIndex].rating = Math.round(skillAvgRating * 10) / 10;
        user.skillsTeaching[skillIndex].sessions = skillMeetings.size;
      }
    }

    await user.save();
  } catch (error) {
    console.error('Error updating user stats:', error);
  }
}

export default router;

