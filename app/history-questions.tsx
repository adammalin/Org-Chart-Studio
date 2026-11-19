"use client";
import { useState } from "react";
import type { ChartDocument } from "../lib/chart-library";
import type {
  HistoricalRole,
  HistoricalChange,
  ParsedHistoryQuestion,
} from "../lib/history-answers";
interface Answer {
  error?: string;
  parsed: ParsedHistoryQuestion;
  roles?: HistoricalRole[];
  changes?: HistoricalChange[];
  gaps?: { chartId: string; chartName: string; reason: string }[];
  missingCharts?: string[];
  note: string;
  message?: string;
}
export function HistoryQuestions({
  charts,
  onView,
}: {
  charts: ChartDocument[];
  onView: (id: string) => void;
}) {
  const [question, setQuestion] = useState(""),
    [mode, setMode] = useState<"roles" | "changes">("roles"),
    [answer, setAnswer] = useState<Answer | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function ask(form: HTMLFormElement) {
    const f = new FormData(form);
    setBusy(true);
    setError("");
    const now = new Date(),
      ref = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    try {
      const r = await fetch("/api/history/answers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question,
            mode: question ? undefined : mode,
            chartId: f.get("chartId") || undefined,
            organization: f.get("organization") || undefined,
            query: f.get("query") || undefined,
            asOf: f.get("asOf") || undefined,
            since: f.get("since") || undefined,
            referenceDate: ref,
            includeArchived: f.get("includeArchived") === "on",
          }),
        }),
        d = (await r.json()) as Answer;
      if (!r.ok) throw Error(d.error);
      setAnswer(d);
    } catch (e) {
      setError((e as Error).message);
      setAnswer(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="history-questions">
      <h2>Ask saved history</h2>
      <p>
        Find recorded role holders or compare organizational changes. Every
        result links to a saved checkpoint; missing coverage is shown
        explicitly.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(e.currentTarget);
        }}
      >
        <label>
          Question
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Who led Physics in October 2026?"
            maxLength={500}
          />
        </label>
        <p>
          Examples: “Who was the director of Physics on 2026-10-31?” · “What
          changed since last month?”
        </p>
        <details>
          <summary>Or use explicit filters</summary>
          <div className="workflow-filters">
            <label>
              Question type
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as typeof mode)}
              >
                <option value="roles">Who held a role?</option>
                <option value="changes">What changed?</option>
              </select>
            </label>
            <label>
              Chart
              <select name="chartId">
                <option value="">All active charts</option>
                {charts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Organization name
              <input name="organization" />
            </label>
            <label>
              Person or role
              <input name="query" />
            </label>
            <label>
              On or before (recorded UTC date)
              <input type="date" name="asOf" />
            </label>
            <label>
              Compare from
              <input type="date" name="since" />
            </label>
          </div>
        </details>
        <label>
          <input type="checkbox" name="includeArchived" />
          Include archived organizations and their recorded states
        </label>
        <button className="button button--primary" disabled={busy}>
          {busy ? "Reading checkpoints…" : "Answer from saved checkpoints"}
        </button>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {answer ? (
        <div aria-live="polite">
          <h3>{answer.parsed.interpretation}</h3>
          <p>{answer.note}</p>
          {answer.message ? <p>{answer.message}</p> : null}
          {answer.missingCharts?.length ? (
            <p>
              {answer.missingCharts.length} charts have no checkpoint on or
              before the selected date.
            </p>
          ) : null}
          {answer.roles?.map((r, i) => (
            <article className="history-answer-record" key={i}>
              <h4>{r.organization}</h4>
              <p>
                <strong>{r.person}</strong> · {r.role}
              </p>
              <details>
                <summary>Supporting checkpoints ({r.evidence.length})</summary>
                {r.evidence.map((e) => (
                  <p key={e.checkpointId + e.chartId + e.nodeId}>
                    {e.chartName} · recorded{" "}
                    {new Date(e.recordedAt).toLocaleString()} ·{" "}
                    {e.certainty.replace("_", " ")} · effective date:{" "}
                    {e.effectiveDate}
                    {e.sourceLocator ? <span> · Source: {e.sourceLocator}</span> : null}
                    {e.reviewNote ? <span> · Review note: {e.reviewNote}</span> : null}
                    <button onClick={() => onView(e.checkpointId)}>
                      View checkpoint
                    </button>
                  </p>
                ))}
              </details>
            </article>
          ))}
          {answer.changes?.map((c) => (
            <article className="history-answer-record" key={c.chartId}>
              <h4>{c.chartName}</h4>
              <p>
                {c.changes.length} recorded differences ·{" "}
                <button onClick={() => onView(c.beforeId)}>
                  Before checkpoint
                </button>{" "}
                <button onClick={() => onView(c.afterId)}>
                  After checkpoint
                </button>
              </p>
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
                    {c.changes.map((d) => (
                      <tr key={d.id}>
                        <th>{d.entityLabel}</th>
                        <td>{d.fieldLabel}</td>
                        <td>{d.before ?? "Not present"}</td>
                        <td>{d.after ?? "Not present"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
          {answer.gaps?.length ? (
            <details open>
              <summary>Comparison gaps ({answer.gaps.length})</summary>
              {answer.gaps.map((g) => (
                <p key={g.chartId}>
                  {g.chartName}: {g.reason}
                </p>
              ))}
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
