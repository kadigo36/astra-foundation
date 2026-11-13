from fastapi import FastAPI

from app.api.health import router as health_router
from app.core.config import settings

app = FastAPI(
    title="ASTRA Foundation API",
    description="A secure, extensible foundation for the ASTRA personal assistant.",
    version="0.1.0",
)

app.include_router(health_router)


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {
        "name": "ASTRA Foundation API",
        "version": "0.1.0",
        "environment": settings.environment,
        "status": "scaffold",
    }
