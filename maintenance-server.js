/**
 * maintenance-server.js
 *
 * Tiny Node.js HTTP server that runs on port 3000 while the Next.js app is
 * being built during a deploy. Reads maintenance.html from disk on every
 * request so the version badge updates automatically once the new archive
 * is extracted — no restart needed.
 *
 * Started by deploy.sh right after `pm2 stop`, killed right before `pm2 start`.
 */

const http = require("http")
const fs   = require("fs")
const path = require("path")

const HTML_PATH = path.join(__dirname, "maintenance.html")
const FALLBACK  = `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>מערכת Helpdesk — עדכון</title>
  <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#1e3a8a;color:#fff;direction:rtl;text-align:center}</style>
  </head><body><div><h1>⚙️ המערכת בעדכון</h1><p>אנא המתן...</p></div></body></html>`

http.createServer((_req, res) => {
  let body = FALLBACK
  try { body = fs.readFileSync(HTML_PATH, "utf8") } catch { /* not ready yet */ }

  res.writeHead(503, {
    "Content-Type":  "text/html; charset=utf-8",
    "Retry-After":   "120",
    "Cache-Control": "no-store, no-cache",
  })
  res.end(body)
}).listen(3000, () => {
  process.stdout.write("[maintenance] serving port 3000\n")
})
