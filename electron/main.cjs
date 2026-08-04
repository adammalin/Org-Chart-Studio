/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
} = require("electron");
const { installLocalOnlyNetworkPolicy } = require("./network-policy.cjs");
const {
  applyPendingDataMigration,
  saveBackup,
  saveEncryptedBackup,
  scheduleDataDirectoryMigration,
  setBackupDirectory,
  storageSettingsSnapshot,
} = require("./storage-locations.cjs");

const APP_NAME = "ORNL OrgChart Studio";
const APP_ID = "gov.ornl.orgchart-studio";
const SERVER_READY_TIMEOUT_MS = 30_000;
const SERVER_STOP_TIMEOUT_MS = 5_000;
const MCP_RUNTIME_FILE_NAME = "mcp-runtime.json";
const smokeTest = process.env.ORGCHART_ELECTRON_SMOKE === "1";
const desktopToken = randomBytes(32).toString("hex");
const smokeUserDataPath = smokeTest
  ? path.join(app.getPath("temp"), `orgchart-studio-smoke-${process.pid}`)
  : null;

if (smokeUserDataPath) {
  fs.mkdirSync(smokeUserDataPath, { recursive: true });
  app.setPath("userData", smokeUserDataPath);
  app.once("quit", () => {
    fs.rmSync(smokeUserDataPath, { recursive: true, force: true });
  });
}

let mainWindow = null;
let serverProcess = null;
let serverUrl = null;
let quitting = false;
let allowWindowClose = false;
let requestedExitCode = 0;
let storageRuntime = null;
let rendererSaveState = "saved";
let quitDialogOpen = false;

app.setName(APP_NAME);
app.setAppUserModelId(APP_ID);

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(async () => {
  try {
    installLocalOnlyNetworkPolicy(session.defaultSession, desktopToken);
    storageRuntime = initializeStorageLocations();
    registerStorageHandlers();
    serverUrl = await startLocalServer();
    publishMcpRuntime(serverUrl);
    createMainWindow(serverUrl);
  } catch (error) {
    console.error(`${APP_NAME} could not start.`, error);
    if (!smokeTest) {
      dialog.showErrorBox(
        `${APP_NAME} could not start`,
        `${error.message}\n\nNo organizational data was uploaded or sent anywhere.`,
      );
    }
    requestedExitCode = 1;
    await beginQuit();
  }
});

app.on("activate", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
});

app.on("before-quit", (event) => {
  if (allowWindowClose) return;
  event.preventDefault();
  void requestUserQuit();
});

app.on("window-all-closed", () => {
  if (!quitting) void beginQuit();
});

async function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error || !port) reject(error || new Error("No local port was available."));
        else resolve(port);
      });
    });
  });
}

async function startLocalServer() {
  const projectRoot = app.getAppPath();
  const nodeExecutable = process.env.ORGCHART_NODE_BIN;
  const wranglerCli = path.join(
    projectRoot,
    "node_modules",
    "wrangler",
    "wrangler-dist",
    "cli.js",
  );
  const wranglerConfig = path.join(projectRoot, "dist", "server", "wrangler.json");
  const dataPath = storageRuntime.dataDirectory;
  const logsPath = path.join(app.getPath("userData"), "logs");

  if (!nodeExecutable || !fs.existsSync(nodeExecutable)) {
    throw new Error("The private Node.js runtime was not supplied by the launcher.");
  }
  if (!fs.existsSync(wranglerCli) || !fs.existsSync(wranglerConfig)) {
    throw new Error("The desktop build is incomplete. Run the setup script again.");
  }
  fs.mkdirSync(dataPath, { recursive: true });
  fs.mkdirSync(logsPath, { recursive: true });

  const port = await availablePort();
  const url = `http://127.0.0.1:${port}/`;
  let stderr = "";
  let exited = false;

  serverProcess = spawn(
    nodeExecutable,
    [
      wranglerCli,
      "dev",
      "--config",
      wranglerConfig,
      "--local",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      dataPath,
      "--log-level",
      "error",
      "--show-interactive-dev-session",
      "false",
      "--var",
      `ORGCHART_DESKTOP_TOKEN:${desktopToken}`,
    ],
    {
      cwd: projectRoot,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        MINIFLARE_REGISTRY_PATH: path.join(dataPath, "registry"),
        NO_UPDATE_NOTIFIER: "1",
        WRANGLER_LOG_PATH: path.join(logsPath, "wrangler.log"),
        WRANGLER_SEND_METRICS: "false",
        WRANGLER_WRITE_LOGS: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  serverProcess.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  serverProcess.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
    if (stderr.length > 12_000) stderr = stderr.slice(-12_000);
    process.stderr.write(chunk);
  });
  serverProcess.once("exit", (code) => {
    exited = true;
    serverProcess = null;
    if (!quitting && serverUrl) {
      requestedExitCode = code === 0 ? 0 : 1;
      if (!smokeTest) {
        dialog.showErrorBox(
          `${APP_NAME} stopped`,
          "Its private local data service stopped unexpectedly. Reopen the app to continue.",
        );
      }
      void beginQuit();
    }
  });

  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(`The private local data service exited during startup.\n${stderr.trim()}`);
    }
    try {
      const response = await fetch(`${url}api/charts`, {
        headers: { "X-OrgChart-Desktop-Token": desktopToken },
        signal: AbortSignal.timeout(750),
      });
      if (response.ok) return url;
    } catch {
      // The local Worker is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 175));
  }

  throw new Error(`The private local data service did not become ready.\n${stderr.trim()}`);
}

function storageArguments() {
  return {
    userDataPath: app.getPath("userData"),
    projectRoot: app.getAppPath(),
  };
}

function initializeStorageLocations() {
  const args = storageArguments();
  let settings = applyPendingDataMigration(args);
  if (smokeTest && !settings.backupDirectory) {
    const smokeBackupDirectory = path.join(args.userDataPath, "smoke-backups");
    fs.mkdirSync(smokeBackupDirectory, { recursive: true });
    settings = setBackupDirectory({
      ...args,
      selectedDirectory: smokeBackupDirectory,
    });
  }
  if (!settings.dataDirectoryIsOutsideRepository) {
    throw new Error("The live chart data folder must remain outside the source repository.");
  }
  if (settings.dataDirectoryIsCloudSynced) {
    throw new Error(
      "The live chart database cannot run from a cloud-sync folder. Choose a local data folder.",
    );
  }
  return settings;
}

function registerStorageHandlers() {
  ipcMain.on("app:save-state", (_event, state) => {
    if (["saved", "saving", "proposal", "error"].includes(state)) {
      rendererSaveState = state;
    }
  });
  ipcMain.handle("app:request-quit", async () => {
    return requestUserQuit();
  });
  ipcMain.handle("storage:get-settings", () =>
    storageSettingsSnapshot(storageArguments()),
  );
  ipcMain.handle("storage:choose-data-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose an empty local folder for live chart data",
      buttonLabel: "Use as live data folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return storageSettingsSnapshot(storageArguments());
    }
    storageRuntime = scheduleDataDirectoryMigration({
      ...storageArguments(),
      selectedDirectory: result.filePaths[0],
    });
    return storageRuntime;
  });
  ipcMain.handle("storage:choose-backup-directory", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "Choose a folder for encrypted OrgChart Studio backups",
      buttonLabel: "Use as backup folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return storageSettingsSnapshot(storageArguments());
    }
    storageRuntime = setBackupDirectory({
      ...storageArguments(),
      selectedDirectory: result.filePaths[0],
    });
    return storageRuntime;
  });
  ipcMain.handle("storage:restart", () => {
    const settings = storageSettingsSnapshot(storageArguments());
    if (!settings.restartRequired) return false;
    app.relaunch();
    void beginQuit();
    return true;
  });
  ipcMain.handle("backup:save-encrypted", (_event, payload) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Encrypted backup details were not provided.");
    }
    return saveEncryptedBackup({
      userDataPath: app.getPath("userData"),
      fileName: payload.fileName,
      encryptedJson: payload.encryptedJson,
    });
  });
  ipcMain.handle("backup:save", (_event, payload) => {
    if (!payload || typeof payload !== "object") {
      throw new Error("Backup details were not provided.");
    }
    return saveBackup({
      userDataPath: app.getPath("userData"),
      fileName: payload.fileName,
      backupJson: payload.backupJson,
      encrypted: payload.encrypted === true,
    });
  });
}

function mcpRuntimePath() {
  return path.join(app.getPath("userData"), MCP_RUNTIME_FILE_NAME);
}

function publishMcpRuntime(url) {
  const target = mcpRuntimePath();
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(
      temporary,
      `${JSON.stringify({
        version: 1,
        pid: process.pid,
        baseUrl: url,
        token: desktopToken,
        startedAt: new Date().toISOString(),
      })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    fs.renameSync(temporary, target);
    try {
      fs.chmodSync(target, 0o600);
    } catch {
      // Some Windows filesystems do not implement POSIX modes.
    }
  } catch (error) {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
    console.error("The optional local MCP connection could not be published.", error);
  }
}

function removeMcpRuntime() {
  const target = mcpRuntimePath();
  if (!fs.existsSync(target)) return;
  try {
    const descriptor = JSON.parse(fs.readFileSync(target, "utf8"));
    if (descriptor?.pid === process.pid) fs.rmSync(target, { force: true });
  } catch {
    // Leave an unreadable file for the next app start to replace safely.
  }
}

function createMainWindow(url) {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1500,
    height: 980,
    minWidth: 1040,
    minHeight: 720,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      webSecurity: true,
      navigateOnDragDrop: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (isAllowedExternalUrl(targetUrl)) void shell.openExternal(targetUrl);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl.startsWith(url)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(targetUrl)) void shell.openExternal(targetUrl);
  });
  mainWindow.on("close", (event) => {
    if (allowWindowClose) return;
    event.preventDefault();
    void requestUserQuit();
  });
  mainWindow.once("ready-to-show", () => {
    if (!smokeTest) mainWindow.show();
  });
  mainWindow.webContents.once("did-finish-load", async () => {
    if (!smokeTest) return;
    try {
      const capabilities = await mainWindow.webContents.executeJavaScript(`(async () => {
        const waitFor = async (predicate, label, timeoutMs = 8000) => {
          const deadline = Date.now() + timeoutMs;
          while (Date.now() < deadline) {
            const value = await predicate();
            if (value) return value;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          throw new Error('Timed out waiting for ' + label + '.');
        };
        const signalProposalReady = async (proposal, activityId, operation = 'replace_chart_draft') => {
          await fetch('/api/ai-activity', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'complete',
              activityId,
              operation,
              label: 'Reviewing synthetic proposal',
              chartId: proposal.chartId,
              chartName: proposal.chartName,
              succeeded: true,
              completionKind: 'review_ready',
              proposalId: proposal.id
            })
          });
        };
        const openProposalReview = async (proposal, activityId) => {
          await signalProposalReady(proposal, activityId);
          return waitFor(
            () => document.querySelector('.ai-review-panel'),
            'the automatically opened AI proposal panel'
          );
        };
        const openImportReview = async (proposal, activityId) => {
          await signalProposalReady(proposal, activityId, 'stage_normalized_import');
          return waitFor(
            () => document.querySelector('.ai-import-review-panel'),
            'the automatically opened AI import review panel'
          );
        };
        const buttonReceivesPointer = (button) => {
          const rect = button.getBoundingClientRect();
          const hit = document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2
          );
          return hit === button || button.contains(hit);
        };
        const chartLibrary = await fetch('/api/charts', { cache: 'no-store' }).then((response) => response.json());
        const chartLibraryInitiallyVisible = await waitFor(
          () => document.body.textContent.includes('Organizational chart library'),
          'the chart library workspace'
        );
        const created = await fetch('/api/charts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'create', name: 'Electron smoke fixture' })
        }).then((response) => response.json());
        await fetch('/api/ai-activity', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'complete',
            activityId: 'electron-smoke-library-refresh',
            operation: 'create_chart_draft',
            label: 'Creating chart draft',
            chartId: created.chart.id,
            chartName: created.chart.name,
            succeeded: true,
            completionKind: 'saved'
          })
        });
        const mcpLibraryAutoRefresh = await waitFor(
          () => [...document.querySelectorAll('.chart-card h2')].some(
            (heading) => heading.textContent === created.chart.name
          ),
          'the MCP-created chart to appear without a page reload'
        );
        const editedChart = {
          ...created.chart,
          nodes: created.chart.nodes.map((node, index) => index === 0 ? {
            ...node,
            position: { x: 321, y: 654 },
            data: {
              ...node.data,
              pinned: true,
              unit: { ...node.data.unit, shortName: 'Edited smoke root' }
            }
          } : node)
        };
        const savedWorking = await fetch('/api/charts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'save', chart: editedChart })
        }).then((response) => response.json());
        const snapshot = await fetch('/api/charts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'snapshot', chart: savedWorking.chart, label: 'Electron version smoke' })
        }).then((response) => response.json());
        const staleSaveResponse = await fetch('/api/charts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'save', chart: editedChart })
        });
        const staleSave = await staleSaveResponse.json();
        const versionHistory = await fetch(
          '/api/charts?resource=versions&chartId=' + encodeURIComponent(created.chart.id),
          { cache: 'no-store' }
        ).then((response) => response.json());
        const initialVersion = versionHistory.versions.find((item) => item.version === 1);
        const restored = await fetch('/api/charts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'restore_version',
            chartId: created.chart.id,
            versionId: initialVersion.id
          })
        }).then((response) => response.json());
        const chartValidation = await fetch(
          '/api/charts?resource=validate&chartId=' + encodeURIComponent(created.chart.id),
          { cache: 'no-store' }
        ).then((response) => response.json());
        const rejectedProposalDocument = {
          ...restored.chart,
          nodes: restored.chart.nodes.map((node, index) => index === 0 ? {
            ...node,
            data: {
              ...node.data,
              unit: { ...node.data.unit, assignmentLabel: 'Synthetic rejected proposal' }
            }
          } : node)
        };
        const rejectedProposal = await fetch('/api/ai-proposals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'stage', chart: rejectedProposalDocument })
        }).then((response) => response.json());
        await openProposalReview(rejectedProposal.proposal, 'electron-smoke-reject');
        const rejectButton = document.querySelector('[data-ai-proposal-action="reject"]');
        const applyButtonBesideReject = document.querySelector('[data-ai-proposal-action="accept"]');
        const rejectButtonClickable =
          rejectButton instanceof HTMLButtonElement &&
          !rejectButton.disabled &&
          buttonReceivesPointer(rejectButton);
        const applyButtonClickableBeforeReject =
          applyButtonBesideReject instanceof HTMLButtonElement &&
          !applyButtonBesideReject.disabled &&
          buttonReceivesPointer(applyButtonBesideReject);
        rejectButton.click();
        await waitFor(
          () => !document.querySelector('.ai-review-panel'),
          'the rejected proposal panel to close'
        );
        const afterReject = await fetch('/api/charts', { cache: 'no-store' })
          .then((response) => response.json())
          .then((library) => library.charts.find((chart) => chart.id === created.chart.id));
        const rejectRoundTrip =
          afterReject.nodes[0].data.unit.assignmentLabel !== 'Synthetic rejected proposal';

        const acceptedProposalDocument = {
          ...afterReject,
          nodes: afterReject.nodes.map((node, index) => index === 0 ? {
            ...node,
            data: {
              ...node.data,
              unit: { ...node.data.unit, assignmentLabel: 'Synthetic accepted proposal' }
            }
          } : node)
        };
        const acceptedProposal = await fetch('/api/ai-proposals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'stage', chart: acceptedProposalDocument })
        }).then((response) => response.json());
        await openProposalReview(acceptedProposal.proposal, 'electron-smoke-accept');
        const applyButton = document.querySelector('[data-ai-proposal-action="accept"]');
        const applyButtonClickable =
          applyButton instanceof HTMLButtonElement &&
          !applyButton.disabled &&
          buttonReceivesPointer(applyButton);
        applyButton.click();
        await waitFor(
          () => !document.querySelector('.ai-review-panel'),
          'the accepted proposal panel to close'
        );
        const afterAccept = await fetch('/api/charts', { cache: 'no-store' })
          .then((response) => response.json())
          .then((library) => library.charts.find((chart) => chart.id === created.chart.id));
        const applyRoundTrip =
          afterAccept.nodes[0].data.unit.assignmentLabel === 'Synthetic accepted proposal';
        const normalizedCsv = [
          'id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility',
          'smoke-root,Smoke Organization,Smoke Organization,laboratory,,Director,Position vacant,vacant,Current,internal',
          'smoke-child,Smoke Division,Smoke Division,division,smoke-root,Division Director,Position vacant,vacant,Current,internal'
        ].join('\\n');
        const intakeForm = (validateOnly) => {
          const form = new FormData();
          form.set('chartName', 'Assisted intake smoke');
          form.set('file', new File([normalizedCsv], 'normalized.csv', { type: 'text/csv' }));
          form.set('evidence', new File(['synthetic evidence'], 'source.pdf', { type: 'application/pdf' }));
          if (validateOnly) form.set('validateOnly', '1');
          return form;
        };
        const intakePreview = await fetch('/api/charts', {
          method: 'POST',
          body: intakeForm(true)
        }).then((response) => response.json());
        const imported = await fetch('/api/charts', {
          method: 'POST',
          body: intakeForm(false)
        }).then((response) => response.json());
        const importedEvidence = imported.chart.sources.find(
          (source) => source.sourceType === 'guided_extraction'
        );
        const evidenceDownload = await fetch(
          '/api/charts?resource=source&sourceId=' + encodeURIComponent(importedEvidence.id),
          { cache: 'no-store' }
        );
        const evidenceDownloadText = await evidenceDownload.text();
        const sourceIntakeForm = new FormData();
        sourceIntakeForm.set('name', 'Synthetic AI import intake');
        sourceIntakeForm.set(
          'evidence',
          new File(['synthetic staged evidence'], 'staged-source.pdf', { type: 'application/pdf' })
        );
        const sourceIntake = await fetch('/api/import-intakes', {
          method: 'POST',
          body: sourceIntakeForm
        }).then((response) => response.json());
        const stagedNormalizedCsv = [
          'id,name,shortName,type,parentId,positionTitle,assignmentLabel,positionStatus,effectiveDate,publicationVisibility,source,sourceLocator,sourceCertainty,reviewNote,planningState',
          'staged-root,Staged Organization,Staged Organization,division,,Director,Position vacant,vacant,October 1 2026,internal,Synthetic staged evidence,Slide 1,inferred,Confirm the source connector,planned'
        ].join('\\n');
        const stagedImport = await fetch('/api/ai-import-proposals', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'stage',
            chartName: 'Synthetic staged AI chart',
            format: 'csv',
            contents: stagedNormalizedCsv,
            intakeId: sourceIntake.intake.id
          })
        }).then((response) => response.json());
        await openImportReview(stagedImport.proposal, 'electron-smoke-ai-import');
        const rejectImportButton = document.querySelector('[data-ai-import-action="reject"]');
        const createImportButton = document.querySelector('[data-ai-import-action="accept"]');
        const importButtonsClickable =
          rejectImportButton instanceof HTMLButtonElement &&
          !rejectImportButton.disabled &&
          buttonReceivesPointer(rejectImportButton) &&
          createImportButton instanceof HTMLButtonElement &&
          !createImportButton.disabled &&
          buttonReceivesPointer(createImportButton);
        createImportButton.click();
        await waitFor(
          () => !document.querySelector('.ai-import-review-panel'),
          'the accepted AI import panel to close'
        );
        const stagedImportedChart = await fetch('/api/charts', { cache: 'no-store' })
          .then((response) => response.json())
          .then((library) => library.charts.find((chart) => chart.name === 'Synthetic staged AI chart'));
        const stagedImportRoundTrip =
          stagedImportedChart.sources.length === 2 &&
          stagedImportedChart.nodes[0].data.unit.sourceLocator === 'Slide 1' &&
          stagedImportedChart.nodes[0].data.unit.sourceCertainty === 'inferred' &&
          stagedImportedChart.nodes[0].data.unit.planningState === 'planned';
        const importedIntakeDiscardResponse = await fetch('/api/import-intakes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'discard', intakeId: sourceIntake.intake.id })
        });
        const stagedEvidenceSource = stagedImportedChart.sources.find(
          (source) => source.sourceType === 'guided_extraction'
        );
        const stagedEvidenceAfterDiscardAttempt = await fetch(
          '/api/charts?resource=source&sourceId=' + encodeURIComponent(stagedEvidenceSource.id),
          { cache: 'no-store' }
        );
        const archiveChartForDeletion = async (chartId) => {
          const chart = await fetch('/api/charts', { cache: 'no-store' })
            .then((response) => response.json())
            .then((library) => library.charts.find((candidate) => candidate.id === chartId));
          if (!chart) throw new Error('The smoke-test chart could not be found for cleanup.');
          if (chart.status === 'archived') return chart;
          const response = await fetch('/api/charts', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              action: 'transition_status',
              chartId,
              targetStatus: 'archived',
              expectedVersion: chart.version,
              expectedUpdatedAt: chart.updatedAt
            })
          });
          if (!response.ok) throw new Error('The smoke-test chart could not be archived for cleanup.');
          return response.json().then((result) => result.chart);
        };
        await archiveChartForDeletion(imported.chart.id);
        const importedDeleted = await fetch('/api/charts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'delete', chartId: imported.chart.id })
        }).then((response) => response.json());
        await archiveChartForDeletion(stagedImportedChart.id);
        const stagedImportedDeleted = await fetch('/api/charts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'delete', chartId: stagedImportedChart.id })
        }).then((response) => response.json());
        const intakesAfterStagedDelete = await fetch('/api/import-intakes', { cache: 'no-store' })
          .then((response) => response.json());
        const importedIntakeMetadataCleaned = !intakesAfterStagedDelete.intakes.some(
          (intake) => intake.id === sourceIntake.intake.id
        );
        await archiveChartForDeletion(created.chart.id);
        const deleted = await fetch('/api/charts', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'delete', chartId: created.chart.id })
        }).then((response) => response.json());
        const storageSettings = await window.orgChartDesktop.getStorageSettings();
        const encryptedBackupSave = await window.orgChartDesktop.saveEncryptedBackup(
          'orgchart-studio-backup-electron-smoke.orgchart-backup',
          JSON.stringify({
            format: 'orgchart-studio-encrypted-backup',
            version: 1,
            createdAt: new Date().toISOString(),
            encryption: {
              cipher: 'AES-GCM',
              keyLength: 256,
              kdf: 'PBKDF2',
              hash: 'SHA-256',
              iterations: 250000,
              saltBase64: 'c21va2U=',
              ivBase64: 'c21va2U='
            },
            ciphertextBase64: 'c21va2U='
          })
        );
        const unencryptedBackupSave = await window.orgChartDesktop.saveBackup(
          'orgchart-studio-backup-unencrypted-electron-smoke.orgchart-backup',
          JSON.stringify({
            format: 'orgchart-studio-library-backup',
            schemaVersion: 2,
            scope: 'all',
            exportedAt: new Date().toISOString(),
            chartCount: 1,
            sourceFileCount: 0,
            versionCount: 0,
            charts: [{ id: 'smoke-backup-chart' }],
            chartVersions: [],
            sourceFiles: []
          }),
          false
        );
        const aiControlNavigation = [...document.querySelectorAll('.sidebar button')].find(
          (button) => button.textContent.includes('Local AI control')
        );
        aiControlNavigation.click();
        await waitFor(
          () => document.body.textContent.includes('Local AI control center'),
          'the local AI control center'
        );
        const pauseAiButton = [...document.querySelectorAll('.ai-control-panel button')].find(
          (button) => button.textContent.includes('Pause local AI access')
        );
        pauseAiButton.click();
        const pausedControl = await waitFor(async () => {
          const state = await fetch('/api/mcp-control', { cache: 'no-store' }).then((response) => response.json());
          return state.control.paused ? state.control : null;
        }, 'local AI access to pause');
        const resumeAiButton = await waitFor(
          () => [...document.querySelectorAll('.ai-control-panel button')].find(
            (button) => button.textContent.includes('Resume local AI access')
          ),
          'the resume local AI button'
        );
        resumeAiButton.click();
        const resumedControl = await waitFor(async () => {
          const state = await fetch('/api/mcp-control', { cache: 'no-store' }).then((response) => response.json());
          return state.control.paused ? null : state.control;
        }, 'local AI access to resume');
        return {
          localOnly: location.hostname === '127.0.0.1',
          desktopBridge: window.orgChartDesktop?.isDesktop === true,
          desktopQuitBridge: typeof window.orgChartDesktop?.requestQuit === 'function',
          desktopSaveStateBridge: typeof window.orgChartDesktop?.reportSaveState === 'function',
          desktopQuitVisible: Boolean(document.querySelector('[data-desktop-quit]')),
          userAgentIncludesElectron: navigator.userAgent.includes('Electron'),
          externalRequestBlocked: await fetch('https://example.com/orgchart-network-test').then(() => false, () => true),
          chartLibraryVisible: chartLibraryInitiallyVisible,
          mcpLibraryAutoRefresh: Boolean(mcpLibraryAutoRefresh),
          sourcesVisible: document.body.textContent.includes('Sources & imports'),
          backupsVisible: document.body.textContent.includes('Backup & restore'),
          startsWithoutExampleCharts: chartLibrary.charts.length === 0,
          localWriteRoundTrip: deleted.deleted === created.chart.id,
          workingDraftRoundTrip:
            savedWorking.chart.nodes[0].position.x === 321 &&
            savedWorking.chart.nodes[0].position.y === 654 &&
            savedWorking.chart.nodes[0].data.pinned === true,
          versionHistoryRoundTrip:
            snapshot.chart.version === 2 &&
            versionHistory.versions.length === 2 &&
            restored.chart.version === 3 &&
            restored.chart.nodes[0].data.unit.shortName === 'Untitled organization',
          staleAutosaveProtected:
            staleSaveResponse.status === 409 &&
            staleSave.currentVersion === 2,
          chartValidationRoundTrip:
            chartValidation.chartId === created.chart.id &&
            chartValidation.valid === true &&
            chartValidation.findings.length === 0,
          aiProposalButtonsClickable:
            rejectButtonClickable &&
            applyButtonClickableBeforeReject &&
            applyButtonClickable,
          aiProposalRejectRoundTrip: rejectRoundTrip,
          aiProposalApplyRoundTrip: applyRoundTrip,
          aiImportButtonsClickable: importButtonsClickable,
          stagedAiImportRoundTrip:
            stagedImportRoundTrip &&
            importedIntakeDiscardResponse.status === 409 &&
            stagedEvidenceAfterDiscardAttempt.ok &&
            stagedImportedDeleted.deleted === stagedImportedChart.id &&
            importedIntakeMetadataCleaned,
          mcpControlRoundTrip:
            pausedControl.paused === true && resumedControl.paused === false,
          assistedImportRoundTrip:
            intakePreview.preview.rowCount === 2 &&
            imported.chart.sources.length === 2 &&
            imported.chart.sources.some((source) => source.sourceType === 'guided_extraction') &&
            importedDeleted.deleted === imported.chart.id,
          sourceEvidenceRoundTrip:
            evidenceDownload.ok &&
            evidenceDownloadText === 'synthetic evidence' &&
            evidenceDownload.headers.get('x-content-type-options') === 'nosniff',
          dataOutsideRepository:
            storageSettings.dataDirectoryIsOutsideRepository === true &&
            storageSettings.dataDirectoryIsCloudSynced === false,
          storageFoldersSeparated:
            Boolean(storageSettings.backupDirectory) &&
            storageSettings.backupDirectory !== storageSettings.dataDirectory,
          encryptedBackupFolderRoundTrip:
            encryptedBackupSave.fileName === 'orgchart-studio-backup-electron-smoke.orgchart-backup' &&
            encryptedBackupSave.bytes > 0,
          unencryptedBackupFolderRoundTrip:
            unencryptedBackupSave.fileName === 'orgchart-studio-backup-unencrypted-electron-smoke.orgchart-backup' &&
            unencryptedBackupSave.bytes > 0
        };
      })()`);
      const runtimeFile = mcpRuntimePath();
      const runtimeDescriptor = JSON.parse(fs.readFileSync(runtimeFile, "utf8"));
      capabilities.mcpRuntimePublished =
        runtimeDescriptor.version === 1 &&
        runtimeDescriptor.pid === process.pid &&
        runtimeDescriptor.baseUrl === serverUrl &&
        runtimeDescriptor.token === desktopToken &&
        (process.platform === "win32" ||
          (fs.statSync(runtimeFile).mode & 0o077) === 0);
      const passed = Object.values(capabilities).every(Boolean);
      console.log(`ORGCHART_ELECTRON_SMOKE ${JSON.stringify({ passed, ...capabilities })}`);
      if (!passed) requestedExitCode = 1;
    } catch (error) {
      requestedExitCode = 1;
      console.error("Electron smoke test failed.", error);
    }
    await beginQuit();
  });
  mainWindow.webContents.once(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
      if (!smokeTest || !isMainFrame) return;
      requestedExitCode = 1;
      console.error(
        `Electron smoke page failed to load (${errorCode}): ${errorDescription} - ${validatedUrl}`,
      );
      void beginQuit();
    },
  );

  void mainWindow.loadURL(url);
}

function isAllowedExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

async function requestUserQuit() {
  if (quitting) return true;
  if (quitDialogOpen) return false;
  quitDialogOpen = true;
  try {
    if (rendererSaveState === "saving") {
      await dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Saving is still in progress",
        message: "Wait for Saved before closing OrgChart Studio.",
        detail:
          "The app is still writing your latest chart decision to local storage. Keep it open until the top bar changes from Saving to Saved, then close it again.",
        buttons: ["Keep app open"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      return false;
    }

    const hasSaveIssue = rendererSaveState === "error";
    const result = await dialog.showMessageBox(mainWindow, {
      type: hasSaveIssue ? "error" : "warning",
      title: `Quit ${APP_NAME}?`,
      message: hasSaveIssue
        ? "The latest change may not be saved."
        : `Quit ${APP_NAME}?`,
      detail: hasSaveIssue
        ? "The top bar shows Save issue. Keep the app open to retry or resolve the problem. Quitting now may require redoing the latest unsaved change; previously saved charts remain on this computer."
        : "The app window, its local MCP connection, and its private local server will close. Changes already showing Saved, pending review proposals, and existing backups will remain on this computer.",
      buttons: hasSaveIssue ? ["Keep app open", "Quit without latest change"] : ["Cancel", "Quit"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (result.response !== 1) return false;
    setImmediate(() => void beginQuit());
    return true;
  } finally {
    quitDialogOpen = false;
  }
}

async function beginQuit() {
  if (quitting) return;
  quitting = true;
  removeMcpRuntime();
  await stopLocalServer();
  allowWindowClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  app.exit(requestedExitCode);
}

async function stopLocalServer() {
  const activeProcess = serverProcess;
  if (!activeProcess?.pid) return;
  const pid = activeProcess.pid;
  const exited = new Promise((resolve) => activeProcess.once("exit", resolve));

  try {
    if (process.platform === "win32") activeProcess.kill("SIGTERM");
    else process.kill(-pid, "SIGTERM");
  } catch {
    activeProcess.kill("SIGTERM");
  }

  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, SERVER_STOP_TIMEOUT_MS)),
  ]);
  if (!serverProcess) return;

  try {
    if (process.platform === "win32") activeProcess.kill("SIGKILL");
    else process.kill(-pid, "SIGKILL");
  } catch {
    activeProcess.kill("SIGKILL");
  }
}
