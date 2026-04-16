const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const router = express.Router();

console.log('Auth route loaded');

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Auth API working' });
});

// Register - simplified
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Test database connection
    const testResult = await pool.query('SELECT 1 as test');
    console.log('Database test:', testResult.rows);
    
    // For now, just return success
    res.json({ 
      success: true, 
      message: 'Database connection works',
      email: email,
      name: name || 'No name provided'
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ 
      error: 'Registration failed',
      details: error.message 
    });
  }
});

// Login - simplified  
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    res.json({ 
      success: true, 
      message: 'Login endpoint works',
      email: email,
      token: 'jwt-test-token-' + Date.now()
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

module.exports = router;

