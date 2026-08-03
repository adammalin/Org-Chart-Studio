# OrgChart Studio public product overview

## Status

OrgChart Studio is a local technical prototype for maintaining organizational charts as structured, versioned data. It is not an authoritative personnel system, an approved production service, or a publication authority.

The repository intentionally contains no operational organizational charts, personnel rosters, imported source documents, local databases, or backup packages. Examples used by automated tests are fictional.

## Current prototype capabilities

- Maintain several independent charts in a persistent local library.
- Create, edit, reparent, arrange, duplicate, archive, and delete chart drafts.
- Import reviewed CSV, JSON, and first-sheet Excel data.
- Retain optional source evidence locally with checksums and provenance records.
- Autosave working drafts and create named immutable versions.
- Compare and restore saved versions without overwriting history.
- Arrange chart cards with branch movement, area selection, alignment, distribution, pinning, undo, and redo.
- Route connectors in separate lanes or optional same-parent sibling combs, then pin and manually move individual orthogonal lanes when a chart needs visual judgment. A per-connector reset returns the relationship to automatic routing, and diagonal segments are never created.
- Export SVG, PNG, vector PDF, editable PowerPoint, and accessible CSV from one shared scene model.
- Use a dedicated Backup & restore workspace to create one encrypted-by-default or explicitly unencrypted package for the full library or selected charts, then restore merge-only copies.
- Choose separate desktop folders for local working data and encrypted recovery packages.

## Data boundary

The desktop application runs a private loopback service and blocks renderer requests to non-loopback network destinations. Working chart data is stored outside the source checkout under the current user's macOS Application Support folder by default.

The application rejects a live-data folder located inside the source repository or a recognized cloud-sync root. A separate OneDrive or Dropbox folder may be used for an encrypted backup package. Unencrypted backup packages require an explicit warning acknowledgement and a local backup folder. The backup passphrase is not stored by the application.

Repository hooks and automated scans reject common database files, chart-shaped structured data, backup packages, source-evidence documents, known personnel examples, credentials, and user-specific filesystem paths. These safeguards reduce accidental disclosure but do not replace approved data handling, code review, or access controls.

## Import and AI-assisted normalization

Existing PowerPoint, Word, PDF, image, roster, and spreadsheet files are treated as source evidence rather than as authoritative databases. A reviewed structured CSV or JSON document becomes the editable source of truth after import.

The application has no live AI endpoint. An external assistant may help normalize a cleared source into canonical CSV or JSON, but a person must review the result and explicitly confirm the import preview. The desktop source test can optionally register a bounded local MCP companion for deliberate chart listing, reading, validation, import, draft editing, and version saves while the app is running. It does not expose deletion, backup restore, source downloads, storage changes, passphrases, or publication. Material returned by any assistant tool enters that AI conversation and must not be used unless the environment and material are approved for one another.

## Desktop distribution

The current macOS source-test installer downloads this repository, installs exact dependency versions, builds the local application, runs an Electron smoke test, and launches the app. It does not create a signed application under `/Applications`, bypass Gatekeeper, or make system-wide changes.

## Production boundary

Before production use, responsible owners must approve identity integration, authorization roles, field classifications, retention, authoritative source connections, audit requirements, backup custody, hosting, accessibility, branding, records management, cybersecurity, and publication workflows.

No ORNL logo artwork is included. The visual treatment is a draft adaptation using an ORNL-inspired institutional palette and square-cornered interface geometry; it must not be represented as formally approved branding.
