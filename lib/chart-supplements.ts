import type { ChartDocument } from "./chart-library";
import type { PositionStatus, SourceCertainty } from "./org-chart";

export interface SupportAssignment {
  id: string;
  role: string;
  person: string;
  positionStatus: PositionStatus;
  effectiveDate: string;
  publicationVisibility: "internal" | "public";
  source: string;
  sourceLocator: string;
  sourceCertainty: SourceCertainty;
  reviewNote: string;
}
export interface SourceBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SourceLayout {
  referenceUrl: string;
  sourceLocator: string;
  capturedAt: string;
  width: number;
  height: number;
}
export interface SupportPanel {
  geometry?: SourceBounds;
  connector?: { points: { x: number; y: number }[]; style: "solid" | "dashed" };
  id: string;
  title: string;
  kind: "matrix_support" | "advisory" | "shared_services";
  anchorUnitId: string;
  placement: "right" | "below";
  publicationVisibility: "internal" | "public";
  source: string;
  sourceLocator: string;
  sourceCertainty: SourceCertainty;
  reviewNote: string;
  entries: SupportAssignment[];
}
export interface SourceCheck {
  id: string;
  checkedAt: string;
  checkedBy: string;
  reviewerType: "ai" | "human";
  sourceUrl: string;
  sourceLocator: string;
  sourceRevision: string;
  result: "matches" | "differences" | "unavailable";
  scope: "full_chart" | "hierarchy_only";
  findings: string;
  contentFingerprint: string;
}
export interface ChartSupplements {
  supportPanels?: SupportPanel[];
  sourceChecks?: SourceCheck[];
  sourceLayout?: SourceLayout;
}
type SupplementDocument = ChartSupplements & {
  nodes: ChartDocument["nodes"];
  edges?: ChartDocument["edges"];
};
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function text(v: unknown, label: string, max = 1000, required = false): string {
  if (v === undefined && !required) return "";
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    throw Error(`${label} is missing or exceeds ${max} characters.`);
  return v.trim();
}
function choice<T extends string>(
  v: unknown,
  allowed: readonly T[],
  fallback: T,
  label: string,
): T {
  if (v === undefined) return fallback;
  if (!allowed.includes(v as T)) throw Error(`${label} is invalid.`);
  return v as T;
}
function provenance(v: Record<string, unknown>) {
  return {
    source: text(v.source, "Source"),
    sourceLocator: text(v.sourceLocator, "Source locator", 2000),
    sourceCertainty: choice(
      v.sourceCertainty,
      ["confirmed", "inferred", "needs_review"] as const,
      "needs_review",
      "Source certainty",
    ),
    reviewNote: text(v.reviewNote, "Review note"),
    publicationVisibility: choice(
      v.publicationVisibility,
      ["internal", "public"] as const,
      "internal",
      "Visibility",
    ),
  };
}
function bounds(raw: unknown): SourceBounds {
  const v = object(raw, "Source geometry");
  for (const key of ["x", "y", "width", "height"])
    if (
      typeof v[key] !== "number" ||
      !Number.isFinite(v[key]) ||
      Math.abs(v[key] as number) > 50000
    )
      throw Error("Source geometry must use finite chart coordinates.");
  if ((v.width as number) < 120 || (v.height as number) < 80)
    throw Error("Source cards need readable positive bounds.");
  return {
    x: v.x as number,
    y: v.y as number,
    width: v.width as number,
    height: v.height as number,
  };
}
export function panelGeometry(
  panel: SupportPanel,
  chart: Pick<ChartDocument, "nodes">,
): SourceBounds {
  if (panel.geometry) return panel.geometry;
  const anchor = chart.nodes.find((n) => n.id === panel.anchorUnitId),
    maxX = Math.max(
      0,
      ...chart.nodes.map((n) => n.position.x + (Number(n.style?.width) || 248)),
    ),
    maxY = Math.max(
      0,
      ...chart.nodes.map(
        (n) => n.position.y + (Number(n.style?.height) || 132),
      ),
    );
  return {
    x: panel.placement === "below" ? (anchor?.position.x ?? 0) : maxX + 72,
    y: panel.placement === "below" ? maxY + 72 : (anchor?.position.y ?? 0),
    width: 520,
    height: 110 + panel.entries.length * 48,
  };
}
export function normalizeSupplements(
  input: SupplementDocument,
): ChartSupplements {
  const result: ChartSupplements = {};
  for (const node of input.nodes) {
    for (const key of ["width", "height"] as const) {
      const value = node.style?.[key];
      if (
        value !== undefined &&
        (typeof value !== "number" ||
          !Number.isFinite(value) ||
          value <= 0 ||
          value > 50000)
      )
        throw Error(
          "Saved card sizes must be finite positive chart dimensions.",
        );
    }
    if (
      !Number.isFinite(node.position?.x) ||
      !Number.isFinite(node.position?.y)
    )
      throw Error("Saved card positions must use finite chart coordinates.");
  }

  if (input.sourceLayout !== undefined) {
    const layout = object(input.sourceLayout, "Source layout");
    const referenceUrl = text(
      layout.referenceUrl,
      "Source layout URL",
      2000,
      true,
    );
    if (!/^https:\/\//.test(referenceUrl))
      throw Error("Source layout needs an HTTPS reference.");
    if (
      typeof layout.width !== "number" ||
      typeof layout.height !== "number" ||
      !Number.isFinite(layout.width) ||
      !Number.isFinite(layout.height) ||
      layout.width < 120 ||
      layout.height < 80 ||
      layout.width > 50000 ||
      layout.height > 50000
    )
      throw Error("Source layout dimensions are invalid.");
    const capturedAt = text(layout.capturedAt, "Layout capture date", 40, true);
    if (!Number.isFinite(Date.parse(capturedAt)))
      throw Error("Layout capture date is invalid.");
    result.sourceLayout = {
      referenceUrl,
      sourceLocator: text(
        layout.sourceLocator,
        "Source layout locator",
        2000,
        true,
      ),
      capturedAt,
      width: layout.width,
      height: layout.height,
    };
  }
  for (const edge of input.edges ?? [])
    if (edge.data?.sourceRoute) {
      const r = object(edge.data.sourceRoute, "Source connector");
      bounds(r.sourceBounds);
      bounds(r.targetBounds);
      if (
        !Array.isArray(r.points) ||
        r.points.length < 2 ||
        r.points.length > 100
      )
        throw Error("Source connectors need 2–100 points.");
      for (let i = 0; i < r.points.length; i++) {
        const v = object(r.points[i], "Source connector point");
        if (
          typeof v.x !== "number" ||
          typeof v.y !== "number" ||
          !Number.isFinite(v.x) ||
          !Number.isFinite(v.y) ||
          Math.abs(v.x) > 50000 ||
          Math.abs(v.y) > 50000
        )
          throw Error("Source connector coordinates are invalid.");
        if (
          i &&
          Math.abs(v.x - (r.points[i - 1] as { x: number }).x) > 0.5 &&
          Math.abs(v.y - (r.points[i - 1] as { y: number }).y) > 0.5
        )
          throw Error(
            "Source connector segments must be horizontal or vertical.",
          );
      }
    }
  if (input.supportPanels !== undefined) {
    if (!Array.isArray(input.supportPanels) || input.supportPanels.length > 20)
      throw Error("A chart supports up to 20 support panels.");
    const unitIds = new Set(input.nodes.map((n) => n.id)),
      ids = new Set<string>();
    let entries = 0;
    result.supportPanels = input.supportPanels.map((raw) => {
      const p = object(raw, "Support panel"),
        id = text(p.id, "Panel ID", 160, true);
      if (ids.has(id) || unitIds.has(id))
        throw Error("Support panel IDs must be unique.");
      ids.add(id);
      const anchorUnitId = text(
        p.anchorUnitId,
        "Supported organization",
        200,
        true,
      );
      if (!unitIds.has(anchorUnitId))
        throw Error("A support panel must refer to an existing organization.");
      if (!Array.isArray(p.entries) || p.entries.length > 200)
        throw Error("A panel supports up to 200 assignments.");
      entries += p.entries.length;
      if (entries > 2000)
        throw Error("A chart supports up to 2,000 support assignments.");
      let connector: SupportPanel["connector"];
      if (p.connector !== undefined) {
        const c = object(p.connector, "Support connector");
        if (
          !Array.isArray(c.points) ||
          c.points.length < 2 ||
          c.points.length > 100
        )
          throw Error("Support connector needs 2–100 points.");
        const points = c.points.map((v) => {
          const point = object(v, "Support connector point");
          if (
            typeof point.x !== "number" ||
            typeof point.y !== "number" ||
            !Number.isFinite(point.x) ||
            !Number.isFinite(point.y) ||
            Math.abs(point.x) > 50000 ||
            Math.abs(point.y) > 50000
          )
            throw Error("Support connector coordinates are invalid.");
          return { x: point.x, y: point.y };
        });
        if (
          points.some(
            (p, i) =>
              i > 0 &&
              Math.abs(p.x - points[i - 1].x) > 0.5 &&
              Math.abs(p.y - points[i - 1].y) > 0.5,
          )
        )
          throw Error("Support connectors must be orthogonal.");
        connector = {
          points,
          style: choice(
            c.style,
            ["solid", "dashed"] as const,
            "solid",
            "Connector style",
          ),
        };
      }
      return {
        ...(p.geometry !== undefined ? { geometry: bounds(p.geometry) } : {}),
        ...(connector ? { connector } : {}),
        id,
        title: text(p.title, "Panel title", 160, true),
        anchorUnitId,
        kind: choice(
          p.kind,
          ["matrix_support", "advisory", "shared_services"] as const,
          "matrix_support",
          "Panel kind",
        ),
        placement: choice(
          p.placement,
          ["right", "below"] as const,
          "right",
          "Panel placement",
        ),
        ...provenance(p),
        entries: p.entries.map((rawEntry) => {
          const e = object(rawEntry, "Support assignment"),
            entryId = text(e.id, "Assignment ID", 160, true);
          if (ids.has(entryId) || unitIds.has(entryId))
            throw Error("Support assignment IDs must be unique.");
          ids.add(entryId);
          return {
            id: entryId,
            role: text(e.role, "Support role", 200, true),
            person: text(e.person, "Assigned person", 300),
            positionStatus: choice(
              e.positionStatus,
              ["filled", "acting", "vacant", "not_specified"] as const,
              "not_specified",
              "Position status",
            ),
            effectiveDate: text(e.effectiveDate, "Effective date", 160),
            ...provenance(e),
          };
        }),
      };
    });
  }
  if (input.sourceChecks !== undefined) {
    if (!Array.isArray(input.sourceChecks) || input.sourceChecks.length > 2000)
      throw Error("A chart supports up to 2,000 recorded source checks.");
    const ids = new Set<string>();
    result.sourceChecks = input.sourceChecks.map((raw) => {
      const c = object(raw, "Source check"),
        id = text(c.id, "Check ID", 160, true);
      if (ids.has(id)) throw Error("Source check IDs must be unique.");
      ids.add(id);
      const checkedAt = text(c.checkedAt, "Check timestamp", 40, true);
      if (!Number.isFinite(Date.parse(checkedAt)))
        throw Error("Check timestamp is invalid.");
      const sourceUrl = text(c.sourceUrl, "Source URL", 2000, true);
      let url: URL;
      try {
        url = new URL(sourceUrl);
      } catch {
        throw Error("Use an absolute HTTPS source URL.");
      }
      if (url.protocol !== "https:" || url.username || url.password)
        throw Error("Use an absolute HTTPS source URL without credentials.");
      const contentFingerprint = text(
        c.contentFingerprint,
        "Content fingerprint",
        64,
        true,
      );
      if (!/^[a-f0-9]{64}$/.test(contentFingerprint))
        throw Error("Content fingerprint is invalid.");
      return {
        id,
        checkedAt,
        sourceUrl,
        contentFingerprint,
        checkedBy: text(c.checkedBy, "Checked by", 160, true),
        sourceLocator: text(c.sourceLocator, "Source locator", 2000, true),
        sourceRevision: text(c.sourceRevision, "Source revision", 300),
        reviewerType: choice(
          c.reviewerType,
          ["ai", "human"] as const,
          "ai",
          "Reviewer type",
        ),
        result: choice(
          c.result,
          ["matches", "differences", "unavailable"] as const,
          "differences",
          "Check result",
        ),
        scope: choice(
          c.scope,
          ["full_chart", "hierarchy_only"] as const,
          "full_chart",
          "Check scope",
        ),
        findings: text(c.findings, "Findings", 5000, true),
      };
    });
  }
  return result;
}
export function supportReviewCount(chart: ChartSupplements): number {
  return (chart.supportPanels ?? []).reduce(
    (n, p) =>
      n +
      (p.sourceCertainty === "needs_review" ? 1 : 0) +
      p.entries.filter((e) => e.sourceCertainty === "needs_review").length,
    0,
  );
}
export function supportSearchText(chart: ChartSupplements): string {
  return (chart.supportPanels ?? [])
    .flatMap((p) => [p.title, ...p.entries.flatMap((e) => [e.role, e.person])])
    .join(" ");
}
export async function contentFingerprint(
  chart: Pick<ChartDocument, "name" | "nodes" | "edges"> & ChartSupplements,
  scope: SourceCheck["scope"] = "full_chart",
): Promise<string> {
  const facts = {
    name: chart.name,
    nodes: chart.nodes
      .map((n) => ({
        id: n.id,
        ...Object.fromEntries(
          [
            "name",
            "shortName",
            "type",
            "positionTitle",
            "assignmentLabel",
            "positionStatus",
            "effectiveDate",
            "planningState",
            "publicationVisibility",
          ].map((k) => [k, n.data.unit[k as keyof typeof n.data.unit] ?? ""]),
        ),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: chart.edges
      .map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.data?.relationshipType ?? "primary supervisory",
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    panels:
      scope === "hierarchy_only"
        ? []
        : (chart.supportPanels ?? [])
            .map((p) => ({
              id: p.id,
              title: p.title,
              kind: p.kind,
              anchor: p.anchorUnitId,
              visibility: p.publicationVisibility,
              entries: p.entries
                .map((e) => ({
                  id: e.id,
                  role: e.role,
                  person: e.person,
                  status: e.positionStatus,
                  effectiveDate: e.effectiveDate,
                  visibility: e.publicationVisibility,
                }))
                .sort((a, b) => a.id.localeCompare(b.id)),
            }))
            .sort((a, b) => a.id.localeCompare(b.id)),
  };
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(facts)),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function currentSourceChecks(chart: ChartDocument) {
  const full = await contentFingerprint(chart),
    hierarchy = await contentFingerprint(chart, "hierarchy_only");
  return (chart.sourceChecks ?? []).map((c) => ({
    ...c,
    stale:
      c.contentFingerprint !== (c.scope === "full_chart" ? full : hierarchy),
  }));
}
/** Hide internal panels/assignments and all person labels for public output. */
export function audienceSupportPanels(
  chart: Pick<ChartDocument, "nodes"> & ChartSupplements,
  audience: "internal" | "public",
): SupportPanel[] {
  const anchors = new Set(
    chart.nodes
      .filter(
        (n) =>
          audience === "internal" ||
          n.data.unit.publicationVisibility === "public",
      )
      .map((n) => n.id),
  );
  return (chart.supportPanels ?? [])
    .filter(
      (p) =>
        anchors.has(p.anchorUnitId) &&
        (audience === "internal" || p.publicationVisibility === "public"),
    )
    .map((p) => ({
      ...p,
      entries: p.entries
        .filter(
          (e) =>
            audience === "internal" || e.publicationVisibility === "public",
        )
        .map((e) => ({
          ...e,
          person: audience === "public" ? "" : e.person,
          source: audience === "public" ? "" : e.source,
          sourceLocator: audience === "public" ? "" : e.sourceLocator,
          reviewNote: audience === "public" ? "" : e.reviewNote,
        })),
    }));
}
