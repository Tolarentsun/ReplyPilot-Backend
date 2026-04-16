const fs = require('fs');
const express = require('express');
const app = express();

// Write startup log
fs.writeFileSync('/tmp/errors.log', '=== Server Starting ===\n');

try {
  fs.appendFileSync('/tmp/errors.log', '1. Loading database...\n');
  const { pool } = require('./db');
  fs.appendFileSync('/tmp/errors.log', '✅ Database loaded\n');
} catch (dbError) {
  fs.appendFileSync('/tmp/errors.log', `❌ Database error: ${dbError.message}\n${dbError.stack}\n`);
}

try {
  fs.appendFileSync('/tmp/errors.log', '2. Loading auth route...\n');
  const authRoutes = require('./routes/auth');
  fs.appendFileSync('/tmp/errors.log', '✅ Auth route loaded\n');
  app.use('/api/auth', authRoutes);
} catch (authError) {
  fs.appendFileSync('/tmp/errors.log', `❌ Auth route error: ${authError.message}\n${authError.stack}\n`);
}

// Simple health check
app.get('/health', (req, res) => {
  fs.appendFileSync('/tmp/errors.log', 'Health check called\n');
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  const msg = `✅ Server running on port ${PORT}\n`;
  fs.appendFileSync('/tmp/errors.log', msg);
  console.log(msg);
});

// Add endpoint to read errors
app.get('/debug/errors', (req, res) => {
  try {
    const errors = fs.readFileSync('/tmp/errors.log', 'utf8');
    res.type('text/plain').send(errors);
  } catch {
    res.send('No error log found');
  }
});
