import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function readStudioServerBundle() {
  const assetsUrl = new URL("../dist/server/ssr/assets/", import.meta.url);
  const files = await readdir(assetsUrl);
  const studioBundle = files.find((file) => /^orgchart-studio-.*\.js$/.test(file));
  assert.ok(studioBundle, "the production server build should contain the studio route");
  return readFile(new URL(studioBundle, assetsUrl), "utf8");
}

test("production server bundle contains the complete OrgChart Studio workspace", async () => {
  const bundle = await readStudioServerBundle();

  assert.match(bundle, /OrgChart Studio/);
  assert.match(bundle, /only charts that staff create or import/i);
  assert.match(bundle, /Chart library/);
  assert.match(bundle, /Chart editor/);
  assert.match(bundle, /Separate lanes/);
  assert.match(bundle, /Sibling combs/);
  assert.match(bundle, /Select area/);
  assert.match(bundle, /Cards touched by the rectangle become a movable group/);
  assert.match(bundle, /Align selected cards left/);
  assert.match(bundle, /Distribute selected cards horizontally/);
  assert.match(bundle, /Accessible table/);
  assert.match(bundle, /Sources & imports/);
  assert.match(bundle, /Backup & restore/);
  assert.match(bundle, /Publish & export/);
  assert.match(bundle, /Version history/);
  assert.match(bundle, /Portable database backup/);
  assert.match(bundle, /Entire library/);
  assert.match(bundle, /Selected charts/);
  assert.match(bundle, /Encrypted \(recommended\)/);
  assert.match(bundle, /Unencrypted/);
  assert.match(bundle, /will not be protected by a passphrase/i);
  assert.match(bundle, /one recovery file/i);
  assert.match(bundle, /Restore without overwriting/);
  assert.match(bundle, /Download PPTX/);
  assert.match(bundle, /Download table/);
  assert.doesNotMatch(bundle, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("keeps core prototype boundaries explicit in source", async () => {
  const [studio, model, importModel, backupModel, chartRoute, nextConfig, packageJson, hosting] = await Promise.all([
    readFile(new URL("../app/orgchart-studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/org-chart.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/import-org-chart.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/encrypted-backup.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/charts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(studio, /no personnel system or AI endpoint is connected/i);
  assert.match(studio, /semantic parent did not change/);
  assert.match(studio, /multiSelectionKeyCode=\{\["Control", "Meta"\]\}/);
  assert.match(studio, /movementNodeIds/);
  assert.doesNotMatch(studio, /chart-synthetic-laboratory|Review proposal demo/);
  assert.match(model, /validateHierarchy/);
  assert.match(model, /runElkLayout/);
  assert.match(importModel, /EMPTY_IMPORT/);
  assert.match(importModel, /MULTIPLE_PRIMARY_PARENTS/);
  assert.match(importModel, /WORKFORCE_ROSTER_MAPPED/);
  assert.match(studio, /multiple/);
  assert.match(studio, /\.docx/);
  assert.match(chartRoute, /getAll\("evidence"\)/);
  assert.match(chartRoute, /pptx\|docx\|pdf/);
  assert.match(chartRoute, /retireBuiltInExampleCharts/);
  assert.doesNotMatch(chartRoute, /seedIfEmpty/);
  assert.match(nextConfig, /bodySizeLimit:\s*"26mb"/);
  assert.match(backupModel, /AES-GCM/);
  assert.match(backupModel, /250_000/);
  assert.match(packageJson, /"@xyflow\/react"/);
  assert.match(packageJson, /"elkjs"/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "SOURCE_FILES"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
