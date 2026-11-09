import type { HistoryCheckpoint } from "./chart-history";
import { diffChartDocuments, type AiFieldChange } from "./ai-change-review";
import { searchText } from "./library-navigation";
import { organizationKey } from "./portfolio-consistency";
export interface HistoryQuestion {
  question?: string;
  mode?: "roles" | "changes";
  chartId?: string;
  organization?: string;
  query?: string;
  asOf?: string;
  since?: string;
  referenceDate?: string;
  includeArchived?: boolean;
  scopeIds?: string[];
}
export interface ParsedHistoryQuestion {
  mode: "roles" | "changes";
  organization: string;
  query: string;
  asOf: string;
  since: string;
  period: boolean;
  leadership: boolean;
  interpretation: string;
}
export function calendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
const months = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
export function parseHistoryQuestion(
  input: HistoryQuestion,
): ParsedHistoryQuestion {
  const text = (input.question || "").trim().replace(/[?]$/, ""),
    reference = input.referenceDate || new Date().toISOString().slice(0, 10);
  if (!calendarDate(reference)) throw Error("Choose a valid reference date.");
  const mode =
      input.mode ??
      (/^what changed|^changes\b/i.test(text) ? "changes" : "roles"),
    leadership = /\b(led|headed|leader)\b/i.test(text);
  let organization = input.organization?.trim() || "",
    query = input.query?.trim() || "",
    asOf = input.asOf || reference,
    since = input.since || "",
    period = false;
  if (text && !/^(who\b|what changed\b|changes\b)/i.test(text))
    throw Error(
      "Use a supported question such as “Who led Physics on 2026-10-31?” or “What changed since 2026-10-01?”, or choose the filters below.",
    );
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/g);
  if (iso?.length) {
    if (mode === "changes") since = input.since || iso[0];
    else asOf = input.asOf || iso[iso.length - 1];
  }
  const named = text
    .toLowerCase()
    .match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/,
    );
  if (named) {
    const month = months.indexOf(named[1]),
      year = Number(named[2] || reference.slice(0, 4));
    since = input.since || `${year}-${String(month + 1).padStart(2, "0")}-01`;
    if (mode === "roles") {
      asOf =
        input.asOf ||
        new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
      period = true;
    }
  }
  if (/last month/i.test(text)) {
    const d = new Date(reference + "T00:00:00Z"),
      year = d.getUTCFullYear(),
      m = d.getUTCMonth() - 1;
    since =
      input.since || new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 10);
    if (mode === "roles") {
      asOf =
        input.asOf ||
        new Date(Date.UTC(year, m + 1, 0)).toISOString().slice(0, 10);
      period = true;
    }
  }
  const led = text.match(
    /^who (?:led|headed) (.+?)(?:\s+(?:on|in|as of)\s+.+)?$/i,
  );
  if (led && !organization) organization = led[1];
  const role = text.match(
    /^who (?:was|is|held) (?:the )?(.+?) (?:of|for|at) (.+?)(?:\s+(?:on|in|as of)\s+.+)?$/i,
  );
  if (role) {
    if (!query) query = role[1];
    if (!organization) organization = role[2];
  }
  if (mode === "changes" && !organization) {
    const m = text.match(
      /^(?:what changed|changes) (?:in|for) (.+?) (?:since|in|on) /i,
    );
    if (m) organization = m[1];
  }
  if (
    input.chartId &&
    /^(this|the) (organization|division|chart)$/i.test(organization)
  )
    organization = "";
  if (!calendarDate(asOf) || (since && !calendarDate(since)))
    throw Error("Dates must be real calendar dates in YYYY-MM-DD format.");
  if (mode === "changes" && !since)
    throw Error("Choose the date to compare from.");
  if (since && since > asOf)
    throw Error("The comparison start must be on or before the end date.");
  if (mode === "roles" && !organization && !query && !input.chartId)
    throw Error("Choose an organization, person, role, or chart to query.");
  return {
    mode,
    organization,
    query,
    asOf,
    since,
    period,
    leadership,
    interpretation:
      mode === "changes"
        ? `Saved organizational changes from ${since} through ${asOf} (UTC recorded dates)`
        : period
          ? `Assignments recorded across ${since} through ${asOf} (UTC)`
          : `Latest recorded state on or before ${asOf} (UTC)`,
  };
}
export interface EvidenceReference {
  nodeId:string;
  checkpointId: string;
  chartId: string;
  chartName: string;
  recordedAt: string;
  kind: string;
  source: string;
  reviewNote: string;
  sourceLocator: string;
  certainty: string;
  effectiveDate: string;
}
export interface HistoricalRole {
  organization: string;
  person: string;
  role: string;
  evidence: EvidenceReference[];
}
function orgMatches(name: string, query: string) {
  return !query || organizationKey(name).includes(organizationKey(query));
}
export function roleAnswers(
  checkpoints: HistoryCheckpoint[],
  parsed: ParsedHistoryQuestion,
): HistoricalRole[] {
  const grouped = new Map<string, HistoricalRole>();
  for (const h of checkpoints) {
    const rootIds = new Set(
      h.chart.nodes
        .filter(
          (n) =>
            !h.chart.edges.some(
              (e) =>
                e.target === n.id &&
                (e.data?.relationshipType ?? "primary supervisory") ===
                  "primary supervisory",
            ),
        )
        .map((n) => n.id),
    );
    for (const n of h.chart.nodes) {
      const u = n.data.unit;
      if (u.planningState === "planned") continue;
      const matchOrg = parsed.organization
        ? orgMatches(u.name, parsed.organization)
        : true;
      if (!matchOrg) continue;
      if (parsed.leadership && !parsed.organization && !rootIds.has(n.id))
        continue;
      const text = searchText(
        [u.name, u.shortName, u.positionTitle, u.assignmentLabel].join(" "),
      );
      if (
        parsed.query &&
        !searchText(parsed.query)
          .split(" ")
          .every((term) => text.includes(term))
      )
        continue;
      const key = [
        organizationKey(u.name),
        searchText(u.positionTitle),
        searchText(u.assignmentLabel),
      ].join(":");
      const item = grouped.get(key) ?? {
        organization: u.name,
        person: u.assignmentLabel || "Not specified",
        role: u.positionTitle || "Not specified",
        evidence: [],
      };
      item.evidence.push({
        nodeId:n.id,
        checkpointId: h.id,
        chartId: h.chartId,
        chartName: h.chartName,
        recordedAt: h.recordedAt,
        kind: h.kind,
        source: u.source ?? "",
        reviewNote: u.reviewNote ?? "",
        sourceLocator: u.sourceLocator ?? "",
        certainty: u.sourceCertainty ?? "needs_review",
        effectiveDate: u.effectiveDate || "Not supplied",
      });
      grouped.set(key, item);
    }
  }
  return [...grouped.values()].sort(
    (a, b) =>
      a.organization.localeCompare(b.organization) ||
      a.person.localeCompare(b.person),
  );
}
export interface HistoricalChange {
  chartId: string;
  chartName: string;
  beforeId: string;
  afterId: string;
  beforeRecordedAt: string;
  afterRecordedAt: string;
  changes: AiFieldChange[];
}
export function changeAnswers(
  before: HistoryCheckpoint[],
  after: HistoryCheckpoint[],
  parsed: ParsedHistoryQuestion,
) {
  const changes: HistoricalChange[] = [],
    gaps: { chartId: string; chartName: string; reason: string }[] = [];
  for (const latest of after) {
    const earliest = before.find((h) => h.chartId === latest.chartId);
    if (!earliest) {
      gaps.push({
        chartId: latest.chartId,
        chartName: latest.chartName,
        reason:
          "No saved state exists on or before the comparison start. New recording is not proof of a newly created organization.",
      });
      continue;
    }
    let diff = diffChartDocuments(earliest.chart, latest.chart).changes.filter(
      (c) => c.category !== "layout",
    );
    if (parsed.organization)
      diff = diff.filter(
        (c) =>
          orgMatches(c.entityLabel, parsed.organization) ||
          orgMatches(latest.chartName, parsed.organization),
      );
    if (parsed.query)
      diff = diff.filter((c) =>
        searchText(
          [c.entityLabel, c.fieldLabel, c.before, c.after].join(" "),
        ).includes(searchText(parsed.query)),
      );
    if (diff.length)
      changes.push({
        chartId: latest.chartId,
        chartName: latest.chartName,
        beforeId: earliest.id,
        afterId: latest.id,
        beforeRecordedAt: earliest.recordedAt,
        afterRecordedAt: latest.recordedAt,
        changes: diff,
      });
  }
  return { changes, gaps };
}
