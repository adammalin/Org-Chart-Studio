"use client";
import { HistoryQuestions } from "./history-questions";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChartDocument } from "../lib/chart-library";
import type {
  CheckpointSummary,
  HistoryCheckpoint,
  MonthlyUpdate,
} from "../lib/chart-history";
import { diffChartDocuments } from "../lib/ai-change-review";
import { compareChartDocuments } from "../lib/chart-governance";
import { searchText } from "../lib/library-navigation";
export function HistoryTimeline({
  charts,
  initialQuery = "",
}: {
  charts: ChartDocument[];
  initialQuery?: string;
}) {
  const [items, setItems] = useState<CheckpointSummary[]>([]),
    [batches, setBatches] = useState<MonthlyUpdate[]>([]),
    [months, setMonths] = useState<string[]>([]),
    [month, setMonth] = useState(""),
    [chartId, setChartId] = useState(""),
    [query, setQuery] = useState(initialQuery),
    [through, setThrough] = useState(""),
    [selected, setSelected] = useState<HistoryCheckpoint | null>(null),
    [compare, setCompare] = useState<HistoryCheckpoint | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [updateMonth, setUpdateMonth] = useState(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  const load = useCallback(async () => {
    try {
      const q = new URLSearchParams({
        month,
        chartId,
        q: query,
        through: through
          ? new Date(through + "T23:59:59.999").toISOString()
          : "",
      });
      const r = await fetch("/api/history?" + q, { cache: "no-store" }),
        d = (await r.json()) as {
          error?: string;
          checkpoints: CheckpointSummary[];
          batches: MonthlyUpdate[];
          months: string[];
        };
      if (!r.ok) throw Error(d.error ?? "Request failed");
      setItems(d.checkpoints);
      setBatches(d.batches);
      setMonths(d.months);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "History unavailable.");
    }
  }, [month, chartId, query, through]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [load]);
  const open = batches.find((b) => b.status === "open");
  async function read(id: string, comparison = false) {
    if (!id) {
      setCompare(null);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(
          "/api/history?checkpointId=" + encodeURIComponent(id),
        ),
        d = (await r.json()) as {
          error?: string;
          checkpoint: HistoryCheckpoint;
        };
      if (!r.ok) throw Error(d.error ?? "Request failed");
      if (comparison) setCompare(d.checkpoint);
      else {
        setSelected(d.checkpoint);
        setCompare(null);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Checkpoint unavailable.");
    } finally {
      setBusy(false);
    }
  }
  async function submit(form: HTMLFormElement, action: string) {
    setBusy(true);
    setMessage("");
    const f = new FormData(form);
    try {
      const r = await fetch("/api/history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            batchId: open?.id,
            month: updateMonth,
            label: f.get("label"),
            changeList: f.get("changeList"),
            effectiveDate: f.get("effectiveDate"),
            summary: f.get("summary"),
          }),
        }),
        d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error ?? "Request failed");
      setMessage(
        action === "begin"
          ? "Monthly update started. Previous states are preserved."
          : "Monthly checkpoint saved.",
      );
      form.reset();
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Monthly update failed.");
    } finally {
      setBusy(false);
    }
  }
  const target =
      compare?.chart ?? charts.find((c) => c.id === selected?.chartId),
    diff = useMemo(
      () =>
        selected && target
          ? compareChartDocuments(selected.chart, target)
          : null,
      [selected, target],
    );
  const fieldChanges = useMemo(
    () =>
      selected && target
        ? diffChartDocuments(selected.chart, target).changes.filter(
            (c) => c.category !== "layout",
          )
        : [],
    [selected, target],
  );
  const records = selected?.chart.nodes.filter(
    (n) =>
      !query ||
      searchText(selected.chartName).includes(searchText(query)) ||
      [
        n.data.unit.name,
        n.data.unit.assignmentLabel,
        n.data.unit.positionTitle,
      ].some((v) => searchText(v || "").includes(searchText(query))),
  );
  return (
    <section className="timeline-panel" aria-labelledby="timeline-title">
      <HistoryQuestions charts={charts} onView={id=>void read(id)}/>
      <h2 id="timeline-title">Historical timeline</h2>
      <p>
        Recorded states are preserved before and after updates. Checkpoint dates
        show when the state was recorded; effective dates appear only when
        supplied.
      </p>
      <div className="timeline-filters">
        <label>
          Month
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Organization
          <select value={chartId} onChange={(e) => setChartId(e.target.value)}>
            <option value="">Entire library</option>
            {charts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Recorded on or before
          <input
            type="date"
            value={through}
            onChange={(e) => setThrough(e.target.value)}
          />
        </label>
        <label>
          Search history
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Organization, person, or role"
          />
        </label>
        <button
          className="button button--secondary"
          onClick={() => void load()}
        >
          Refresh timeline
        </button>
      </div>
      <details className="monthly-update">
        <summary>
          {open ? `Open update: ${open.label}` : "Start a monthly update"}
        </summary>
        {open ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(e.currentTarget, "complete");
            }}
          >
            <p>
              {open.month} · {open.chartIds.length} charts · started{" "}
              {new Date(open.startedAt).toLocaleString()}
            </p>
            <pre>{open.changeList}</pre>
            <label>
              Completion summary
              <textarea name="summary" required maxLength={20000} />
            </label>
            <button className="button button--primary" disabled={busy}>
              Complete monthly update and save checkpoint
            </button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(e.currentTarget, "begin");
            }}
          >
            <p>
              Includes all active charts. Their previous states are saved before
              this batch begins. An AI agent can read the change list through
              MCP and prepare updates for review.
            </p>
            <label>
              Update month
              <input
                type="month"
                required
                value={updateMonth}
                onChange={(e) => setUpdateMonth(e.target.value)}
              />
            </label>
            <label>
              Label
              <input
                name="label"
                required
                maxLength={160}
                placeholder="November organizational updates"
              />
            </label>
            <label>
              Monthly change list
              <textarea name="changeList" required maxLength={20000} />
            </label>
            <label>
              Documented effective date (optional)
              <input type="date" name="effectiveDate" />
            </label>
            <button
              className="button button--primary"
              disabled={busy || !charts.some((c) => c.status !== "archived")}
            >
              Start update and preserve previous states
            </button>
          </form>
        )}
      </details>
      {message ? <p role="status">{message}</p> : null}
      <details>
        <summary>Monthly update log ({batches.length})</summary>
        {batches.map((b) => (
          <article key={b.id}>
            <strong>
              {b.month} · {b.label} · {b.status}
            </strong>
            <p>{b.summary || "Update in progress"}</p>
            <pre>{b.changeList}</pre>
          </article>
        ))}
      </details>
      <div className="timeline-layout">
        <div className="timeline-list" aria-label="Historical checkpoints">
          {items.length ? (
            items.map((h) => (
              <button
                key={h.id}
                type="button"
                className={h.id === selected?.id ? "is-selected" : ""}
                disabled={busy}
                onClick={() => void read(h.id)}
              >
                <strong>{h.chartName}</strong>
                <span>
                  {new Date(h.recordedAt).toLocaleString()} ·{" "}
                  {h.kind.replaceAll("_", " ")}
                </span>
                <small>{h.label}</small>
              </button>
            ))
          ) : (
            <p>No checkpoints match these filters.</p>
          )}
          {items.length === 2000 ? (
            <p>
              Showing 2,000 checkpoints. Narrow the month, organization, or
              search.
            </p>
          ) : null}
        </div>
        <div className="timeline-snapshot" aria-live="polite">
          {selected ? (
            <>
              <h3>{selected.chartName}</h3>
              <p>
                Read-only checkpoint ·{" "}
                {new Date(selected.recordedAt).toLocaleString()} ·{" "}
                {selected.chart.status}
              </p>
              <p>
                Update effective date:{" "}
                {selected.effectiveDate || "Not supplied"} · Source state saved{" "}
                {new Date(selected.sourceUpdatedAt).toLocaleString()}
              </p>
              <label>
                Compare with
                <select
                  value={compare?.id ?? ""}
                  onChange={(e) => void read(e.target.value, true)}
                >
                  <option value="">Current working chart</option>
                  {items
                    .filter(
                      (h) =>
                        h.chartId === selected.chartId && h.id !== selected.id,
                    )
                    .map((h) => (
                      <option key={h.id} value={h.id}>
                        {new Date(h.recordedAt).toLocaleString()} · {h.kind} ·{" "}
                        {h.label}
                      </option>
                    ))}
                </select>
              </label>
              {diff ? (
                <p>
                  Compared with{" "}
                  {compare ? "selected checkpoint" : "working chart"}:{" "}
                  {diff.addedNodeIds.length} added ·{" "}
                  {diff.changedNodeIds.length} changed ·{" "}
                  {diff.removedNodeIds.length} removed ·{" "}
                  {diff.addedEdgeIds.length} relationships added ·{" "}
                  {diff.changedEdgeIds.length} changed ·{" "}
                  {diff.removedEdgeIds.length} removed
                </p>
              ) : null}
              {fieldChanges.length ? (
                <details className="timeline-changes">
                  <summary>
                    View before-and-after changes ({fieldChanges.length})
                  </summary>
                  <div className="timeline-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Organization / relationship</th>
                          <th>Field</th>
                          <th>Selected checkpoint</th>
                          <th>Comparison state</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fieldChanges.map((c) => (
                          <tr key={c.id}>
                            <th>{c.entityLabel}</th>
                            <td>{c.fieldLabel}</td>
                            <td>{c.before ?? "Not present"}</td>
                            <td>{c.after ?? "Not present"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ) : null}
              <div className="timeline-table">
                <table>
                  <thead>
                    <tr>
                      <th>Organization</th>
                      <th>Person / assignment</th>
                      <th>Role</th>
                      <th>Effective date in source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records?.map((n) => (
                      <tr key={n.id}>
                        <td>{n.data.unit.name}</td>
                        <td>{n.data.unit.assignmentLabel}</td>
                        <td>{n.data.unit.positionTitle}</td>
                        <td>{n.data.unit.effectiveDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details>
                <summary>
                  Reporting relationships ({selected.chart.edges.length})
                </summary>
                {selected.chart.edges.map((e) => (
                  <p key={e.id}>
                    {
                      selected.chart.nodes.find((n) => n.id === e.source)?.data
                        .unit.name
                    }{" "}
                    →{" "}
                    {
                      selected.chart.nodes.find((n) => n.id === e.target)?.data
                        .unit.name
                    }{" "}
                    · {String(e.data?.relationshipType || "unspecified")}
                  </p>
                ))}
              </details>
            </>
          ) : (
            <p>
              Select a checkpoint to view its people, roles, and reporting
              relationships.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
