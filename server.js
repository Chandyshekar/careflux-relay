/**
 * Careflux AI — Email Relay & Demo Host
 * - Sends emails via Resend API
 * - Stores & serves provider demo landing pages at /demo/:slug
 * Deploy free on Render.com
 */

const express = require("express");
const cors    = require("cors");

const app = express();

// ── Increase payload limit so full HTML pages upload fine ──
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Explicit CORS — handles file:// null origin, localhost, and any domain
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Relay-Secret");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  // Handle preflight
  if (req.method === "OPTIONS") return res.status(200).end();
  next();
});

// ── ENV VARS (set in Render dashboard) ──
const {
  RESEND_API_KEY = "",
  FROM_EMAIL     = "chandrashekar@carefluxai.com",
  FROM_NAME      = "Chandrashekar — Careflux AI",
  RELAY_SECRET   = "CarefluxAI-2025-SendKey",
  PORT           = "3000",
} = process.env;

// ── In-memory demo page store ──
// Key: slug (e.g. "patel-family-medicine")
// Value: { html, providerName, createdAt }
// Note: persists as long as Render instance is running.
// For permanent storage, upgrade to Render Disk or use a free DB like Supabase.
const demoStore = new Map();

// ════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Careflux AI Relay & Demo Host",
    from: FROM_EMAIL,
    demosStored: demoStore.size,
    demoSlugs: [...demoStore.keys()],
  });
});

// ════════════════════════════════════════════
// SAVE DEMO PAGE
// POST /save-demo
// Body: { secret, slug, html, providerName }
// Returns: { success, url }
// ════════════════════════════════════════════
app.post("/save-demo", (req, res) => {
  const { secret, slug, html, providerName } = req.body;
  if (secret !== RELAY_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  if (!slug || !html) {
    return res.status(400).json({ error: "slug and html are required" });
  }
  // Sanitise slug — only allow lowercase letters, numbers, hyphens
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  demoStore.set(cleanSlug, {
    html,
    providerName: providerName || cleanSlug,
    createdAt: new Date().toISOString(),
  });
  const host     = req.get("host");
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const url      = `${protocol}://${host}/demo/${cleanSlug}`;
  console.log(`Demo saved: ${url} (${providerName})`);
  return res.json({ success: true, slug: cleanSlug, url });
});

// ════════════════════════════════════════════
// SERVE DEMO PAGE
// GET /demo/:slug
// ════════════════════════════════════════════
app.get("/demo/:slug", (req, res) => {
  const { slug } = req.params;
  const demo = demoStore.get(slug);
  if (!demo) {
    // Return a friendly "coming soon" page instead of a raw 404
    return res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Demo Not Found — Careflux AI</title>
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;700;800&display=swap" rel="stylesheet">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Sora',sans-serif;background:#050e1a;color:#e8f0fe;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:40px}
    .box{max-width:480px}
    .icon{font-size:64px;margin-bottom:24px}
    h1{font-size:1.8rem;font-weight:800;margin-bottom:12px}
    p{color:#8faabb;font-size:15px;line-height:1.7;margin-bottom:24px}
    a{display:inline-block;padding:12px 28px;border-radius:50px;background:linear-gradient(135deg,#00d4c8,#4f8ef7);color:#050e1a;font-weight:700;text-decoration:none;font-size:14px}
  </style>
</head>
<body>
  <div class="box">
    <div class="icon">⚡</div>
    <h1>Demo Page Coming Soon</h1>
    <p>This personalized website demo is being prepared by the Careflux AI team. Please check back shortly or contact us directly.</p>
    <a href="mailto:chandrashekar@carefluxai.com">Contact Careflux AI →</a>
    <p style="margin-top:20px;font-size:12px;color:#4a6070">Careflux AI · Healthcare Digital Agency</p>
  </div>
</body>
</html>`);
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.send(demo.html);
});

// ════════════════════════════════════════════
// LIST ALL DEMOS
// GET /demos (protected)
// ════════════════════════════════════════════
app.get("/demos", (req, res) => {
  const secret = req.headers["x-relay-secret"] || req.query.secret;
  if (secret !== RELAY_SECRET) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  const list = [...demoStore.entries()].map(([slug, d]) => ({
    slug,
    providerName: d.providerName,
    createdAt: d.createdAt,
    url: `/demo/${slug}`,
  }));
  return res.json({ total: list.length, demos: list });
});

// ════════════════════════════════════════════
// DELETE DEMO
// DELETE /demo/:slug
// ════════════════════════════════════════════
app.delete("/demo/:slug", (req, res) => {
  const secret = req.headers["x-relay-secret"];
  if (secret !== RELAY_SECRET) return res.status(403).json({ error: "Unauthorized" });
  const deleted = demoStore.delete(req.params.slug);
  return res.json({ success: deleted, slug: req.params.slug });
});

// ════════════════════════════════════════════
// SEND SINGLE EMAIL (via Resend)
// POST /send
// Body: { secret, to, toName, subject, body, providerName, previewUrl }
// ════════════════════════════════════════════
app.post("/send", async (req, res) => {
  const { secret, to, toName, subject, body, providerName, previewUrl } = req.body;
  if (secret !== RELAY_SECRET) return res.status(403).json({ error: "Unauthorized" });
  if (!to || !subject || !body) return res.status(400).json({ error: "Missing: to, subject, body" });
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) return res.status(400).json({ error: "Invalid email: " + to });
  const htmlBody = buildHtmlEmail({ toName, subject, body, providerName, previewUrl });
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject,
        text: body,
        html: htmlBody,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || data.error || "Resend API error");
    }
    console.log(`Email sent to ${to} — ID: ${data.id}`);
    return res.json({ success: true, messageId: data.id, to, subject, sentAt: new Date().toISOString() });
  } catch (err) {
    console.error(`Send failed to ${to}:`, err.message);
    return res.status(500).json({
      error: "Send failed",
      detail: err.message,
      hint: RESEND_API_KEY ? "Resend API key is set — check key validity at resend.com/api-keys" : "RESEND_API_KEY env var is EMPTY — add it in Render dashboard",
    });
  }
});

// ════════════════════════════════════════════
// BULK SEND
// POST /send-bulk
// Body: { secret, emails: [...] }
// ════════════════════════════════════════════
app.post("/send-bulk", async (req, res) => {
  const { secret, emails } = req.body;
  if (secret !== RELAY_SECRET) return res.status(403).json({ error: "Unauthorized" });
  if (!Array.isArray(emails) || emails.length === 0)
    return res.status(400).json({ error: "emails must be a non-empty array" });
  const results = [];
  for (const email of emails) {
    try {
      const htmlBody = buildHtmlEmail(email);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [email.to],
          subject: email.subject,
          text: email.body,
          html: htmlBody,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Resend error");
      results.push({ to: email.to, success: true, messageId: data.id });
      console.log(`Bulk sent to ${email.to}`);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      results.push({ to: email.to, success: false, error: err.message });
      console.error(`Bulk failed to ${email.to}:`, err.message);
    }
  }
  const succeeded = results.filter(r => r.success).length;
  return res.json({
    total: emails.length,
    succeeded,
    failed: emails.length - succeeded,
    results,
    sentAt: new Date().toISOString()
  });
});

// ════════════════════════════════════════════
// HTML EMAIL BUILDER
// ════════════════════════════════════════════
function buildHtmlEmail({ toName, subject, body, providerName, previewUrl }) {
  // Clean body — strip greeting lines and signature block
  let cleanBody = body.trim();

  // Remove ALL leading greeting lines (handles multi-line greetings like "Dear X,")
  // Keeps stripping any line at the top that looks like a salutation
  const greetingPattern = /^(dear|hi|hello).{0,40},?$/i;
  let prevBody;
  while (prevBody !== cleanBody) {
    prevBody = cleanBody;
    cleanBody = cleanBody.replace(greetingPattern, "").trim();
  }

  // Remove trailing signature block — everything from sign-off keyword downward
  cleanBody = cleanBody
    .replace(/(warm regards|best regards|kind regards|sincerely|regards,|best,|thanks,|thank you,|cheers,)[\s\S]*/is, "")
    .trim();

  // Also strip any lines that are just a name followed by a comma (orphaned salutation)
  // e.g. "chandy," or "Dr. Patel," sitting alone at the top
  cleanBody = cleanBody
    .replace(/^[A-Za-z][A-Za-z.\s]{1,40},$/m, "")
    .trim();

  const paragraphs = cleanBody
    .split("\n")
    .filter(l => l.trim())
    .map(l => {
      // If the line looks like a URL, make it a clickable link
      if (l.trim().startsWith("http")) {
        return `<p style="margin:0 0 14px"><a href="${l.trim()}" style="color:#00897b;font-weight:600;word-break:break-all">${l.trim()}</a></p>`;
      }
      // Style the demo site line prominently
      if (l.includes("View your free demo") || l.includes("🌐")) {
        return `<p style="margin:0 0 14px;line-height:1.75;color:#00897b;font-size:15px;font-weight:600">${l}</p>`;
      }
      return `<p style="margin:0 0 14px;line-height:1.75;color:#2d3748;font-size:15px">${l}</p>`;
    })
    .join("");

  // Big CTA button for the demo link
  const demoButton = previewUrl ? `
  <div style="margin:28px 0;background:linear-gradient(135deg,#f0fffe,#e6f9f8);border:2px solid #00c4be;border-radius:14px;padding:24px 28px;text-align:center">
    <p style="margin:0 0 6px;font-size:12px;color:#00897b;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">&#127881; Your Free Demo Website Is Ready</p>
    <p style="margin:0 0 18px;font-size:15px;color:#2d3748;font-weight:500">We already built a personalized site for <strong>${providerName || "your practice"}</strong>.<br>Click below to see exactly what it looks like.</p>
    <a href="${previewUrl}" style="display:inline-block;background:linear-gradient(135deg,#00c4be,#0288d1);color:white;padding:14px 36px;border-radius:50px;text-decoration:none;font-weight:800;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 20px rgba(0,196,190,0.35)">&nbsp;&#128064;&nbsp; View Your New Website &rarr;</a>
    <p style="margin:12px 0 0;font-size:11px;color:#718096">Or copy this link: <a href="${previewUrl}" style="color:#00897b">${previewUrl}</a></p>
  </div>` : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:'Segoe UI',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;padding:40px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;width:100%">
<!-- HEADER -->
<tr><td style="background:linear-gradient(135deg,#0b2d5e,#1565c0);padding:28px 40px">
<table cellpadding="0" cellspacing="0"><tr>
<td style="width:46px;height:46px;background:linear-gradient(135deg,#00c4be,#f0c040);border-radius:12px;text-align:center;vertical-align:middle;font-size:24px">⚡</td>
<td style="padding-left:14px;vertical-align:middle">
<div style="color:#ffffff;font-size:18px;font-weight:800;line-height:1.2;font-family:'Segoe UI',sans-serif">Careflux AI</div>
<div style="color:rgba(255,255,255,0.5);font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:2px">Healthcare Digital Agency</div>
</td></tr></table>
</td></tr>
<!-- BODY -->
<tr><td style="padding:36px 40px 8px">
${toName ? `<p style="margin:0 0 22px;font-size:15px;color:#2d3748">Dear <strong>${toName}</strong>,</p>` : ""}
${paragraphs}
${demoButton}
</td></tr>
<!-- SIGNATURE -->
<tr><td style="padding:8px 40px 32px">
<table cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e8f0;padding-top:20px;width:100%"><tr><td>
<div style="font-weight:800;color:#0b2d5e;font-size:15px">Chandrashekar S.</div>
<div style="color:#00897b;font-size:13px;font-weight:600;margin:3px 0">Careflux AI — Healthcare Digital Agency</div>
<div style="color:#718096;font-size:12px;margin-top:5px">chandrashekar@carefluxai.com</div>
<div style="color:#718096;font-size:12px;margin-top:2px">carefluxai.com</div>
</td></tr></table>
</td></tr>
<!-- FOOTER -->
<tr><td style="background:#f7fafc;padding:16px 40px;border-top:1px solid #e2e8f0;text-align:center">
<p style="margin:0;font-size:11px;color:#a0aec0">Sent by Careflux AI · chandrashekar@carefluxai.com</p>
<p style="margin:4px 0 0;font-size:11px;color:#a0aec0">To unsubscribe reply with &ldquo;unsubscribe&rdquo; in the subject.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ════════════════════════════════════════════
// RESEND EMAIL LOG — proxy to Resend API
// GET /resend-log?secret=...&limit=50
// ════════════════════════════════════════════
app.get("/resend-log", async (req, res) => {
  const secret = req.query.secret || req.headers["x-relay-secret"];
  if (secret !== RELAY_SECRET) return res.status(403).json({ error: "Unauthorized" });
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  try {
    const response = await fetch(`https://api.resend.com/emails?limit=${limit}`, {
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}` },
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || "Resend API error");
    }
    const data = await response.json();
    // Normalise — Resend returns { data: [...] }
    const emails = (data.data || data.emails || []).map(e => ({
      id: e.id,
      to: e.to,
      from: e.from,
      subject: e.subject,
      created_at: e.created_at,
      last_event: e.last_event || "sent",
    }));
    return res.json({ total: emails.length, emails });
  } catch (err) {
    console.error("Resend log error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── START ──
app.listen(parseInt(PORT), () => {
  console.log(`\n Careflux AI Relay & Demo Host · Port ${PORT}`);
  console.log(` Email from: ${FROM_EMAIL}`);
  console.log(` Demo pages: /demo/:slug\n`);
});
