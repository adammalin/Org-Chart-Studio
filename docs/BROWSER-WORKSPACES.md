# Browser and portable file workspaces

Version 0.4.0 is a local release candidate. A production site, Windows qualification of this revision, and plugin publication are separate release steps.

## Open, save and recover

A published static editor needs no Studio account or local app. Its first library is empty. The development preview requires Node and a running local preview server; it is not the staff distribution URL.

Open library continues a full `.orgchart-workspace` file with the same chart and history IDs. It validates the candidate before replacing the active browser recovery record. Malformed files and quota failures leave the previous workspace intact. Opening a legacy library backup preserves its chart identities; Merge backup explicitly imports copies with new IDs.

Each successful command commits to this browser's IndexedDB recovery storage. A worker keeps SQL off the UI thread; the SQL rules, guard triggers and atomic batches are shared with desktop. One writable tab per origin avoids competing local writers. Different browsers, origins and devices have separate recovery. Clearing website data or browser eviction can remove recovery, so save an independent library file.

The file bar distinguishes the working revision from the last file revision. Direct saves require a user-selected handle and read/write permission. Studio checks for external modifications, writes/closes the file, reads its bytes back and verifies SHA-256 before reporting it saved. Changes made during an export remain dirty. Save a copy leaves the linked library's save state unchanged. Linked-file autosave is an explicit, session-only option.

Where direct file access is absent, prepare a download, save it, then confirm it. That status records user-confirmed download evidence, not a verified disk write. The browser may require the user to click its file picker. The file bar reminds users after 15 minutes of unsaved file changes; navigation/close warns while dirty. Resolve editor save errors before opening a different file.

Choose a local OneDrive or Dropbox folder to use its normal sync client. Studio verifies its file write only. It does not authenticate to the provider or confirm remote synchronization. Avoid editing the same file in two places concurrently; an external-file conflict requires reopening the newer file or saving a copy.

## Protection and contents

Files are unencrypted by default. Encrypt file uses the existing authenticated AES-GCM portable envelope and a passphrase of at least 12 characters. Opening or saving an encrypted working library also encrypts SQL and retained-source recovery bytes. Reload requires unlocking again. Passphrases and encryption keys are never persisted. Recovery metadata such as the filename and revision remains readable; browser/OS account security still matters.

The outer JSON format is `orgchart-studio-workspace`, schema 1. It wraps a schema 7 library backup plus pending chart proposals and continuity records. It retains:

- active/archived charts, lifecycle, geometry, support panels, sources and checksums;
- named versions, immutable checkpoints, monthly batches including unfinished work;
- durable user/agent operations, events, guards and retry receipts;
- pending chart updates, durable new-chart import reviews and their normalized inputs;
- pending source intakes and their source bytes, appearance and library-tree preferences.

Private selected-chart recheck rollback entries stay in browser recovery; they are not separate disk files and are not included as standalone backups in the portable package. Permission grants, local paths, file handles, encryption keys, session access receipts and desktop storage settings are not transported. Older versions intentionally reject the new outer format rather than silently discard pending work. Keep the source file and update the destination app when needed.

A file is limited to 512 MB of physical JSON/encrypted-envelope bytes. Existing source import/extraction and backup validation limits also apply; the outer cap is not a promise that every library below it fits a device's memory or storage quota. Exports assemble a complete snapshot in memory. Save smaller scoped legacy backups if necessary; they are explicit copies, not full continuation files. No truncation is performed to fit a limit.

## Desktop handoff

The conventional desktop database remains local and unchanged by opening a web library. Download full working library exports a complete unencrypted continuation snapshot, including pending work. Use the separate portable file workspace to open it and optionally save an encrypted copy. The file workspace is sandboxed, has no privileged preload, uses its own browser partition and serves static assets from an isolated loopback origin. Its window-close and app-quit paths check for unsaved working/file state.

Desktop stdio MCP remains attached to the conventional database. It does not follow the focused file window. Browser tools, where the host supports them, target the open file workspace. Establish the target explicitly before reading or writing. A web library is never silently merged into the conventional desktop database.

## Agent and feature capabilities

The browser registers the same 30 chart operations plus metadata-only workspace status and save preparation. Discover tool names through the host, read workspace status first and pass expectedWorkspaceId. A separate connection guard prevents queued calls from hitting a reopened file with the same ID. Pause, selected-chart scope and retained-source extraction rules remain in force. Apply/Reject and Current use the visible review UI. Monthly updates preserve before/after checkpoints; completing a batch does not mean the portable file is saved.

Browser tool availability depends on the agent host. There is no remote MCP server on GitHub Pages. If tools are absent, the editor remains usable manually, and the plugin can use supported browser UI or explain the missing capability. Desktop setup/storage controls are hidden from the web editor. Local source access never bypasses SharePoint authentication; the official ORNL chart site remains a separate source of truth.

SVG, PNG, PDF, editable PowerPoint and CSV use the shared scene/export modules. Available fonts can differ by browser/OS; the app reports fallback fonts. No direct cloud API, multi-user server, background remote agent or automatic SharePoint refresh is included in this release.

## Build and publication

`npm run build` builds both desktop assets and the static `public/` folder. `npm run web:build` builds only the static editor. `npm run web:verify` verifies relative entry assets, allowed output types and absence of private paths, credentials or source maps. Public assets contain no chart fixtures, sources or user library. The source scanner blocks `.orgchart-workspace` files alongside databases and source documents.

The manual `web-pages.yml` workflow builds a downloadable artifact without deploying by default. Deploy requires an explicit input on main and the GitHub Pages environment. After a reviewed release is deployed, verify the actual URL and browser tools before updating the plugin's `web-release.json`. Do not publish a guessed URL. Installer pins and the plugin's desktop installer qualification remain unchanged until their own release checks pass.
