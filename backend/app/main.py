from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.auth import router as auth_router
from app.api.spaces import router as spaces_router
from app.api.approvals import router as approvals_router
from app.api.audit import router as audit_router
from app.core.config import settings
from app.db.session import Base, engine

app = FastAPI(
    title="ASTRA Foundation API",
    description="Secure core for the ASTRA personal assistant.",
    version="0.2.0",
)

origins = [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health_router)
app.include_router(auth_router, prefix="/api")
app.include_router(spaces_router, prefix="/api")
app.include_router(approvals_router, prefix="/api")
app.include_router(audit_router, prefix="/api")


@app.on_event("startup")
def initialize_development_schema() -> None:
    if settings.environment != "development":
        if settings.auth_secret == "INSECURE-DEVELOPMENT-ONLY-CHANGE-ME":
            raise RuntimeError("ASTRA_AUTH_SECRET must be set outside development.")
        if settings.allow_public_registration:
            raise RuntimeError("Public registration must be disabled outside development.")
    # create_all is suitable for this scaffold; production must use versioned migrations.
    Base.metadata.create_all(bind=engine)


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {
        "name": "ASTRA Foundation API",
        "version": "0.2.0",
        "environment": settings.environment,
        "status": "development-scaffold",
    }
