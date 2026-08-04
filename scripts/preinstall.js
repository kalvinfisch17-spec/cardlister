#!/usr/bin/env node
// Cross-platform preinstall script — works on Windows, Mac, and Linux
const fs = require("fs");
const agent = process.env.npm_config_user_agent || "";

// Remove lock files from other package managers
["package-lock.json", "yarn.lock"].forEach((f) => {
  try { fs.unlinkSync(f); } catch (_) {}
});

// Enforce pnpm
if (!agent.startsWith("pnpm/")) {
  process.stderr.write("Use pnpm instead of npm or yarn.\n");
  process.exit(1);
}
