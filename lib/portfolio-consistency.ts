import type { ChartDocument } from "./chart-library";
import type { OrgFlowNode } from "./org-chart";
import { searchText } from "./library-navigation";
import { libraryPlacements } from "./library-navigation";
export type ConsistencyCategory =
  "assignment" | "reporting" | "role" | "identity";
export interface RelatedAppearance {
  chartId: string;
  chartName: string;
  nodeId: string;
  organization: string;
  person: string;
  role: string;
  parent: string | null;
  source: string;
  sourceLocator: string;
  reviewNote: string;
  certainty: string;
  effectiveDate: string;
}
export interface ConsistencyIssue {
  id: string;
  organizationKey: string;
  organization: string;
  category: ConsistencyCategory;
  priority: "high" | "medium";
  title: string;
  appearances: RelatedAppearance[];
}
export function organizationKey(name: string) {
  const key = searchText(name).replace(
    / (directorate|division|office|group|team|department)$/,
    "",
  );
  return key.length >= 5 ? key : searchText(name);
}
const generic = new Set([
  "group team leads",
  "team leads",
  "leadership",
  "director",
  "staff",
  "administration",
  "management",
  "support",
]);
function meaningful(value: string) {
  return (
    !!searchText(value) &&
    !/(not specified|assignment shown in source|leadership position|unknown|untitled)/i.test(
      value,
    )
  );
}
export function relatedAppearances(
  charts: ChartDocument[],
): Map<string, RelatedAppearance[]> {
  const groups = new Map<string, RelatedAppearance[]>();
  for (const chart of charts.filter((c) => c.status !== "archived"))
    for (const node of chart.nodes) {
      const u = node.data.unit;
      if (u.planningState === "planned") continue;
      const key = organizationKey(u.name);
      if (generic.has(key)) continue;
      const parent = chart.edges.find(
        (e) =>
          e.target === node.id &&
          (e.data?.relationshipType ?? "primary supervisory") ===
            "primary supervisory",
      );
      const p = parent
        ? chart.nodes.find((n) => n.id === parent.source)
        : undefined;
      const record: RelatedAppearance = {
        chartId: chart.id,
        chartName: chart.name,
        nodeId: node.id,
        organization: u.name,
        person: u.assignmentLabel,
        role: u.positionTitle,
        parent: p?.data.unit.name ?? null,
        source: u.source,
        sourceLocator: u.sourceLocator ?? "",
        reviewNote: u.reviewNote ?? "",
        certainty: u.sourceCertainty ?? "needs_review",
        effectiveDate: u.effectiveDate,
      };
      groups.set(key, [...(groups.get(key) ?? []), record]);
    }
  return groups;
}
export function auditPortfolio(charts: ChartDocument[]): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  for (const [key, rows] of relatedAppearances(charts)) {
    if (new Set(rows.map((r) => r.chartId)).size < 2) continue;
    const add = (
      category: ConsistencyCategory,
      title: string,
      priority: "high" | "medium",
    ) =>
      issues.push({
        id: category + ":" + key,
        organizationKey: key,
        organization: rows[0].organization,
        category,
        priority,
        title,
        appearances: rows,
      });
    if (new Set(rows.map((r) => r.chartId)).size !== rows.length) {
      add(
        "identity",
        "Multiple positions share this organization name; confirm identity before synchronizing",
        "medium",
      );
      continue;
    }
    const people = new Set(
      rows
        .map((r) => r.person)
        .filter(meaningful)
        .map(searchText),
    );
    if (people.size > 1)
      add(
        "assignment",
        "Different assignments appear in related charts",
        "high",
      );
    const parents = new Set(
      rows
        .map((r) => r.parent)
        .filter((p): p is string => !!p)
        .map(organizationKey),
    );
    if (parents.size > 1)
      add(
        "reporting",
        "Different immediate reporting parents appear in related charts",
        "high",
      );
    const roles = new Set(
      rows
        .map((r) => r.role)
        .filter(meaningful)
        .map(searchText),
    );
    if (roles.size > 1)
      add("role", "Position titles differ across related charts", "medium");
  }
  return issues.sort(
    (a, b) =>
      (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1) ||
      a.organization.localeCompare(b.organization),
  );
}
export type ReviewCategory =
  "conflicts" | "reporting" | "dates" | "source" | "placement";
export interface ReviewTask {
  id: string;
  category: ReviewCategory;
  priority: number;
  chartId: string;
  chartName: string;
  nodeId?: string;
  edgeId?: string;
  title: string;
  detail: string;
  source: string;
  sourceLocator: string;
}
export function prioritizedReview(charts: ChartDocument[]): ReviewTask[] {
  const issues = auditPortfolio(charts),
    conflicts = new Set(
      issues.flatMap((i) =>
        i.appearances.map((a) => a.chartId + ":" + a.nodeId),
      ),
    );
  const tasks: ReviewTask[] = issues.map((i) => ({
    id: i.id,
    category: "conflicts",
    priority: i.priority === "high" ? 0 : 1,
    chartId: i.appearances[0].chartId,
    chartName: i.appearances[0].chartName,
    nodeId: i.appearances[0].nodeId,
    title: i.organization,
    detail: i.title,
    source: i.appearances.map((a) => a.chartName + ": " + a.person).join("; "),
    sourceLocator: i.appearances[0].sourceLocator,
  }));
  for (const c of charts.filter((c) => c.status !== "archived")) {
    for (const n of c.nodes) {
      const u = n.data.unit;
      if (
        u.sourceCertainty !== "needs_review" ||
        conflicts.has(c.id + ":" + n.id)
      )
        continue;
      const missing =
        !u.effectiveDate ||
        /not specified|unknown|^current$/i.test(u.effectiveDate);
      tasks.push({
        id: c.id + ":" + n.id,
        category: missing ? "dates" : "source",
        priority: missing ? 3 : 2,
        chartId: c.id,
        chartName: c.name,
        nodeId: n.id,
        title: u.name,
        detail: missing
          ? "No documented effective date; do not infer one from a save or file date."
          : u.reviewNote || "Compare this card with the source.",
        source: u.source,
        sourceLocator: u.sourceLocator ?? "",
      });
    }
    for (const e of c.edges) {
      if (e.data?.sourceCertainty !== "needs_review") continue;
      const from =
          c.nodes.find((n) => n.id === e.source)?.data.unit.name ?? e.source,
        to = c.nodes.find((n) => n.id === e.target)?.data.unit.name ?? e.target;
      tasks.push({
        id: c.id + ":" + e.id,
        category: "reporting",
        priority: 1,
        chartId: c.id,
        chartName: c.name,
        nodeId: e.target,
        edgeId: e.id,
        title: from + " → " + to,
        detail: String(
          e.data.reviewNote ||
            "Verify this connection and whether it represents supervisory authority.",
        ),
        source: String(e.data.relationshipType || ""),
        sourceLocator: String(e.data.sourceLocator || ""),
      });
    }
  }
  for (const [id, p] of libraryPlacements(
    charts.filter((c) => c.status !== "archived"),
  )) {
    if (p.ambiguous) {
      const c = charts.find((c) => c.id === id)!;
      tasks.push({
        id: "placement:" + id,
        category: "placement",
        priority: 2,
        chartId: id,
        chartName: c.name,
        title: c.name,
        detail:
          "More than one library parent is plausible. Choose placement in Organization tree.",
        source: "Suggested navigation placement",
        sourceLocator: "",
      });
    }
  }
  return tasks.sort(
    (a, b) => a.priority - b.priority || a.title.localeCompare(b.title),
  );
}
export function nodeReviewPriority(
  node: OrgFlowNode,
  chartId: string,
  issues: ConsistencyIssue[],
) {
  return issues.some((i) =>
    i.appearances.some((a) => a.chartId === chartId && a.nodeId === node.id),
  )
    ? 0
    : /conflict|disagree|differs|newer source/i.test(
          node.data.unit.reviewNote ?? "",
        )
      ? 1
      : 2;
}
