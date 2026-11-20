# Source connections and standalone cards

A visible line does not necessarily establish supervision. Preserve its endpoints, geometry and styling, and use the existing relationship type `source connection — authority unspecified` when the source does not establish supervisory authority. Primary supervision alone establishes a semantic parent, reporting depth, compact membership, movable branch and hierarchy ancestry.

A source can also contain a real card with no primary parent shown. Set its unit's optional `reportingPlacement` to `standalone`. The normal default is `hierarchy` (also represented by an absent field). Standalone means no primary parent is asserted in this chart; it does not mean vacant, advisory, subordinate to the nearest box, or absent from the organization.

Validation still requires exactly one hierarchy root. Explicit standalone roots may coexist with it; an unexplained extra root still fails. A standalone card with an incoming primary relationship is contradictory and fails. Duplicate identifiers, missing endpoints, unsupported values, multiple primary parents and primary reporting cycles remain blocked.

## Editing and review

In Organization structure & source details, Primary parent offers **No parent shown in source (standalone)**. In Advanced Individual cards, selecting a connector exposes **Connection meaning**. Editing its meaning preserves card positions and marks the relationship for source review; removing primary authority explicitly marks its otherwise parentless target standalone. Confirm only the supported facts: a confirmed neutral connection establishes the presence of the line, not supervisory authority.

AI proposals display reporting-placement and relationship-meaning changes in Before/After. Use stable card and edge IDs and retain source locators and explanatory notes. A source-backed revision can update the captured relationship manifest after actually checking the same original strokes; ordinary edits continue to disable stale captured formatting. Neither these fields nor structural validity grant human approval or Current designation.

## Imports, exports, history and compatibility

Canonical chart JSON, complete workspace files, backups, checkpoints and durable undo/redo preserve both fields. Normalized JSON/CSV and Excel accept optional `reportingPlacement`; `relationshipType` accepts all three meanings. With normalized rows, `parentId` is the connection endpoint: it is a supervisory parent only for a primary supervisory relationship. Use canonical chart JSON when one card needs multiple connections.

Accessible exports identify standalone cards as **No parent shown in source**, retain their explicit placement and list other source connections separately. Public exports omit internal endpoints and never infer a private parent from a neutral connection. Library tree placement and historical leadership answers use the real hierarchy root rather than treating standalone cards as additional organization roots.

Source comparison fingerprints include standalone placement without changing old fingerprints for the ordinary hierarchy default. Original history and comparison records remain append-only. Libraries containing standalone cards require this updated shared renderer/validator; older builds may reject them as extra roots. Preserve the original complete library before updating or importing into another version. A diagram or table export is not a full database backup.
