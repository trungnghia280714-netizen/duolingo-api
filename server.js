const express = require('express');
const cors = require('cors');
const fs = require('fs');
const axios = require('axios');
const app = express();

app.use(cors());
app.use(express.json());

// ========== CONFIG ==========
const FREE_KEY = 'Auto-Super';
const ADMIN_PW = 'ADMIN KEY SUPER';
const DB_FILE = './database.json';

// ========== DATABASE ==========
function loadDB() {
    try {
        return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch {
        return { 
            vipUsers: [], 
            links: [],
            leaderboard: [],
            feed: []
        };
    }
}

function saveDB(db) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ========== GEN KEY ==========
function genKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 8; i++) {
        key += chars[Math.floor(Math.random() * chars.length)];
    }
    return key;
}

// ========== HÀM GỌI DUOLINGO THẬT ==========
async function callDuolingo(jwt, endpoint, method = 'POST', data = null) {
    const url = `https://www.duolingo.com${endpoint}`;
    const headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Authorization': `Bearer ${jwt}`,
        'Accept': 'application/json;charset=UTF-8',
        'Origin': 'https://www.duolingo.com',
        'Referer': 'https://www.duolingo.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    
    try {
        const response = await axios({
            method: method,
            url: url,
            headers: headers,
            data: data,
            timeout: 30000
        });
        return { success: true, data: response.data };
    } catch (error) {
        return { 
            success: false, 
            status: error.response?.status || 0,
            error: error.response?.data || error.message 
        };
    }
}

// ========== 1. API TẠO LINK SUPER THẬT ==========

app.post('/api/create-links', async (req, res) => {
    const { key, count = 5, jwt } = req.body;
    const db = loadDB();
    
    // Xác thực key
    const isValid = key === FREE_KEY || key === ADMIN_PW || 
                    db.vipUsers.find(u => u.key === key);
    if (!isValid) {
        return res.status(403).json({ error: 'Key không hợp lệ' });
    }
    
    // Kiểm tra JWT
    if (!jwt) {
        return res.status(400).json({ error: 'Cần JWT token để tạo link thật' });
    }
    
    // Giới hạn số link
    const maxCount = (key === FREE_KEY) ? 1 : 5;
    const actualCount = Math.min(count, maxCount);
    
    const newLinks = [];
    
    // Gọi API thật của Duolingo
    for (let i = 0; i < actualCount; i++) {
        try {
            // Bước 1: Lấy thông tin user
            const userResult = await callDuolingo(jwt, '/2017-06-30/users/me', 'GET');
            if (!userResult.success) {
                return res.status(401).json({ error: 'JWT không hợp lệ hoặc hết hạn' });
            }
            
            const userId = userResult.data.id;
            const fromLang = userResult.data.fromLanguage || 'en';
            const learnLang = userResult.data.learningLanguage || 'es';
            
            // Bước 2: Tạo link invite (endpoint thật của Duolingo)
            const inviteResult = await callDuolingo(jwt, '/family-plan/invites', 'POST', {
                fromLanguage: fromLang,
                learningLanguage: learnLang
            });
            
            if (inviteResult.success && inviteResult.data.invite_id) {
                const link = {
                    id: `link_${Date.now()}_${i}`,
                    url: `https://www.duolingo.com/invite/${inviteResult.data.invite_id}`,
                    invite_id: inviteResult.data.invite_id,
                    created: new Date().toISOString(),
                    type: key === FREE_KEY ? 'FREE' : 'VIP'
                };
                newLinks.push(link);
                db.links.push(link);
                
                // Đợi 1s giữa các lần tạo
                await new Promise(r => setTimeout(r, 1000));
            } else {
                console.error('Lỗi tạo invite:', inviteResult.error);
            }
        } catch (error) {
            console.error('Lỗi khi tạo link:', error.message);
        }
    }
    
    saveDB(db);
    
    res.json({
        success: true,
        links: newLinks,
        total: newLinks.length,
        message: newLinks.length === 0 ? 'Không tạo được link nào. Kiểm tra JWT hoặc thử lại sau.' : undefined
    });
});

// ========== 2. API KÍCH HOẠT SUPER ==========
app.post('/api/activate-super', async (req, res) => {
    const { jwt, key } = req.body;
    const db = loadDB();
    
    // Xác thực key
    const isValid = key === FREE_KEY || key === ADMIN_PW || 
                    db.vipUsers.find(u => u.key === key);
    if (!isValid) {
        return res.status(403).json({ error: 'Key không hợp lệ' });
    }
    
    if (!jwt) {
        return res.status(400).json({ error: 'Cần JWT token' });
    }
    
    try {
        // Lấy thông tin user
        const userResult = await callDuolingo(jwt, '/2017-06-30/users/me', 'GET');
        if (!userResult.success) {
            return res.status(401).json({ error: 'JWT không hợp lệ' });
        }
        
        const userId = userResult.data.id;
        const fromLang = userResult.data.fromLanguage || 'en';
        const learnLang = userResult.data.learningLanguage || 'es';
        
        // Kích hoạt Super 3 ngày
        const activateResult = await callDuolingo(jwt, '/2017-06-30/users/' + userId + '/shop-items', 'POST', {
            itemName: 'immersive_subscription',
            isFree: true,
            consumed: true,
            fromLanguage: fromLang,
            learningLanguage: learnLang,
            productId: 'com.duolingo.immersive_free_trial_subscription'
        });
        
        if (activateResult.success) {
            res.json({
                success: true,
                message: 'Đã kích hoạt Super 3 ngày thành công!',
                expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
            });
        } else if (activateResult.status === 409) {
            res.json({
                success: false,
                message: 'Bạn đã có Super rồi!',
                already_has: true
            });
        } else {
            res.status(400).json({
                success: false,
                error: 'Không thể kích hoạt Super',
                detail: activateResult.error
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== 3. API VERIFY KEY ==========
app.post('/api/verify-key', (req, res) => {
    const { key } = req.body;
    const db = loadDB();
    
    if (key === FREE_KEY) {
        return res.json({ valid: true, type: 'FREE' });
    }
    if (key === ADMIN_PW) {
        return res.json({ valid: true, type: 'ADMIN' });
    }
    
    const vip = db.vipUsers.find(u => u.key === key);
    if (vip) {
        return res.json({ valid: true, type: 'VIP', username: vip.username });
    }
    
    res.status(403).json({ valid: false, error: 'Key không hợp lệ' });
});

// ========== 4. API LẤY LỊCH SỬ LINK ==========
app.get('/api/links/history', (req, res) => {
    const { key } = req.query;
    const db = loadDB();
    
    const isValid = key === FREE_KEY || key === ADMIN_PW || 
                    db.vipUsers.find(u => u.key === key);
    if (!isValid) {
        return res.status(403).json({ error: 'Key không hợp lệ' });
    }
    
    const userLinks = db.links.slice(-20).reverse();
    res.json({ links: userLinks, total: db.links.length });
});

// ========== 5. API LEADERBOARD ==========
app.post('/api/leaderboard/update', (req, res) => {
    const { username, xp, gems, streak, action } = req.body;
    const db = loadDB();
    
    let user = db.leaderboard.find(u => u.username === username);
    if (!user) {
        user = { 
            username, 
            xp: 0, 
            gems: 0, 
            streak: 0,
            rank: 0,
            lastActive: new Date().toISOString(),
            actions: []
        };
        db.leaderboard.push(user);
    }
    
    if (xp) user.xp += xp;
    if (gems) user.gems += gems;
    if (streak) user.streak += streak;
    user.lastActive = new Date().toISOString();
    
    if (action) {
        db.feed.push({
            username,
            action,
            xp: xp || 0,
            gems: gems || 0,
            timestamp: new Date().toISOString()
        });
        if (db.feed.length > 50) db.feed.shift();
    }
    
    db.leaderboard.sort((a, b) => b.xp - a.xp);
    db.leaderboard.forEach((u, i) => u.rank = i + 1);
    
    saveDB(db);
    res.json({ success: true, user });
});

app.get('/api/leaderboard', (req, res) => {
    const db = loadDB();
    const { limit = 20 } = req.query;
    
    let users = [...db.leaderboard];
    users.sort((a, b) => b.xp - a.xp);
    users = users.slice(0, parseInt(limit));
    users.forEach((u, i) => u.rank = i + 1);
    
    res.json({
        success: true,
        leaderboard: users,
        total: db.leaderboard.length
    });
});

app.get('/api/feed', (req, res) => {
    const db = loadDB();
    const { limit = 20 } = req.query;
    
    const feed = db.feed.slice(-parseInt(limit)).reverse();
    res.json({ 
        success: true, 
        feed,
        total: db.feed.length
    });
});

// ========== 6. API ADMIN ==========
app.post('/api/admin/create-vip', (req, res) => {
    const { adminKey, username } = req.body;
    if (adminKey !== ADMIN_PW) {
        return res.status(403).json({ error: 'Admin key sai' });
    }
    
    const db = loadDB();
    if (db.vipUsers.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username đã có VIP' });
    }
    
    const key = genKey();
    db.vipUsers.push({ key, username, ts: new Date().toISOString() });
    saveDB(db);
    
    res.json({ success: true, key, username });
});

app.get('/api/admin/vip-users', (req, res) => {
    const db = loadDB();
    res.json({ users: db.vipUsers });
});

app.delete('/api/admin/vip-users/:key', (req, res) => {
    const { adminKey } = req.body;
    if (adminKey !== ADMIN_PW) {
        return res.status(403).json({ error: 'Admin key sai' });
    }
    
    const db = loadDB();
    db.vipUsers = db.vipUsers.filter(u => u.key !== req.params.key);
    saveDB(db);
    res.json({ success: true });
});

// ========== HEALTH CHECK ==========
app.get('/', (req, res) => {
    res.json({
        name: 'Duolingo API - Link + Leaderboard',
        version: '2.0.0',
        endpoints: {
            'Link': ['/api/verify-key', '/api/create-links', '/api/links/history'],
            'Leaderboard': ['/api/leaderboard', '/api/leaderboard/update', '/api/feed'],
            'Admin': ['/api/admin/create-vip', '/api/admin/vip-users']
        }
    });
});

// ========== START ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API chạy tại port ${PORT}`);
});
