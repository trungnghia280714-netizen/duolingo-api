const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const OWNER_JWT = process.env.OWNER_JWT || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjYzMDcyMDAwMDAsImlhdCI6MCwic3ViIjo4MTAyMDQ0NTh9.qoPkyOMoXDvxgoU0O2WB9LQYa5iCp3WyU9_7pAy4Dgw';

app.get('/', function(req, res) {
    res.json({ status: 'OK', service: 'Duolingo Super API', version: '2.0' });
});

app.get('/api/test', async function(req, res) {
    try {
        var r = await fetch('https://www.duolingo.com/2017-06-30/users/810204458?fields=id,username', {
            headers: {
                'Authorization': 'Bearer ' + OWNER_JWT,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        var status = r.status;
        var text = await r.text();
        res.json({ jwtStatus: status, response: text.substring(0, 500), jwtLen: OWNER_JWT.length });
    } catch (e) {
        res.json({ error: e.message });
    }
});

// ═══ TẠO LINK SUPER - CHỈ DÙNG OWNER JWT ═══
app.post('/api/create-super-link', async function(req, res) {
    try {
        var uid = req.body.uid;
        if (!uid) return res.status(400).json({ error: 'Missing uid' });

        console.log('Creating link for UID:', uid);

        var ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

        // Thử nhiều endpoint khác nhau
        var endpoints = [
            {
                url: 'https://www.duolingo.com/2017-06-30/family-plan/invites',
                method: 'POST',
                body: { role: 'MEMBER' }
            },
            {
                url: 'https://www.duolingo.com/2017-06-30/family-plan/invites',
                method: 'POST',
                body: {}
            },
            {
                url: 'https://www.duolingo.com/2017-06-30/family-plan/invite-link',
                method: 'POST',
                body: {}
            },
            {
                url: 'https://www.duolingo.com/2017-06-30/family-plan/invite-link',
                method: 'POST',
                body: { role: 'MEMBER' }
            },
            {
                url: 'https://www.duolingo.com/2023-05-23/family-plan/invites',
                method: 'POST',
                body: { role: 'MEMBER' }
            },
            {
                url: 'https://www.duolingo.com/2017-06-30/family-plans/invites',
                method: 'POST',
                body: { role: 'MEMBER' }
            },
            {
                url: 'https://www.duolingo.com/2017-06-30/family-plan/members/invites',
                method: 'POST',
                body: { role: 'MEMBER', targetUserId: parseInt(uid) }
            },
            {
                url: 'https://www.duolingo.com/2017-06-30/family-plan/members',
                method: 'POST',
                body: { userId: parseInt(uid), role: 'MEMBER' }
            },
            {
                url: 'https://www.duolingo.com/2017-06-30/family-plan',
                method: 'POST',
                body: { inviteeId: parseInt(uid) }
            }
        ];

        var results = [];

        for (var i = 0; i < endpoints.length; i++) {
            var ep = endpoints[i];
            console.log('[' + (i+1) + '/' + endpoints.length + '] ' + ep.method + ' ' + ep.url);
            
            try {
                var r = await fetch(ep.url, {
                    method: ep.method,
                    headers: {
                        'Content-Type': 'application/json;charset=UTF-8',
                        'Authorization': 'Bearer ' + OWNER_JWT,
                        'Accept': 'application/json;charset=UTF-8',
                        'Origin': 'https://www.duolingo.com',
                        'Referer': 'https://www.duolingo.com/',
                        'User-Agent': ua,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify(ep.body)
                });

                var status = r.status;
                var text = await r.text();
                
                console.log('  → Status: ' + status + ' Body: ' + text.substring(0, 200));

                var entry = { 
                    url: ep.url, 
                    body: JSON.stringify(ep.body),
                    status: status, 
                    ok: r.ok,
                    response: text.substring(0, 300) 
                };
                results.push(entry);

                if (r.ok) {
                    var data = {};
                    try { data = JSON.parse(text); } catch(e) {}
                    
                    var link = data.inviteLink || data.link || data.invite_link || data.url;
                    var token = data.inviteToken || data.token || data.invite_token || data.code;
                    var familyId = data.familyPlanId || data.family_plan_id || data.id;

                    if (link) {
                        return res.json({ success: true, link: link, endpoint: ep.url });
                    } else if (token) {
                        return res.json({ success: true, link: 'https://www.duolingo.com/family-plan/invite/' + token, endpoint: ep.url });
                    } else if (familyId) {
                        return res.json({ success: true, data: data, endpoint: ep.url });
                    } else {
                        return res.json({ success: true, data: data, raw: text.substring(0, 1000), endpoint: ep.url });
                    }
                }
            } catch (e) {
                console.log('  → Error: ' + e.message);
                results.push({ url: ep.url, error: e.message });
            }
        }

        // Thử GET để xem family plan status
        try {
            var getStatus = await fetch('https://www.duolingo.com/2017-06-30/family-plan', {
                headers: {
                    'Authorization': 'Bearer ' + OWNER_JWT,
                    'Content-Type': 'application/json',
                    'User-Agent': ua
                }
            });
            var getStatusText = await getStatus.text();
            results.push({ 
                url: 'GET /family-plan', 
                status: getStatus.status, 
                response: getStatusText.substring(0, 500) 
            });
        } catch(e) {}

        return res.status(500).json({ 
            error: 'All endpoints failed',
            hint: 'Visit /api/test to check JWT validity',
            results: results
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: error.message });
    }
});

var PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', function() {
    console.log('🚀 API v2.0 on port ' + PORT);
});
