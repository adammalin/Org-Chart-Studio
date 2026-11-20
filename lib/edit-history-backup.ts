import { UNIT_TYPES } from "./org-chart";
import {
  contentFromState,
  type EditOperation,
  type EditEvent,
  type EditState,
} from "./edit-history";
export interface EditHistoryBackup {
  operations: EditOperation[];
  events: EditEvent[];
}
export function editBackupError(
  history: EditHistoryBackup | undefined,
  chartIds: Set<string>,
): string | null {
  if (!history) return null;
  if (
    !Array.isArray(history.operations) ||
    !Array.isArray(history.events) ||
    history.operations.length > 100000 ||
    history.events.length > 300000
  )
    return "Invalid edit history or edit history exceeds the restore limit.";
  const ids = new Map<string, string>(),
    eventIds = new Set<string>();
  try {
    let prior = 0;
    for (const op of history.operations) {
      if (
        !op ||
        !chartIds.has(op.chart_id) ||
        typeof op.id !== "string" || !op.id || op.id.length > 200 ||
        (op.group_id !== null && (typeof op.group_id !== "string" || op.group_id.length > 200)) ||
        ids.has(op.id) ||
        !Number.isSafeInteger(op.sequence) ||
        op.sequence <= prior ||
        typeof op.label !== "string" ||
        op.label.length > 1000 ||
        !["applied", "undone", "superseded"].includes(op.state) ||
        ![0, 1].includes(op.reversible) ||
        !["user", "agent", "system"].includes(op.actor) ||
        !Number.isFinite(Date.parse(op.recorded_at))
      )
        return "A saved edit operation is malformed.";
      for (const raw of [op.before_state, op.after_state]) {
        const state = JSON.parse(raw) as EditState;
        if (
          state.id !== op.chart_id ||
          typeof state.name !== "string" || !state.name.trim() ||
          typeof state.description !== "string" ||
          !["draft", "in_review", "current", "archived"].includes(state.status) ||
          !Number.isSafeInteger(state.version) || state.version < 1 ||
          typeof state.createdAt !== "string" || !Number.isFinite(Date.parse(state.createdAt)) ||
          typeof state.updatedAt !== "string" || !Number.isFinite(Date.parse(state.updatedAt)) ||
          !Array.isArray(state.payload?.nodes) ||
          !Array.isArray(state.payload?.edges)
        )
          return "A saved edit snapshot is malformed.";
        // Historical charts may have unresolved hierarchy findings. Preserve
        // those records, but reject shapes that cannot be read or recovered.
        const nodeIds = new Set<string>();
        for (const node of state.payload.nodes) {
          const unit = node?.data?.unit;
          if (!node || typeof node.id !== "string" || !node.id || nodeIds.has(node.id) ||
              !Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y) ||
              !unit || typeof unit.id !== "string" || !UNIT_TYPES.includes(unit.type) ||
              ["name", "shortName", "positionTitle", "assignmentLabel", "effectiveDate", "source"].some(k => typeof (unit as unknown as Record<string, unknown>)[k] !== "string") ||
              !["filled", "acting", "vacant", "not_specified"].includes(unit.positionStatus) ||
              !["internal", "public"].includes(unit.publicationVisibility))
            return "A saved edit unit is malformed.";
          nodeIds.add(node.id);
        }
        const edgeIds = new Set<string>();
        for (const edge of state.payload.edges) {
          if (!edge || typeof edge.id !== "string" || !edge.id || edgeIds.has(edge.id) ||
              typeof edge.source !== "string" || typeof edge.target !== "string")
            return "A saved edit relationship is malformed.";
          edgeIds.add(edge.id);
        }
        if (state.payload.libraryParentId != null && typeof state.payload.libraryParentId !== "string")
          return "A saved edit directory parent is malformed.";
        contentFromState(raw);
      }
      prior = op.sequence;
      ids.set(op.id, op.chart_id);
    }
    prior = 0;
    for (const e of history.events) {
      if (
        !e ||
        eventIds.has(e.id) ||
        typeof e.id !== "string" ||
        ids.get(e.operation_id) !== e.chart_id ||
        !Number.isSafeInteger(e.sequence) ||
        e.sequence <= prior ||
        !["applied", "undo", "redo"].includes(e.action) ||
        !["user", "agent", "system"].includes(e.actor) ||
        !Number.isFinite(Date.parse(e.recorded_at))
      )
        return "A saved edit receipt is malformed.";
      eventIds.add(e.id);
      prior = e.sequence;
    }
  } catch {
    return "A saved edit snapshot is invalid.";
  }
  return null;
}

// Restored copies keep the imported history as evidence. Source IDs and local
// storage paths are not embedded in edit snapshots. Map cross-chart navigation
// and the restored copy's name/description consistently across all snapshots so
// undo remains valid without renaming the copy back to the original chart.
export function remapEditState(
  raw: string,
  ids: Map<string, string>,
  names: Map<string, { name: string; description: string }>,
  original: { name: string; description: string },
) {
  const s = JSON.parse(raw) as EditState,
    id = ids.get(s.id)!;
  const renamed = names.get(s.id)!;
  s.id = id;
  s.name = s.name === original.name ? renamed.name : `${s.name} — Restored`;
  s.description =
    s.description === original.description
      ? renamed.description
      : s.description;
  if (s.payload.libraryParentId)
    s.payload.libraryParentId = ids.get(s.payload.libraryParentId) ?? null;
  return JSON.stringify(s);
}
