"use client";
import {remainingReviewSelection} from "../lib/monthly-progress";
import { useCallback, useEffect, useState } from "react";
import type { ChartDocument } from "../lib/chart-library";
import type { MonthlyUpdate } from "../lib/chart-history";
import type { AiChartProposal, AiChangeSummary } from "../lib/ai-change-review";
interface Row {
  chartId: string;
  name: string;
  status: string;
  version: number;
  sourceNotes: number;
  missingDates: number;
  sourceLocators: number;
  cards: number;
  changed: boolean;
  blockingIssues: number;
  pending: { id: string; chartName: string; summary: AiChangeSummary }[];
  lastCheckpoint: { id: string; recorded_at: string } | null;
}
interface Report {
  batch: MonthlyUpdate;
  rows: Row[];
  issues: { id: string; title: string }[];
  pendingCount: number;
  changedCharts: number;
  currentCharts: number;
  blockingIssues: number;
  outsideCharts: { id: string; name: string }[];
  decisions: { chart_id: string; status: string; change_count: number }[];
}
export function MonthlyWorkspace({
  charts,
  saveState,
  onRefresh,
  onOpen,
  onMarkCurrent,
}: {
  charts: ChartDocument[];
  saveState: string;
  onRefresh: () => Promise<void>;
  onOpen: (id: string) => void;
  onMarkCurrent: (chart: ChartDocument) => void;
}) {
  const [report, setReport] = useState<Report | null>(null),
    [batches, setBatches] = useState<MonthlyUpdate[]>([]),
    [batchId, setBatchId] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [details, setDetails] = useState<Record<string, AiChartProposal>>({}),
    [scope, setScope] = useState<Set<string>>(
      new Set(charts.filter((c) => c.status !== "archived").map((c) => c.id)),
    ),
    [progress, setProgress] = useState("");
  const load = useCallback(async () => {
    const r = await fetch(
        "/api/monthly-workspace?batchId=" + encodeURIComponent(batchId),
        { cache: "no-store" },
      ),
      d = (await r.json()) as {
        error?: string;
        report: Report | null;
        batches: MonthlyUpdate[];
      };
    if (!r.ok) throw Error(d.error || "Monthly updates unavailable.");
    setReport(d.report);
    setBatches(d.batches);
    setSelected(old=>remainingReviewSelection(old,d.report?.rows.flatMap(row=>row.pending.map(p=>p.id))??[]));
  }, [batchId]);
  const chartRevision = charts.map((c) => c.id + ":" + c.updatedAt).join("|");
  useEffect(() => {
    const timer = setTimeout(() => void load().catch((e) => setMessage(e.message)), 0);
    return () => clearTimeout(timer);
  }, [load, chartRevision]);
  useEffect(() => {
    if (report?.batch.status !== "open") return;
    const timer = setInterval(() => {
      if (!document.hidden) void load().catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [report?.batch.status, load]);
  const open = batches.find((b) => b.status === "open"),
    active = report?.batch.status === "open";
  async function post(path: string, body: unknown) {
    const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      d = (await r.json()) as { error?: string };
    if (!r.ok) throw Error(d.error || "The update could not be saved.");
    return d;
  }
  async function begin(form: HTMLFormElement) {
    setBusy(true);
    setMessage("");
    try {
      const f = new FormData(form);
      await post("/api/history", {
        action: "begin",
        month: f.get("month"),
        label: f.get("label"),
        changeList: f.get("changeList"),
        effectiveDate: f.get("effectiveDate"),
        chartIds: [...scope],
      });
      setBatchId("");
      await load();
      setMessage("Update started. Previous states are preserved.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function review(id: string) {
    setBusy(true);
    try {
      const r = await fetch(
          "/api/ai-proposals?proposalId=" + encodeURIComponent(id),
        ),
        d = (await r.json()) as { error?: string; proposal: AiChartProposal };
      if (!r.ok) throw Error(d.error);
      setDetails((old) => ({ ...old, [id]: d.proposal }));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: "accept" | "reject") {
    if (!report || saveState !== "saved") return;
    const ids = [...selected];
    setBusy(true);
    setMessage("");
    let done = 0;
    try {
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10);
        setProgress(
          `${decision === "accept" ? "Applying" : "Rejecting"} ${done + 1}–${done + chunk.length} of ${ids.length}`,
        );
        await post("/api/monthly-workspace", {
          action: "review_batch",
          batchId: report.batch.id,
          proposalIds: chunk,
          decision,
        });
        done += chunk.length;
        setSelected(
          (old) => new Set([...old].filter((id) => !chunk.includes(id))),
        );
        await load();
      }
      await onRefresh();
      setMessage(
        `${done} proposal decisions saved with their checkpoints. Source flags remain attached.`,
      );
    } catch (e) {
      await onRefresh();
      await load();
      setMessage(
        `Saved progress has been refreshed. ${(e as Error).message} Completed decisions remain saved; remaining reviews can be retried.`,
      );
    } finally {
      setProgress("");
      setBusy(false);
    }
  }
  async function complete(form: HTMLFormElement) {
    if (!report) return;
    setBusy(true);
    try {
      const f = new FormData(form);
      await post("/api/history", {
        action: "complete",
        batchId: report.batch.id,
        summary: f.get("summary"),
      });
      await load();
      setMessage("Monthly update completed. Final dated states are preserved.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function handoff() {
    if (!report) return;
    const text = `Monthly OrgChart Studio update: ${report.batch.label}\nMonth: ${report.batch.month}\nBatch ID: ${report.batch.id}\nChart IDs: ${report.batch.chartIds.join(", ")}\n\nRequested changes:\n${report.batch.changeList}\n\nUse the OrgChart Studio MCP connection. Read list_monthly_updates and current charts, check related records and source evidence, and stage reviewed proposals. Do not invent facts or clear source notes. The batch already preserves previous states. Resolve reviews before completing the batch; do not designate Current without the user's accountable decision.`;
    void navigator.clipboard
      .writeText(text)
      .then(() =>
        setMessage(
          "AI handoff copied. Paste it into your approved agent session.",
        ),
      )
      .catch(() =>
        setMessage(
          "Clipboard unavailable. The change list remains visible below.",
        ),
      );
  }
  function download() {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `orgchart-monthly-${report.batch.month}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="monthly-workspace">
      <h1>Monthly update workspace</h1>
      <p>
        Preserve the starting state, review related changes, designate charts
        when appropriate, and finish with a dated checkpoint. Open updates and
        completed decisions survive interruptions.
      </p>
      <div className="workflow-filters">
        <label>
          Update
          <select
            value={report?.batch.id ?? ""}
            onChange={(e) => {
              setBatchId(e.target.value);
              setSelected(new Set());
              setDetails({});
            }}
          >
            <option value="">Choose an update</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.month} · {b.label} · {b.status}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button button--secondary"
          disabled={busy}
          onClick={() => void load().catch((e) => setMessage(e.message))}
        >
          Refresh checks
        </button>
      </div>
      {!open ? (
        <details className="monthly-update" open={!report}>
          <summary>Start a monthly update</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void begin(e.currentTarget);
            }}
          >
            <label>
              Month
              <input
                type="month"
                name="month"
                required
                defaultValue={(() => {
                  const d = new Date();
                  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                })()}
              />
            </label>
            <label>
              Update label
              <input name="label" required maxLength={160} />
            </label>
            <label>
              Change list
              <textarea name="changeList" required maxLength={20000} />
            </label>
            <label>
              Documented effective date (optional)
              <input type="date" name="effectiveDate" />
            </label>
            <fieldset>
              <legend>Included active charts ({scope.size})</legend>
              <button
                type="button"
                onClick={() =>
                  setScope(
                    new Set(
                      charts
                        .filter((c) => c.status !== "archived")
                        .map((c) => c.id),
                    ),
                  )
                }
              >
                Select active charts
              </button>
              <button type="button" onClick={() => setScope(new Set())}>
                Clear selection
              </button>
              <div className="monthly-scope">
                {charts
                  .filter((c) => c.status !== "archived")
                  .map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        checked={scope.has(c.id)}
                        onChange={(e) =>
                          setScope((old) => {
                            const n = new Set(old);
                            if (e.target.checked) n.add(c.id); else n.delete(c.id);
                            return n;
                          })
                        }
                      />
                      {c.name}
                    </label>
                  ))}
              </div>
            </fieldset>
            <button
              className="button button--primary"
              disabled={busy || !scope.size || saveState !== "saved"}
            >
              Start and preserve previous states
            </button>
          </form>
        </details>
      ) : report?.batch.id !== open.id ? (
        <button
          className="button button--primary"
          onClick={() => setBatchId(open.id)}
        >
          Resume open update: {open.label}
        </button>
      ) : null}
      {message ? (
        <p role="status" className="workflow-message">
          {message}
        </p>
      ) : null}
      {progress ? <p role="status">{progress}</p> : null}
      {report ? (
        <>
          <ol className="monthly-steps">
            <li>1. Starting states preserved</li>
            <li>2. Review changes ({report.pendingCount} pending)</li>
            <li>
              3. Current designation ({report.currentCharts}/
              {report.rows.length})
            </li>
            <li>
              4.{" "}
              {active
                ? "Save final checkpoint"
                : "Completed checkpoint available"}
            </li>
          </ol>
          <h2>
            {report.batch.month} · {report.batch.label}
          </h2>
          <p>
            {report.batch.status} · Started{" "}
            {new Date(report.batch.startedAt).toLocaleString()}
            {report.batch.completedAt
              ? ` · Completed ${new Date(report.batch.completedAt).toLocaleString()}`
              : ""}
          </p>
          <div className="workflow-metrics">
            <div>
              <strong>
                {report.changedCharts}/{report.rows.length}
              </strong>
              <span>Charts with saved changes</span>
            </div>
            <div>
              <strong>{report.pendingCount}</strong>
              <span>Proposals pending review</span>
            </div>
            <div>
              <strong>{report.issues.length}</strong>
              <span>Cross-chart questions</span>
            </div>
            <div>
              <strong>{report.blockingIssues}</strong>
              <span>Structural blockers</span>
            </div>
          </div>
          {!active ? <p>This report uses the final saved checkpoints. Opening a chart shows its current working state.</p> : null}
          <details open>
            <summary>Original change list</summary>
            <pre>{report.batch.changeList}</pre>
          </details>
          <button className="button button--secondary" onClick={handoff}>
            Copy AI handoff
          </button>
          <button className="button button--secondary" onClick={download}>
            Download update report
          </button>
          {active && report.outsideCharts.length ? (
            <details>
              <summary>
                Active charts outside this update ({report.outsideCharts.length}
                )
              </summary>
              {report.outsideCharts.map((c) => (
                <p key={c.id}>
                  {c.name}
                  <button
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      void post("/api/monthly-workspace", {
                        action: "include_charts",
                        batchId: report.batch.id,
                        chartIds: [c.id],
                      })
                        .then(load)
                        .catch((e) => setMessage(e.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    Include and checkpoint
                  </button>
                </p>
              ))}
            </details>
          ) : null}
          <div className="monthly-chart-table">
            <table>
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Saved state</th>
                  <th>Source coverage</th>
                  <th>Pending reviews</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.chartId}>
                    <th>{row.name}</th>
                    <td>
                      {row.status} v{row.version} ·{" "}
                      {row.changed ? "changed" : "no saved changes"}
                      {row.lastCheckpoint ? (
                        <small>
                          Checkpoint{" "}
                          {new Date(
                            row.lastCheckpoint.recorded_at,
                          ).toLocaleString()}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      {row.sourceLocators}/{row.cards} cards have source
                      locations
                      <small>
                        {row.sourceNotes} notes · {row.missingDates} dates not
                        documented
                      </small>
                    </td>
                    <td>
                      {row.pending.map((p) => (
                        <button
                          key={p.id}
                          disabled={busy}
                          onClick={() => void review(p.id)}
                        >
                          Review {p.summary.total} changes
                        </button>
                      ))}
                    </td>
                    <td>
                      <button
                        onClick={() => onOpen(row.chartId)}
                        disabled={busy || saveState !== "saved"}
                      >
                        Open current chart
                      </button>
                      {active && row.status !== "current" && row.status !== "archived" ? (
                        <button
                          disabled={busy || saveState !== "saved"}
                          onClick={() => {
                            const c = charts.find((c) => c.id === row.chartId);
                            if (c) onMarkCurrent(c);
                          }}
                        >
                          Designate Current
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="monthly-proposal-reviews">
            {Object.values(details).map((p) => (
              <article key={p.id}>
                <h3>{p.chartName}</h3>
                <p>{p.changeSummary}</p>
                <div className="timeline-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Record</th>
                        <th>Field</th>
                        <th>Before</th>
                        <th>After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.changes.map((c) => (
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
                <label>
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    disabled={
                      busy ||
                      !active ||
                      !report.rows.some((r) =>
                        r.pending.some((item) => item.id === p.id),
                      )
                    }
                    onChange={(e) =>
                      setSelected((old) => {
                        const n = new Set(old);
                        if (e.target.checked) n.add(p.id); else n.delete(p.id);
                        return n;
                      })
                    }
                  />
                  I reviewed this proposal; include it in the next decision
                </label>
              </article>
            ))}
          </div>
          {selected.size ? (
            <div className="monthly-decision-bar">
              <strong>{selected.size} reviewed proposals selected</strong>
              <button
                className="button button--primary"
                disabled={busy || saveState !== "saved"}
                onClick={() => void decide("accept")}
              >
                Apply selected reviewed proposals
              </button>
              <button
                className="button button--secondary"
                disabled={busy || saveState !== "saved"}
                onClick={() => void decide("reject")}
              >
                Reject selected proposals
              </button>
              <p>
                Groups of up to ten are committed atomically with history and
                decision receipts. Completed groups remain saved if a later
                group needs attention.
              </p>
            </div>
          ) : null}
          {active ? (
            <form
              className="monthly-complete"
              onSubmit={(e) => {
                e.preventDefault();
                void complete(e.currentTarget);
              }}
            >
              <h2>Finish this update</h2>
              <p>
                Resolve pending proposals and structural blockers. Current
                designation is a separate accountable decision; charts may
                remain Draft with source notes attached.
              </p>
              <label>
                Completion summary
                <textarea name="summary" required maxLength={20000} />
              </label>
              <button
                className="button button--primary"
                disabled={
                  busy ||
                  saveState !== "saved" ||
                  report.pendingCount > 0 ||
                  report.blockingIssues > 0
                }
              >
                Complete update and save final checkpoint
              </button>
            </form>
          ) : (
            <p>
              Completion summary:{" "}
              {report.batch.summary ||
                "Imported unfinished update; start a new batch to resume."}
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
