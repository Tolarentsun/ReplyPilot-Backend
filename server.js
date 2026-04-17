const express = require('express');
const cors = require('cors');
const app = express();

// Enable CORS for your Netlify site
app.use(cors({
  origin: [
    'https://sparkling-hotteok-2033b7.netlify.app', // Your Netlify URL
    'http://localhost:3000' // For local testing
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Simple auth test endpoint
app.get('/api/auth/test', (req, res) => {
  res.json({ 
    message: 'Auth API is working!',
    timestamp: new Date().toISOString(),
    endpoints: {
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login',
      test: 'GET /api/auth/test'
    }
  });
});

// User registration endpoint
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }
    
    res.json({ 
      success: true,
      message: 'User registration successful (simulated)',
      user: {
        email: email,
        name: name || 'Not provided',
        id: 'user-' + Date.now(),
        createdAt: new Date().toISOString()
      },
      token: 'jwt-simulated-token-' + Date.now()
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// User login endpoint
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Email and password are required' 
      });
    }
    
    res.json({ 
      success: true,
      message: 'Login successful (simulated)',
      user: {
        email: email,
        id: 'user-12345',
        name: 'Test User'
      },
      token: 'jwt-simulated-token-' + Date.now(),
      expiresIn: '24h'
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'ReplyPilot Backend',
    version: '1.0.2',
    timestamp: new Date().toISOString(),
    cors: 'enabled',
    allowed_origins: ['sparkling-hotteok-2033b7.netlify.app']
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🚀 ReplyPilot API is running!',
    description: 'Google Review Response Service for Local Businesses',
    version: '1.0.2',
    status: 'operational',
    endpoints: {
      health: '/health',
      auth: {
        test: 'GET /api/auth/test',
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login'
      }
    },
    frontend: 'https://sparkling-hotteok-2033b7.netlify.app'
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 ReplyPilot Backend launched on port ${PORT}`);
  console.log(`✅ CORS enabled for: sparkling-hotteok-2033b7.netlify.app`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
});
