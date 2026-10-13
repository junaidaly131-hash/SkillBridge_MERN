"""
Configuration management using Pydantic Settings v2
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List
import os


class Settings(BaseSettings):
    """Application settings with validation"""
    
    # MongoDB
    mongodb_uri: str = "mongodb://localhost:27017/skillbridge"
    mongodb_db_name: str = "skillbridge"
    
    # Service
    service_port: int = 8001
    service_host: str = "0.0.0.0"
    environment: str = "development"
    
    # Redis (optional)
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str = ""
    
    # Model Configuration
    models_storage_path: str = "./models"  # Renamed to avoid 'model_' conflict
    collaborative_weight: float = 0.6
    content_weight: float = 0.4
    min_ratings_for_collaborative: int = 3
    
    # Auto-Training
    enable_auto_training: bool = True
    auto_training_cooldown_minutes: int = 5
    
    # Security
    # No default. This used to fall back to "your-secret-api-key-here",
    # which is committed in a public repository - so any deployment that
    # forgot to set API_KEY authenticated callers with a known string.
    # Empty means unconfigured, and verify_api_key refuses every request
    # rather than letting them through.
    api_key: str = ""
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"
    
    # Logging
    log_level: str = "INFO"
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        protected_namespaces=('settings_',)  # Fix protected namespace warning
    )
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Create models directory if it doesn't exist
        os.makedirs(self.models_storage_path, exist_ok=True)
    
    @property
    def allowed_origins_list(self) -> List[str]:
        """Get allowed origins as list"""
        if isinstance(self.allowed_origins, list):
            return self.allowed_origins
        return [origin.strip() for origin in self.allowed_origins.split(',')]


# Global settings instance
settings = Settings()
