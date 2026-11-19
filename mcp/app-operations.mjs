// Transport-independent application operations shared by stdio and page tools.
export class OrgChartOperations {
  async request(...args) { void args; throw new Error("A runtime transport is required."); }
  rawRequest(pathname,init){return this.request(pathname,init);}
  authorizeTool({ toolName, chartId, mode = "read", sourceAccess = false }) {
    return this.rawRequest("/api/mcp-control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "authorize",
        toolName,
        chartId,
        mode,
        sourceAccess,
      }),
    });
  }

  listCharts() {
    return this.request("/api/charts", { cache: "no-store" });
  }

  listImportIntakes() {
    return this.request("/api/import-intakes", { cache: "no-store" });
  }

  extractImportIntake(intakeId) {
    return this.request("/api/source-extractions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "intake", id: intakeId }),
    });
  }

  extractChartSources(chartId) {
    return this.request("/api/source-extractions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scope: "chart", id: chartId }),
    });
  }

  createBackup(chartIds = []) {
    const query = new URLSearchParams();
    for (const chartId of chartIds) query.append("chartId", chartId);
    return this.request(`/api/backups${query.size ? `?${query}` : ""}`, {
      cache: "no-store",
    });
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

  reportMcpActivity(body) {
    return this.request("/api/ai-activity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  stageChartProposal(chart, changeSummary) {
    return this.request("/api/ai-proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "stage", chart, changeSummary }),
    });
  }

  stageImportProposal({ chartName, format, contents, intakeId }) {
    return this.request("/api/ai-import-proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "stage",
        chartName,
        format,
        contents,
        intakeId,
      }),
    });
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
