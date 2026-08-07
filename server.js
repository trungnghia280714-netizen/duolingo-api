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
    res.json({ status: 'OK', service: 'Duolingo Super API', version: '1.0' });
});

// Create Super Link
app.post('/api/create-super-link', async function(req, res) {
    try {
        var uid = req.body.uid;
        var token = req.body.token;

        if (!uid || !token) {
            return res.status(400).json({ error: 'Missing uid or token' });
        }

        // Verify user
        var userRes = await fetch('https://www.duolingo.com/2017-06-30/users/' + uid + '?fields=id,username', {
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
        });
        if (!userRes.ok) {
            return res.status(401).json({ error: 'Invalid user token' });
        }
        var userData = await userRes.json();
        console.log('User:', userData.username, 'UID:', uid);

        // Try multiple Duolingo API endpoints
        var endpoints = [
            { url: 'https://www.duolingo.com/2017-06-30/family-plan/invites', body: { role: 'MEMBER' } },
            { url: 'https://www.duolingo.com/2017-06-30/family-plan/invite-link', body: {} },
            { url: 'https://www.duolingo.com/2023-05-23/family-plan/invites', body: { role: 'MEMBER' } },
            { url: 'https://www.duolingo.com/2017-06-30/family-plan/members/invites', body: { role: 'MEMBER' } }
        ];

        var lastErr = null;

        for (var i = 0; i < endpoints.length; i++) {
            var ep = endpoints[i];
            console.log('Trying:', ep.url);
            try {
                var inviteRes = await fetch(ep.url, {
                    method: 'POST',
                    headers: HEADERS,
                    body: JSON.stringify(ep.body)
                });

                var rawText = await inviteRes.text();
                console.log('Status:', inviteRes.status, 'Body:', rawText.substring(0, 500));

                if (inviteRes.ok) {
                    var data = {};
                    try { data = JSON.parse(rawText); } catch(e) {}

                    // Try to extract invite link/token
                    var inviteToken = data.inviteToken || data.token || data.invite_token || data.code;
                    var inviteLink = data.inviteLink || data.link || data.invite_link || data.url;

                    if (inviteLink) {
                        return res.json({ link: inviteLink, user: userData.username });
                    } else if (inviteToken) {
                        return res.json({ 
                            link: 'https://www.duolingo.com/family-plan/invite/' + inviteToken,
                            user: userData.username 
                        });
                    } else {
                        // Return raw data for debugging
                        return res.json({ raw: data, user: userData.username, endpoint: ep.url });
                    }
                }

                lastErr = { status: inviteRes.status, body: rawText.substring(0, 300), endpoint: ep.url };
            } catch (e) {
                lastErr = { error: e.message, endpoint: ep.url };
            }
        }

        return res.status(500).json({ 
            error: 'All endpoints failed',
            lastError: lastErr,
            hint: 'Check if OWNER_JWT is valid. Login as family plan owner and copy jwt_token from cookies.'
        });

    } catch (error) {
        console.error('Error:', error.message);
        return res.status(500).json({ error: error.message });
    }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
    console.log('API running on port ' + PORT);
    console.log('JWT starts with:', OWNER_JWT.substring(0, 20) + '...');
});
