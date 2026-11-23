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
      const nameKey = organizationKey(u.name);
      if (generic.has(nameKey)) continue;
      const parent = chart.edges.find(
        (e) =>
          e.target === node.id &&
          (e.data?.relationshipType ?? "primary supervisory") ===
            "primary supervisory",
      );
      const p = parent
        ? chart.nodes.find((n) => n.id === parent.source)
        : undefined;
      // A reusable position title identifies a position within its organization,
      // not one laboratory-wide organization shared by unrelated parents.
      const titleOnly = searchText(u.name) === searchText(u.positionTitle);
      const key = titleOnly
        ? `${nameKey}::position-in:${p ? organizationKey(p.data.unit.name) : "chart:" + chart.id}`
        : nameKey;
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
/** Role labels describe positions; they are never evidence that two people are identical. */
export function roleKey(value: string) {
  return searchText(value)
    .replace(/\b(?:assoc lab|associate lab) director\b/g, "associate laboratory director")
    .replace(/\bald\b/g, "associate laboratory director")
    .replace(/\bcoo\b/g, "chief operating officer")
    .replace(/\bcio\b/g, "chief information officer")
    .replace(/\bcco\b/g, "chief communications officer")
    .replace(/\bchro\b/g, "chief human resources officer")
    .replace(/\bchief human resource officer\b/g, "chief human resources officer")
    .replace(/\b(?:acting|interim)\b/g, "")
    .replace(/^(?:division|office|directorate|laboratory) director$/, "director")
    .replace(/\s+/g, " ").trim();
}
interface Assignment { person: string; role: string }
const embeddedRole = /(?:deputy\s+)?associate\s+(?:laboratory|lab)\s+director|(?:deputy\s+)?assoc\.?\s+lab\.?\s+director|chief\s+(?:human\s+resources?|operating|information|communications?)\s+officer|(?:deputy|associate|operations|program|project|division|office|laboratory|directorate)\s+director|executive\s+assistant|senior\s+administrative\s+assistant|division\s+admin(?:istrator)?|group\s+leader|section\s+head|director|\b(?:ALD|COO|CIO|CCO|CHRO)\b/gi;
function personKey(value: string) {
  return searchText(value.replace(/\([^)]*\)/g, "").replace(/\b(?:acting|interim)\b/gi, ""));
}
export function comparableAssignments(person: string, role: string): Assignment[] {
  if (!meaningful(person)) return [];
  const assignments: Assignment[] = [];
  const segments = person.split(/[·;\n]+/).map(s => s.trim()).filter(Boolean);
  for (const segment of segments) {
    const matches = [...segment.matchAll(embeddedRole)];
    if (matches.length) {
      let from = 0;
      for (const match of matches) {
        const name = personKey(segment.slice(from, match.index).replace(/[,\s]+$/, ""));
        if (name) assignments.push({ person: name, role: roleKey(match[0]) });
        from = match.index! + match[0].length;
      }
    } else if (segment.includes(",")) {
      const comma = segment.indexOf(",");
      const name = personKey(segment.slice(0, comma));
      const title = segment.slice(comma + 1).trim();
      if (name && meaningful(title)) assignments.push({ person: name, role: roleKey(title) });
    } else {
      const name = personKey(segment);
      if (name) assignments.push({ person: name, role: segments.length === 1 && meaningful(role) ? roleKey(role) : "" });
    }
  }
  return assignments;
}
function explicitLevel(name: string) {
  return searchText(name).match(/ (directorate|division|office|group|team|department)$/)?.[1];
}
function sameOrganizationContext(a: RelatedAppearance, b: RelatedAppearance) {
  const al = explicitLevel(a.organization), bl = explicitLevel(b.organization);
  if (al && bl && al !== bl) return false;
  // Dropping a suffix finds candidates, not identity. In particular, a project
  // function called Research is not automatically the Research Division.
  const sameName = searchText(a.organization) === searchText(b.organization);
  const sameParent = !!a.parent && !!b.parent && organizationKey(a.parent) === organizationKey(b.parent);
  return sameParent || (sameName && (!a.parent || !b.parent));
}
export function auditPortfolio(charts: ChartDocument[]): ConsistencyIssue[] {
  const issues = new Map<string, ConsistencyIssue>();
  for (const [key, rows] of relatedAppearances(charts)) {
    if (new Set(rows.map(r => r.chartId)).size < 2) continue;
    const add = (category: ConsistencyCategory, title: string, priority: "high" | "medium", pair: RelatedAppearance[], role = "") => {
      const id = category + ":" + key + (role ? ":" + role : "");
      const existing = issues.get(id);
      const appearances = [...(existing?.appearances ?? []), ...pair];
      issues.set(id, { id, organizationKey: key, organization: pair[0].organization,
        category, priority, title, appearances: [...new Map(appearances.map(a => [a.chartId + ":" + a.nodeId, a])).values()] });
    };
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j];
      if (a.chartId === b.chartId) continue;
      const aa = comparableAssignments(a.person, a.role), ba = comparableAssignments(b.person, b.role);
      const commonRoles = [...new Set(aa.map(x => x.role).filter(r => r && ba.some(x => x.role === r)))];
      const sameContext = sameOrganizationContext(a, b);
      // No name-only promotion: unrelated groups, service portfolios and unknown
      // roles remain visible as identity/context questions, never high conflicts.
      if (!sameContext || !commonRoles.length) {
        if (!sameContext && a.parent && b.parent && searchText(a.organization) === searchText(b.organization) && commonRoles.length && rows.some(r => !r.parent)) {
          add("reporting", "A root-matched organization and role appear under different parents; verify identity, source scope and authority", "medium", [a, b]);
          continue;
        }
        const peopleA = new Set(aa.map(x => x.person));
        const peopleB = new Set(ba.map(x => x.person));
        const differentSharedRole = commonRoles.some(role => {
          const names = (values: Assignment[]) => [...new Set(values.filter(x => x.role === role).map(x => x.person))].sort().join("|");
          return names(aa) !== names(ba);
        });
        if (differentSharedRole || (peopleA.size && peopleB.size && [...peopleA].every(p => !peopleB.has(p)))) {
          add("identity", "Similar organization names have different or undocumented role/context; confirm identity before comparing", "medium", [a, b]);
        } else if (sameContext && meaningful(a.role) && meaningful(b.role) && roleKey(a.role) !== roleKey(b.role)) {
          add("role", "The same named person has different role labels; verify whether these are separate positions", "medium", [a, b]);
        }
        continue;
      }
      for (const role of commonRoles) {
        const pa = [...new Set(aa.filter(x => x.role === role).map(x => x.person))].sort();
        const pb = [...new Set(ba.filter(x => x.role === role).map(x => x.person))].sort();
        if (pa.join("|") !== pb.join("|")) {
          add("assignment", `Different named assignments for the same role (${role}); verify both official sources`, "high", [a, b], role);
        }
      }
      if (meaningful(a.role) && meaningful(b.role) && searchText(a.role) !== searchText(b.role) && roleKey(a.role) === roleKey(b.role)) {
        // Preserve meaningful acting/interim qualifications; harmless abbreviations
        // and extra administrative staff do not constitute different leaders.
        const qualifiers = (v: string) => searchText(v).match(/\b(?:acting|interim)\b/g)?.sort().join(" ") ?? "";
        if (qualifiers(a.role) !== qualifiers(b.role)) add("role", "Acting/interim role qualifications differ; compare the official labels", "medium", [a, b]);
      }
    }
  }
  return [...issues.values()].sort((a, b) => (a.priority === "high" ? 0 : 1) - (b.priority === "high" ? 0 : 1) || a.organization.localeCompare(b.organization) || a.id.localeCompare(b.id));
}
export function undocumentedEffectiveDate(value: string) {
  return !value.trim() || /not (?:specified|supplied|documented)|unknown|^current$/i.test(value);
}
export function effectiveDateCoverage(charts: ChartDocument[]) {
  const rows = charts.filter(c => c.status !== "archived").map(c => ({
    chartId: c.id, chartName: c.name,
    missing: c.nodes.filter(n => n.data.unit.planningState !== "planned" && undocumentedEffectiveDate(n.data.unit.effectiveDate)),
  }));
  return { cards: rows.reduce((n, r) => n + r.missing.length, 0), charts: rows.filter(r => r.missing.length), };
}
export type ReviewCategory =
  "conflicts" | "identity" | "reporting" | "dates" | "source" | "placement";
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
    category: i.category === "identity" ? "identity" : i.category === "reporting" ? "reporting" : "conflicts",
    priority: i.priority === "high" ? 0 : i.category === "identity" ? 2 : 1,
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
      tasks.push({
        id: c.id + ":" + n.id,
        category: "source",
        priority: 2,
        chartId: c.id,
        chartName: c.name,
        nodeId: n.id,
        title: u.name,
        detail: u.reviewNote || "Compare this card with the source.",
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
  for (const row of effectiveDateCoverage(charts).charts) {
    tasks.push({ id: "dates:" + row.chartId, category: "dates", priority: 4,
      chartId: row.chartId, chartName: row.chartName, nodeId: row.missing[0].id,
      title: row.chartName, detail: `${row.missing.length} current ${row.missing.length === 1 ? "card has" : "cards have"} no documented effective date. This is a source coverage gap, not a proven error. Keep dates unknown when the official chart does not state them.`,
      source: "Effective-date coverage", sourceLocator: "" });
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
