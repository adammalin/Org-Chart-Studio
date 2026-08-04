import {
  IDLE_MCP_ACTIVITY,
  type McpActivitySnapshot,
} from "../../../lib/mcp-activity";

interface ActiveMcpOperation {
  activityId: string;
  operation: string;
  label: string;
  chartId: string | null;
  chartName: string | null;
  startedAt: string;
}

interface McpActivityStore {
  revision: number;
  active: Map<string, ActiveMcpOperation>;
  latest: McpActivitySnapshot;
}

const RECEIPT_DURATION_MS = 8_000;
const STALE_ACTIVITY_MS = 2 * 60_000;
const activityGlobal = globalThis as typeof globalThis & {
  __orgChartMcpActivityStore?: McpActivityStore;
};

function activityStore(): McpActivityStore {
  if (!activityGlobal.__orgChartMcpActivityStore) {
    activityGlobal.__orgChartMcpActivityStore = {
      revision: 0,
      active: new Map(),
      latest: { ...IDLE_MCP_ACTIVITY },
    };
  }
  return activityGlobal.__orgChartMcpActivityStore;
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result ? result.slice(0, maxLength) : null;
}

function activeSnapshot(store: McpActivityStore): McpActivitySnapshot | null {
  const operation = Array.from(store.active.values()).at(-1);
  if (!operation) return null;
  return {
    revision: store.revision,
    phase: "working",
    activityId: operation.activityId,
    operation: operation.operation,
    label: operation.label,
    chartId: operation.chartId,
    chartName: operation.chartName,
    startedAt: operation.startedAt,
    finishedAt: null,
    expiresAt: null,
    activeCount: store.active.size,
    message: null,
    completionKind: null,
    proposalId: null,
  };
}

function currentActivity(): McpActivitySnapshot {
  const store = activityStore();
  const now = Date.now();
  for (const [activityId, operation] of store.active) {
    if (now - Date.parse(operation.startedAt) > STALE_ACTIVITY_MS) {
      store.active.delete(activityId);
    }
  }
  const active = activeSnapshot(store);
  if (active) return active;
  if (store.latest.expiresAt && Date.parse(store.latest.expiresAt) > now) {
    return { ...store.latest, activeCount: 0 };
  }
  return { ...IDLE_MCP_ACTIVITY, revision: store.revision };
}

function json(activity: McpActivitySnapshot, status = 200) {
  return Response.json(
    { activity },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function GET() {
  return json(currentActivity());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const action = safeText(body.action, 20);
  const activityId = safeText(body.activityId, 160);
  const store = activityStore();

  if (!activityId || (action !== "begin" && action !== "complete" && action !== "dismiss")) {
    return Response.json(
      { error: "A valid MCP activity action and ID are required." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (action === "dismiss") {
    store.active.delete(activityId);
    store.revision += 1;
    if (store.latest.activityId === activityId) {
      store.latest = { ...IDLE_MCP_ACTIVITY, revision: store.revision };
    }
    return json(currentActivity());
  }

  if (action === "begin") {
    const operation = safeText(body.operation, 80);
    const label = safeText(body.label, 120);
    if (!operation || !label) {
      return Response.json(
        { error: "An MCP operation and display label are required." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const startedAt = new Date().toISOString();
    store.active.set(activityId, {
      activityId,
      operation,
      label,
      chartId: safeText(body.chartId, 200),
      chartName: safeText(body.chartName, 160),
      startedAt,
    });
    store.revision += 1;
    store.latest = activeSnapshot(store) ?? {
      ...IDLE_MCP_ACTIVITY,
      revision: store.revision,
    };
    return json(store.latest);
  }

  const existing = store.active.get(activityId);
  store.active.delete(activityId);
  store.revision += 1;
  const otherActive = activeSnapshot(store);
  if (otherActive) {
    store.latest = otherActive;
    return json(otherActive);
  }

  const finishedAt = new Date();
  const succeeded = body.succeeded === true;
  store.latest = {
    revision: store.revision,
    phase: succeeded ? "succeeded" : "failed",
    activityId,
    operation: safeText(body.operation, 80) ?? existing?.operation ?? null,
    label: safeText(body.label, 120) ?? existing?.label ?? "Updating chart",
    chartId: safeText(body.chartId, 200) ?? existing?.chartId ?? null,
    chartName: safeText(body.chartName, 160) ?? existing?.chartName ?? null,
    startedAt: existing?.startedAt ?? finishedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    expiresAt: new Date(finishedAt.getTime() + RECEIPT_DURATION_MS).toISOString(),
    activeCount: 0,
    message: safeText(body.message, 240),
    completionKind:
      body.completionKind === "review_ready" ? "review_ready" : "saved",
    proposalId: safeText(body.proposalId, 200),
  };
  return json(store.latest);
}
