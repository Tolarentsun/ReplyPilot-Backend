// server.js - Ultra Minimal Test
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({ origin: true }));

// Basic health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Backend is responding!',
    time: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.send('ReplyPilot Backend is running!');
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
