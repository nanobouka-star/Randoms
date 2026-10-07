// POST /api/khalid  — server-side Claude call for "Talk to Khalid".
// The API key stays on the server (ANTHROPIC_API_KEY). The persona and copy
// guardrails live in data/khalid.json and are always applied here, so a
// client cannot replace them.
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const KHALID = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "khalid.json"), "utf8"));
const MAX_TURNS = 6;
const MAX_CHARS = 120000; // each message carries the full trip state (about 13k characters)

const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "changes"],
  properties: {
    reply: { type: "string" },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["row", "pick"],
        properties: { row: { type: "integer" }, pick: { type: "string" } },
      },
    },
  },
};

let client;

// Returns a clean message list, or null if the body is not a valid conversation.
export function cleanMessages(body) {
  const msgs = body && Array.isArray(body.messages) ? body.messages.slice(-MAX_TURNS) : null;
  if (!msgs || !msgs.length) return null;
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  let total = 0;
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const want = i % 2 === 0 ? "user" : "assistant";
    if (!m || m.role !== want || typeof m.content !== "string" || !m.content.trim()) return null;
    total += m.content.length;
  }
  if (!msgs.length || msgs[msgs.length - 1].role !== "user" || total > MAX_CHARS) return null;
  return msgs.map(({ role, content }) => ({ role, content }));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(501).json({ error: "Khalid is not configured on this server." });
  }
  const messages = cleanMessages(req.body);
  if (!messages) return res.status(400).json({ error: "Send {messages:[...]} ending with a user turn." });

  client ??= new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: KHALID.rules,
      output_config: { effort: "low", format: { type: "json_schema", schema: REPLY_SCHEMA } },
      messages,
    });
    if (response.stop_reason === "refusal") {
      return res.status(200).json({ reply: "Let's keep it to the trip. Tell me who's coming and what you love.", changes: [] });
    }
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const out = JSON.parse(text);
    if (typeof out.reply !== "string" || !Array.isArray(out.changes)) throw new Error("bad shape");
    return res.status(200).json(out);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "Khalid is busy. Try again in a moment." });
    if (error instanceof Anthropic.APIError) {
      console.error("Claude API error", error.status, error.message);
      return res.status(502).json({ error: "Khalid could not answer right now." });
    }
    console.error("Khalid handler error", error);
    return res.status(502).json({ error: "Khalid could not answer right now." });
  }
}
