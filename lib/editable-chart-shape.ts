import type { ChartDocument } from './chart-library';
import { UNIT_TYPES } from './org-chart';

/** Validate readable record shapes without normalizing or dropping source fields. */
export function editableChartShapeError(chart: ChartDocument): string | null {
  if (!chart || typeof chart !== 'object' || typeof chart.id !== 'string' || !chart.id ||
      typeof chart.name !== 'string' || typeof chart.description !== 'string' ||
      !Number.isSafeInteger(chart.version) || chart.version < 1 ||
      typeof chart.updatedAt !== 'string' || !Number.isFinite(Date.parse(chart.updatedAt)) ||
      (chart.libraryParentId != null && typeof chart.libraryParentId !== 'string') ||
      !Array.isArray(chart.nodes) || !Array.isArray(chart.edges))
    return 'The chart metadata, nodes, or relationships are malformed.';
  for (const node of chart.nodes) {
    const unit = node?.data?.unit;
    if (!node || typeof node.id !== 'string' || !node.id || !unit || unit.id !== node.id ||
        !UNIT_TYPES.includes(unit.type) ||
        !Number.isFinite(node.position?.x) || !Number.isFinite(node.position?.y) ||
        ['name','shortName','positionTitle','assignmentLabel','effectiveDate','source'].some(
          key => typeof (unit as unknown as Record<string,unknown>)[key] !== 'string') ||
        !['filled','acting','vacant','not_specified'].includes(unit.positionStatus) ||
        !['internal','public'].includes(unit.publicationVisibility))
      return 'A chart unit is malformed. No chart changes were saved.';
  }
  const ids = new Set<string>();
  for (const edge of chart.edges) {
    if (!edge || typeof edge.id !== 'string' || !edge.id || ids.has(edge.id) ||
        typeof edge.source !== 'string' || typeof edge.target !== 'string' ||
        (edge.data != null && (typeof edge.data !== 'object' || Array.isArray(edge.data))))
      return 'A chart relationship is malformed. No chart changes were saved.';
    ids.add(edge.id);
  }
  return null;
}
