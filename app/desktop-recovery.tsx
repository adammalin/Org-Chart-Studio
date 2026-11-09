"use client";
import { useEffect, useState } from "react";
import type { ChartDocument } from "../lib/chart-library";
import { storageSafeNodes } from "../lib/chart-library";
import { validateHierarchy, type OrgFlowNode } from "../lib/org-chart";
import type { Edge } from "@xyflow/react";
export function DesktopRecovery({
  charts,
  activeChart,
  nodes,
  edges,
  saveState,
  onRecover,
}: {
  charts: ChartDocument[];
  activeChart?: ChartDocument;
  nodes: OrgFlowNode[];
  edges: Edge[];
  saveState: string;
  onRecover: (draft: DesktopRecoveryDraft, chart: ChartDocument) => void;
}) {
  const [service, setService] = useState<DesktopServiceState | null>(null),
    [draft, setDraft] = useState<DesktopRecoveryDraft | null>(null),
    [loaded, setLoaded] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const bridge = window.orgChartDesktop;
    if (!bridge) {
      return;
    }
    let alive = true;
    void bridge
      .getServiceState()
      .then((s) => {
        if (alive) setService(s);
      })
      .catch(() => {});
    void bridge
      .getRecoveryDraft()
      .then((d) => {
        if (alive) {
          setDraft(d);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    const remove = bridge.onServiceState((s) => {
      if (alive) setService(s);
    });
    return () => {
      alive = false;
      remove();
    };
  }, []);
  const base = charts.find((c) => c.id === draft?.chartId);
  const differs =
    !!draft &&
    !!base &&
    JSON.stringify({
      nodes: storageSafeNodes(base.nodes),
      edges: base.edges,
    }) !== JSON.stringify({ nodes: draft.nodes, edges: draft.edges });
  const matching =
    base?.version === draft?.version &&
    base?.updatedAt === draft?.updatedAt &&
    base?.status !== "archived";
  useEffect(() => {
    const bridge = window.orgChartDesktop;
    if (
      !bridge ||
      !loaded ||
      !activeChart ||
      differs ||
      saveState === "proposal"
    )
      return;
    const timer = setTimeout(() => {
      void bridge
        .saveRecoveryDraft({
          chartId: activeChart.id,
          chartName: activeChart.name,
          version: activeChart.version,
          updatedAt: activeChart.updatedAt,
          nodes: storageSafeNodes(nodes),
          edges,
        })
        .catch(() =>
          setMessage(
            "The editor recovery copy could not be written. Saved database checkpoints remain available.",
          ),
        );
    }, 250);
    return () => clearTimeout(timer);
  }, [activeChart, nodes, edges, saveState, loaded, differs]);
  useEffect(() => {
    if (activeChart && saveState === "saved")
      window.orgChartDesktop?.reportLastSaved(activeChart.updatedAt);
  }, [activeChart, saveState]);
  function download() {
    if (!draft) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "orgchart-editor-recovery.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      {service && service.phase !== "ready" ? (
        <section
          className="service-recovery-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="service-recovery-title"
        >
          <div>
            <h2 id="service-recovery-title">
              {service.phase === "recovering"
                ? "Reconnecting to your local library"
                : "Your local library is temporarily unavailable"}
            </h2>
            <p>
              The window and editor state are preserved. Saved charts, pending
              reviews and history remain on this computer.
            </p>
            <p>
              Last saved state:{" "}
              {service.lastSavedAt
                ? new Date(service.lastSavedAt).toLocaleString()
                : "Check the library when reconnected"}
            </p>
            {service.phase === "recovering" ? (
              <p>
                Attempt {service.attempt} of {service.maxAttempts}
              </p>
            ) : (
              <button
                className="button button--primary"
                onClick={() => void window.orgChartDesktop?.retryService()}
              >
                Retry connection
              </button>
            )}
            <button
              className="button button--secondary"
              onClick={() => void window.orgChartDesktop?.openDiagnostics()}
            >
              Open local diagnostics
            </button>
          </div>
        </section>
      ) : null}
      {differs && draft && base ? (
        <section className="editor-recovery-notice" role="status">
          <strong>Recover editor changes for {draft.chartName}</strong>
          <p>
            Captured {new Date(draft.capturedAt).toLocaleString()}.{" "}
            {matching
              ? "Review and recover these edits into the working chart."
              : "The saved chart has changed. Download this recovery copy for comparison; it will not replace newer data."}
          </p>
          <button
            className="button button--primary"
            disabled={
              !matching ||
              saveState !== "saved" ||
              (!!service && service.phase !== "ready")
            }
            onClick={() => {
              let findings;
              try { findings = validateHierarchy(draft.nodes, draft.edges); }
              catch { setMessage("The recovery copy is malformed. Download it for comparison."); return; }
              if (findings.some((f) => f.severity === "blocking")) {
                setMessage(
                  "The recovery copy has structural issues. Download it for review.",
                );
                return;
              }
              onRecover(draft, base);
              setDraft(null);
            }}
          >
            Recover edits
          </button>
          <button className="button button--secondary" onClick={download}>
            Download recovery copy
          </button>
          <button
            className="button button--secondary"
            onClick={() => setDraft(null)}
          >
            Keep saved chart
          </button>
        </section>
      ) : null}
      {message ? (
        <p className="editor-recovery-notice" role="alert">
          {message}
        </p>
      ) : null}
    </>
  );
}
