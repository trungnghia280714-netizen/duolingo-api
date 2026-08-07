const express = require('express');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OWNER_UID = '810204458';
const OWNER_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjYzMDcyMDAwMDAsImlhdCI6MCwic3ViIjo4MTAyMDQ0NTh9.qoPkyOMoXDvxgoU0O2WB9LQYa5iCp3WyU9_7pAy4Dgw';

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'Duolingo API Server' });
});

// Create super link
app.post('/api/create-super-link', async (req, res) => {
  try {
    const { uid, token } = req.body;
    
    if (!uid || !token) {
      return res.status(400).json({ error: 'Missing uid or token' });
    }

    // Use owner token if no token provided
    const authToken = token || OWNER_JWT;
    
    // Call Duolingo API to create super intent
    const response = await axios.post(
      `https://www.duolingo.com/2017-06-30/users/${uid}/super-intents`,
      {
        source: 'profile',
        medium: 'web'
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://www.duolingo.com',
          'Referer': 'https://www.duolingo.com/'
        }
      }
    );

    if (response.data && response.data.code) {
      const link = `https://www.duolingo.com/super-intent/${response.data.code}`;
      return res.json({ 
        success: true, 
        link: link,
        code: response.data.code 
      });
    } else if (response.data && response.data.intents && response.data.intents.length > 0) {
      const code = response.data.intents[0].code;
      const link = `https://www.duolingo.com/super-intent/${code}`;
      return res.json({ 
        success: true, 
        link: link,
        code: code 
      });
    } else {
      return res.status(500).json({ error: 'No code returned from Duolingo' });
    }
  } catch (error) {
    console.error('Error creating super link:', error.response?.data || error.message);
    
    if (error.response?.status === 409) {
      return res.status(409).json({ error: 'User already has Super' });
    }
    
    return res.status(500).json({ 
      error: 'Failed to create super link',
      details: error.response?.data || error.message 
    });
  }
});

// Get user info
app.get('/api/user/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const token = req.headers.authorization?.replace('Bearer ', '') || OWNER_JWT;
    
    const response = await axios.get(
      `https://www.duolingo.com/2017-06-30/users/${uid}?fields=id,username,totalXp,gems,streak`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://www.duolingo.com',
          'Referer': 'https://www.duolingo.com/'
        }
      }
    );
    
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// Claim badge
app.post('/api/claim-badge', async (req, res) => {
  try {
    const { uid, token } = req.body;
    const authToken = token || OWNER_JWT;
    
    const response = await axios.post(
      `https://www.duolingo.com/2017-06-30/users/${uid}/badges`,
      {
        type: 'monthly_xp_challenge',
        fromLanguage: 'en',
        learningLanguage: 'es'
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://www.duolingo.com',
          'Referer': 'https://www.duolingo.com/'
        }
      }
    );
    
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ error: 'Failed to claim badge' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
