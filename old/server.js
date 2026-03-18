// server.js
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware to parse JSON bodies (for contact form)
app.use(express.json());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Health‑check endpoint
app.get('/ping', (req, res) => res.send('pong'));

// Contact form endpoint – logs payload (replace with real email service later)
app.post('/contact', (req, res) => {
  const { name, email, message } = req.body;
  console.log('📩 New contact request:', { name, email, message });
  // TODO: integrate nodemailer, SendGrid, etc.
  res.sendStatus(200);
});

// Catch‑all for undefined routes (optional 404 page)
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Purple Acorns site is live at http://localhost:${PORT}`);
});
