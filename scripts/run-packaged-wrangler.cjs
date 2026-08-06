/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

// Wrangler's CLI recognizes "node" and "electron" when deciding where user
// arguments begin. A branded packaged Electron executable has a different
// filename, so normalize argv. Compile the CLI into this main module so its
// normal require.main guard still starts the command.
process.argv[0] = "electron";
process.defaultApp = true;
const cliPath = path.resolve(__dirname, "../node_modules/wrangler/wrangler-dist/cli.js");
const source = fs.readFileSync(cliPath, "utf8");
module.filename = cliPath;
module.paths = Module._nodeModulePaths(path.dirname(cliPath));
module._compile(source, cliPath);
