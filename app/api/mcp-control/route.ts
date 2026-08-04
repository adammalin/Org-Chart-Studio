import type {
  McpAccessEvent,
  McpChartScope,
  McpControlState,
} from "../../../lib/mcp-control";

type McpControlStore = McpControlState;

const MAX_EVENTS = 100;
const controlGlobal = globalThis as typeof globalThis & {
  __orgChartMcpControlStore?: McpControlStore;
};

function controlStore(): McpControlStore {
  if (!controlGlobal.__orgChartMcpControlStore) {
    controlGlobal.__orgChartMcpControlStore = {
      paused: false,
      chartScope: "all",
      allowedChartIds: [],
      revision: 0,
      events: [],
    };
  }
  return controlGlobal.__orgChartMcpControlStore;
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
}

function response(store: McpControlStore, status = 200) {
  return Response.json(
    { control: { ...store, allowedChartIds: [...store.allowedChartIds], events: [...store.events] } },
    { status, headers: { "cache-control": "private, no-store" } },
  );
}

export async function GET() {
  return response(controlStore());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const action = safeText(body.action, 24);
  const store = controlStore();

  if (action === "configure") {
    const chartScope: McpChartScope = body.chartScope === "selected" ? "selected" : "all";
    const allowedChartIds = Array.isArray(body.allowedChartIds)
      ? [
          ...new Set(
            body.allowedChartIds
              .map((value) => safeText(value, 200))
              .filter((value): value is string => Boolean(value)),
          ),
        ].slice(0, 200)
      : [];
    store.paused = body.paused === true;
    store.chartScope = chartScope;
    store.allowedChartIds = allowedChartIds;
    store.revision += 1;
    return response(store);
  }

  if (action === "clear_events") {
    store.events = [];
    store.revision += 1;
    return response(store);
  }

  if (action === "authorize") {
    const toolName = safeText(body.toolName, 120);
    const chartId = safeText(body.chartId, 200);
    const mode = body.mode === "write" ? "write" : "read";
    if (!toolName) {
      return Response.json(
        { error: "An MCP tool name is required." },
        { status: 400, headers: { "cache-control": "private, no-store" } },
      );
    }
    const chartAllowed =
      !chartId ||
      store.chartScope === "all" ||
      store.allowedChartIds.includes(chartId);
    const allowed = !store.paused && chartAllowed;
    const event: McpAccessEvent = {
      id: `mcp-access-${crypto.randomUUID()}`,
      toolName,
      chartId,
      mode,
      allowed,
      createdAt: new Date().toISOString(),
      message: store.paused
        ? "Blocked while local AI access is paused."
        : chartAllowed
          ? `${mode === "write" ? "Write" : "Read"} access allowed.`
          : "Blocked by the selected-chart access scope.",
    };
    store.events = [event, ...store.events].slice(0, MAX_EVENTS);
    store.revision += 1;
    if (!allowed) {
      return Response.json(
        { error: event.message, control: store },
        { status: 423, headers: { "cache-control": "private, no-store" } },
      );
    }
    return response(store);
  }

  return Response.json(
    { error: "Unsupported MCP control action." },
    { status: 400, headers: { "cache-control": "private, no-store" } },
  );
}
