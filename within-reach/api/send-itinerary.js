// POST /api/send-itinerary — emails the traveller their itinerary PDF.
// The page builds the PDF; this route checks it and sends it through Resend (resend.com).
//
// Environment:
//   RESEND_API_KEY   Resend API key
//   MAIL_FROM        verified sender, e.g. "Within Reach <trips@yourdomain.com>"
// Without them the route answers 501 and the page offers a download instead.

const MAX_PDF_BYTES = 3 * 1024 * 1024;
const LIMIT = 5, WINDOW_MS = 60 * 60 * 1000; // 5 emails per visitor per hour
const hits = new Map();
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  list.push(now); hits.set(ip, list);
  if (hits.size > 10000) hits.clear();
  return list.length > LIMIT;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Use POST." }); }
  if (!process.env.RESEND_API_KEY || !process.env.MAIL_FROM) return res.status(501).json({ error: "Email is not set up on this server." });

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  if (limited(ip)) return res.status(429).json({ error: "Too many emails. Try again later." });

  const { email, name, filename, pdf } = req.body || {};
  if (typeof email !== "string" || email.length > 254 || !EMAIL.test(email)) return res.status(400).json({ error: "A valid email address is needed." });
  if (typeof pdf !== "string" || !pdf) return res.status(400).json({ error: "The PDF is missing." });
  const bytes = Buffer.from(pdf, "base64");
  if (bytes.length > MAX_PDF_BYTES || bytes.subarray(0, 5).toString() !== "%PDF-") return res.status(400).json({ error: "That isn't a valid itinerary PDF." });

  const first = typeof name === "string" && name.trim() ? name.trim().split(/\s+/)[0].slice(0, 40) : "";
  const file = typeof filename === "string" && /^[\w .-]{1,80}\.pdf$/.test(filename) ? filename : "Qatar itinerary.pdf";
  try {
    const r = await fetch((process.env.RESEND_API_BASE || "https://api.resend.com") + "/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [email],
        subject: "Your Qatar itinerary",
        html: `<p>Marhaba${first ? " " + esc(first) : ""},</p><p>Your Qatar itinerary is attached as a PDF. All times are Qatar time (GMT+3).</p><p>Khalid, your AI travel friend<br>Within Reach</p><p style="color:#5F7177;font-size:12px">Concept prototype: prices are illustrative and nothing is booked until you complete checkout.</p>`,
        attachments: [{ filename: file, content: pdf }],
      }),
    });
    if (!r.ok) { console.error("Resend error", r.status, await r.text()); return res.status(502).json({ error: "The email could not be sent." }); }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("send-itinerary error", error.message);
    return res.status(502).json({ error: "The email could not be sent." });
  }
}
