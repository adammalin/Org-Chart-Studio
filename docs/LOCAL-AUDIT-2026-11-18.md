# OrgChart Studio audit — November 18, 2026

The local v0.3.0 candidate was audited and patched for confirmed correctness, UI and security issues. The updated app is open against the existing saved workspace. This is local verification, not a published release or a formal penetration test.

## Fixed findings

| Priority | Finding and consequence | Correction and evidence |
| --- | --- | --- |
| High | Electron allowed requests to any loopback service and attached the desktop session token. An unintended request or redirect to a different local port could disclose that token. | Pin HTTP/WebSocket access to the app's actual 127.0.0.1 origin/port, fail closed before startup, strip case variants of existing token headers, and attach the token only to its own server. Unit tests cover other ports, aliases, credentials and missing startup origin. |
| High | The MCP HTTP client followed redirects with a custom authentication header. | Refuse redirects. A synthetic two-server test verifies ordinary requests succeed and redirected/direct foreign targets never reach the capture server. |
| High | Encrypted backups accepted arbitrary numeric PBKDF2 work factors; a malformed file could request excessive CPU work. | Require an integer work factor from 100,000 through 1,000,000, AES-256, a 16-byte salt and a 12-byte IV. Normal exports remain 250,000 iterations. Invalid parameters and normal encryption round trips are tested. |
| High | Installed dependencies included known security advisories, including critical runtime/framework findings. | Upgrade the coherent runtime/build stack and compatible transitive dependencies. Registry audit fell from 66 findings (4 critical, 44 high, 15 moderate, 3 low) to four high findings in one Mac DMG build chain. Counts include transitive/build dependencies and are not counts of demonstrated reachable exploits. |
| Medium | History request generation IDs were reused after chart switches. Late results could replace the newly selected chart's history; an old action's reconciliation could initiate another stale read. | Monotonic invalidation, selected-chart guards and stale error protection. The native suite holds actual responses, switches charts, releases the old response and verifies the selected chart remains correct. |
| Medium | Refreshing during an operation preview could leave history buttons permanently disabled because the invalidated request never cleared its loading state. Older-page and revert responses also needed stale-generation guards. | Reset transient loading on refreshed data; ignore stale responses and refresh paginated data when its revision changes. Native delayed-preview/refresh regression passes. |
| Medium | A late history reconciliation cleared the shared autosave timer before checking which chart was open. This could cancel another chart's pending save. | Check the hydrated chart before touching the timer/save generation. Existing stale-autosave and chart-switch native tests pass; the specific callback ordering was reviewed in source. |
| Medium | Imported edit snapshots could contain malformed metadata, units, coordinates or relationship shapes, producing recovery failures later. | Validate snapshots and operation grouping before any restore writes. Preserve valid In review snapshots and historical records with unresolved hierarchy findings. Synthetic malformed cases return 422 and leave chart counts unchanged. |
| Low | History returned 500 for invalid request JSON and exposed raw internal errors. | Return a safe 400 for malformed JSON; keep explicit expected errors and sanitize unexpected 500 responses. API tests cover both. |
| Medium | Search/header controls could overlap, and Saved disappeared at compact desktop widths. | Let the search track shrink while reserving space for controls. Native geometry checks pass at 1500, 1280 and the supported 1040-pixel minimum content width, with Saved visible. |
| Low | AI comparison text overflowed the compact navigation rail and made it unnecessarily tall. | Provide a compact checked/total count with the complete accessible description and tooltip. Native geometry checks and saved screenshots verify the rail. |

Relevant code: `electron/network-policy.cjs`, `electron/main.cjs`, `mcp/orgchart-app-client.mjs`, `app/edit-history.tsx`, `app/orgchart-studio.tsx`, `app/api/edit-history/route.ts`, `lib/edit-history-backup.ts`, `lib/backup-format.ts`, `lib/encrypted-backup.ts`, `app/globals.css`, `app/support-panels.tsx`.

The runtime updates include Electron 43.8.11, MCP SDK 1.32.2, React/RSC 19.3.1, Next 16.4.6, Vinext 1.4.6, Vite 8.3.8 and Wrangler 4.164.0. Forge is 8.0.1. Scoped parser overrides update PptxGenJS's installed image-size dependency to 2.1.0 and Satori's fflate dependency to 0.8.3; PowerPoint export and synthetic SVG rendering pass. Primary advisory context: [React RSC advisory](https://github.com/react/react/security/advisories/GHSA-xqc2-xf4c-x3h3), [MCP SDK advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-6prh-2h8m-c8cw).

## Remaining findings and limits

- **Four high dependency findings remain in the Mac disk-image builder:** `@electron-forge/maker-dmg → electron-installer-dmg → appdmg → image-size@0.7.5`. These are four flagged packages in the same dependency chain, not four demonstrated attacks. The callback-based image-size API used by appdmg is incompatible with the patched 2.x API. No compatible upstream fix was reported. The vulnerable parser is used for packaging backgrounds, not chart editing; this project's DMG config supplies a fixed background color, not user-imported image files. Replace/patch the DMG builder or obtain an upstream fix before calling the dependency audit clean. [Parser advisories](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq), [ICNS advisory](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr).
- **Onboarding can reappear after app restart.** Tour dismissal uses origin-scoped browser localStorage while the desktop server changes ports. Persisting this preference in app settings would make it survive restarts reliably.
- **Support-panel proposal differences still show large JSON blocks.** They are correct before/after records, but role/person-level rows would make human review easier.
- **Windows native execution and fresh installer packaging were not performed.** The upgraded Forge/Electron/worker combination needs native Windows and installer checks before distribution. The single Windows-only test is skipped on this Mac.
- The audit does not certify absence of other issues. Enterprise deployment/authentication, formal accessibility testing, a full IPC/CSP review and large-database performance testing were outside this bounded pass.
- Existing source comparisons, Current status and library directory suggestions were not revalidated against SharePoint or changed during this audit. The older editor recovery draft remains present and was neither applied nor discarded.

## Verification and preservation

- `npm test`: production build/typecheck plus **207 passing tests, zero failures, one Windows-only skip** (208 total). See `Full-Test.log`.
- `npm run lint`: passed. `git diff --check`: passed.
- Final disposable native desktop journey: **64 checks all true**, including actual undo/redo, mixed user/agent changes, service restart/recovery, lost-response receipts, chart switching, source layout, backup/import, monthly history, delayed history responses and responsive UI. See `Desktop-Verification.json` and `Desktop-Test-Final.log`.
- Old-runtime synthetic persisted database opened under the new runtime with identical chart content/save timestamp, operation ID, history revision and operation count. See `Upgrade-Seed.log` and `Upgrade-Verify-Final.log`.
- A new private cold recovery copy was created in the configured backup folder and every copied file hash was verified. Location/count are in `Pre-Audit-Backup.json`. This is a worker-data recovery copy, not the portable backup import format.
- Reopened the actual saved app through its normal launcher and verified Saved, 136 charts, the history view and the retained recovery notice in the native UI. No real chart edits, review decisions, Current changes or restore actions were used for testing.
- Real-library before/after metadata is identical: **136 charts, 362 named versions, 152 checkpoints, 138 source records**; chart payload-length sum, version sum and latest saved timestamp also match. See `Library-Preservation.json`.
- Before/Final-Source snapshots and hashes are retained here. Earlier unrelated worktree edits were preserved. No GitHub push, public release, installer pin change, plugin publication or website update was made in this pass.

Synthetic UI evidence: [minimum-width header and compact sidebar](Header-1040.png), [1500-pixel view](Header-1500.png), [durable history](Durable-History-Desktop.png).
