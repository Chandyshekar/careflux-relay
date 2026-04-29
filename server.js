const express = require('express');
const { Resend } = require('resend');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RELAY_SECRET = process.env.RELAY_SECRET;
const FROM_EMAIL = process.env.FROM_EMAIL || 'chandrashekar@carefluxai.com';

const resend = new Resend(RESEND_API_KEY);

console.log('Careflux AI Email Relay (Resend) starting...');
console.log('From email: ' + FROM_EMAIL);

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Careflux AI Email Relay',
    provider: 'Resend',
    from: FROM_EMAIL
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
    const data = await resend.emails.send({
      from: 'Careflux AI <' + FROM_EMAIL + '>',
      to: toName ? toName + ' <' + to + '>' : to,
      subject: subject,
      text: body
    });
    console.log('Email sent successfully to ' + to + ', id: ' + data.id);
    res.json({ success: true, message: 'Email sent successfully', id: data.id });
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
      const data = await resend.emails.send({
        from: 'Careflux AI <' + FROM_EMAIL + '>',
        to: email.to,
        subject: email.subject,
        text: email.body
      });
      results.push({ to: email.to, success: true, id: data.id });
    } catch (err) {
      results.push({ to: email.to, success: false, error: err.message });
    }
  }

  res.json({ results });
});

app.listen(PORT, () => {
  console.log('Careflux AI Email Relay (Resend) running on port ' + PORT);
});
