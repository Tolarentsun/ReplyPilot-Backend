const express = require('express');
const app = express();

console.log('1. Testing database...');
try {
  // Try to load database
  const { pool } = require('./db');
  console.log('✅ Database loaded');
} catch (error) {
  console.log('❌ Database error:', error.message);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
