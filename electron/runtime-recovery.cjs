/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function buildFiles(root) {
  const files = [];
  function walk(relative) {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink())
      throw Error("Runtime builds cannot contain symbolic links.");
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(absolute).sort())
        walk(path.join(relative, child));
    } else if (stat.isFile()) files.push(relative);
  }
  for (const entry of ["dist", "migrations", "electron/preload.cjs"])
    walk(entry);
  return files;
}
function fingerprint(root) {
  const hash = crypto.createHash("sha256");
  for (const rel of buildFiles(root)) {
    hash.update(rel);
    hash.update(fs.readFileSync(path.join(root, rel)));
  }
  return hash.digest("hex");
}
function prepareRuntimeBuild(projectRoot, userDataPath) {
  if (!fs.existsSync(path.join(projectRoot, "dist/server/wrangler.json")))
    throw Error(
      "The desktop build is incomplete. Finish the build before opening Studio.",
    );
  const digest = fingerprint(projectRoot),
    parent = path.join(userDataPath, "runtime-builds");
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const destination = path.join(parent, digest);
  if (fs.existsSync(destination) && fingerprint(destination) === digest)
    return { root: destination, digest };
  const temporary = path.join(parent, `.preparing-${crypto.randomUUID()}`);
  fs.mkdirSync(temporary, { mode: 0o700 });
  try {
    for (const entry of ["dist", "migrations", "electron/preload.cjs"]) {
      const target = path.join(temporary, entry);
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.cpSync(path.join(projectRoot, entry), target, { recursive: true });
    }
    if (
      fingerprint(temporary) !== digest ||
      fingerprint(projectRoot) !== digest
    )
      throw Error(
        "The build changed while Studio was starting. Finish building, then reopen it.",
      );
    // Only generated application code is copied; live data and credentials are never included.
    const final = fs.existsSync(destination)
      ? `${destination}-${crypto.randomUUID()}`
      : destination;
    fs.renameSync(temporary, final);
    return { root: final, digest };
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}
function writeDiagnostic(userDataPath, event) {
  const folder = path.join(userDataPath, "logs");
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = path.join(folder, "recovery.jsonl");
  if (fs.existsSync(file) && fs.statSync(file).size > 128 * 1024)
    fs.renameSync(file, path.join(folder, "recovery.previous.jsonl"));
  // Deliberately omit stderr, chart content, tokens, URLs and exception messages.
  const safe = {
    version:
      typeof event.version === "string" && /^\d+\.\d+\.\d+/.test(event.version)
        ? event.version.slice(0, 40)
        : undefined,
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    event: String(event.event).slice(0, 60),
    reason: String(event.reason || "unknown").slice(0, 50),
    code: Number.isInteger(event.code) ? event.code : null,
    attempt: Number.isInteger(event.attempt) ? event.attempt : null,
  };
  fs.appendFileSync(file, JSON.stringify(safe) + "\n", { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {}
  return safe;
}
function recoveryDraftPath(userDataPath) {
  return path.join(userDataPath, "recovery", "editor-draft.json");
}
function validDraft(draft) {
  return !!draft && typeof draft.chartId === "string" &&
    typeof draft.updatedAt === "string" && Number.isInteger(draft.version) &&
    Array.isArray(draft.nodes) && Array.isArray(draft.edges) &&
    draft.nodes.length <= 5000 && draft.edges.length <= 10000 &&
    draft.nodes.every(n => n && typeof n.id === "string" && n.data && n.data.unit &&
      typeof n.data.unit.name === "string" && n.position &&
      Number.isFinite(n.position.x) && Number.isFinite(n.position.y)) &&
    draft.edges.every(e => e && typeof e.id === "string" &&
      typeof e.source === "string" && typeof e.target === "string");
}
function saveRecoveryDraft(userDataPath, draft) {
  if (!validDraft(draft)) throw Error("Invalid recovery draft.");
  const value = {
    chartId: draft.chartId,
    chartName: String(draft.chartName || "").slice(0, 160),
    version: draft.version,
    updatedAt: draft.updatedAt,
    nodes: draft.nodes,
    edges: draft.edges,
    capturedAt: new Date().toISOString(),
  };
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 15_000_000)
    throw Error("Recovery draft is too large.");
  const target = recoveryDraftPath(userDataPath);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const tmp = target + ".tmp";
  fs.writeFileSync(tmp, text, { mode: 0o600 });
  fs.renameSync(tmp, target);
  try {
    fs.chmodSync(target, 0o600);
  } catch {}
  return value.capturedAt;
}
function readRecoveryDraft(userDataPath) {
  try {
    const file = recoveryDraftPath(userDataPath);
    if (fs.statSync(file).size > 15_000_000) return null;
    const value = JSON.parse(fs.readFileSync(file, "utf8"));
    return validDraft(value) ? value : null;
  } catch {
    return null;
  }
}
class ServiceRecovery {
  constructor({
    start,
    onState,
    diagnostic,
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = Date.now,
    maxAttempts = 3,
  }) {
    this.start = start;
    this.onState = onState;
    this.diagnostic = diagnostic;
    this.wait = wait;
    this.now = now;
    this.maxAttempts = maxAttempts;
    this.attemptTimes = [];
    this.inFlight = null;
    this.cancelled = false;
    this.state = { phase: "ready", attempt: 0, maxAttempts, lastSavedAt: null };
  }
  emit(patch) {
    this.state = { ...this.state, ...patch };
    this.onState(this.state);
  }
  recover(reason = "service-exit", manual = false) {
    if (this.cancelled) return Promise.resolve(false);
    if (this.inFlight) return this.inFlight;
    if (manual) this.attemptTimes = [];
    this.inFlight = this.run(reason).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
  async run(reason) {
    this.attemptTimes = this.attemptTimes.filter((t) => this.now() - t < 60000);
    while (!this.cancelled && this.attemptTimes.length < this.maxAttempts) {
      const attempt = this.attemptTimes.length + 1;
      this.attemptTimes.push(this.now());
      this.emit({ phase: "recovering", attempt, reason });
      this.diagnostic({ event: "service-retry", reason, attempt });
      await this.wait(attempt === 1 ? 300 : attempt * 1000);
      if (this.cancelled) return false;
      try {
        await this.start();
        if (this.cancelled) return false;
        this.emit({ phase: "ready", attempt, reason: "reconnected" });
        this.diagnostic({ event: "service-recovered", attempt });
        return true;
      } catch {
        this.diagnostic({ event: "service-retry-failed", attempt });
      }
    }
    if (!this.cancelled)
      this.emit({
        phase: "offline",
        reason,
        attempt: this.attemptTimes.length,
      });
    return false;
  }
  stop() {
    this.cancelled = true;
  }
}
module.exports = {
  prepareRuntimeBuild,
  fingerprint,
  writeDiagnostic,
  saveRecoveryDraft,
  readRecoveryDraft,
  ServiceRecovery,
};
