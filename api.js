// SFP Maintenance System — Netlify Function
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbySWpkDC8MJ0-2VBtPVRptP-jCpT_yBcD92s874XfAQMg03a4zUyNizpEIh9PECkDOx/exec";
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (code, body) => ({
  statusCode: code,
  headers: { ...CORS, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function proxyGet(action, extra = {}) {
  const params = new URLSearchParams({ action, ...extra });
  const r = await fetch(`${APPS_SCRIPT_URL}?${params}`);
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { throw new Error("Bad Apps Script response: " + text.slice(0,200)); }
}

async function proxyPost(body) {
  const r = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  try { return JSON.parse(text); }
  catch { throw new Error("Bad Apps Script response: " + text.slice(0,200)); }
}

async function extractPassDownItems(base64pdf) {
  if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY not set in Netlify env vars");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64pdf }},
          { type: "text", text: `This is a handwritten maintenance pass down sheet from a sawmill.
Extract each individual task or note from the handwriting.
Return ONLY a JSON array of strings, one per item. No preamble, no markdown, no explanation.
Example: ["Check lubrication on twin infeed", "Replace belt on green chain #2"]
If you cannot read the handwriting clearly, make your best guess.` }
        ]
      }]
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error("Claude API error: " + JSON.stringify(data));
  const text = data.content?.[0]?.text || "[]";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS")
    return { statusCode: 200, headers: CORS, body: "" };

  try {
    const action = event.queryStringParameters?.action;

    // Extract pass down items via Claude (server-side, avoids CORS)
    if (action === "extractPassDown" && event.httpMethod === "POST") {
      const { base64 } = JSON.parse(event.body || "{}");
      const items = await extractPassDownItems(base64);
      return json(200, { items });
    }

    if (event.httpMethod === "GET") {
      const fileId = event.queryStringParameters?.fileId;
      const extra  = fileId ? { fileId } : {};
      const data   = await proxyGet(action, extra);
      return json(200, data);
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const data = await proxyPost(body);
      return json(200, data);
    }

    return json(400, { error: "Unknown method" });

  } catch(e) {
    console.error("Function error:", e.message);
    return json(500, { error: e.message || "Server error" });
  }
};
