import type { ChartDocument } from "./chart-library";
export function searchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
export function chartMatches(chart: ChartDocument, query: string) {
  const q = searchText(query);
  if (!q) return true;
  return [
    chart.name,
    chart.description,
    ...chart.nodes.flatMap((n) => [
      n.data.unit.name,
      n.data.unit.shortName,
      n.data.unit.assignmentLabel,
      n.data.unit.positionTitle,
    ]),
  ].some((v) => searchText(v || "").includes(q));
}
export interface LibraryMatch {
  chartId: string;
  chartName: string;
  status: string;
  nodeId: string | null;
  organization: string;
  person: string;
  role: string;
}
export function searchLibrary(
  charts: ChartDocument[],
  query: string,
): LibraryMatch[] {
  const q = searchText(query);
  if (!q) return [];
  return charts.flatMap<LibraryMatch>((chart) => {
    const nodes = chart.nodes.filter((n) =>
      [
        n.data.unit.name,
        n.data.unit.shortName,
        n.data.unit.assignmentLabel,
        n.data.unit.positionTitle,
      ].some((v) => searchText(v || "").includes(q)),
    );
    return nodes.length
      ? nodes.map((n) => ({
          chartId: chart.id,
          chartName: chart.name,
          status: chart.status,
          nodeId: n.id,
          organization: n.data.unit.name,
          person: n.data.unit.assignmentLabel,
          role: n.data.unit.positionTitle,
        }))
      : searchText(chart.name).includes(q)
        ? [
            {
              chartId: chart.id,
              chartName: chart.name,
              status: chart.status,
              nodeId: null,
              organization: chart.name,
              person: "",
              role: "",
            },
          ]
        : [];
  });
}
function root(chart: ChartDocument) {
  const children = new Set(
    chart.edges
      .filter(
        (e) =>
          !e.data?.relationshipType ||
          e.data.relationshipType === "primary supervisory",
      )
      .map((e) => e.target),
  );
  return chart.nodes.find((n) => !children.has(n.id)) ?? chart.nodes[0];
}
function organizationNames(value: string) {
  const name = searchText(value);
  return [
    name,
    name.replace(/ (directorate|division|office|group|team|department)$/, ""),
  ];
}
function aliases(chart: ChartDocument) {
  const r = root(chart);
  return new Set(
    [chart.name, r?.data.unit.name, r?.data.unit.shortName]
      .filter(Boolean)
      .flatMap((x) => organizationNames(x!)),
  );
}
export interface LibraryPlacement {
  parentId: string | null;
  inferred: boolean;
  ambiguous: boolean;
}
export function libraryPlacements(
  charts: ChartDocument[],
): Map<string, LibraryPlacement> {
  const result = new Map<string, LibraryPlacement>(),
    byId = new Map(charts.map((c) => [c.id, c]));
  const names = new Map(charts.map((c) => [c.id, aliases(c)]));
  for (const c of charts) {
    if (c.libraryParentId !== undefined) {
      result.set(c.id, {
        parentId:
          c.libraryParentId && byId.has(c.libraryParentId)
            ? c.libraryParentId
            : null,
        inferred: false,
        ambiguous: !!c.libraryParentId && !byId.has(c.libraryParentId),
      });
      continue;
    }
    const candidates = charts.filter(
      (p) =>
        p.id !== c.id &&
        p.status !== "archived" &&
        p.nodes.some(
          (n) =>
            n.id !== root(p)?.id &&
            [n.data.unit.name, n.data.unit.shortName].some((v) =>
              organizationNames(v).some((name) => names.get(c.id)!.has(name)),
            ),
        ),
    );
    // Prefer the closest containing organization: eliminate ancestors that also
    // contain another candidate's root. Equal/ambiguous matches remain unassigned.
    const closest = candidates.filter(
      (p) =>
        !candidates.some(
          (other) =>
            other.id !== p.id &&
            p.nodes.some(
              (n) =>
                n.id !== root(p)?.id &&
                organizationNames(n.data.unit.name).some((name) =>
                  names.get(other.id)!.has(name),
                ),
            ),
        ),
    );
    result.set(c.id, {
      parentId: closest.length === 1 ? closest[0].id : null,
      inferred: closest.length === 1,
      ambiguous: closest.length > 1,
    });
  }
  for (const c of charts) {
    const seen = new Set([c.id]);
    let id = result.get(c.id)?.parentId;
    while (id) {
      if (seen.has(id)) {
        result.set(c.id, { parentId: null, inferred: false, ambiguous: true });
        break;
      }
      seen.add(id);
      id = result.get(id)?.parentId;
    }
  }
  return result;
}
