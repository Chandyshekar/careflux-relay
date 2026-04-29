/**
 * Careflux AI Email Relay & Demo Page Host
 * - Sends emails via Resend API
 * - Stores & serves provider demo landing pages at /demo/:slug
 * 
 * Deploy free on Render.com
 */

const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');

const app = express();

// Increase payload limit so full HTML pages upload fine
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cors({ origin: '*', methods: ['POST', 'GET', 'DELETE'] }));

// ENV VARS (set in Render dashboard)
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || 'chandrashekar@carefluxai.com';
const FROM_NAME = process.env.FROM_NAME || 'Chandyshekar | Careflux AI';
const RELAY_SECRET = process.env.RELAY_SECRET || 'CarefluxAI-2025-SendKey';
const PORT = process.env.PORT || 3000;

const resend = new Resend(RESEND_API_KEY);

// In-memory demo page store
// Key: slug (e.g. \"patel-family-medicine\") | Value: { html, providerName, createdAt }
// Note: persists as long as Render instance is running.
const demoStore = new Map();

// HEALTH CHECK
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Careflux AI Relay & Demo Host',
    from: FROM_EMAIL,
    demosStored: demoStore.size,
    demoSlugs: Array.from(demoStore.keys())
  });
});

// SAVE DEMO PAGE
// POST /save-demo
// Body: { secret, slug, html, providerName }
app.post('/save-demo', (req, res) => {
  const { secret, slug, html, providerName } = req.body;

  if (secret !== RELAY_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  if (!slug || !html) return res.status(400).json({ error: 'slug and html are required' });

  // Sanitise slug
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  demoStore.set(cleanSlug, {
    html,
    providerName: providerName || cleanSlug,
    createdAt: new Date().toISOString()
  });

  const host = req.get('host');
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const url = `${protocol}://${host}/demo/${cleanSlug}`;

  console.log(`Demo saved: ${url} for ${providerName}`);
  return res.json({ success: true, slug: cleanSlug, url });
});

// SERVE DEMO PAGE
// GET /demo/:slug
app.get('/demo/:slug', (req, res) => {
  const slug = req.params.slug;
  const demo = demoStore.get(slug);

  if (!demo) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang=\"en\">
      <head>
        <meta charset=\"UTF-8\">
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">
        <title>Demo Not Found | Careflux AI</title>
        <link href=\"https://fonts.googleapis.com/css2?family=Sora:wght@400;700;800&display=swap\" rel=\"stylesheet\">
        <style>
          body { font-family: 'Sora', sans-serif; background: #050e1a; color: #e8f0fe; min-height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center; padding: 40px; }
          .box { max-width: 480px; }
          h1 { font-size: 1.8rem; font-weight: 800; margin-bottom: 12px; }
          p { color: #8faabb; font-size: 15px; line-height: 1.7; margin-bottom: 24px; }
          a { display: inline-block; padding: 12px 28px; border-radius: 50px; background: linear-gradient(135deg, #00d4c8, #4f8ef7); color: #050e1a; font-weight: 700; text-decoration: none; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class=\"box\">
          <h1>Demo Page Coming Soon</h1>
          <p>This personalized website demo is being prepared. Please check back shortly or contact us directly.</p>
          <a href=\"mailto:${FROM_EMAIL}\">Contact Careflux AI</a>
        </div>
      </body>
      </html>
    `);
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(demo.html);
});

// LIST ALL DEMOS
app.get('/demos', (req, res) => {
  const secret = req.headers['x-relay-secret'] || req.query.secret;
  if (secret !== RELAY_SECRET) return res.status(403).json({ error: 'Unauthorized' });

  const list = Array.from(demoStore.entries()).map(([slug, d]) => ({
    slug,
    providerName: d.providerName,
    createdAt: d.createdAt,
    url: `/demo/${slug}`
  }));

  return res.json({ total: list.length, demos: list });
});

// DELETE DEMO
app.delete('/demo/:slug', (req, res) => {
  const secret = req.headers['x-relay-secret'];
  if (secret !== RELAY_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  const deleted = demoStore.delete(req.params.slug);
  return res.json({ success: deleted, slug: req.params.slug });
});

// SEND EMAIL
app.post('/send', async (req, res) => {
  const { secret, to, toName, subject, body, providerName, previewUrl } = req.body;

  if (secret !== RELAY_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  if (!to || !subject || !body) return res.status(400).json({ error: 'Missing to, subject, body' });

  const htmlBody = buildHtmlEmail(toName, subject, body, providerName, previewUrl);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject: subject,
        html: htmlBody
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Resend error');

    return res.json({ success: true, messageId: data.id });
  } catch (err) {
    return res.status(500).json({ error: 'Send failed', detail: err.message });
  }
});

// BULK SEND
app.post('/send-bulk', async (req, res) => {
  const { secret, emails } = req.body;
  if (secret !== RELAY_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  if (!Array.isArray(emails) || emails.length === 0) return res.status(400).json({ error: 'emails must be a non-empty array' });

  const results = [];
  for (const email of emails) {
    try {
      const htmlBody = buildHtmlEmail(email.toName, email.subject, email.body, email.providerName, email.previewUrl);
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${FROM_EMAIL}>`,
          to: [email.to],
          subject: email.subject,
          html: htmlBody
        })
      });

      const data = await response.json();
      results.push({ to: email.to, success: true, id: data.id });
      await new Promise(r => setTimeout(r, 500)); // Rate limit protection
    } catch (err) {
      results.push({ to: email.to, success: false, error: err.message });
    }
  }

  return res.json({ total: emails.length, results });
});

function buildHtmlEmail(toName, subject, body, providerName, previewUrl) {
  const paragraphs = body.split('\
').filter(l => l.trim()).map(l => {
    if (l.trim().startsWith('http')) return `<p style=\"margin:0 0 14px\"><a href=\"${l.trim()}\" style=\"color:#00897b;font-weight:600\">${l.trim()}</a></p>`;
    return `<p style=\"margin:0 0 14px;line-height:1.75;color:#2d3748;font-size:15px\">${l}</p>`;
  }).join('');

  const demoButton = previewUrl ? `
    <div style=\"margin:28px 0;background:linear-gradient(135deg,#f0fffe,#e6f9f8);border:2px solid #00c4be;border-radius:14px;padding:24px 28px;text-align:center\">
      <p style=\"margin:0 0 18px;font-size:15px;color:#2d3748;font-weight:500\">We already built a personalized site for <strong>${providerName || 'your practice'}</strong>. Click below to see exactly what it looks like.</p>
      <a href=\"${previewUrl}\" style=\"display:inline-block;background:linear-gradient(135deg,#00c4be,#0288d1);color:white;padding:14px 36px;border-radius:50px;text-decoration:none;font-weight:800;font-size:15px\">View Your New Website</a>
    </div>` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\"></head>
    <body style=\"margin:0;padding:0;background:#f7fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif\">
      <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#f7fafc;padding:40px 16px\">
        <tr><td align=\"center\">
          <table width=\"600\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)\">
            <tr><td style=\"background:linear-gradient(135deg,#0b2d5e,#1565c0);padding:28px 40px;color:white;font-weight:800;font-size:18px\">Careflux AI</td></tr>
            <tr><td style=\"padding:36px 40px 32px\">
              <p style=\"margin:0 0 22px;font-size:15px;color:#2d3748\">Dear <strong>${toName || 'Doctor'}</strong>,</p>
              ${paragraphs}
              ${demoButton}
              <div style=\"border-top:1px solid #e2e8f0;margin-top:20px;padding-top:20px\">
                <div style=\"font-weight:800;color:#0b2d5e\">Chandrashekar S.</div>
                <div style=\"color:#00897b;font-size:13px;font-weight:600\">Careflux AI Healthcare Digital Agency</div>
              </div>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>`;
}

app.listen(parseInt(PORT), () => {
  console.log(`Careflux AI Relay & Demo Host Port ${PORT}`);
});
