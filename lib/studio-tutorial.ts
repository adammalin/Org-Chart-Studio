import type { InterfaceMode } from './interface-mode';

export type TutorialView = 'library' | 'canvas' | 'review' | 'history' | 'monthly' | 'backups' | 'exports' | 'ai' | 'sources' | 'table' | 'consistency';
export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  tips: string[];
  view: TutorialView;
  target: string;
  needsChart?: boolean;
}
export const TUTORIAL_COMPLETION_KEY = 'orgchart-studio-tutorial-v2';
export const TUTORIAL_WELCOME_KEY = 'orgchart-studio-onboarding-v1';

export function tutorialDestination(step: TutorialStep, hasChart: boolean): TutorialView {
  return step.needsChart && !hasChart ? 'library' : step.view;
}

export function tutorialSteps(mode: InterfaceMode, runtime: 'browser' | 'desktop'): TutorialStep[] {
  const browser = runtime === 'browser';
  const steps: TutorialStep[] = [
    {id:'files', title:browser ? 'Open and save your library file' : 'Your desktop database and portable files', view:'library', target:browser ? '.library-file-bar' : '.library-heading',
      body:browser ? 'Open library continues an existing working file with its chart IDs, history and pending reviews. Browser recovery helps after an interruption; keep a saved library file outside the browser too.' : 'The desktop app saves its database locally. A portable file workspace is separate from that database; use Backup & restore to download or open a complete working library.',
      tips:[browser ? 'Wait for Saved, then use Save library or Prepare library download. A prepared download still needs to be downloaded and confirmed.' : 'Wait for Saved before switching charts or closing Studio. Export the full working library to continue in the web app.', 'Files can live in an already synced OneDrive or Dropbox folder. Studio confirms its own save; your sync client handles cloud upload.']},
    {id:'find', title:'Find an organization, person or role', view:'library', target:'.global-search',
      body:'Search across the library, then open the matching chart or card. The active-chart selector changes which chart you are working on.',
      tips:['Use names, organization names, abbreviations or role titles. Include archived charts when looking for older material.', 'For who held a role on a particular date, use History / Timeline rather than assuming a current search result describes the past.']},
    {id:'library', title:'Browse, create and import charts', view:'library', target:'.library-heading',
      body:'Flat list and Organization tree are two views of the same library. Lifecycle filters control which charts appear; the totals include archived charts.',
      tips:['Open a card to edit it. New chart creates a blank draft; Import chart opens the source-import workflow for creating a chart from evidence.', 'Tree placement is a navigation aid, not a reporting relationship. Open library continues a complete file; Merge backup imports copies.']},
    {id:'edit', title:'Make a basic card update', view:'canvas', target:'.canvas-toolbar--essentials', needsChart:true,
      body:'Select a card to edit its display name, role, assignment, position status and effective date. Use Save organizational changes, then wait for Saved.',
      tips:['Use Filled, Acting, Vacant or Not specified as supported by the source. A missing person is not automatically a vacancy.', 'Fit view, zoom and pan help you inspect the diagram. Organization structure & source details holds less common fields; deleting or reparenting a card changes the organization.']},
    {id:'undo', title:'Recover from an unwanted edit', view:'history', target:'.history-heading', needsChart:true,
      body:'Undo and Redo use the saved edit history, including user and AI changes. Text fields keep their own normal text undo while you are typing.',
      tips:['Inspect Individual changes & undo history to see before/after values. A reviewed revert can recover an older operation when later edits do not conflict.', 'A named checkpoint preserves a deliberate restore point. Restoring a historical version creates a new Draft and retains the earlier history.']},
    {id:'ai', title:'Work with your AI assistant', view:'ai', target:'.ai-control-heading',
      body:browser ? 'Browser AI control shows the connection for this web workspace. Your assistant must connect to this browser library; a desktop MCP connection can contain different data.' : 'Local AI control shows the desktop MCP connection, activity and access settings. The plugin can help open Studio, update content, and save or export through the supported controls.',
      tips:['Choose the charts the assistant may access, pause access when needed, and allow retained-source extraction only when you want those files rechecked.', 'AI proposals show Before and After. Apply changes only after review, Reject to leave the chart unchanged, or Review later to keep the proposal pending. AI changes are not automatically approved or Current.']},
    {id:'source-review', title:'Understand and resolve source reviews', view:'review', target:'.source-review-heading', needsChart:true,
      body:'The sidebar badge counts flagged records across the library, not charts. The review page separates cards, lines, support records and the number of charts remaining.',
      tips:['Compare each item with the official source. Confirm means it matches; Keep inferred means it is reasonable but not explicit. Keep unresolved questions visible when the source is unclear.', 'AI comparison, human source review and Current designation are separate. A structural validation pass does not prove the source facts, and older comparisons can become stale after an edit.']},
    {id:'lifecycle', title:'Distinguish Draft, review, Current and Archived', view:'library', target:'.library-status-filter',
      body:'Draft is editable work; In review is ready for review. Current is an explicit working-chart designation with a checkpoint. Archived charts retain their data and history and are read-only.',
      tips:['Use the card lifecycle control or Mark Current workflow, inspect readiness, and supply the accountable designation details. Source checks alone do not mark a chart Current.', 'Restore or duplicate an archived chart when you need an editable copy. Filtering the library never removes data.']},
    {id:'history', title:'Explore historical checkpoints', view:'history', target:'.history-heading', needsChart:true,
      body:'History / Timeline lets you inspect dated checkpoints, named versions, comparisons, undo operations and AI Apply/Reject decisions for the selected chart.',
      tips:['Filter by date or month and compare states to answer who held a role or what changed. A recorded checkpoint date is distinct from an actual appointment date.', 'Save a meaningful checkpoint label before a milestone. A chart checkpoint is not a full-library backup file.']},
    {id:'monthly', title:'Run the monthly update workflow', view:'monthly', target:'.monthly-workspace',
      body:'Select the month and chart scope, record the change list, and start the update. Studio captures the previous states before changes so the month can be traced later.',
      tips:['Have the assistant prepare source-backed updates, inspect the proposals and remaining questions, and resume the saved batch after an interruption.', 'Complete the batch when its decisions are resolved. Completion saves final checkpoints; designate Current separately where appropriate, then save the full library file.']},
    {id:'backups', title:'Back up, import and restore safely', view:'backups', target:'.backup-heading',
      body:'Choose Entire library for a portable backup containing charts, retained sources, layout and history. Selected-chart exports contain only that scope. Unencrypted is the default; encryption is optional.',
      tips:['For encrypted files, keep the passphrase securely outside the file. Studio cannot recover a lost passphrase.', 'Merge backup creates remapped copies, preserving existing records. Inspect the import summary; Open library is the way to continue a complete working library with its original IDs.']},
    {id:'exports', title:'Choose an export and save before leaving', view:'exports', target:'.export-heading', needsChart:true,
      body:'Choose audience and output profiles, then download SVG, PNG, PDF, editable PowerPoint or an accessible table. Inspect the saved output for labels, connections and readability.',
      tips:['Public-safe filtering changes which fields are included; it does not grant publication clearance. A diagram or table export is not a database backup.', browser ? 'After any manual or AI updates, save the library file too. Download the prepared file and confirm only after it exists; recovery and named checkpoints do not replace that file.' : 'Keep a full database backup in addition to diagram exports and named checkpoints. The web and desktop app can open the complete portable working library.']},
  ];
  if (mode === 'advanced') {
    steps.splice(4, 0,
      {id:'structure', title:'Edit hierarchy and detailed assignments', view:'canvas', target:'.unit-more-details', needsChart:true,
        body:'Advanced exposes unit identity, type, primary parent, planning and publication fields, source locators and certainty. Stable unit IDs keep source and history links attached.',
        tips:['Distinguish saved reporting relationships from tree navigation placement and visual proximity. Check validation after reparenting, adding or deleting cards.', 'Support panels preserve matrix, advisory and shared-service memberships without turning every person into a supervisory unit. Verify support roles and source evidence too.']},
      {id:'layout', title:'Arrange cards without losing source geometry', view:'canvas', target:'.layout-options', needsChart:true,
        body:'Expand Appearance & layout to choose individual cards or compact groups, appearance, card-layout scope and connector routing. Official slide arrangement uses captured source positions where available.',
        tips:['Respect pins preserves manually positioned cards; selected-branch layout limits the change. Full layout can move the entire drawing, so inspect its result and use Undo if needed.', 'Use branch movement, area selection, alignment and spacing for deliberate adjustments. Compact presentation changes the drawing rather than reporting membership.']},
      {id:'connectors', title:'Inspect routes, typography and source arrangement', view:'canvas', target:'.source-layout-details', needsChart:true,
        body:'Connector lanes, shared branches and saved route corners control drawing paths. When a captured source layout is available, Source arrangement & formatting provides its reference and font information.',
        tips:['Pin or reset a connector route only after checking its endpoints and meaning. A dashed line or a side card does not by itself establish supervisory authority.', 'Use authorized local source fonts when available, then check wrapping, card bounds, fills, line styles and exported diagrams. Appearance controls do not verify the source content.']},
    );
    steps.splice(steps.findIndex(s=>s.id==='backups'), 0,
      {id:'imports', title:'Prepare source evidence and import proposals', view:'sources', target:'.sources-heading',
        body:'Sources & imports accepts structured data and supported source files. Retain evidence, inspect extraction warnings, and normalize organization, role and assignment fields before creating a chart.',
        tips:['Review proposed cards, relationships, source locators, support contents and unresolved questions. A staged intake has not created a chart until Create reviewed chart is chosen.', 'To correct an existing chart, ask the assistant to update that chart by stable ID. Importing or merging creates copies and is not a replacement update.']},
      {id:'table', title:'Inspect the accessible table and quality filters', view:'table', target:'.table-panel', needsChart:true,
        body:'Accessible table provides a text-based view of organizations, roles, assignments and source fields. Search and filters help find status, source-certainty and quality problems.',
        tips:['Use the table alongside the diagram, especially when a card is hard to find or inspect visually.', 'Download table is useful for review and accessible sharing; it does not carry the complete library, original files or restore history.']},
      {id:'consistency', title:'Review consistency across organizations', view:'consistency', target:'.portfolio-review',
        body:'Consistency & priorities identifies possible disagreements between chart appearances, assignments, roles and reporting lines. Matching names are candidates, not proof that two records mean the same thing.',
        tips:['Open the affected chart and verify the relevant official source before making a correction. Keep source conflicts explicit when official files disagree.', 'Use review priorities to focus work, then recheck the saved record. A quiet consistency report does not replace source validation.']},
    );
  }
  return steps;
}
