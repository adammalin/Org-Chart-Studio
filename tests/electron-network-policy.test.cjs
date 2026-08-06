/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  installLocalOnlyNetworkPolicy,
  isAllowedAppRequest,
} = require("../electron/network-policy.cjs");

test("desktop network policy accepts only loopback and non-network URLs", () => {
  for (const allowed of [
    "http://127.0.0.1:43123/api/charts",
    "http://localhost:43123/",
    "ws://127.0.0.1:43123/",
    "about:blank",
    "blob:http://127.0.0.1:43123/fixture",
    "data:text/plain,fixture",
  ]) {
    assert.equal(isAllowedAppRequest(allowed), true, allowed);
  }

  for (const blocked of [
    "https://example.com/",
    "http://192.168.1.25/",
    "wss://example.com/socket",
    "mailto:someone@example.com",
    "not a url",
  ]) {
    assert.equal(isAllowedAppRequest(blocked), false, blocked);
  }
});

test("desktop request filter blocks external URLs and adds the local token", () => {
  let beforeRequest;
  let beforeSendHeaders;
  const electronSession = {
    webRequest: {
      onBeforeRequest(callback) {
        beforeRequest = callback;
      },
      onBeforeSendHeaders(callback) {
        beforeSendHeaders = callback;
      },
    },
  };

  installLocalOnlyNetworkPolicy(electronSession, "desktop-secret");

  let result;
  beforeRequest({ url: "https://example.com/" }, (value) => {
    result = value;
  });
  assert.deepEqual(result, { cancel: true });

  beforeRequest({ url: "http://127.0.0.1:43123/" }, (value) => {
    result = value;
  });
  assert.deepEqual(result, { cancel: false });

  beforeSendHeaders(
    { url: "http://127.0.0.1:43123/", requestHeaders: { Accept: "text/html" } },
    (value) => {
      result = value;
    },
  );
  assert.deepEqual(result.requestHeaders, {
    Accept: "text/html",
    "X-OrgChart-Desktop-Token": "desktop-secret",
  });
});

test("desktop window keeps the Electron renderer isolated", () => {
  const source = readFileSync(
    path.join(__dirname, "..", "electron", "main.cjs"),
    "utf8",
  );

  assert.match(source, /contextIsolation:\s*true/);
  assert.match(source, /nodeIntegration:\s*false/);
  assert.match(source, /sandbox:\s*true/);
  assert.match(source, /webSecurity:\s*true/);
  assert.match(source, /navigateOnDragDrop:\s*false/);
  assert.match(source, /127\.0\.0\.1/);
  assert.match(source, /randomBytes\(32\)/);
});

test("desktop quit control confirms before using the clean shutdown path", () => {
  const mainSource = readFileSync(
    path.join(__dirname, "..", "electron", "main.cjs"),
    "utf8",
  );
  const preloadSource = readFileSync(
    path.join(__dirname, "..", "electron", "preload.cjs"),
    "utf8",
  );

  assert.match(preloadSource, /requestQuit:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("app:request-quit"\)/);
  assert.match(preloadSource, /reportSaveState:\s*\(state\)\s*=>\s*ipcRenderer\.send\("app:save-state",\s*state\)/);
  assert.match(preloadSource, /getMcpConfigurationStatus:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("mcp:configuration-status"\)/);
  assert.match(preloadSource, /configureMcp:\s*\(action\)\s*=>\s*ipcRenderer\.invoke\("mcp:configure",\s*action\)/);
  assert.match(mainSource, /ipcMain\.handle\("app:request-quit"/);
  assert.match(mainSource, /ipcMain\.on\("app:save-state"/);
  assert.match(mainSource, /rendererSaveState === "saving"/);
  assert.match(mainSource, /Wait for Saved before closing OrgChart Studio/);
  assert.match(mainSource, /Quit without latest change/);
  assert.match(mainSource, /mainWindow\.on\("close"[\s\S]*requestUserQuit\(\)/);
  assert.match(mainSource, /local MCP connection/);
  assert.match(mainSource, /private local server/);
  assert.match(mainSource, /setImmediate\(\(\)\s*=>\s*void beginQuit\(\)\)/);
  assert.match(mainSource, /removeMcpRuntime\(\);[\s\S]*await stopLocalServer\(\);/);
  assert.match(mainSource, /taskkill\.exe[\s\S]*"\/T"[\s\S]*"\/F"/);
  assert.match(
    mainSource,
    /if \(smokeTest\)[\s\S]*process\.exit\(requestedExitCode\)/,
  );
});
