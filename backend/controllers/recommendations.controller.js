import axios from 'axios';
import User from '../models/User.js';

const RECOMMENDATION_SERVICE_URL = process.env.RECOMMENDATION_SERVICE_URL || 'http://localhost:8001';

// No fallback value. This used to default to 'your-secret-api-key-here', the
// same placeholder the Python service defaulted to - both sides agreeing on a
// string that is committed in a public repository, so the shared secret was
// public whenever either deployment forgot to set the variable. Sending no key
// at all is the honest failure: the service answers 401 and the caller sees the
// recommendations outage state, instead of the pair silently authenticating
// with something anyone can read.
const RECOMMENDATION_SERVICE_API_KEY = process.env.RECOMMENDATION_SERVICE_API_KEY || '';

/**
 * Get AI-powered recommendations in either direction.
 *
 *   ?direction=learn (default) -> teachers who teach what I want to learn
 *   ?direction=teach           -> students who want to learn what I teach
 *
 * @route GET /api/recommendations/me
 * @access Private
 */
export const getMyRecommendations = async (req, res) => {
  try {
    // JWT contains { userId: ... } not { id: ... }
    const userId = req.user.userId || req.user.id || req.user._id;
    const limit = parseInt(req.query.limit) || 10;
    const direction = req.query.direction === 'teach' ? 'teach' : 'learn';

    // Fetch full user data from database (JWT doesn't carry the skill arrays)
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Each direction needs the skills on the asking user's own side of the
    // match. Answered as an empty result rather than an error so the client
    // can show a "add some skills" empty state instead of a failure.
    const requiredSkills = direction === 'teach' ? user.skillsTeaching : user.skillsLearning;
    if (!requiredSkills || requiredSkills.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          recommendations: [],
          student_id: userId.toString(),
          direction,
          method: 'none',
          reason: direction === 'teach' ? 'no_teaching_skills' : 'no_learning_skills',
        }
      });
    }

    const response = await axios.post(
      `${RECOMMENDATION_SERVICE_URL}/recommend`,
      {
        student_id: userId.toString(),
        limit: limit,
        direction: direction
      },
      {
        headers: {
          'X-API-Key': RECOMMENDATION_SERVICE_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 second timeout
      }
    );

    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error('❌ Error getting recommendations:', error.message);
    if (error.response) {
      console.error('❌ Python service error status:', error.response.status);
      console.error('❌ Python service error data:', error.response.data);
    }

    // Handle specific errors
    if (error.response) {
      // Recommendation service returned an error
      const status = error.response.status;
      const message = error.response.data?.detail || 'Failed to get recommendations';

      if (status === 503) {
        return res.status(503).json({
          success: false,
          message: 'Recommendation service is not ready. Models need to be trained first.'
        });
      }

      if (status === 404) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      return res.status(500).json({
        success: false,
        message: message
      });
    }

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        // Just the cause. The dashboard supplies its own heading and a button
        // through to "All Users", so repeating "check back later" here only
        // made the panel say the same thing three times over.
        message: 'The recommendation service is offline at the moment.'
      });
    }

    // Generic error
    res.status(500).json({
      success: false,
      message: 'Failed to get recommendations. Please try again later.'
    });
  }
};

/**
 * Trigger model training (Admin only)
 * @route POST /api/recommendations/train
 * @access Private (Admin only)
 */
export const trainModels = async (req, res) => {
  try {
    // Admin check happens in requireAdmin middleware (route-level)
    const forceRetrain = req.body.force_retrain || false;

    // Call Python recommendation service
    const response = await axios.post(
      `${RECOMMENDATION_SERVICE_URL}/train`,
      {
        force_retrain: forceRetrain
      },
      {
        headers: {
          'X-API-Key': RECOMMENDATION_SERVICE_API_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 2 minute timeout (training can take time)
      }
    );

    res.status(200).json({
      success: true,
      message: 'Model training completed successfully',
      data: response.data
    });

  } catch (error) {
    console.error('Error training models:', error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        message: error.response.data?.detail || 'Training failed'
      });
    }

    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Recommendation service is unavailable'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to train models'
    });
  }
};

/**
 * Check recommendation service health
 * @route GET /api/recommendations/health
 * @access Private
 */
export const checkServiceHealth = async (req, res) => {
  try {
    const response = await axios.get(`${RECOMMENDATION_SERVICE_URL}/health`, {
      timeout: 5000
    });

    res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      message: 'Recommendation service is unavailable',
      error: error.message
    });
  }
};
