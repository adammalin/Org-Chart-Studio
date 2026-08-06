# OrgChart Studio human-test guide

## Test boundary

This build is ready for a local human test using synthetic or explicitly cleared source material. It is not an approved production system, an authoritative personnel source, or a publication authority. Do not submit sensitive source material to an AI service unless that service and use are approved for the material.

The test is intended to answer whether staff can maintain several charts, normalize legacy charts, make routine changes safely, recover previous versions, and create useful outputs without editing source code.

## Install or update the command-line desktop app

Follow the three-page [Mac and Windows desktop quick start](ORNL-OrgChart-Studio-Desktop-Quick-Start.pdf). The public setup needs no GitHub account, signing certificate, or administrator shell. It resolves `main` to one exact commit, records that revision and the archive SHA-256 in `INSTALL-REVISION.txt`, prepares a verified Node runtime when necessary, installs exact dependency versions, builds the app, and runs a hidden Electron/GUI/storage/AI smoke test before opening the desktop window.

Repeat the same platform commands to update or repair the app. On Mac, double-click `Start-OrgChart-Studio.command` in the installed folder or run its start script. On Windows, double-click `Start-OrgChart-Studio.cmd` in the installed folder.

Working data is separate from the downloaded application folder under the normal macOS Application Support or Windows AppData location. Updating application code does not intentionally replace chart data.

Before recording results, open `INSTALL-REVISION.txt` in the installed application folder and confirm its commit matches the commit selected for testing. On an update, also confirm a file placed under `output/` remains intact while an obsolete application file is removed.

## Test 0: choose protected storage locations

1. Open **Backup & restore** in the installed desktop app.
2. Under **Desktop file locations**, confirm the live chart library shows a path outside the Git checkout and is labeled **Local only**.
3. Choose a new empty local folder that is not in OneDrive, Dropbox, iCloud, or the source repository. Confirm the app schedules the change instead of switching while its database service is running.
4. Restart from the storage panel. Confirm the app reopens, the live path changes, and existing test charts still load. Confirm the old folder remains available as a recovery copy.
5. Choose a different backup folder. A OneDrive or Dropbox folder is allowed only for encrypted backups.
6. Create an encrypted backup and confirm a timestamped `.orgchart-backup` file appears in that folder. Confirm no SQLite, D1, R2, JSON, CSV, or original source-evidence file is written beside it.
7. Run `npm run security:scan` from the source checkout and confirm the tracked-data scan passes.

Pass when live data remains local and outside the repository, the two configured paths do not overlap, migration preserves all charts after checksum verification, and the backup location receives only the encrypted package.

## Before testing

1. Choose a test owner and one person to record results.
2. Use synthetic or approved sanitized charts only.
3. Create an encrypted backup from **Backup & restore** before a test that uses pre-existing app data.
4. Store the backup passphrase separately; the app cannot recover it.
5. Record the app commit, operating-system version, and Mac or Windows architecture.

## Test 1: manage several independent charts

1. Open **Chart library**.
2. Confirm a fresh installation starts empty and does not add example charts.
3. Create two blank charts with different names.
4. Edit each chart name and description.
5. Change one working status to **In review** and another to **Archived**.
6. Duplicate one chart and confirm the copy is independent.
7. Open each chart and confirm its units, layout, versions, and sources do not change when another chart is edited.
8. Delete only the disposable duplicate.

Pass when each chart behaves as a separate saved document and no other chart is overwritten.

## Test 2: edit structure and presentation safely

1. Open a draft chart and select its root card.
2. Add a child unit, then edit its full name, display name, unit type, position title, status, current/planned state, effective label, visibility, source locator, source certainty, review note, and provenance note.
3. Add a second branch and change the first unit's primary parent using the detail panel.
4. Turn **Move branch** off, drag a card, and confirm its descendants remain in place and the semantic parent does not change.
5. Turn **Move branch** on, drag that card, and confirm every descendant moves by the same amount while the semantic parent still does not change. Repeat with an L2 card that has L3 and L4 descendants.
6. Turn **Select area** on. Drag a box that partially touches several cards and confirm the animated dotted boundary selects every touched card. Control-click or Command-click additional cards and confirm they join the selection.
7. With **Move branch** on, drag one selected card. Confirm the selected cards and every descendant below each of them move and pin together. Turn **Move branch** off, repeat, and confirm only the selected cards move.
8. With two or more cards selected, use left, horizontal-center, right, top, vertical-center, and bottom alignment. With three or more selected, use horizontal and vertical distribution. Confirm only selected cards move, their positions become pinned, and one **Undo** reverses each arrangement.
9. Hold Space and drag while **Select area** is on; confirm the canvas pans instead of drawing a selection. Turn **Select area** off and confirm normal background drag-to-pan returns.
10. Pin the card, run **Respect pins**, and confirm its position remains.
11. Run a selected-branch layout and then a full layout.
12. Choose **Separate lanes** under **Connectors**. Inspect a chart with adjacent branches and confirm every connector avoids cards and positive-length overlap with every other connector.
13. Click one connector. Confirm its automatic corner handles and contextual route toolbar appear. Drag a hollow corner handle and confirm the related lane moves only horizontally or vertically, the controls become pinned, and no diagonal segment appears.
14. Move either connected card and confirm the saved route reconnects with horizontal and vertical segments. Export SVG and PowerPoint and confirm the manual lane remains in the same relative place.
15. Choose **Reset connector** and confirm only that relationship returns to automatic routing. Undo and redo the pin and reset.
16. Choose **Sibling combs**. Confirm children from one parent that sit on the same nearby row share an aligned trunk, while different parents, substantially different rows, and manually pinned relationships remain separate. Export a visual format and confirm it uses the selected connector mode.
17. Use **Undo** and **Redo**, including `Command-Z` and `Shift-Command-Z` outside a form field.
18. Press `/`, search for a unit, and confirm the matching card can be focused.
19. Collapse and expand a branch.
20. Open **Accessible table** and confirm the same units and parents appear there. Filter between all, current, and planned units; confirm planning state, source certainty, and source locator are announced as text rather than color alone.

Pass when organizational changes and presentation-only changes remain distinguishable, blocking hierarchy errors prevent a saved version or export, and the table agrees with the visual chart.

## Test 3: normalize and import an existing chart

### Spreadsheet path

1. In **Sources & imports**, download the CSV template.
2. Prepare a canonical CSV, workforce-roster CSV, canonical JSON, source manifest, or Excel workbook. Excel reads the first worksheet, maps common column labels, generates missing stable IDs, and can resolve parent names. A workforce roster can use `Full Name`, `Position Title`, and `Supervisor Full Name`. Include card provenance in `sourceLocator`, `sourceCertainty`, and `reviewNote`; include reporting-line provenance separately in `relationshipSourceLocator`, `relationshipSourceCertainty`, and `relationshipReviewNote`.
3. Choose **Validate for review**.
4. Inspect every finding and the normalized hierarchy preview.
5. Check the human-confirmation box only after verifying names, parents, statuses, and source evidence.
6. Create the draft and download its stored original from the source register.

### PowerPoint, Word, PDF, image, CSV, or Excel evidence path

1. Download the **AI normalization brief**.
2. Use it only in an AI environment approved for the source material. The first pass identifies uncertain connectors or labels; a review proposal may preserve deliberately unresolved facts as `needs_review`, but material ambiguity must not be presented as confirmed.
3. In OrgChart Studio, create a named **Source intake bundle** with up to 10 unchanged PowerPoint, Word, PDF, PNG, JPEG, CSV, or Excel files. Confirm the pending bundle lists file names, sizes, and fingerprints without creating a chart.
4. Choose the normalized JSON as the structured file and associate the pending bundle, or stage it with `stage_normalized_import` through MCP.
5. Inspect the proposed units, relationships, evidence names, planned/current labels, source certainty, and **Import quality report**. Confirm duplicate-name/uncertain/deep-or-wide findings are advisory and blocking structural findings still prevent creation.
6. Reject one staged import and confirm no chart or normalized source record is created. Stage it again and choose **Create reviewed chart**.
7. Download the stored normalized source and evidence records and compare them with the originals.

Pass when the original source is retained as evidence, the normalized data becomes the editable source of truth, and no chart is created before a human confirms the preview.

## Test 4: save, compare, merge, and restore versions

1. Open **Version history** and save a named version with a meaningful change summary.
2. Make a structural change and save a second named version.
3. Compare the working draft with both saved versions.
4. Restore the first version.
5. Confirm the restore creates a new higher version and does not delete the old versions.
6. Create or import a second disposable chart, then open **Compare charts**. Confirm added, removed, and changed units are summarized without altering either chart.
7. Stage **Apply source structure** to the target. Reject it once and confirm the target is unchanged; stage it again, inspect the normal Before/After proposal, and Apply it. Confirm source-file bytes were not copied by the structural merge.
8. Quit and reopen the desktop app; confirm the restored state, merge result, and history remain.

Pass when autosave protects the working draft, named versions are immutable checkpoints, and restore is additive rather than destructive.

## Test 5: publish working outputs

1. Open **Publish & export**.
2. Try the natural-bounds, 16:9, 11 × 17 landscape, and 11 × 17 portrait profiles.
3. Export the internal profile and confirm it includes current assignment labels.
4. Mark only a small approved subset of units as public, including each selected unit's full ancestor path. Confirm the app blocks a detached public child, then export and verify internal units and assignment labels are absent.
5. Download SVG, PNG at 1×/2×/4×, PDF, PowerPoint, and the accessible CSV table.
6. Open the SVG in a vector editor and confirm text and shapes remain vector objects.
7. Open the PowerPoint and confirm cards, text, and connector segments are individually editable and the slide dimensions match the selected profile.
8. For a wide chart that triggers the small-card warning, compare the PowerPoint slide with the editor at **Fit view**. Confirm card proportions, compact one-line names, internal text spacing, and connector routes match visually, with no label collisions caused by enlarged minimum font sizes.
9. Inspect the PDF page size and searchable text.
10. Confirm every visual output identifies the chart version, audience profile, and generation date.
11. When the app displays a small-card warning, choose natural bounds, a larger profile, or a smaller branch when the proportionally scaled output is too small for the intended audience.

Pass when all outputs derive from the same data and geometry, public-safe output excludes restricted fields, and the editable formats are genuinely editable.

## Test 6: optional encryption and merge-only recovery

1. From **Backup & restore**, choose a separate backup folder, select **Entire library** and **Encrypted (recommended)**, enter a passphrase of at least 12 characters, and confirm it.
2. Save the encrypted library backup. In the desktop app it should appear as one file in the configured folder; browser development mode uses a download.
3. Create a second backup with **Selected charts** and confirm only the checked charts are reported in the completed backup summary.
4. Add or change a disposable chart.
5. Restore the backup with its passphrase.
6. Confirm restored charts, source records, and saved versions appear as new drafts with new identifiers.
7. Confirm existing charts were not overwritten or deleted.
8. Try a wrong passphrase and confirm restore fails without creating partial charts.
9. Choose **Unencrypted**, acknowledge the readable-file warning, create a backup in a local folder, and restore it without entering a passphrase.
10. Configure a OneDrive or Dropbox backup folder, choose **Unencrypted**, and confirm creation is blocked until encryption is turned on or a local folder is selected.
11. In **Backup health**, set a reminder interval, confirm the latest backup records its time, included-chart count, and encryption status, then perform a successful restore and confirm **Last verified restore** updates. Reopen the app and confirm these device-local indicators remain without asking for or displaying a passphrase.

Pass when both formats can be recovered without destructive replacement and unencrypted packages cannot be written directly to a recognized cloud-sync folder.

## Test 7: optional local MCP companion

1. During command-line setup, answer `y` at **Install the local MCP integration? [y/N]**. Or open **Local AI control** later and choose **Install local AI integration**. Confirm the status changes to **Installed**, then restart ChatGPT Desktop or Codex once.
2. Open OrgChart Studio, then inspect MCP servers and confirm `orgchart_studio` is enabled. Open **AI & MCP control**, pause MCP, and confirm a tool call is refused. Resume it.
3. Select **Selected charts**, allow one approved test chart, and confirm `get_chart` is refused for a different chart. Switch to **All charts** only for the remainder of this synthetic test. Confirm a session receipt appears for each authorized or denied operation and contains no prompt text.
4. Call `list_charts` and verify it returns summaries without full node data. Call `get_chart` only on the approved test chart and confirm the current saved layout is returned.
5. Call `validate_chart` and `list_chart_versions`; confirm neither changes the chart.
6. Create a synthetic pending intake bundle. Call `list_import_intakes` and confirm it returns metadata and checksums, not file bytes. Validate synthetic canonical CSV through `validate_normalized_import`, then approve `stage_normalized_import` with the intake ID.
7. Confirm the app opens **AI import review** and the library is still unchanged. Verify **Reject import** and **Create reviewed chart** are both keyboard- and pointer-usable. Reject once, stage again, accept, and confirm it creates a separate draft with the linked evidence.
8. Read that draft and make one change through `replace_chart_draft`. Confirm the MCP result says it was staged and that the saved chart remains unchanged.
9. While the proposal is prepared, confirm the app shows a green edge cue plus **AI preparing changes** and names the operation. Meaning must remain clear without relying on color.
10. Choose **Review changes**. Confirm the proposed canvas is read-only, changed cards and connectors have text/pattern cues, and the panel lists exact Before and After fields including additions/removals.
11. Reject one proposal and confirm the saved chart remains unchanged. Stage it again, choose **Apply reviewed changes**, and confirm only the reviewed fields change.
12. Open **Version history**. Confirm both review decisions appear in the AI-assisted timeline, the accepted item says it is awaiting a named version, then save a named version and confirm the item links to it.
13. Trigger a synthetic failed write and confirm the receipt uses **AI edit needs attention** without changing chart data. Make a deliberately stale proposal and confirm it is rejected rather than overwriting newer work.
14. Create and restore a selected-chart backup. Confirm the related AI review timeline is restored with its version links.
15. Confirm **Allow retained-source extraction for this session** is off. Confirm `extract_import_intake` and `extract_chart_sources` are refused. Enable it only for the synthetic or cleared files, call both tools, and verify they return extracted text/cells/PowerPoint geometry plus checksums, never raw source bytes. Confirm image-only evidence is reported as metadata-only when OCR is unavailable.
16. Modify a copy of the current chart to correct one source-backed field, set that card to `needs_review`, and add a precise source locator and actionable review note. Call `stage_source_recheck` with the exact checksums from extraction. Confirm the result reports a private rollback backup, the saved chart remains unchanged, and the proposal preserves all layout, pins, card IDs, and reporting endpoints. Reject once; stage again and Apply, then resolve the item in **Source review queue**.
17. Confirm `stage_source_recheck` refuses added/removed cards, relationship rewiring, layout movement, missing notes/locators, `confirmed` changes, and stale or incomplete source checksums.
18. Confirm write tools request approval and that delete, backup restore, raw source-file download, storage, passphrase, and publication tools are absent.
19. Quit OrgChart Studio and confirm a tool reports that the desktop app must be opened. Reopen it and confirm tools reconnect with the new session and pause, scope, and retained-source permission have reset.
20. Choose **Remove integration**, restart ChatGPT Desktop or Codex, and confirm only the OrgChart Studio server was removed. Choose **Install local AI integration** to restore it. Source developers may use `npm run mcp:remove` and `npm run mcp:configure` for the same check.

Pass when MCP is local and on-demand, proposals cannot change saved data before Apply, field-level review is accurate, timeline/version links survive backup restore, stale writes are rejected, and no tool bypasses the normal chart/version workflow.

## Keyboard and accessibility checks

- Complete the library, editor, version, import, and export workflows with a keyboard.
- Confirm visible focus is present on every interactive control.
- Complete file selection, validation, preview review, human confirmation, and draft creation using the keyboard.
- Check zoom at 200% and macOS increased contrast.
- Test **Accessible table** with VoiceOver and verify headers, row names, parent relationships, status, and effective labels are announced coherently.
- Confirm information is not communicated by color alone.

## Result log

Record one row per test or issue:

| ID | Area | Tester | Mac/app commit | Result | Evidence or notes | Severity |
|---|---|---|---|---|---|---|
| HT-01 | Chart library | | | Pass / Fail | | Blocking / Major / Minor |

A blocking issue is data loss, cross-chart overwrite, a silent structural error, restricted data in a public export, an unusable backup, or an installation/startup failure. Stop the affected test and preserve the backup and exact reproduction steps.

## Deliberate exclusions from this local test

- production authentication, role-based authorization, and separation of duties;
- authoritative HR, directory, identity, or organization-system synchronization;
- a live approved AI gateway inside the app;
- official approval, publication, retention, or records-management workflows;
- production hosting, monitoring, managed keys, and disaster recovery;
- formal cybersecurity, privacy, accessibility, records, or brand approval;
- a signed and notarized `/Applications` package.

Those items require owners, approved systems, policies, and reviews that cannot be inferred or safely simulated by this source-test build.
