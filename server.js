const fs = require('fs');
const express = require('express');
const app = express();

fs.writeFileSync('/tmp/routes.log', '=== Testing Routes ===\n');

// Load database
try {
  const { pool } = require('./db');
  fs.appendFileSync('/tmp/routes.log', '✅ Database loaded\n');
} catch (error) {
  fs.appendFileSync('/tmp/routes.log', `❌ Database: ${error.message}\n`);
}

// Load ONLY auth first (we know this works)
try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
  fs.appendFileSync('/tmp/routes.log', '✅ auth.js loaded\n');
} catch (error) {
  fs.appendFileSync('/tmp/routes.log', `❌ auth.js: ${error.message}\n`);
}

// Test users.js
try {
  const userRoutes = require('./routes/users');
  app.use('/api/users', userRoutes);
  fs.appendFileSync('/tmp/routes.log', '✅ users.js loaded\n');
} catch (error) {
  fs.appendFileSync('/tmp/routes.log', `❌ users.js: ${error.message}\n`);
}

// Test subscriptions.js  
try {
  const subscriptionRoutes = require('./routes/subscriptions');
  app.use('/api/subscriptions', subscriptionRoutes);
  fs.appendFileSync('/tmp/routes.log', '✅ subscriptions.js loaded\n');
} catch (error) {
  fs.appendFileSync('/tmp/routes.log', `❌ subscriptions.js: ${error.message}\n`);
}

// Test google.js
try {
  const googleRoutes = require('./routes/google');
  app.use('/api/google', googleRoutes);
  fs.appendFileSync('/tmp/routes.log', '✅ google.js loaded\n');
} catch (error) {
  fs.appendFileSync('/tmp/routes.log', `❌ google.js: ${error.message}\n`);
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Route to view logs
app.get('/debug/routes', (req, res) => {
  try {
    const log = fs.readFileSync('/tmp/routes.log', 'utf8');
    res.type('text/plain').send(log);
  } catch {
    res.send('No log found');
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

