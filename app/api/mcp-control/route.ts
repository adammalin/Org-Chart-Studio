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

async function controlStore(): Promise<McpControlStore> {
  if (!controlGlobal.__orgChartMcpControlStore) {
    const {getBindings,ensureSchema}=await import("../../../db");
    const {DB}=getBindings();await ensureSchema(DB);
    const saved=await DB.prepare("SELECT payload FROM app_settings WHERE key='mcp-control'").first<{payload:string}>();
    const preferences=saved?JSON.parse(saved.payload) as Partial<McpControlState>:{};
    controlGlobal.__orgChartMcpControlStore = {
      paused: preferences.paused===true,
      chartScope: preferences.chartScope==="selected"?"selected":"all",
      allowedChartIds: Array.isArray(preferences.allowedChartIds)?preferences.allowedChartIds:[],
      sourceAccessEnabled: preferences.sourceAccessEnabled!==false,
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
  return response(await controlStore());
}

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const action = safeText(body.action, 24);
  const store = await controlStore();

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
    const preferences={paused:body.paused===true,chartScope,allowedChartIds,sourceAccessEnabled:body.sourceAccessEnabled===true};
    const {getBindings}=await import("../../../db");
    await getBindings().DB.prepare("INSERT INTO app_settings(key,payload) VALUES('mcp-control',?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload").bind(JSON.stringify(preferences)).run();
    store.paused = body.paused === true;
    store.chartScope = chartScope;
    store.allowedChartIds = allowedChartIds;
    store.sourceAccessEnabled = body.sourceAccessEnabled === true;
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
    const sourceAccess = body.sourceAccess === true;
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
    const sourceAllowed = !sourceAccess || store.sourceAccessEnabled;
    const allowed = !store.paused && chartAllowed && sourceAllowed;
    const event: McpAccessEvent = {
      id: `mcp-access-${crypto.randomUUID()}`,
      toolName,
      chartId,
      mode,
      sourceAccess,
      allowed,
      createdAt: new Date().toISOString(),
      message: store.paused
        ? "Blocked while local AI access is paused."
        : !sourceAllowed
          ? "Blocked because retained-source extraction is off in Local AI control."
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
