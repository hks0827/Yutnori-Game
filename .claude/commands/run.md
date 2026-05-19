Start a local HTTP server for the Yutnori game and open it in the browser using Playwright MCP.

## Steps

1. Check if a server is already running on port 8765 with `lsof -ti:8765`. If running, skip to step 3.
2. Start the server: run `python3 -m http.server 8765 &>/tmp/yutnori-server.log &` from the current working directory, then wait 1 second.
3. Navigate to `http://localhost:8765` using the `mcp__playwright__browser_navigate` tool.
4. Take a screenshot with `mcp__playwright__browser_take_screenshot` to confirm the game loaded.
5. Report the URL and any console errors found.
