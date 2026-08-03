const LOCAL_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const NON_NETWORK_PROTOCOLS = new Set(["about:", "blob:", "data:", "devtools:", "file:"]);

function isAllowedAppRequest(value) {
  try {
    const url = new URL(value);
    if (NON_NETWORK_PROTOCOLS.has(url.protocol)) return true;
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return false;
    return LOCAL_HOSTNAMES.has(url.hostname);
  } catch {
    return false;
  }
}

function installLocalOnlyNetworkPolicy(electronSession, desktopToken) {
  if (!electronSession?.webRequest?.onBeforeRequest) {
    throw new Error("Electron's network request filter is unavailable.");
  }

  electronSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowedAppRequest(details.url) });
  });

  electronSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    if (isAllowedAppRequest(details.url)) {
      requestHeaders["X-OrgChart-Desktop-Token"] = desktopToken;
    }
    callback({ requestHeaders });
  });
}

module.exports = {
  installLocalOnlyNetworkPolicy,
  isAllowedAppRequest,
};
