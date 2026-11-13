# ASTRA — Zero-Cost Multi-Account Architecture (v0.9)

## Hard budget rule

The target operating cost is **€0/month**. Do not create a Google Cloud billing account, attach a payment card, enable paid services, or deploy Cloud Run, Cloud SQL, Cloud Scheduler, Artifact Registry, or Secret Manager. Any future paid option requires a separate explicit decision and must never be enabled automatically.

## Multi-account decision

ASTRA starts with three independent Google account connections. One is the school account and must monitor:
- Google Classroom (active courses and coursework)
- Gmail (IMPORTANT label and message headers only)
- Google Drive (file metadata only)

The other two are personal accounts. Their enabled providers default to Gmail and Drive. Account labels are aliases only (for example `school`, `personal-1`, `personal-2`); do not place email addresses in source code, logs or GitHub.

## Why there is one Apps Script instance per account

Google Apps Script installable triggers execute as the account that created the trigger. `ScriptApp.getOAuthToken()` represents that executing account; an open browser session for another Google account does not grant this script access to it.

Therefore, the zero-cost MVP uses **one standalone Apps Script project per Google account**, copied and authorized while signed into that account. Each instance reads only that account's Google services, has its own OAuth consent and Script Properties, writes to a private Google Sheet in that account, and keeps its own seen-ID baseline. This avoids collecting passwords, sharing OAuth refresh tokens, or granting one account broad access to another account's mailbox or Drive.

## Current topology

```text
Private GitHub repository (single source of code)
  |
  +-- Apps Script instance: school account
  |     +-- Classroom + Gmail + Drive (read-only)
  |     +-- private school-account event sheet
  |
  +-- Apps Script instance: personal account 1
  |     +-- Gmail + Drive (read-only)
  |     +-- private personal-account event sheet
  |
  +-- Apps Script instance: personal account 2
        +-- Gmail + Drive (read-only)
        +-- private personal-account event sheet

Future central ASTRA layer:
  authorized event aggregation, account-aware permissions, dashboard and smart notifications.
  Not deployed in v0.9; no cross-account sharing is enabled by default.
```

Separate sheets are intentional: they prevent accidental disclosure of school data to a personal account or vice versa. Central aggregation will be designed as a separate, explicit consent step. Sharing a sheet between accounts is not required for initial monitoring.

## Setup for each account

1. Sign into exactly one target Google account in the browser; verify the avatar/email before creating the script.
2. Open Google Apps Script and create a standalone project named `ASTRA Monitoring — <alias>`.
3. Copy `google-apps-script/Code.gs`.
4. In the `ASTRA` configuration at the top of `Code.gs`, set a non-sensitive `accountId`, `accountType`, and `enabledProviders`:
   - School: `accountId: "school"`, `accountType: "school"`, `enabledProviders: ["classroom", "gmail", "drive"]`.
   - Personal account 1: `accountId: "personal-1"`, `accountType: "personal"`, `enabledProviders: ["gmail", "drive"]`.
   - Personal account 2: `accountId: "personal-2"`, `accountType: "personal"`, `enabledProviders: ["gmail", "drive"]`.
5. In Project Settings, show the `appsscript.json` manifest. Use `appsscript.json` for the school account and `appsscript.personal.json` for each personal account. The personal manifest intentionally omits Classroom scopes.
6. Enable only the Google APIs required by that instance in its associated Cloud project. This is per project/instance. Do not configure billing or attach a card. If Google Workspace policy blocks an API or external sharing, stop and ask the administrator; do not bypass policy.
7. Run `setupAstraMonitoring` to create that account's private event sheet. This function does **not** create a recurring trigger.
8. Run `runMonitoringCycle` manually. The first successful cycle establishes the baseline without historical alerts.
9. Inspect execution logs and verify only the enabled providers succeeded.
10. Only after successful manual validation, explicitly run `enableAstraSchedule` to opt into a 15-minute trigger. Use `stopAstraMonitoring` to remove it.

Repeat independently for each of the three accounts. Do not paste passwords, OAuth tokens, API keys, account email addresses or spreadsheet contents into GitHub/chat.

## OAuth scopes

School manifest:
- Apps Script external HTTP requests, trigger control and spreadsheet creation/update;
- Classroom read-only courses/coursework;
- Gmail metadata;
- Drive metadata read-only.

Personal manifest:
- Apps Script external HTTP requests, trigger control and spreadsheet creation/update;
- Gmail metadata;
- Drive metadata read-only;
- no Classroom scopes.

Gmail/Drive metadata scopes may trigger additional Google verification/policy requirements depending on account type. A school Workspace administrator may restrict Classroom, Gmail, Drive, Apps Script, OAuth scopes or external sharing. Do not try to circumvent those restrictions.

## Current limitations

- This is a personal monitoring prototype, not a central multi-account dashboard.
- Each account has a separate spreadsheet and baseline. No cross-account data aggregation occurs yet.
- Scanning is bounded: 20 active courses, 50 coursework items per course, 50 IMPORTANT Gmail messages and 50 recently modified Drive files per cycle.
- Pagination/cursors are not complete; activity beyond the scan windows can be missed.
- Seen-ID history is bounded to 2,000 IDs per provider.
- The initial baseline does not create historical alerts.
- Triggers depend on Apps Script quotas and scheduling behavior. Free quotas and policies can change.
- Google APIs may need enabling in each script's associated Google Cloud project. Enabling an API is not permission to create billing. Never add billing to solve an activation prompt.
- GitHub stores source code only. It does not create or authorize scripts in any Google account.

## Explicitly deferred

- Central event aggregation across accounts.
- Cross-account spreadsheet sharing or OAuth token exchange.
- Production dashboard/backend deployment.
- Google Cloud paid infrastructure.
- WhatsApp gateway until a genuinely free, secure and terms-compliant option is verified.
- Sending email, editing/deleting files, submitting school work, sharing data or other write actions.
- Sending Google content to Gemini by default.

## Acceptance criteria for v0.9

- Three independent Apps Script instances exist, one per Google account.
- School instance successfully reads Classroom, Gmail metadata and Drive metadata.
- Each personal instance successfully reads only its configured providers.
- Every event row includes account alias, account type and provider.
- Each account's event spreadsheet remains private to that account.
- Baselines are created without historical alerts.
- Recurring triggers remain off until each account passes manual validation.
- No billing account, card, paid service or cross-account data sharing is introduced.
