# Official chart appearance

Studio's default **Chart appearance → Official slide** uses the visual conventions measured from the current BESS, Computing and Computational Sciences, and Buildings and Transportation Science PDFs linked by [ORNL's organization chart site](https://ornl.sharepoint.com/sites/orgchart). This is a shared presentation profile. It does not designate charts Current or certify their factual content.

## Shared defaults

- Century Gothic, using actual regular and bold faces when available. Organization headings are bold; people and assignment lines use regular weight. Text is centered, wraps by measured advance widths, and scales to the available saved card bounds.
- White background; black type; thin gray (`#595959`) card borders and reporting lines; pale green (`#D2E4BB`) division cards, white section cards, restrained cream group/team cards, and gray (`#D9D9D9`) support panels. Root cards stay white.
- At a 960-point source-slide width, representative headings use 18 pt for a directorate root, 14.28 pt for a division root, 12.24 pt for a division, 12 pt for a section and 10.5 pt for a group. Ordinary cards use 10.8 pt. Captured source coordinates scale these values uniformly. Long text shrinks within its own card rather than moving other cards.
- Multiple leadership assignments separated by a middle dot display on separate lines. Placeholder roles and duplicate role lines are omitted. Acting names remain visible with their Interim wording; empty, unspecified assignments do not acquire an invented visual label or vacancy.
- Status dots, organizational-type labels, source-review badges, decorative color strips and persistent handles are omitted from the official drawing. Source flags and position statuses remain stored and available in the review/detail/table workflows. Selection, search, hover controls and proposal-review interaction remain available.
- **Editor annotations** retains the earlier diagnostic card rendering as an optional global choice. Compact groups is still a separate arrangement option. Compact-entry selection and support assignment descriptions remain accessible.

The appearance choice is stored in the local database's app settings, independently of the desktop server's changing port. It applies across charts and to visual exports. New sessions default to Individual cards unless the user has explicitly chosen Compact groups. Appearance is an application preference; importing chart copies does not override the user's display preference.

## Geometry and source coverage

Shared styling preserves the saved card positions, widths, heights, pins, reporting geometry and support-panel bounds. It does not run auto-layout or rewrite chart content. Captured source arrangements continue to open as Individual cards. Charts without captured geometry retain their existing arrangement; recovering the original sibling placement, special side branches, exact authored line breaks and exceptions to the palette requires a chart-specific source comparison and reviewed update.

Default tokens are derived from representative linked PDFs, not a claim that all official charts use identical text sizes or fills. Source documents can differ in age or detail; the site's linked current files remain authoritative for each organization. Original logos, slide rails and source revision dates are not recreated or fabricated by this profile. Draft/Current/version/audience metadata remains outside the diagram in exports.

## Fonts and exports

The desktop checks known local Century Gothic files in an existing Mac PowerPoint/Fonts installation or the Windows Fonts directory. It accepts no renderer-supplied filesystem path. The font IPC is restricted to Studio's own main frame and current local origin. Regular and bold files are size/format checked; fonts marked restricted, bitmap-only or no-subsetting are not exposed. The app and installers contain numeric advance metrics, not copied Office font files.

When usable local faces exist, the canvas loads them, SVG/PNG can carry the authorized embedded faces, and PDF embeds subsets. PowerPoint references Century Gothic and keeps cards, lines and text editable. If a font is unavailable, the toolbar discloses the system fallback; PDF retains its supported standard-font fallback. A fallback is not an exact Century Gothic match.

Implementation: `lib/chart-appearance.ts` supplies the shared line layout, metrics and palette; `app/official-card.tsx` draws the canvas; `lib/chart-export.ts`, `lib/chart-export-pdf.ts` and `lib/chart-export-pptx.ts` use that layout for output. `electron/chart-fonts.cjs` provides bounded local font discovery. No new MCP tools or chart-data fields are required for the global preference.

## Verification boundary — November 18, 2026

The full production build/typecheck and synthetic regression suite passed 213 tests with one Windows-only skip. Lint and diff checks passed. The native Mac test profile passed the official font, text-bounds, optional annotations, global-preference and preview-deferral identity checks along with prior history/monthly/source workflows. The real BESS chart was inspected and exported through the actual Studio UI; both Century Gothic faces are embedded in that PDF. Windows native and fresh installer execution remain unverified in this pass.

An additional visual-test finding was fixed: opening a proposal for a just-created chart now inserts its saved base into the in-memory library when absent, so Review later cannot pair that chart's cards with an unrelated fallback chart's name. This does not insert or apply any chart in the database.
