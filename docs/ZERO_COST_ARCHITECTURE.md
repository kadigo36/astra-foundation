# ASTRA — Zero-Cost Architecture (v0.8)

## Hard budget rule

The target operating cost is **€0/month**. Do not create a Google Cloud billing account, attach a payment card, enable paid services, or deploy Cloud Run, Cloud SQL, Cloud Scheduler, Artifact Registry, or Secret Manager. Any future paid option requires a separate explicit decision and must never be enabled automatically.

"Free" means staying within published free quotas and using services that do not require a paid subscription. Providers can change quotas or terms; exceeding free quotas may stop functionality. This document does not promise unlimited availability.

## What stays intact

The existing FastAPI backend, authentication, approval workflow, audit events, memory engine, Gemini planner, Google OAuth integration, dashboard source, and v0.7 monitoring worker remain in the repository. They are not deleted. The Python backend remains the development/reference implementation for now; it is **not deployed** in this zero-cost setup.

## Zero-cost MVP topology

```text
GitHub private repository
  ├── existing Python/FastAPI backend (local development/reference)
  ├── React dashboard (not deployed yet)
  └── google-apps-script/
        ├── Code.gs
        └── appsscript.json
               |
               | executes as the user's Google account
               v
        Google APIs (read-only metadata)
          ├── Classroom: active courses + coursework
          ├── Gmail: IMPORTANT label + message headers only
          └── Drive: file metadata only
               |
               v
        Private Google Sheet in the user's own Drive
        (monitoring event log; no email bodies or file contents)

Optional later:
  React dashboard -> Cloudflare Pages Free
  Small API/services -> Cloudflare Workers Free + D1 Free
  Only after checking limits, data residency, security and no-card requirements.
```

The Apps Script path avoids a continuously running server and Google Cloud billing. It runs as the user's own Google account; OAuth authorization is granted by that user. The monitoring event log is a private spreadsheet in that account. It does not send Gmail/Drive/Classroom content to Gemini or to an ASTRA server.

## Implemented Apps Script monitor

Source: [google-apps-script/Code.gs](../google-apps-script/Code.gs).

- Checks Classroom coursework, Gmail messages carrying the IMPORTANT system label, and Drive file metadata.
- First run establishes a baseline and deliberately emits no historical alerts.
- Later runs append only newly discovered IDs to a private spreadsheet.
- Stores a bounded set of seen IDs in Script Properties to avoid duplicates.
- Uses a script lock to prevent overlapping cycles.
- Creates a 15-minute time-driven trigger; Google may schedule it with some timing variation.
- Includes a stop function that removes only the trigger and preserves the event sheet.
- Reads metadata only: no email bodies, attachments, or Drive file contents.
- Gmail metadata, Drive metadata and Classroom read-only OAuth scopes are declared in the manifest.

### Important initial limitations

This is an initial personal monitor, not yet a complete multi-user replacement for v0.7.

- Classroom: up to 20 active courses and 50 coursework items per course per cycle.
- Gmail: up to 50 IMPORTANT messages per cycle, reading Subject/From headers only.
- Drive: up to 50 most recently modified non-trashed files per cycle.
- The current implementation does not yet follow every page token. Very high activity can push an item outside the scan window before it is seen.
- Seen-ID history is bounded to 2,000 IDs per provider.
- Trigger executions are subject to Apps Script quotas and may be delayed or fail temporarily.
- Google API services may need to be enabled in the Apps Script project's associated Google Cloud project. This does not require enabling billing. Do not create a billing account.
- The script stores event titles and limited metadata in the user's private spreadsheet. Treat that sheet as personal data and do not share it publicly.

## Setup (no billing)

1. Open [Google Apps Script](https://script.google.com/) while signed into the Google account that owns the Classroom, Gmail and Drive data.
2. Create a standalone project named `ASTRA Monitoring`.
3. Replace the default code with `google-apps-script/Code.gs`.
4. In Project Settings, enable **Show "appsscript.json" manifest file** and replace the manifest with `google-apps-script/appsscript.json`.
5. If Google asks to enable the Classroom, Gmail or Drive API for the script's associated project, enable only those APIs. **Do not configure billing and do not attach a payment method.**
6. Run `setupAstraMonitoring` once from the editor and review/accept the Google permissions. This creates a private event spreadsheet and a 15-minute trigger.
7. Run `runMonitoringCycle` manually once. This establishes the initial baseline without alerting on old items.
8. Open the execution log to find the spreadsheet URL. The spreadsheet is also in the account's Google Drive as **ASTRA — Monitoring Events**.
9. Use Apps Script → Triggers / Executions to inspect operation. Run `stopAstraMonitoring` to stop scheduled checks.

Do not paste OAuth tokens, passwords, API keys or spreadsheet contents into chat or GitHub.

## Free-tier constraints checked for this design

- Google Apps Script consumer accounts currently have a 6-minute maximum per execution, 90 minutes/day total runtime for time-driven triggers, and a limit of 20 triggers per user per script. Quotas are subject to change: [Google Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas).
- Time-driven triggers can run as frequently as every minute, but their actual execution time may be randomized: [Installable triggers](https://developers.google.com/apps-script/guides/triggers/installable).
- Cloudflare Workers Free currently lists 100,000 requests/day and 10 ms CPU per invocation; this is an optional future host, not part of the initial monitor: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
- Cloudflare D1 has free-plan daily read/write limits; exceeding them blocks queries until reset rather than automatically upgrading: [D1 FAQ](https://developers.cloudflare.com/d1/reference/faq/) and [D1 limit enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/).

## Explicitly deferred

- No Google Cloud billing account or paid infrastructure.
- No Cloud Run, Cloud Scheduler, Cloud SQL, Artifact Registry or Secret Manager.
- No production deployment of the FastAPI API or React dashboard.
- No WhatsApp gateway until a genuinely free, secure and terms-compliant option is verified.
- No automated email sending, file editing, task submission, sharing or deletion.
- No forwarding of personal Google data to Gemini by default.
- No claim that the full multi-user ASTRA platform is live.

## Next engineering gates

1. Validate the Apps Script against a test Google account and inspect real execution logs.
2. Add pagination and robust incremental cursors for all three APIs.
3. Add event preferences and digest/urgent notification routing without exposing private content.
4. Decide whether the dashboard should read from the spreadsheet via a controlled Apps Script web app or remain a later Cloudflare-hosted frontend.
5. Port the minimum required backend functions to a free runtime only after a security and quota review. Do not expose the existing FastAPI backend directly without authentication, migrations, rate limits and security review.
