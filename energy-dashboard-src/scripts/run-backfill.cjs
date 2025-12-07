#!/usr/bin/env node
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: "commonjs",
  moduleResolution: "node",
  esModuleInterop: true,
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("ts-node/register/transpile-only");
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./backfill-spot-prices.ts");
