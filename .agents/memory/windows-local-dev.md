---
name: Windows local dev setup
description: Quirks for running this pnpm monorepo on Windows with pnpm v11 and Node 24.
---

## Rules

1. **PORT env vars**: root `pnpm run dev` must use `cross-env` (installed at root) — bare `PORT=5001 cmd` is Unix-only and silently fails on Windows cmd/PowerShell.
2. **esbuild on pnpm v11**: `onlyBuiltDependencies` belongs in `pnpm-workspace.yaml` (not `package.json`). Also add `@esbuild/win32-x64` as a direct root devDependency pinned to the same version as esbuild (currently 0.27.3) so the binary is present without needing `pnpm approve-builds`.
3. **git stash before pull**: user's pnpm operations modify `pnpm-workspace.yaml` and `pnpm-lock.yaml` locally; always `git stash` before `git pull`.
4. **start.bat vs pnpm run dev**: `start.bat` (in repo root) opens two separate cmd windows using `SET PORT=…`; `pnpm run dev` uses concurrently + cross-env in one window. Both work after the cross-env fix.
5. **Close old windows**: after `pnpm run dev` fails, old compiled binaries keep running in background windows — must close them before restarting.

**Why:** pnpm v11 moved settings out of package.json; Windows cmd doesn't parse Unix env var syntax; esbuild needs its platform binary pre-installed.
