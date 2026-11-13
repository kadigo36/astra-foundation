from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    log_level: str = "INFO"
    allowed_origins: str = "http://localhost:5173"
    database_url: str = "sqlite:///./astra.db"
    auth_secret: str = "INSECURE-DEVELOPMENT-ONLY-CHANGE-ME"
    access_token_minutes: int = 30
    allow_public_registration: bool = True

    gemini_api_key: str | None = Field(default=None, validation_alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-3.8-flash", validation_alias="GEMINI_MODEL")
    gemini_share_memory: bool = Field(default=False, validation_alias="ASTRA_GEMINI_SHARE_MEMORY")

    model_config = SettingsConfigDict(
        env_prefix="ASTRA_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        env_ignore_empty=True,
    )


settings = Settings()
