"""Scheduled, read-only Google monitoring worker for Cloud Run Jobs."""
import json
import logging
import sys
from datetime import datetime, timezone

from app.api.google_monitoring import SUPPORTED_PROVIDERS, _sync_provider
from app.db.models import GoogleCredential, User
from app.db.session import SessionLocal

logger = logging.getLogger("astra.google_monitoring")


def run_monitoring_cycle() -> dict:
    """Synchronize all users with stored Google credentials, one provider at a time."""
    db = SessionLocal()
    totals = {
        "started_at": datetime.now(timezone.utc).isoformat(),
        "users_scanned": 0,
        "providers_scanned": 0,
        "new_events": 0,
        "provider_errors": 0,
        "results": [],
    }
    try:
        users = (
            db.query(User)
            .join(GoogleCredential, GoogleCredential.user_id == User.id)
            .order_by(User.id.asc())
            .all()
        )
        totals["users_scanned"] = len(users)
        for user in users:
            for provider in SUPPORTED_PROVIDERS:
                try:
                    result = _sync_provider(db, user, provider)
                except Exception as exc:
                    db.rollback()
                    logger.exception(
                        "Google sync failed for user_id=%s provider=%s error_type=%s",
                        user.id, provider, type(exc).__name__,
                    )
                    result = {"provider": provider, "status": "error", "new_events": 0}
                totals["providers_scanned"] += 1
                totals["new_events"] += result.get("new_events", 0)
                if result.get("status") == "error":
                    totals["provider_errors"] += 1
                totals["results"].append({
                    "user_id": user.id,
                    "provider": provider,
                    "status": result.get("status", "unknown"),
                    "new_events": result.get("new_events", 0),
                    "scanned": result.get("scanned", 0),
                })
    finally:
        db.close()
    totals["finished_at"] = datetime.now(timezone.utc).isoformat()
    logger.info("monitoring_cycle=%s", json.dumps(totals, separators=(",", ":")))
    return totals


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        result = run_monitoring_cycle()
    except Exception:
        logger.exception("Google monitoring cycle failed")
        return 1
    return 1 if result["provider_errors"] else 0


if __name__ == "__main__":
    sys.exit(main())