"use client";
import { studioRequest } from "../runtime/request";
import { OfficialCardDrawing } from "./official-card";
import {officialSupport,officialScale,officialAssignment,type ChartAppearance} from "../lib/chart-appearance";
import { useState, useEffect, useRef } from "react";
import type { ChartDocument } from "../lib/chart-library";
import {
  currentSourceChecks,
  panelGeometry,
  type SupportPanel,
  type SourceCheck,
  type SupportAssignment,
} from "../lib/chart-supplements";
const emptyAssignment = (): SupportAssignment => ({
  id: `support-${crypto.randomUUID()}`,
  role: "",
  person: "",
  positionStatus: "not_specified",
  effectiveDate: "",
  publicationVisibility: "internal",
  source: "",
  sourceLocator: "",
  sourceCertainty: "needs_review",
  reviewNote: "",
});
export function SupportPanelsCanvas({
  chart,
  compact = false,
  appearance = "official",
}: {
  chart: ChartDocument;
  compact?: boolean;
  appearance?:ChartAppearance;
}) {
  return (
    <>
      {(chart.supportPanels ?? []).map((p, index) => {
        const g = panelGeometry(
          compact ? { ...p, geometry: undefined, placement: "below" } : p,
          chart,
        );
        if (compact) g.y += index * (g.height + 32);
        return (
          <div key={p.id}>
            {!compact && p.connector ? (
              <svg
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  width: 1,
                  height: 1,
                  overflow: "visible",
                  pointerEvents: "none",
                }}
                aria-hidden="true"
              >
                <polyline
                  points={p.connector.points
                    .map((point) => `${point.x},${point.y}`)
                    .join(" ")}
                  fill="none"
                  stroke={appearance === "official" ? "#595959" : "#65756b"}
                  strokeWidth={appearance === "official" ? (chart.sourceLayout?.width??960)/960*1.5 : 1.5}
                  strokeDasharray={
                    p.connector.style === "dashed" ? "6 4" : undefined
                  }
                />
              </svg>
            ) : null}
            <article
              className={`support-panel-canvas nodrag nopan ${appearance === "official" ? "is-official" : ""}`}
              style={{
                position: "absolute",
                left: g.x,
                top: g.y,
                width: g.width,
                height: g.height,
                overflow: "auto",
              }}
              aria-label={`${p.title}, support assignments. ${p.entries.map(e=>`${e.role}: ${officialAssignment({assignmentLabel:e.person,positionStatus:e.positionStatus})}`).join("; ")}`}
            >
              {appearance === "official" ? <OfficialCardDrawing card={officialSupport(p.title,p.entries,g.width,g.height,officialScale(compact?undefined:chart.sourceLayout?.width,g.width))} width={g.width} height={g.height}/> : <>
              <header>
                <h3>{p.title}</h3>
                <span>
                  Support for{" "}
                  {chart.nodes.find((n) => n.id === p.anchorUnitId)?.data.unit
                    .shortName ?? chart.name}
                </span>
              </header>
              <dl>
                {p.entries.map((e) => (
                  <div key={e.id}>
                    <dt>{e.role}</dt>
                    <dd>
                      {e.person || "Not specified"}
                      {e.positionStatus === "acting"
                        ? " · Interim"
                        : e.positionStatus === "vacant"
                          ? " · Vacant"
                          : ""}
                    </dd>
                  </div>
                ))}
              </dl>
              </>}
              {!p.geometry ? (
                <small>Source position has not been captured.</small>
              ) : null}
            </article>
          </div>
        );
      })}
    </>
  );
}
export function SupportPanelsEditor({
  chart,
  disabled,
  onSaved,
}: {
  chart: ChartDocument;
  disabled: boolean;
  onSaved: (chart: ChartDocument) => void;
}) {
  const [editing, setEditing] = useState(false),
    [panels, setPanels] = useState<SupportPanel[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const base = useRef(chart);
  function begin() {
    base.current = chart;
    setPanels(structuredClone(chart.supportPanels ?? []));
    setEditing(true);
    setError("");
  }
  const patch = (id: string, data: Partial<SupportPanel>) =>
    setPanels((ps) => ps.map((p) => (p.id === id ? { ...p, ...data } : p)));
  const entryPatch = (
    panel: SupportPanel,
    id: string,
    data: Partial<SupportAssignment>,
  ) =>
    patch(panel.id, {
      entries: panel.entries.map((e) => (e.id === id ? { ...e, ...data } : e)),
    });
  async function save() {
    if (chart.updatedAt !== base.current.updatedAt) {
      setError(
        "This chart changed while the panel editor was open. Your input is retained; compare it with the newer saved chart before reopening the editor.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await studioRequest("/api/charts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          chart: {
            ...base.current,
            supportPanels: panels,
            status:
              base.current.status === "current" ? "draft" : base.current.status,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await response.json()) as {
        error?: string;
        chart: ChartDocument;
      };
      if (!response.ok)
        throw Error(data.error || "Support panels could not be saved.");
      onSaved(data.chart);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="supplement-editor">
      <div className="supplement-toolbar">
        <strong>Support panels · {chart.supportPanels?.length ?? 0}</strong>
        <button
          type="button"
          className="button button--secondary"
          disabled={disabled || busy}
          onClick={begin}
        >
          Edit support panels
        </button>
      </div>
      {editing ? (
        <div
          role="dialog"
          aria-label="Edit support panels"
          className="support-panel-editor"
        >
          <h2>Support panels</h2>
          <p>
            Keep support assignments alongside the hierarchy. Positions use the
            same chart coordinates as the organizational cards. Capture the
            official slide’s geometry to preserve its arrangement.
          </p>
          {panels.map((p) => (
            <fieldset key={p.id}>
              <legend>{p.title || "New support panel"}</legend>
              <label>
                Panel title
                <input
                  value={p.title}
                  onChange={(e) => patch(p.id, { title: e.target.value })}
                  maxLength={160}
                />
              </label>
              <label>
                Supports organization
                <select
                  value={p.anchorUnitId}
                  onChange={(e) =>
                    patch(p.id, { anchorUnitId: e.target.value })
                  }
                >
                  {chart.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.data.unit.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kind
                <select
                  value={p.kind}
                  onChange={(e) =>
                    patch(p.id, {
                      kind: e.target.value as SupportPanel["kind"],
                    })
                  }
                >
                  <option value="matrix_support">Matrix support</option>
                  <option value="advisory">Advisory</option>
                  <option value="shared_services">Shared services</option>
                </select>
              </label>
              <label>
                Source / provenance
                <input
                  value={p.source}
                  onChange={(e) => patch(p.id, { source: e.target.value })}
                />
              </label>
              <label>
                Source location
                <input
                  value={p.sourceLocator}
                  onChange={(e) =>
                    patch(p.id, { sourceLocator: e.target.value })
                  }
                />
              </label>
              <label>
                Panel review
                <select
                  value={p.sourceCertainty}
                  onChange={(e) =>
                    patch(p.id, {
                      sourceCertainty: e.target
                        .value as SupportPanel["sourceCertainty"],
                    })
                  }
                >
                  <option value="needs_review">Needs review</option>
                  <option value="confirmed">Confirmed against source</option>
                  <option value="inferred">Inferred</option>
                </select>
              </label>
              <label>
                Panel visibility
                <select
                  value={p.publicationVisibility}
                  onChange={(e) =>
                    patch(p.id, {
                      publicationVisibility: e.target
                        .value as SupportPanel["publicationVisibility"],
                    })
                  }
                >
                  <option value="internal">Internal</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label>
                Panel review note
                <textarea
                  value={p.reviewNote}
                  onChange={(e) => patch(p.id, { reviewNote: e.target.value })}
                />
              </label>
              <details>
                <summary>Position and size</summary>
                <div className="support-geometry">
                  {(["x", "y", "width", "height"] as const).map((k) => (
                    <label key={k}>
                      {k}
                      <input
                        type="number"
                        value={panelGeometry(p, chart)[k]}
                        onChange={(e) =>
                          patch(p.id, {
                            geometry: {
                              ...panelGeometry(p, chart),
                              [k]: Number(e.target.value),
                            },
                            connector: undefined,
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </details>
              <table>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Person</th>
                    <th>Status</th>
                    <th>Evidence / review</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {p.entries.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <input
                          aria-label="Support role"
                          value={e.role}
                          onChange={(v) =>
                            entryPatch(p, e.id, { role: v.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label="Support person"
                          value={e.person}
                          onChange={(v) =>
                            entryPatch(p, e.id, { person: v.target.value })
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label="Support assignment status"
                          value={e.positionStatus}
                          onChange={(v) =>
                            entryPatch(p, e.id, {
                              positionStatus: v.target
                                .value as SupportAssignment["positionStatus"],
                            })
                          }
                        >
                          {["filled", "acting", "vacant", "not_specified"].map(
                            (v) => (
                              <option key={v}>{v}</option>
                            ),
                          )}
                        </select>
                      </td>
                      <td>
                        <details>
                          <summary>
                            {e.sourceCertainty.replaceAll("_", " ")}
                          </summary>
                          <label>
                            Source
                            <input
                              value={e.source}
                              onChange={(v) =>
                                entryPatch(p, e.id, { source: v.target.value })
                              }
                            />
                          </label>
                          <label>
                            Source location
                            <input
                              value={e.sourceLocator}
                              onChange={(v) =>
                                entryPatch(p, e.id, {
                                  sourceLocator: v.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Review
                            <select
                              value={e.sourceCertainty}
                              onChange={(v) =>
                                entryPatch(p, e.id, {
                                  sourceCertainty: v.target
                                    .value as SupportAssignment["sourceCertainty"],
                                })
                              }
                            >
                              {["needs_review", "confirmed", "inferred"].map(
                                (v) => (
                                  <option key={v}>{v}</option>
                                ),
                              )}
                            </select>
                          </label>
                          <label>
                            Note
                            <textarea
                              value={e.reviewNote}
                              onChange={(v) =>
                                entryPatch(p, e.id, {
                                  reviewNote: v.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Effective date
                            <input
                              value={e.effectiveDate}
                              onChange={(v) =>
                                entryPatch(p, e.id, {
                                  effectiveDate: v.target.value,
                                })
                              }
                            />
                          </label>
                          <label>
                            Visibility
                            <select
                              value={e.publicationVisibility}
                              onChange={(v) =>
                                entryPatch(p, e.id, {
                                  publicationVisibility: v.target
                                    .value as SupportAssignment["publicationVisibility"],
                                })
                              }
                            >
                              <option>internal</option>
                              <option>public</option>
                            </select>
                          </label>
                        </details>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() =>
                            patch(p.id, {
                              entries: p.entries.filter((v) => v.id !== e.id),
                            })
                          }
                        >
                          Remove assignment
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={() =>
                  patch(p.id, { entries: [...p.entries, emptyAssignment()] })
                }
              >
                Add support assignment
              </button>
              <button
                type="button"
                onClick={() =>
                  setPanels((ps) => ps.filter((v) => v.id !== p.id))
                }
              >
                Remove panel
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              setPanels((ps) => [
                ...ps,
                {
                  id: `panel-${crypto.randomUUID()}`,
                  title: "Matrix Support",
                  kind: "matrix_support",
                  anchorUnitId: chart.nodes[0]?.id ?? "",
                  placement: "below",
                  publicationVisibility: "internal",
                  source: "",
                  sourceLocator: "",
                  sourceCertainty: "needs_review",
                  reviewNote: "",
                  entries: [emptyAssignment()],
                },
              ])
            }
          >
            Add support panel
          </button>
          {error ? <p role="alert">{error}</p> : null}
          <footer>
            <button
              type="button"
              className="button button--primary"
              disabled={busy || disabled}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save support panels"}
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
export function SourceChecks({
  chart,
  disabled,
  onSaved,
}: {
  chart: ChartDocument;
  disabled: boolean;
  onSaved: (chart: ChartDocument) => void;
}) {
  const [checks, setChecks] = useState<(SourceCheck & { stale: boolean })[]>(
      [],
    ),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void currentSourceChecks(chart).then((v) => {
      if (!cancelled) setChecks(v);
    });
    return () => {
      cancelled = true;
    };
  }, [chart]);
  async function record(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await studioRequest("/api/charts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "record_source_check",
          chartId: chart.id,
          expectedVersion: chart.version,
          expectedUpdatedAt: chart.updatedAt,
          sourceCheck: {
            checkedBy: String(form.get("checkedBy")),
            reviewerType: "human",
            result: String(form.get("result")),
            scope: String(form.get("scope")),
            sourceUrl: String(form.get("sourceUrl")),
            sourceLocator: String(form.get("sourceLocator")),
            sourceRevision: String(form.get("sourceRevision")),
            findings: String(form.get("findings")),
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
      const data = (await response.json()) as {
        error?: string;
        chart: ChartDocument;
      };
      if (!response.ok)
        throw Error(data.error || "Source check could not be saved.");
      onSaved(data.chart);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }
  const latest = (type: "ai" | "human") =>
    checks.filter((c) => c.reviewerType === type && !c.stale).at(-1);
  return (
    <section
      className="source-check-records"
      aria-label="Source comparison records"
    >
      <h2>Source comparisons</h2>
      <p>
        AI comparison: <strong>{latest("ai")?.result ?? "Not recorded"}</strong>{" "}
        · Human comparison:{" "}
        <strong>{latest("human")?.result ?? "Awaiting review"}</strong>. Current
        designation remains separate.
      </p>
      <button
        type="button"
        disabled={disabled || busy}
        onClick={() => setOpen((v) => !v)}
      >
        Record human source comparison
      </button>
      {open ? (
        <form onSubmit={record}>
          <label>
            Reviewed by
            <input name="checkedBy" required maxLength={160} />
          </label>
          <label>
            Source URL
            <input
              name="sourceUrl"
              type="url"
              required
              defaultValue={chart.sourceLayout?.referenceUrl ?? ""}
            />
          </label>
          <label>
            Source location
            <input
              name="sourceLocator"
              required
              placeholder="Slide, page, shape or source section"
            />
          </label>
          <label>
            Source revision (if known)
            <input name="sourceRevision" />
          </label>
          <label>
            Scope
            <select name="scope">
              <option value="full_chart">Hierarchy and support content</option>
              <option value="hierarchy_only">Hierarchy only</option>
            </select>
          </label>
          <label>
            Result
            <select name="result">
              <option value="matches">Matches source</option>
              <option value="differences">Differences / omissions</option>
              <option value="unavailable">Source unavailable</option>
            </select>
          </label>
          <label>
            Evidence and findings
            <textarea name="findings" required maxLength={5000} />
          </label>
          <button className="button button--primary" disabled={busy}>
            {busy ? "Saving…" : "Save human comparison"}
          </button>
        </form>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <ol>
        {checks
          .slice()
          .reverse()
          .map((c) => (
            <li key={c.id}>
              <strong>
                {c.reviewerType === "ai" ? "AI check" : "Human comparison"} ·{" "}
                {c.result}
                {c.stale ? " · Content changed since check" : ""}
              </strong>
              <span>
                {c.checkedBy} · {new Date(c.checkedAt).toLocaleString()} ·{" "}
                {c.scope === "full_chart" ? "Full chart" : "Hierarchy only"}
              </span>
              <a href={c.sourceUrl} target="_blank" rel="noreferrer">
                {c.sourceLocator}
              </a>
              <p>{c.findings}</p>
            </li>
          ))}
      </ol>
    </section>
  );
}

export function SourceCheckProgress({ charts }: { charts: ChartDocument[] }) {
  const [counts, setCounts] = useState({
    matches: 0,
    differences: 0,
    checked: 0,
  });
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      charts
        .filter((c) => c.status !== "archived" && c.sourceChecks?.length)
        .map(async (c) =>
          (await currentSourceChecks(c))
            .filter(
              (r) =>
                r.reviewerType === "ai" && !r.stale && r.scope === "full_chart",
            )
            .at(-1),
        ),
    ).then((rows) => {
      if (!cancelled)
        setCounts({
          checked: rows.filter(Boolean).length,
          matches: rows.filter((r) => r?.result === "matches").length,
          differences: rows.filter((r) => r && r.result !== "matches").length,
        });
    });
    return () => {
      cancelled = true;
    };
  }, [charts]);
  const total = charts.filter((c) => c.status !== "archived").length;
  const summary = `AI comparisons: ${counts.matches} match · ${counts.differences} need attention. ${total - counts.checked} not checked against current content`;
  return (
    <p className="source-check-progress" aria-label={summary} title={summary}>
      <span className="source-check-progress__full" aria-hidden="true">
        AI comparisons: {counts.matches} match · {counts.differences} need attention
        <br />{total - counts.checked} not checked against current content
      </span>
      <span className="source-check-progress__compact" aria-hidden="true">
        AI<br />{counts.checked}/{total}
      </span>
    </p>
  );
}

export function SupplementHistoryDetails({ chart }: { chart: ChartDocument }) {
  return (
    <section aria-label="Historical support and source evidence">
      {chart.sourceLayout ? (
        <p>
          Saved source arrangement:{" "}
          <a
            href={chart.sourceLayout.referenceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {chart.sourceLayout.sourceLocator}
          </a>{" "}
          · captured {new Date(chart.sourceLayout.capturedAt).toLocaleString()}
        </p>
      ) : null}
      {(chart.supportPanels ?? []).map((p) => (
        <div key={p.id}>
          <h3>{p.title} · support assignments</h3>
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Person</th>
                <th>Source evidence</th>
              </tr>
            </thead>
            <tbody>
              {p.entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.role}</td>
                  <td>
                    {e.person}{" "}
                    {e.positionStatus === "acting" ? "(Interim)" : ""}
                  </td>
                  <td>
                    {e.sourceLocator || p.sourceLocator} · {e.sourceCertainty}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {chart.sourceChecks?.length ? (
        <details>
          <summary>
            Recorded source comparisons ({chart.sourceChecks.length})
          </summary>
          {chart.sourceChecks.map((c) => (
            <p key={c.id}>
              {c.reviewerType === "ai" ? "AI" : "Human"} · {c.checkedBy} ·{" "}
              {new Date(c.checkedAt).toLocaleString()} · {c.result} ·{" "}
              {c.findings}
            </p>
          ))}
        </details>
      ) : null}
    </section>
  );
}
