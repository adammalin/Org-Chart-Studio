# Codex handoff for installed OrgChart Studio

OrgChart Studio remains usable with Codex after the desktop source test is installed. The app does not contain a live AI endpoint and Codex does not receive background access to its local data. Staff deliberately exchange cleared files through the app's import and export controls.

## Bring in a new legacy chart

1. Collect the cleared PowerPoint, Word, PDF, image, roster, CSV, or Excel sources without modifying the originals.
2. Ask Codex to identify readable facts and list ambiguity before producing import data. Resolve uncertain connectors, names, titles, and reporting relationships with a human source owner.
3. Ask Codex for canonical JSON or CSV that follows the app's downloaded template or AI normalization brief.
4. In **Sources & imports**, select that structured file and attach the unchanged originals as evidence.
5. Validate the preview, resolve all blocking findings, check the human-confirmation box, and create a new draft.

## Ask Codex to revise an existing chart

1. Open the chart and download **Source manifest** from **Sources & imports**.
2. Give the manifest to Codex with a precise list of approved changes. Do not include material that is not cleared for the AI environment in use.
3. Review the revised JSON, then import it. The import creates a separate draft and does not overwrite the existing chart. The manifest carries canonical units and relationships, but not custom card positions, named-version history, or original source-file bytes.
4. Compare the two charts, continue editing the approved draft, and save a named version.
5. Export an encrypted library backup before deleting or archiving an older chart.

For small edits or layout changes, staff can make the change directly in **Chart editor**. If the user explicitly asks, Codex can also operate the running Electron interface locally, but each task must be initiated by the user and the app must be open.

## Safety boundary

- Use the app UI, source manifest, canonical import, version, and backup paths.
- Do not directly edit files under `~/Library/Application Support/ORNL OrgChart Studio/local-worker-data`; that can bypass validation and history or damage the store.
- Keep original evidence unchanged and retain it with the structured import.
- Treat AI-produced structure as a proposal until a human verifies the preview.
- Keep backup passphrases outside the app in an approved password manager.

This workflow keeps the saved structured chart as the source of truth while allowing Codex to help with extraction, formatting, quality checks, and bounded revisions.
