"""
FastAPI Application - AI Teacher Recommendation Service
"""
from fastapi import FastAPI, HTTPException, Depends, status, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import secrets
from datetime import datetime, timedelta
from typing import Optional

from config import settings
from database import db
from models import (
    RecommendationRequest,
    RecommendationResponse,
    TrainRequest,
    TrainResponse,
    HealthResponse
)
from recommendation_engine import recommendation_engine
from change_stream import get_change_watcher

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle startup and shutdown events"""
    change_watcher = None
    try:
        # Startup
        logger.info("🚀 Starting AI Recommendation Service...")
        
        # Connect to MongoDB
        await db.connect()
        
        # Try to load existing models from MongoDB
        logger.info("Loading existing models from MongoDB...")
        models_loaded = await recommendation_engine.load_models()
        
        if not any(models_loaded.values()):
            logger.warning("⚠️  No pre-trained models found. Please call /train endpoint first.")
        else:
            logger.info(f"✅ Models loaded: {models_loaded}")
        
        # Start auto-training change watcher if enabled
        if settings.enable_auto_training:
            logger.info("🔄 Auto-training enabled")
            change_watcher = get_change_watcher(settings.mongodb_uri, settings.mongodb_db_name)
            change_watcher.retrain_cooldown = timedelta(minutes=settings.auto_training_cooldown_minutes)
            await change_watcher.start(recommendation_engine)
        else:
            logger.info("⏸️  Auto-training disabled")
        
        logger.info(f"✅ Service ready on port {settings.service_port}")
        
        yield
        
    except Exception as e:
        logger.error(f"❌ Lifespan error: {e}", exc_info=True)
        raise
    finally:
        # Shutdown
        logger.info("Shutting down...")
        try:
            if change_watcher:
                await change_watcher.stop()
            await db.disconnect()
        except:
            pass


# Initialize FastAPI app
app = FastAPI(
    title="SkillBridge AI Recommendation Service",
    description="Content-based teacher recommendation system matching students with teachers based on skills and expertise",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# The value config.py used to fall back to when API_KEY was unset. It is
# committed in a public repository, so it is not a secret and is refused here.
PLACEHOLDER_API_KEY = "your-secret-api-key-here"


async def verify_api_key(x_api_key: Optional[str] = Header(None)):
    """Verify the API key on every request.

    This used to be checked only when environment == "production", and
    `environment` defaults to "development" - so unless ENVIRONMENT was
    explicitly set on the deployed service, /train and /recommend had no
    authentication at all. /train walks the whole database and rebuilds the
    models, which made it a free way to burn the service's CPU, and /recommend
    returns who is on the platform and what they teach.

    Fails closed in two directions now: no key configured is a 503 rather than
    an open door, and a key that matches the old public placeholder is treated
    as no key at all.
    """
    expected = (settings.api_key or "").strip()

    if not expected or expected == PLACEHOLDER_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service is not configured with an API key. Set API_KEY."
        )

    # compare_digest, not ==: a plain comparison returns as soon as two bytes
    # differ, which leaks how much of a guess was correct.
    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key"
        )

    return x_api_key


@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "service": "SkillBridge AI Recommendation Service",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint"""
    try:
        # Check database connection
        await db.client.admin.command('ping')
        db_connected = True
    except:
        db_connected = False
    
    models_loaded = {
        "content_based": recommendation_engine.content_based_engine.is_trained
    }
    
    return HealthResponse(
        status="healthy" if db_connected and any(models_loaded.values()) else "degraded",
        service="recommendation-service",
        version="1.0.0",
        models_loaded=models_loaded,
        database_connected=db_connected
    )


@app.post("/train", response_model=TrainResponse, tags=["Training"])
async def train_models(
    request: TrainRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Train or retrain both collaborative and content-based models
    
    This endpoint should be called:
    - Initially to train models
    - Periodically (e.g., daily/weekly) to update with new data
    - After significant new ratings are added
    
    Args:
        request: TrainRequest with force_retrain flag
        
    Returns:
        TrainResponse with training status
    """
    try:
        logger.info("=" * 60)
        logger.info("🎓 TRAINING REQUEST RECEIVED")
        logger.info("=" * 60)
        
        # Fetch data from MongoDB
        logger.info("📊 Fetching data from MongoDB...")
        ratings_data = await db.get_all_ratings()
        teachers_data = await db.get_all_teachers()
        students_data = await db.get_all_students()
        
        logger.info(f"   Ratings: {len(ratings_data)}")
        logger.info(f"   Teachers: {len(teachers_data)}")
        logger.info(f"   Students: {len(students_data)}")
        
        if not teachers_data and not students_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No data available for training. Please ensure ratings and teachers exist in database."
            )
        
        # Train models
        results = await recommendation_engine.train(ratings_data, teachers_data, students_data)
        
        models_trained = [k for k, v in results.items() if v]
        
        if not models_trained:
            return TrainResponse(
                success=False,
                message="Training failed for all models. Check logs for details.",
                models_trained=[],
                training_stats={
                    "ratings_count": len(ratings_data),
                    "teachers_count": len(teachers_data),
                    "students_count": len(students_data)
                }
            )
        
        logger.info("=" * 60)
        logger.info("✅ TRAINING COMPLETED SUCCESSFULLY")
        logger.info("=" * 60)
        
        return TrainResponse(
            success=True,
            message=f"Successfully trained {len(models_trained)} model(s)",
            models_trained=models_trained,
            training_stats={
                "ratings_count": len(ratings_data),
                "teachers_count": len(teachers_data),
                "students_count": len(students_data),
                "content_based_trained": results.get('content_based', False),
                "directions_trained": recommendation_engine.trained_directions()
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Training error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Training failed: {str(e)}"
        )


@app.post("/recommend", response_model=RecommendationResponse, tags=["Recommendations"])
async def get_recommendations(
    request: RecommendationRequest,
    api_key: str = Depends(verify_api_key)
):
    """
    Get personalized teacher recommendations for a student
    
    Uses content-based filtering to match student interests and learning goals
    with teacher skills and expertise using TF-IDF and cosine similarity.
    
    Args:
        request: RecommendationRequest with student_id and limit
        
    Returns:
        RecommendationResponse with list of recommended teachers
    """
    try:
        direction = request.direction
        logger.info(f"📍 '{direction}' recommendation request for user: {request.student_id}")
        
        # Check the corpus this direction searches is actually trained
        if not recommendation_engine.content_based_engine.is_direction_trained(direction):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"The '{direction}' model is not trained yet. Please call /train first."
            )
        
        # Any user can ask, in either direction - no role filter on the lookup.
        student_data = await db.get_user_by_id(request.student_id)
        
        if not student_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"User with ID {request.student_id} not found"
            )
        
        # Already-rated teachers are only worth excluding when looking FOR
        # teachers; a past rating says nothing about a student match.
        excluded_teacher_ids = []
        if direction == "learn":
            student_ratings = await db.get_student_ratings(request.student_id)
            excluded_teacher_ids = [str(r.get('teacherId', '')) for r in student_ratings]
        
        # Generate recommendations
        recommendations = await recommendation_engine.get_recommendations(
            student_id=request.student_id,
            student_data=student_data,
            limit=request.limit,
            excluded_teacher_ids=excluded_teacher_ids,
            direction=direction
        )
        
        if not recommendations:
            logger.warning(f"No '{direction}' recommendations for user {request.student_id}")
            return RecommendationResponse(
                recommendations=[],
                student_id=request.student_id,
                direction=direction,
                method="none",
                generated_at=datetime.utcnow()
            )
        
        # Content-based filtering only
        method = "content-based"
        
        logger.info(f"✅ Returning {len(recommendations)} recommendations")
        
        return RecommendationResponse(
            recommendations=recommendations,
            student_id=request.student_id,
            direction=direction,
            method=method,
            generated_at=datetime.utcnow()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Recommendation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate recommendations: {str(e)}"
        )


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error occurred"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.service_host,
        port=settings.service_port,
        reload=settings.environment == "development"
    )
