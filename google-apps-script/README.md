# ASTRA Apps Script source — multi-account

This folder contains the zero-cost, multi-account monitoring prototype.

**Deployment warning:** this is not a verified snapshot of the current school
Apps Script project. Its Events schema differs from the live school's schema.
Do not overwrite an existing installation with this prototype. Reconcile the
active modules and state first; see [the technical audit](../docs/AUDIT_2026-11-18.md).

Persistence recovery tests run without Google credentials:
`node --test google-apps-script/tests/*.test.cjs`.

Install **one standalone Apps Script project per Google account**. Apps Script runs as the account that created the trigger; it cannot monitor other browser-signed-in accounts simply because they are open in the same browser.

Each instance has its own private event spreadsheet, OAuth authorization, seen-ID baseline and provider configuration. No cross-account sharing or central aggregation is enabled yet.

## Per-account configuration

Edit the `ASTRA` object at the top of `Code.gs` before running:

- School: `accountId: "school"`, `accountType: "school"`, `enabledProviders: ["classroom", "gmail", "drive"]`.
- Personal 1: `accountId: "personal-1"`, `accountType: "personal"`, `enabledProviders: ["gmail", "drive"]`.
- Personal 2: `accountId: "personal-2"`, `accountType: "personal"`, `enabledProviders: ["gmail", "drive"]`.

Use aliases only; never hardcode email addresses or credentials.

## Choose the correct manifest

- School account: copy the content of `appsscript.json` (includes Classroom, Gmail and Drive read-only scopes).
- Personal accounts: copy the content of `appsscript.personal.json` (Gmail and Drive scopes only; no Classroom scope).

## Safe installation order

1. Sign into the target Google account and verify the account avatar.
2. Create a standalone Apps Script project for that account.
3. Copy `Code.gs` and the matching manifest.
4. Set that instance's account alias/type/providers.
5. Run `setupAstraMonitoring` (creates a private spreadsheet only; no trigger).
6. Run `runMonitoringCycle` manually and inspect logs.
7. Only after successful validation, run `enableAstraSchedule` to create the 15-minute trigger.
8. Repeat in the next Google account.

See [the multi-account zero-cost architecture](../docs/ZERO_COST_ARCHITECTURE.md).

The code is not deployed by GitHub. It must be copied and authorized by the account owner. Do not create a billing account or add a payment card.

