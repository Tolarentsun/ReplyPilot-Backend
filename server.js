const express = require('express');
const app = express();

// Try to load database
try {
  console.log('Attempting to load database...');
  const { pool } = require('./db/index');
  console.log('✅ Database loaded successfully');
} catch (error) {
  console.log('❌ Database error:', error.message);
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
