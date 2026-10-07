// /api/whatsapp — Khalid on WhatsApp (WhatsApp Business Platform, Cloud API).
//
//   GET  : Meta's webhook verification handshake.
//   POST : incoming messages. Verifies Meta's signature, asks Claude for
//          Khalid's reply, sends it back through the Cloud API.
//
// Environment:
//   ANTHROPIC_API_KEY        Claude API key
//   WHATSAPP_TOKEN           Cloud API access token (system user token)
//   WHATSAPP_VERIFY_TOKEN    any string; the same value goes in Meta's webhook settings
//   WHATSAPP_APP_SECRET      the Meta app secret, used to check X-Hub-Signature-256
//   WHATSAPP_GRAPH_VERSION   optional, defaults to v21.0
//   SITE_URL                 optional, the planner link Khalid sends for booking
//
// Each reply only sees the incoming message (no conversation memory). Add a
// store keyed by the sender's number if Khalid needs to remember earlier turns.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const KHALID = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "khalid.json"), "utf8"));
const GRAPH = (process.env.WHATSAPP_API_BASE || "https://graph.facebook.com") + "/" + (process.env.WHATSAPP_GRAPH_VERSION || "v21.0");
const seen = new Set(); // message ids already answered (Meta retries deliveries)
let client;

async function rawBody(req) {
  if (typeof req.rawBody === "string") return req.rawBody;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}

export function validSignature(raw, header, secret) {
  if (!header || !secret || !header.startsWith("sha256=")) return false;
  const want = Buffer.from(crypto.createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(header.slice(7));
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

async function khalidReply(text) {
  client ??= new Anthropic();
  const system = KHALID.whatsappRules + (process.env.SITE_URL ? `\nPlanner link for booking: ${process.env.SITE_URL}` : "");
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: text.slice(0, 4000) }],
  });
  if (response.stop_reason === "refusal") return "Let's keep it to your trip. Tell me when you're coming and what you love.";
  const reply = response.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  return reply.slice(0, 4000) || "Tell me when you're coming and what you love, and I'll help you plan.";
}

async function send(phoneNumberId, to, body) {
  const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
  if (!r.ok) console.error("WhatsApp send failed", r.status, await r.text());
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const q = new URL(req.url, "http://x").searchParams;
    if (q.get("hub.mode") === "subscribe" && process.env.WHATSAPP_VERIFY_TOKEN && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.statusCode = 200;
      return res.end(q.get("hub.challenge") || "");
    }
    return res.status(403).json({ error: "Verification failed." });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Use GET or POST." });
  }
  const raw = await rawBody(req);
  if (!validSignature(raw, req.headers["x-hub-signature-256"], process.env.WHATSAPP_APP_SECRET)) {
    return res.status(401).json({ error: "Bad signature." });
  }
  let payload;
  try { payload = JSON.parse(raw); } catch { return res.status(400).json({ error: "Invalid JSON." }); }

  const jobs = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const phoneNumberId = value.metadata && value.metadata.phone_number_id;
      for (const msg of value.messages || []) {
        if (!phoneNumberId || !msg.from || seen.has(msg.id)) continue;
        seen.add(msg.id);
        if (seen.size > 5000) seen.clear();
        const text = msg.type === "text" && msg.text ? msg.text.body : "";
        jobs.push((async () => {
          try {
            const reply = text.trim() ? await khalidReply(text) : "I can only read text messages for now. What would you like to do in Qatar?";
            await send(phoneNumberId, msg.from, reply);
          } catch (error) {
            console.error("Khalid WhatsApp error", error instanceof Anthropic.APIError ? error.status : "", error.message);
          }
        })());
      }
    }
  }
  await Promise.all(jobs); // finish before responding: serverless functions freeze after the response
  return res.status(200).json({ ok: true });
}
