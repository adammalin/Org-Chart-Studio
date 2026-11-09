/* eslint-disable @typescript-eslint/no-require-imports -- Tests the CommonJS Electron runtime helper. */
const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const {
  prepareRuntimeBuild,
  writeDiagnostic,
  saveRecoveryDraft,
  readRecoveryDraft,
  ServiceRecovery,
} = require("../electron/runtime-recovery.cjs");
test("runtime snapshot stays unchanged when development build files are replaced", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-runtime-"));
  try {
    const source = path.join(dir, "source");
    for (const f of [
      "dist/server/wrangler.json",
      "dist/server/index.js",
      "dist/client/main.js",
      "migrations/001.sql",
      "electron/preload.cjs",
    ]) {
      const p = path.join(source, f);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, "synthetic original");
    }
    const a = prepareRuntimeBuild(source, path.join(dir, "data"));
    fs.writeFileSync(path.join(source, "dist/server/index.js"), "new build");
    assert.equal(
      fs.readFileSync(path.join(a.root, "dist/server/index.js"), "utf8"),
      "synthetic original",
    );
    assert.notEqual(
      prepareRuntimeBuild(source, path.join(dir, "data")).digest,
      a.digest,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("recovery is bounded, serialized and supports an explicit retry", async () => {
  let starts = 0;
  const states = [];
  const recovery = new ServiceRecovery({
    start: async () => {
      starts++;
      throw Error("synthetic failure");
    },
    onState: (s) => states.push(s.phase),
    diagnostic: () => {},
    wait: async () => {},
  });
  const first = recovery.recover();
  assert.equal(first, recovery.recover());
  assert.equal(await first, false);
  assert.equal(starts, 3);
  assert.equal(recovery.state.phase, "offline");
  assert.equal(await recovery.recover(), false);
  assert.equal(starts, 3);
  recovery.start = async () => {};
  assert.equal(await recovery.recover("manual", true), true);
  assert.equal(recovery.state.phase, "ready");
});
test("shutdown cancels retries and leaves a private recoverable editor draft", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-draft-"));
  try {
    let starts = 0;
    const recovery = new ServiceRecovery({
      start: async () => {
        starts++;
      },
      onState: () => {},
      diagnostic: () => {},
      wait: async () => {
        recovery.stop();
      },
    });
    await recovery.recover();
    assert.equal(starts, 0);
    saveRecoveryDraft(dir, {
      chartId: "synthetic",
      chartName: "Synthetic",
      version: 1,
      updatedAt: "2026-11-09",
      nodes: [],
      edges: [],
    });
    assert.equal(readRecoveryDraft(dir).chartId, "synthetic");
    const file = path.join(dir, "recovery/editor-draft.json");
    if (process.platform !== "win32")
      assert.equal(fs.statSync(file).mode & 0o077, 0);
    fs.writeFileSync(file, JSON.stringify({ chartId: "synthetic", nodes: [null], edges: [] }));
    assert.equal(readRecoveryDraft(dir), null);
    assert.throws(() => saveRecoveryDraft(dir, { chartId: "synthetic", updatedAt: "today", version: 1, nodes: [null], edges: [] }), /Invalid recovery/);
    writeDiagnostic(dir, {
      event: "test",
      reason: "crashed",
      stderr: "do not retain secret",
      token: "secret",
    });
    assert.ok(
      !fs
        .readFileSync(path.join(dir, "logs/recovery.jsonl"), "utf8")
        .includes("secret"),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
