import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RUNTIME_FILE_NAME = "mcp-runtime.json";
const REQUEST_TIMEOUT_MS = 10_000;

export class OrgChartAppUnavailableError extends Error {
  constructor(message = "Open the ORNL OrgChart Studio desktop app, then try this tool again.") {
    super(message);
    this.name = "OrgChartAppUnavailableError";
  }
}

export function defaultRuntimeFilePath() {
  if (process.platform === "darwin") {
    return path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "ORNL OrgChart Studio",
      RUNTIME_FILE_NAME,
    );
  }
  return path.join(os.homedir(), ".orgchart-studio", RUNTIME_FILE_NAME);
}

export function runtimeFilePath() {
  return process.env.ORGCHART_MCP_RUNTIME_FILE || defaultRuntimeFilePath();
}

function readRuntimeDescriptor(runtimePath = runtimeFilePath()) {
  let stats;
  try {
    stats = fs.lstatSync(runtimePath);
  } catch {
    throw new OrgChartAppUnavailableError();
  }
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new OrgChartAppUnavailableError(
      "The OrgChart Studio desktop connection file is not a regular local file.",
    );
  }
  if (process.platform !== "win32" && (stats.mode & 0o077) !== 0) {
    throw new OrgChartAppUnavailableError(
      "The OrgChart Studio desktop connection file has unsafe permissions. Restart the app to repair it.",
    );
  }

  let descriptor;
  try {
    descriptor = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
  } catch {
    throw new OrgChartAppUnavailableError(
      "The OrgChart Studio desktop connection file could not be read. Restart the app and try again.",
    );
  }
  if (
    descriptor?.version !== 1 ||
    !Number.isInteger(descriptor.pid) ||
    typeof descriptor.baseUrl !== "string" ||
    typeof descriptor.token !== "string" ||
    descriptor.token.length < 32
  ) {
    throw new OrgChartAppUnavailableError(
      "The OrgChart Studio desktop connection file is invalid. Restart the app and try again.",
    );
  }

  let baseUrl;
  try {
    baseUrl = new URL(descriptor.baseUrl);
  } catch {
    throw new OrgChartAppUnavailableError();
  }
  if (baseUrl.protocol !== "http:" || baseUrl.hostname !== "127.0.0.1") {
    throw new OrgChartAppUnavailableError(
      "OrgChart Studio refused a desktop connection that was not loopback-only.",
    );
  }
  return { ...descriptor, baseUrl };
}

function safeAppError(status, body) {
  if (body && typeof body === "object" && typeof body.error === "string") {
    return body.error.slice(0, 500);
  }
  if (status === 403) return "OrgChart Studio rejected the desktop session. Restart the app.";
  if (status === 404) return "The requested chart record was not found.";
  return `OrgChart Studio returned status ${status}.`;
}

export class OrgChartAppClient {
  constructor(options = {}) {
    this.runtimePath = options.runtimePath;
  }

  async request(pathname, init = {}) {
    const descriptor = readRuntimeDescriptor(this.runtimePath);
    const url = new URL(pathname, descriptor.baseUrl);
    if (url.origin !== descriptor.baseUrl.origin) {
      throw new Error("OrgChart Studio refused a non-local request target.");
    }
    const headers = new Headers(init.headers);
    headers.set("X-OrgChart-Desktop-Token", descriptor.token);
    headers.set("accept", "application/json");

    let response;
    try {
      response = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new OrgChartAppUnavailableError();
    }

    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json()
      : { error: await response.text() };
    if (!response.ok) throw new Error(safeAppError(response.status, body));
    return body;
  }

  listCharts() {
    return this.request("/api/charts", { cache: "no-store" });
  }

  validateChart(chartId) {
    return this.request(
      `/api/charts?resource=validate&chartId=${encodeURIComponent(chartId)}`,
      { cache: "no-store" },
    );
  }

  listVersions(chartId) {
    return this.request(
      `/api/charts?resource=versions&chartId=${encodeURIComponent(chartId)}`,
      { cache: "no-store" },
    );
  }

  postJson(body) {
    return this.request("/api/charts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  importNormalized({ chartName, format, contents, validateOnly }) {
    const form = new FormData();
    const extension = format === "json" ? "json" : "csv";
    const contentType = format === "json" ? "application/json" : "text/csv";
    form.set("chartName", chartName);
    form.set(
      "file",
      new File([contents], `ai-normalized-org-chart.${extension}`, {
        type: contentType,
      }),
    );
    if (validateOnly) form.set("validateOnly", "1");
    return this.request("/api/charts", { method: "POST", body: form });
  }
}
