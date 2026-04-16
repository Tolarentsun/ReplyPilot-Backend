const fs = require('fs');
const express = require('express');
const app = express();

// Write startup log
fs.writeFileSync('/tmp/startup.log', '=== Server Starting ===\n');

try {
  fs.appendFileSync('/tmp/startup.log', '1. Loading database...\n');
  const { pool } = require('./db');
  fs.appendFileSync('/tmp/startup.log', '✅ Database loaded\n');
} catch (dbError) {
  fs.appendFileSync('/tmp/startup.log', `❌ Database error: ${dbError.message}\n`);
}

// Load all routes with error handling
const loadRoute = (name, path) => {
  try {
    fs.appendFileSync('/tmp/startup.log', `Loading ${name} route...\n`);
    const route = require(path);
    app.use(`/api/${name}`, route);
    fs.appendFileSync('/tmp/startup.log', `✅ ${name} route loaded\n`);
    return true;
  } catch (error) {
    fs.appendFileSync('/tmp/startup.log', `❌ ${name} route error: ${error.message}\n`);
    return false;
  }
};

// Load routes
loadRoute('auth', './routes/auth');
loadRoute('users', './routes/users');
loadRoute('subscriptions', './routes/subscriptions');
loadRoute('google', './routes/google');

// Simple health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', routes: ['auth', 'users', 'subscriptions', 'google'] });
});

// Debug endpoint
app.get('/debug/routes', (req, res) => {
  try {
    const log = fs.readFileSync('/tmp/startup.log', 'utf8');
    res.type('text/plain').send(log);
  } catch {
    res.send('No log found');
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  const msg = `✅ Server running on port ${PORT}\n`;
  fs.appendFileSync('/tmp/startup.log', msg);
  console.log(msg);
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
