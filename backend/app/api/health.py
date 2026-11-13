from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    # This is a process-level health check, not a dependency/readiness check.
    return {"status": "ok", "service": "astra-api", "version": "0.1.0"}
