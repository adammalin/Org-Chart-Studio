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
- Choose separate desktop folders for local working data and recovery packages, with encryption available per backup.

## Data boundary

The desktop application runs a private loopback service and blocks renderer requests to non-loopback network destinations. Working chart data is stored outside the downloaded application folder under the current user's macOS Application Support or Windows AppData folder by default.

The application rejects a live-data folder located inside the source repository or a recognized cloud-sync root. A separate local, OneDrive, Dropbox, iCloud, or other cloud-synced folder may be used for backup packages. Encryption is optional per backup; an unencrypted package requires an explicit readable-file acknowledgement. The backup passphrase is not stored by the application.

Repository hooks and automated scans reject common database files, chart-shaped structured data, backup packages, source-evidence documents, known personnel examples, credentials, and user-specific filesystem paths. These safeguards reduce accidental disclosure but do not replace approved data handling, code review, or access controls.

## Import and AI-assisted normalization

Existing PowerPoint, Word, PDF, image, roster, and spreadsheet files are treated as source evidence rather than as authoritative databases. A reviewed structured CSV or JSON document becomes the editable source of truth after import.

The application has no live AI endpoint. An external assistant may help normalize a cleared source into canonical CSV or JSON, but a person must review the result and explicitly confirm the import preview. The command-line desktop app can optionally register a bounded local MCP companion for deliberate chart listing, reading, validation, import, draft editing, and version saves while the app is running. A separate session-only permission, off by default, can expose bounded locally extracted text, worksheet cells, and PowerPoint structure from retained sources; it never returns raw file bytes. A source-recheck tool creates a private rollback package and stages only `needs_review` corrections while preserving layout, card identities, and reporting endpoints. The MCP does not expose deletion, backup restore, raw source downloads, storage changes, passphrases, or publication. Material returned by any assistant tool enters that AI conversation and must not be used unless the environment and material are approved for one another.

## Desktop distribution

The current distribution path uses public command-line scripts for macOS and Windows instead of unsigned DMG, PKG, MSI, or Setup files. It therefore needs no Apple or Microsoft developer signing account, no administrator install, and no GitHub authentication. Each platform resolves public `main` to one exact commit, downloads that commit archive, records its SHA-256, prepares a compatible pinned Node.js runtime after validating the official Node checksum when necessary, installs exact dependencies, builds the application, and launches the real Electron/GUI/storage/AI smoke suite.

Running the same command again performs a safe update: obsolete application files are removed while the private runtime, local dependencies until refresh, local tool state, and output folders are preserved. The installed app contains no user charts or source evidence. Live data and backups remain under per-user application storage or folders the user selects, separate from replaceable application files.

The optional ChatGPT Desktop/Codex connection can be accepted with `y` during setup or installed and removed later from **Local AI control**. Unsigned native package builds remain manual developer experiments and are not the current distribution path.

## Production boundary

Before production use, responsible owners must approve identity integration, authorization roles, field classifications, retention, authoritative source connections, audit requirements, backup custody, hosting, accessibility, branding, records management, cybersecurity, and publication workflows.

No ORNL logo artwork is included. The visual treatment is a draft adaptation using an ORNL-inspired institutional palette and square-cornered interface geometry; it must not be represented as formally approved branding.
