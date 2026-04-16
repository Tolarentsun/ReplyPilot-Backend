const express = require('express');
const app = express();

app.use(express.json());

// Load database
const { pool } = require('./db');

// Load routes (update paths based on your folder structure)
const authRoutes = require('./db/routes/auth');  // or ./routes/auth if you moved it
const userRoutes = require('./db/routes/users');
const subscriptionRoutes = require('./db/routes/subscriptions');
const googleRoutes = require('./db/routes/google');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/google', googleRoutes);

// Keep health and root endpoints
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.json({ message: 'ReplyPilot API with real routes' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

