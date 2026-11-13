from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    log_level: str = "INFO"
    allowed_origins: str = "http://localhost:5173"

    # Provider credentials are optional. No external provider is called in v0.1.
    gemini_api_key: str | None = None
    gemini_model: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
