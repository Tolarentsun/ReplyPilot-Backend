const express = require('express');
const app = express();

console.log('1. Loading database...');
const { pool } = require('./db');
console.log('✅ Database loaded');

console.log('2. Loading auth route...');
try {
  const authRoutes = require('./routes/auth');
  console.log('✅ Auth route loaded');
  app.use('/api/auth', authRoutes);
} catch (error) {
  console.log('❌ Auth route error:', error.message);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
