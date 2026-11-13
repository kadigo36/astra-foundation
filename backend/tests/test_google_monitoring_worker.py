from app.jobs.google_sync import run_monitoring_cycle


def test_scheduled_worker_scans_each_connected_user_and_provider(client, monkeypatch):
    register(client, "worker@example.com")
    add_credential("worker@example.com", [
        "https://www.googleapis.com/auth/drive.metadata.readonly"
    ])
    calls = []

    def fake_sync(db, user, provider):
        calls.append((user.id, provider))
        return {"provider": provider, "status": "success", "new_events": 1 if provider == "drive" else 0, "scanned": 3}

    monkeypatch.setattr("app.jobs.google_sync._sync_provider", fake_sync)
    result = run_monitoring_cycle()

    assert result["users_scanned"] == 1
    assert result["providers_scanned"] == 3
    assert result["new_events"] == 1
    assert result["provider_errors"] == 0
    assert [provider for _, provider in calls] == ["classroom", "gmail", "drive"]


def test_scheduled_worker_isolates_provider_errors(client, monkeypatch):
    register(client, "worker-error@example.com")
    add_credential("worker-error@example.com", [
        "https://www.googleapis.com/auth/drive.metadata.readonly"
    ])
    calls = []

    def fake_sync(db, user, provider):
        calls.append(provider)
        if provider == "gmail":
            raise RuntimeError("simulated provider outage")
        return {"provider": provider, "status": "success", "new_events": 0, "scanned": 0}

    monkeypatch.setattr("app.jobs.google_sync._sync_provider", fake_sync)
    result = run_monitoring_cycle()

    assert calls == ["classroom", "gmail", "drive"]
    assert result["providers_scanned"] == 3
    assert result["provider_errors"] == 1