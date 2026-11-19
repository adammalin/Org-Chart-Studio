const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const NON_NETWORK_PROTOCOLS = new Set(["about:", "blob:", "data:", "devtools:", "file:"]);

function isAppOrigin(value, appUrl) {
  try {
    const target = new URL(value), app = new URL(appUrl);
    return app.protocol === "http:" && app.hostname === "127.0.0.1" &&
      !target.username && !target.password &&
      ["http:", "ws:"].includes(target.protocol) &&
      target.hostname === app.hostname && target.port === app.port;
  } catch { return false; }
}

function isAllowedAppRequest(value, appUrl) {
  try {
    const url = new URL(value);
    if (NON_NETWORK_PROTOCOLS.has(url.protocol)) {
      if (url.protocol === "file:") return !url.hostname || url.hostname === "localhost";
      return true;
    }
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return false;
    return LOCAL_HOSTNAMES.has(url.hostname) && isAppOrigin(value, appUrl);
  } catch {
    return false;
  }
}

function installLocalOnlyNetworkPolicy(electronSession, desktopToken, appUrl) {
  if (!electronSession?.webRequest?.onBeforeRequest) {
    throw new Error("Electron's network request filter is unavailable.");
  }

  const currentUrl = () => typeof appUrl === "function" ? appUrl() : appUrl;
  electronSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedAppRequest(details.url, currentUrl()) });
  });

  electronSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    // Never forward a pre-existing credential to a different local service,
    // including after a redirect or when a renderer supplies mixed-case keys.
    for (const name of Object.keys(requestHeaders)) {
      if (name.toLowerCase() === "x-orgchart-desktop-token") delete requestHeaders[name];
    }
    if (isAppOrigin(details.url, currentUrl())) {
      requestHeaders["X-OrgChart-Desktop-Token"] = desktopToken;
    }
    callback({ requestHeaders });
  });
}

module.exports = {
  installLocalOnlyNetworkPolicy,
  isAllowedAppRequest,
  isAppOrigin,
};
