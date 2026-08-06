@echo off
echo Starting CardLister...
echo.

start "CardLister API" cmd /k "SET PORT=5001 && SET BASE_PATH=/api && pnpm --filter @workspace/api-server run dev"
start "CardLister Web" cmd /k "SET PORT=3000 && SET BASE_PATH=/ && pnpm --filter @workspace/card-lister run dev"

echo Both servers are starting in new windows.
echo   API server:  http://localhost:5001
echo   Frontend:    http://localhost:3000
echo.
echo Close those windows to stop the servers.
