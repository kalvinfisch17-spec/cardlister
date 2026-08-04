#!/usr/bin/env node
// Cross-platform preinstall script — works on Windows, Mac, and Linux
import { unlinkSync } from "fs";

const agent = process.env.npm_config_user_agent || "";

// Remove lock files from other package managers
for (const f of ["package-lock.json", "yarn.lock"]) {
  try { unlinkSync(f); } catch (_) {}
}

// Enforce pnpm
if (!agent.startsWith("pnpm/")) {
  process.stderr.write("Use pnpm instead of npm or yarn.\n");
  process.exit(1);
}
