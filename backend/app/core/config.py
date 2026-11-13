from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    log_level: str = "INFO"
    allowed_origins: str = "http://localhost:5173"
    database_url: str = "sqlite:///./astra.db"
    auth_secret: str = "INSECURE-DEVELOPMENT-ONLY-CHANGE-ME"
    access_token_minutes: int = 30
    allow_public_registration: bool = True

    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.8-flash"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        env_ignore_empty=True,
    )


settings = Settings()
