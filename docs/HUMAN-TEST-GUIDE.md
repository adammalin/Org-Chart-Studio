# OrgChart Studio human-test guide

## Test boundary

This build is ready for a local human test using synthetic or explicitly cleared source material. It is not an approved production system, an authoritative personnel source, or a publication authority. Do not submit sensitive source material to an AI service unless that service and use are approved for the material.

The test is intended to answer whether staff can maintain several charts, normalize legacy charts, make routine changes safely, recover previous versions, and create useful outputs without editing source code.

## Install or update the desktop source test

The one-page illustrated guide is [ORNL OrgChart Studio macOS Quick Start](ORNL-OrgChart-Studio-macOS-Quick-Start.pdf).

For a checkout already on the test Mac, run:

```bash
/bin/zsh scripts/setup-mac-source-test.zsh
```

For the shared GitHub installer, use the commands in the PDF after the tested commit has been pushed to public `main`. The installer uses macOS `curl`, resolves `main` to one exact commit through GitHub's public API, writes its commit and archive checksum to `INSTALL-REVISION.txt`, installs exact dependency versions, builds the app, runs a hidden Electron and local-storage smoke test, and then opens the desktop window.

For later launches, run:

```bash
/bin/zsh "$HOME/OrgChart-Studio-source-test/scripts/start-mac-source-test.zsh"
```

Working data is separate from the source checkout under `~/Library/Application Support/ORNL OrgChart Studio/local-worker-data` by default. Updating the source-test folder does not intentionally replace that data.

Before recording results, open `$HOME/OrgChart-Studio-source-test/INSTALL-REVISION.txt` and confirm the installed commit matches the commit selected for testing. On an update, also confirm the bundled quick-start PDF was refreshed while another file placed under `output/` remained intact.

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
5. Record the app commit, macOS version, and whether the Mac is Apple silicon or Intel.

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
2. Add a child unit, then edit its full name, display name, unit type, position title, status, effective label, visibility, and provenance note.
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
20. Open **Accessible table** and confirm the same units and parents appear there.

Pass when organizational changes and presentation-only changes remain distinguishable, blocking hierarchy errors prevent a saved version or export, and the table agrees with the visual chart.

## Test 3: normalize and import an existing chart

### Spreadsheet path

1. In **Sources & imports**, download the CSV template.
2. Prepare a canonical CSV, workforce-roster CSV, canonical JSON, source manifest, or Excel workbook. Excel reads the first worksheet, maps common column labels, generates missing stable IDs, and can resolve parent names. A workforce roster can use `Full Name`, `Position Title`, and `Supervisor Full Name`.
3. Choose **Validate for review**.
4. Inspect every finding and the normalized hierarchy preview.
5. Check the human-confirmation box only after verifying names, parents, statuses, and source evidence.
6. Create the draft and download its stored original from the source register.

### PowerPoint, Word, PDF, or image path

1. Download the **AI normalization brief**.
2. Use it only in an AI environment approved for the source material. The first pass identifies uncertain connectors or labels; the final pass returns import-ready JSON only after the human resolves them.
3. In OrgChart Studio, choose the normalized JSON as the structured file and attach up to 10 unchanged PowerPoint, Word, PDF, PNG, or JPEG files as source evidence.
4. Validate, review, and confirm before creating the draft.
5. Download both stored source records and compare them with the originals.

Pass when the original source is retained as evidence, the normalized data becomes the editable source of truth, and no chart is created before a human confirms the preview.

## Test 4: save, compare, and restore versions

1. Open **Version history** and save a named version with a meaningful change summary.
2. Make a structural change and save a second named version.
3. Compare the working draft with both saved versions.
4. Restore the first version.
5. Confirm the restore creates a new higher version and does not delete the old versions.
6. Quit and reopen the desktop app; confirm the restored state and history remain.

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

Pass when both formats can be recovered without destructive replacement and unencrypted packages cannot be written directly to a recognized cloud-sync folder.

## Test 7: optional local MCP companion

1. During setup, confirm the installer explains the local MCP boundary. At **Install the local MCP integration? [y/N]**, type `y` and press Return, then restart ChatGPT Desktop or Codex once.
2. Open OrgChart Studio, then inspect MCP servers and confirm `orgchart_studio` is enabled.
3. Call `list_charts` and verify it returns summaries without full node data. Call `get_chart` only on an approved test chart and confirm the current saved layout is returned.
4. Call `validate_chart` and `list_chart_versions`; confirm neither changes the chart.
5. Validate a synthetic canonical CSV through `validate_normalized_import`, then approve `import_normalized_chart`. Confirm it creates a separate draft rather than overwriting an existing chart.
6. Read that draft and make one change through `replace_chart_draft`. Confirm the MCP result says it was staged and that the saved chart remains unchanged.
7. While the proposal is prepared, confirm the app shows a green edge cue plus **AI preparing changes** and names the operation. Meaning must remain clear without relying on color.
8. Choose **Review changes**. Confirm the proposed canvas is read-only, changed cards and connectors have text/pattern cues, and the panel lists exact Before and After fields including additions/removals.
9. Reject one proposal and confirm the saved chart remains unchanged. Stage it again, choose **Apply reviewed changes**, and confirm only the reviewed fields change.
10. Open **Version history**. Confirm both review decisions appear in the AI-assisted timeline, the accepted item says it is awaiting a named version, then save a named version and confirm the item links to it.
11. Trigger a synthetic failed write and confirm the receipt uses **AI edit needs attention** without changing chart data. Make a deliberately stale proposal and confirm it is rejected rather than overwriting newer work.
12. Create and restore a selected-chart backup. Confirm the related AI review timeline is restored with its version links.
13. Confirm write tools request approval and that delete, backup restore, source-file download, storage, passphrase, and publication tools are absent.
14. Quit OrgChart Studio and confirm a tool reports that the desktop app must be opened. Reopen it and confirm tools reconnect with the new session.
15. Run `npm run mcp:remove`, restart ChatGPT Desktop or Codex, and confirm only the OrgChart Studio server was removed. Run `npm run mcp:configure` to restore it if needed.

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
