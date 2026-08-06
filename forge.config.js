import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const macIcon = path.join(projectRoot, "packaging", "assets", "OrgChartStudio.icns");
const windowsIcon = path.join(projectRoot, "packaging", "assets", "OrgChartStudio.ico");
const macSigningEnabled = process.env.MACOS_SIGNING_ENABLED === "1";
const macNotarizeConfig =
  process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER
    ? {
        appleApiKey: process.env.APPLE_API_KEY,
        appleApiKeyId: process.env.APPLE_API_KEY_ID,
        appleApiIssuer: process.env.APPLE_API_ISSUER,
      }
    : process.env.APPLE_ID &&
        process.env.APPLE_APP_SPECIFIC_PASSWORD &&
        process.env.APPLE_TEAM_ID
      ? {
          appleId: process.env.APPLE_ID,
          appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
          teamId: process.env.APPLE_TEAM_ID,
        }
      : null;
const windowsCertificateConfigured =
  Boolean(process.env.WINDOWS_CERTIFICATE_FILE) &&
  Boolean(process.env.WINDOWS_CERTIFICATE_PASSWORD);

const forgeConfig = {
  packagerConfig: {
    appBundleId: "gov.ornl.orgchart-studio",
    appCategoryType: "public.app-category.business",
    appCopyright: "Copyright UT-Battelle LLC",
    asar: false,
    executableName: "ORNL OrgChart Studio",
    icon: process.platform === "darwin" ? macIcon : windowsIcon,
    name: "ORNL OrgChart Studio",
    overwrite: true,
    prune: true,
    ...(macSigningEnabled ? { osxSign: {} } : {}),
    ...(macSigningEnabled && macNotarizeConfig ? { osxNotarize: macNotarizeConfig } : {}),
    ignore: [
      /^\/(?:\.git|\.github|\.githooks|\.cache|\.next|\.openai|\.vinext|\.wrangler|build|docs|drizzle|examples|out|output|outputs|release-notes|releases|tests|tmp|work|worker)(?:\/|$)/,
      /^\/(?:\.DS_Store|\.gitattributes|\.gitignore)$/,
      /^\/(?:README|AGENTS|CLAUDE|TEST-REPORT)\.md$/,
      /^\/app(?:\/|$)/,
      /^\/db(?:\/|$)/,
      /^\/lib(?:\/|$)/,
      /^\/types(?:\/|$)/,
      /^\/public(?:\/|$)/,
      /^\/scripts\/(?!configure-orgchart-mcp\.mjs$|run-packaged-wrangler\.cjs$)/,
      /^\/packaging(?:\/|$)/,
      /^\/forge\.config\.js$/,
      /^\/tsconfig(?:\..+)?$/,
      /^\/(?:eslint|next|postcss|vite|wrangler)\.config\.[a-z]+$/,
      /^\/SECURITY\.md$/,
    ],
  },
  hooks: {
    postPackage: async (_forgeConfig, packageResult) => {
      if (packageResult.platform !== "darwin" || macSigningEnabled) return;
      for (const outputPath of packageResult.outputPaths) {
        const appPath = path.join(outputPath, "ORNL OrgChart Studio.app");
        if (!existsSync(appPath)) throw new Error(`Packaged Mac app was not found: ${appPath}`);
        const result = spawnSync(
          "/usr/bin/codesign",
          ["--force", "--deep", "--sign", "-", appPath],
          { stdio: "inherit" },
        );
        if (result.status !== 0) throw new Error(`Ad-hoc signing failed for ${appPath}`);
      }
    },
  },
  makers: [
    {
      name: "@electron-forge/maker-dmg",
      platforms: ["darwin"],
      config: {
        backgroundColor: "#EFF5F0",
        format: "ULFO",
        icon: macIcon,
        name: "ORNL OrgChart Studio",
      },
    },
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "ORNLOrgChartStudio",
        authors: "UT-Battelle LLC",
        description: "Private local desktop app for governed organizational chart data and layout.",
        setupIcon: windowsIcon,
        noMsi: true,
        ...(windowsCertificateConfigured
          ? {
              certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
              certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
            }
          : {}),
      },
    },
  ],
};

export default forgeConfig;
