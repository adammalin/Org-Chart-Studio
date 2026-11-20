"use client";
import { studioRequest } from "../runtime/request";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ChartDocument } from "../lib/chart-library";
import type { AiFieldChange } from "../lib/ai-change-review";
export interface EditSummary {
  id: string;
  sequence: number;
  actor: string;
  label: string;
  groupId: string | null;
  recordedAt: string;
  reversible: boolean;
  state: string;
}
export interface EditHistoryState {
  chartId: string;
  undo: EditSummary | null;
  redo: EditSummary | null;
  revision: string;
  expectedVersion: number;
  expectedUpdatedAt: string;
  operations: EditSummary[];
  nextCursor: number | null;
  events: {
    id: string;
    operation_id: string;
    action: string;
    actor: string;
    recorded_at: string;
  }[];
}
type HistoryResponse = EditHistoryState & {
  error?: string;
  chart: ChartDocument;
  proposed: ChartDocument;
  operation: EditSummary & { changes: AiFieldChange[] };
  receipt?: { id: string };
};
async function readResponse(r: Response) {
  return (await r.json()) as HistoryResponse;
}
export function useEditHistory(
  chart: ChartDocument | undefined,
  onSaved: (chart: ChartDocument) => void,
  onBusy: (busy: boolean) => void,
) {
  const [state, setState] = useState<EditHistoryState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [pendingAction, setPendingAction] = useState<{
      chartId: string;
      action: "undo" | "redo";
    } | null>(null);
  const generation = useRef(0),
    locked = useRef(false),
    pending = useRef(
      new Map<
        string,
        {
          action: "undo" | "redo";
          chartId: string;
          operationId: string;
          expectedRevision: string;
          expectedVersion: number;
          expectedUpdatedAt: string;
          requestId: string;
        }
      >(),
    );
  const id = chart?.id,
    updatedAt = chart?.updatedAt;
  const activeId = useRef(id);
  useLayoutEffect(() => { activeId.current = id; }, [id]);
  const load = useCallback(async () => {
    if (activeId.current !== id) return;
    const g = ++generation.current;
    if (!id) {
      setState(null);
      return;
    }
    try {
      const r = await studioRequest(
          `/api/edit-history?chartId=${encodeURIComponent(id)}`,
          { cache: "no-store" },
        ),
        d = await readResponse(r);
      if (!r.ok) throw Error(d.error ?? "Could not read edit history.");
      if (g === generation.current) {
        setState(d);
        const unresolved = pending.current.get(id);
        setPendingAction(
          unresolved ? { chartId: id, action: unresolved.action } : null,
        );
        setError("");
      }
    } catch (e) {
      if (g === generation.current) {
        setState(null);
        setError(
          e instanceof Error ? e.message : "Could not read edit history.",
        );
      }
    }
  }, [id]);
  const invalidateRead = useCallback(() => { generation.current += 1; }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(t);
      invalidateRead();
    };
  }, [load, updatedAt, invalidateRead]);
  const run = useCallback(
    async (action: "undo" | "redo") => {
      if (locked.current || !id) return;
      const prior = pending.current.get(id);
      if (prior && prior.action !== action) {
        setError(
          "Resolve the uncertain recovery request before another history action.",
        );
        return;
      }
      if (!prior && (!state || state.chartId !== id || !state[action])) return;
      const body = prior ?? {
        action,
        chartId: id,
        operationId: state![action]!.id,
        expectedRevision: state!.revision,
        expectedVersion: state!.expectedVersion,
        expectedUpdatedAt: state!.expectedUpdatedAt,
        requestId: `history-request-${crypto.randomUUID()}`,
      };
      pending.current.set(id, body);
      locked.current = true;
      setBusy(true);
      onBusy(true);
      setError("");
      let failure = "",
        uncertain = true;
      try {
        const r = await studioRequest("/api/edit-history", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        });
        const d = await readResponse(r);
        uncertain = false;
        pending.current.delete(id);
        setPendingAction(null);
        if (!r.ok) throw Error(d.error ?? "History action was not saved.");
        onSaved(d.chart);
      } catch (e) {
        failure = e instanceof Error ? e.message : "History action failed.";
        // Read current state and the exact receipt after a lost response. Never
        // assume failure means the transaction was not committed.
        try {
          const r = await studioRequest(
              `/api/edit-history?chartId=${encodeURIComponent(id)}&includeChart=1&receiptId=${encodeURIComponent(body.requestId)}`,
              { cache: "no-store", signal: AbortSignal.timeout(15000) },
            ),
            d = await readResponse(r);
          if (r.ok) {
            onSaved(d.chart);
            if (d.receipt) {
              uncertain = false;
              failure = "";
              pending.current.delete(id);
              setPendingAction(null);
            }
          }
        } catch {
          /* Keep the request identity so an explicit retry is idempotent. */
        }
        if (uncertain) {
          setPendingAction({ chartId: id, action });
          failure =
            "Connection interrupted; the action may already be saved. Use Retry recovery request to reconcile this same request safely.";
        }
      } finally {
        locked.current = false;
        setBusy(false);
        onBusy(pending.current.has(id));
        await load();
        if (failure && activeId.current === id) setError(failure);
      }
    },
    [state, id, onSaved, onBusy, load],
  );
  return {
    state: state?.chartId === id ? state : null,
    busy,
    pendingAction:
      pendingAction && pendingAction.chartId === id
        ? pendingAction.action
        : null,
    error,
    load,
    run,
  };
}
export function EditHistoryPanel({
  history,
  disabled,
  onNotice,
}: {
  history: ReturnType<typeof useEditHistory>;
  disabled: boolean;
  onNotice: (s: string) => void;
}) {
  const { state, busy, error } = history;
  const [detail, setDetail] = useState<
      (EditSummary & { changes: AiFieldChange[] }) | null
    >(null),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [older, setOlder] = useState<EditSummary[]>([]),
    [cursor, setCursor] = useState<number | null>(null);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    const t = setTimeout(() => {
      setDetail(null);
      setLoading(false);
      setOlder([]);
      setCursor(state?.nextCursor ?? null);
      setMessage("");
    }, 0);
    return () => clearTimeout(t);
  }, [state]);
  async function inspect(op: EditSummary) {
    if (!state) return;
    const g = ++generation.current;
    setLoading(true);
    setMessage("");
    try {
      const r = await studioRequest(
          `/api/edit-history?chartId=${encodeURIComponent(state.chartId)}&operationId=${encodeURIComponent(op.id)}`,
          { cache: "no-store" },
        ),
        d = await readResponse(r);
      if (!r.ok) throw Error(d.error);
      if (g !== generation.current) return;
      if (d.revision !== state.revision) {
        await history.load();
        setMessage(
          "History changed. Select the operation again from the refreshed list.",
        );
        return;
      }
      if (g === generation.current) setDetail(d.operation);
    } catch (e) {
      if (g === generation.current)
        setMessage(
          e instanceof Error ? e.message : "Could not read operation.",
        );
    } finally {
      if (g === generation.current) setLoading(false);
    }
  }
  async function more() {
    if (!state || !cursor) return;
    const g = ++generation.current;
    setLoading(true);
    try {
      const r = await studioRequest(
          `/api/edit-history?chartId=${encodeURIComponent(state.chartId)}&before=${cursor}`,
          { cache: "no-store" },
        ),
        d = await readResponse(r);
      if (!r.ok) throw Error(d.error);
      if (g !== generation.current) return;
      if (d.revision !== state.revision) {
        await history.load();
        return;
      }
      setOlder((c) => [...c, ...d.operations]);
      setCursor(d.nextCursor);
    } catch (e) {
      if(g === generation.current) setMessage(
        e instanceof Error ? e.message : "Could not load older edits.",
      );
    } finally {
      if(g === generation.current) setLoading(false);
    }
  }
  async function revert() {
    if (!state || !detail) return;
    const g = ++generation.current;
    setLoading(true);
    setMessage("");
    try {
      const r = await studioRequest(
          `/api/edit-history?chartId=${encodeURIComponent(state.chartId)}&operationId=${encodeURIComponent(detail.id)}&previewRevert=1`,
          { cache: "no-store" },
        ),
        d = await readResponse(r);
      if (!r.ok) throw Error(d.error);
      if(g !== generation.current) return;
      if (d.revision !== state.revision)
        throw Error(
          "History changed. Refresh and preview before staging a revert.",
        );
      const response = await studioRequest("/api/ai-proposals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "stage",
            chart: d.proposed,
            changeSummary: `Revert saved operation: ${detail.label}`,
          }),
        }),
        p = await readResponse(response);
      if (!response.ok) throw Error(p.error);
      if(g !== generation.current) return;
      setMessage(
        "Revert proposal prepared. Review Before/After and choose Apply in the AI review queue.",
      );
      onNotice(
        "A history revert is ready for review. The saved chart has not changed.",
      );
    } catch (e) {
      if(g === generation.current) setMessage(
        e instanceof Error ? e.message : "Could not prepare a safe revert.",
      );
    } finally {
      if(g === generation.current) setLoading(false);
    }
  }
  return (
    <section
      className="edit-history-panel"
      aria-labelledby="edit-history-title"
    >
      <div className="history-heading">
        <div>
          <span className="eyebrow">Saved user and agent actions</span>
          <h2 id="edit-history-title">Undo, redo and recover</h2>
          <p>
            History stays with each chart after switching or restarting. New
            edits start a new branch; previous actions remain visible. Recovery
            preserves source-review evidence and restores active content as
            Draft.
          </p>
        </div>
        <button
          className="button button--secondary"
          onClick={() => void history.load()}
          disabled={busy}
        >
          Refresh edit history
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {history.pendingAction ? (
        <button
          className="button button--secondary"
          disabled={busy}
          onClick={() => void history.run(history.pendingAction!)}
        >
          Retry recovery request
        </button>
      ) : null}
      <div className="edit-history-actions">
        <button
          className="button button--secondary"
          disabled={disabled || busy || !state?.undo}
          onClick={() => void history.run("undo")}
        >
          Undo {state?.undo?.label ?? "—"}
        </button>
        <button
          className="button button--secondary"
          disabled={disabled || busy || !state?.redo}
          onClick={() => void history.run("redo")}
        >
          Redo {state?.redo?.label ?? "—"}
        </button>
      </div>
      {disabled ? (
        <p>
          Wait for Saved and resolve pending review proposals before recovering
          a saved action.
        </p>
      ) : null}
      <div className="edit-history-layout">
        <div>
          <ol className="edit-history-list">
            {[...(state?.operations ?? []), ...older].map((op) => (
              <li key={op.id}>
                <button
                  aria-pressed={detail?.id === op.id}
                  onClick={() => void inspect(op)}
                  disabled={loading}
                >
                  <strong>{op.label}</strong>
                  <span>
                    {op.actor === "agent" ? "Agent" : "User / app"} ·{" "}
                    {new Date(op.recordedAt).toLocaleString()} ·{" "}
                    {op.reversible ? op.state : "Audit record"}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {state && !state.operations.length ? (
            <p>
              No saved edits yet. Changes made before this history feature was
              installed remain in the historical timeline and named versions
              below.
            </p>
          ) : null}
          {cursor ? (
            <button
              className="button button--secondary"
              disabled={loading}
              onClick={() => void more()}
            >
              Load earlier edits
            </button>
          ) : null}
        </div>
        {detail ? (
          <section
            className="edit-history-detail"
            aria-label="Selected edit details"
          >
            <h3>{detail.label}</h3>
            <p>
              {detail.actor === "agent" ? "Agent" : "User / app"} ·{" "}
              {detail.state}
            </p>
            <details>
              <summary>Operation reference</summary>
              <p>{detail.id}</p>
              {detail.groupId ? <p>Group: {detail.groupId}</p> : null}
            </details>
            <p>Original operation: before → after</p>
            <ul>
              {detail.changes.map((c) => (
                <li key={c.id}>
                  <strong>
                    {c.entityLabel}: {c.fieldLabel}
                  </strong>
                  <div>
                    {c.before ?? "(empty)"} → {c.after ?? "(empty)"}
                  </div>
                </li>
              ))}
            </ul>
            {!detail.changes.length ? (
              <p>
                Metadata or review evidence changed. Approval and source-check
                records are retained.
              </p>
            ) : null}
            <button
              className="button button--secondary"
              disabled={
                disabled ||
                loading ||
                busy ||
                !detail.reversible ||
                detail.state !== "applied"
              }
              onClick={() => void revert()}
            >
              Prepare reviewed revert of this operation
            </button>
            <p>
              Later nonconflicting changes are kept. A conflicting later edit
              blocks the revert.
            </p>
          </section>
        ) : null}
      </div>
      {message ? <p role="status">{message}</p> : null}
      {state?.events.length ? (
        <details>
          <summary>Recovery receipts and audit trail</summary>
          <ul>
            {state.events.map((e) => (
              <li key={e.id}>
                {e.action} · {e.actor} ·{" "}
                {new Date(e.recorded_at).toLocaleString()} · {e.id}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
