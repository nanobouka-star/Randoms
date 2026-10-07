// Local dev server: serves the static site and routes POST /api/khalid to the
// same handler Vercel runs. No framework.  Usage: ANTHROPIC_API_KEY=... npm start
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import handler from "./api/khalid.js";
import whatsapp from "./api/whatsapp.js";
import sendItinerary from "./api/send-itinerary.js";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PORT = Number(process.env.PORT) || 8000;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".svg": "image/svg+xml" };

function shim(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); return res; };
  return res;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/whatsapp") return whatsapp(req, shim(res));
  if (url.pathname === "/api/send-itinerary") {
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 5000000) return shim(res).status(413).json({ error: "Too large." }); }
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { return shim(res).status(400).json({ error: "Invalid JSON." }); }
    return sendItinerary(req, shim(res));
  }
  if (url.pathname === "/api/khalid") {
    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 200000) return shim(res).status(413).json({ error: "Too large." }); }
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { return shim(res).status(400).json({ error: "Invalid JSON." }); }
    return handler(req, shim(res));
  }
  const rel = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.join(ROOT, path.normalize(rel));
  if (!file.startsWith(ROOT + path.sep) || /[\\/](api|node_modules)[\\/]|server\.mjs$|package/.test(file.slice(ROOT.length))) {
    res.statusCode = 404; return res.end("Not found");
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, () => {
  console.log(`Within Reach on http://localhost:${PORT}` + (process.env.ANTHROPIC_API_KEY ? "" : "  (no ANTHROPIC_API_KEY: Khalid runs offline)"));
});
