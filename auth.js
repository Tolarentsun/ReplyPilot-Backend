const express = require('express');
const router = express.Router();

console.log('✅ Auth route loaded');

// Simple test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Auth route works!' });
});

// Health check for auth route
router.get('/health', (req, res) => {
  res.json({ status: 'auth-ok' });
});

module.exports = router;
