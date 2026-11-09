import assert from "node:assert/strict";
import test from "node:test";
import { createBlankChart } from "../lib/chart-library";
import { parseImportFile } from "../lib/import-org-chart";
import { buildChartExportScene, buildChartSvg } from "../lib/chart-export";

test("unspecified source assignments survive import and export without becoming vacancies", () => {
 const chart = createBlankChart("Synthetic source group", "synthetic-source-group");
 chart.nodes[0].data.unit.positionStatus = "not_specified";
 chart.nodes[0].data.unit.assignmentLabel = "";
 const imported = parseImportFile("synthetic.json", JSON.stringify(chart));
 assert.equal(imported.findings.some(f => f.severity === "blocking"), false);
 assert.equal(imported.nodes[0].data.unit.positionStatus, "not_specified");
 const scene = buildChartExportScene({ ...chart, nodes: imported.nodes, edges: imported.edges }, "internal");
 assert.equal(scene.nodes[0].statusText, "Not specified");
 const svg = buildChartSvg(scene, "natural");
 assert.match(svg, /Not specified/);
 assert.doesNotMatch(svg, /Vacant/);
});
