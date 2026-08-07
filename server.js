const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const OWNER_JWT = process.env.OWNER_JWT || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjYzMDcyMDAwMDAsImlhdCI6MCwic3ViIjo4MTAyMDQ0NTh9.qoPkyOMoXDvxgoU0O2WB9LQYa5iCp3WyU9_7pAy4Dgw';

const HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + OWNER_JWT,
    'Accept': 'application/json',
    'Origin': 'https://www.duolingo.com',
    'Referer': 'https://www.duolingo.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
};

// Health check
app.get('/', function(req, res) {
    res.json({ status: 'OK', service: 'Duolingo Super API', version: '1.0', time: new Date().toISOString() });
});

// Test endpoint
app.get('/api/test', function(req, res) {
    res.json({ 
        message: 'API working!',
        jwtLength: OWNER_JWT.length,
        jwtStart: OWNER_JWT.substring(0, 30)
    });
});

// Create Super Link
app.post('/api/create-super-link', async function(req, res) {
    try {
        var uid = req.body.uid;
        var token = req.body.token;

        console.log('Request:', { uid, tokenLength: token ? token.length : 0 });

        if (!uid || !token) {
            return res.status(400).json({ error: 'Missing uid or token' });
        }

        // Verify user first
        var userRes;
        try {
            userRes = await fetch('https://www.duolingo.com/2017-06-30/users/' + uid + '?fields=id,username', {
                headers: { 
                    'Authorization': 'Bearer ' + token, 
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                }
            });
        } catch (e) {
            return res.status(500).json({ error: 'Failed to verify user: ' + e.message });
        }

        if (!userRes.ok) {
            var errText = await userRes.text();
            return res.status(401).json({ error: 'Invalid user token', status: userRes.status, detail: errText.substring(0, 200) });
        }

        var userData = await userRes.json();
        console.log('Verified user:', userData.username, 'UID:', uid);

        // Try endpoints with owner JWT
        var endpoints = [
            { 
                url: 'https://www.duolingo.com/2017-06-30/family-plan/invites', 
                body: { role: 'MEMBER' },
                desc: 'Standard invite endpoint'
            },
            { 
                url: 'https://www.duolingo.com/2017-06-30/family-plan/invite-link', 
                body: {},
                desc: 'Invite link endpoint'
            }
        ];

        var results = [];

        for (var i = 0; i < endpoints.length; i++) {
            var ep = endpoints[i];
            console.log('Trying endpoint ' + (i+1) + ':', ep.url);
            
            try {
                var inviteRes = await fetch(ep.url, {
                    method: 'POST',
                    headers: HEADERS,
                    body: JSON.stringify(ep.body)
                });

                var status = inviteRes.status;
                var rawText = await inviteRes.text();
                
                console.log('Result:', { status, bodyLength: rawText.length, preview: rawText.substring(0, 200) });

                results.push({
                    endpoint: ep.url,
                    status: status,
                    success: inviteRes.ok,
                    body: rawText.substring(0, 500)
                });

                if (inviteRes.ok) {
                    var data = {};
                    try { 
                        data = JSON.parse(rawText); 
                    } catch(e) {
                        // If response isn't JSON, return as is
                        return res.json({
                            success: true,
                            rawResponse: rawText.substring(0, 1000),
                            user: userData.username,
                            endpoint: ep.url
                        });
                    }

                    // Extract link/token from response
                    var inviteToken = data.inviteToken || data.token || data.invite_token || data.code;
                    var inviteLink = data.inviteLink || data.link || data.invite_link || data.url;

                    return res.json({ 
                        success: true,
                        link: inviteLink || ('https://www.duolingo.com/family-plan/invite/' + inviteToken),
                        token: inviteToken,
                        user: userData.username,
                        endpoint: ep.url,
                        rawData: data
                    });
                }
            } catch (e) {
                console.error('Endpoint error:', ep.url, e.message);
                results.push({
                    endpoint: ep.url,
                    error: e.message
                });
            }
        }

        // All endpoints failed
        return res.status(500).json({ 
            error: 'All endpoints failed',
            results: results,
            hint: '1. Check if OWNER_JWT is valid family plan owner token. 2. Check if Duolingo API changed.',
            jwtInfo: {
                length: OWNER_JWT.length,
                startsWith: OWNER_JWT.substring(0, 50)
            }
        });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({ 
            error: 'Server error: ' + error.message,
            stack: error.stack
        });
    }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function() {
    console.log('🚀 API running on port ' + PORT);
    console.log('JWT length:', OWNER_JWT.length);
    console.log('JWT starts with:', OWNER_JWT.substring(0, 50) + '...');
    console.log('Test: GET /api/test');
});
