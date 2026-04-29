const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const SMTP_HOST = process.env.SMTP_HOST || 'smtpout.secureserver.net';
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const RELAY_SECRET = process.env.RELAY_SECRET;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS
  }
});

transporter.verify(function (error, success) {
  if (error) {
    console.error('SMTP connection error:', error);
  } else {
    console.log('✅ SMTP connected — ready to send from ' + SMTP_USER);
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Careflux AI Email Relay',
    from: SMTP_USER
  });
});

app.post('/send', async (req, res) => {
  const { secret, to, toName, subject, body, providerName, previewUrl } = req.body;

  if (secret !== RELAY_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, body' });
  }

  try {
    await transporter.sendMail({
      from: `"Careflux AI" <${SMTP_USER}>`,
      to: toName ? `"${toName}" <${to}>` : to,
      subject: subject,
      text: body
    });
    res.json({ success: true, message: 'Email sent successfully' });
  } catch (err) {
    console.error('Send error:', err);
    res.status(500).json({ error: 'Failed to send email', details: err.message });
  }
});

app.post('/send-bulk', async (req, res) => {
  const { secret, emails } = req.body;

  if (secret !== RELAY_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({ error: 'Missing emails array' });
  }

  const results = [];
  for (const email of emails) {
    try {
      await transporter.sendMail({
        from: `"Careflux AI" <${SMTP_USER}>`,
        to: email.to,
        subject: email.subject,
        text: email.body
      });
      results.push({ to: email.to, success: true });
    } catch (err) {
      results.push({ to: email.to, success: false, error: err.message });
    }
  }

  res.json({ results });
});

app.listen(PORT, () => {
  console.log(`Careflux AI Email Relay running on port ${PORT}`);
});
