const express = require('express');
const cors = require('cors');
const fs = require('fs');
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

// ========== 1. API TẠO LINK SUPER ==========

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

app.post('/api/create-links', (req, res) => {
    const { key, count = 5 } = req.body;
    const db = loadDB();
    
    const isValid = key === FREE_KEY || key === ADMIN_PW || 
                    db.vipUsers.find(u => u.key === key);
    if (!isValid) {
        return res.status(403).json({ error: 'Key không hợp lệ' });
    }
    
    const maxCount = (key === FREE_KEY) ? 1 : 10;
    const actualCount = Math.min(count, maxCount);
    
    const newLinks = [];
    for (let i = 0; i < actualCount; i++) {
        const link = {
            id: `link_${Date.now()}_${i}`,
            url: `https://www.duolingo.com/invite/${genKey().toLowerCase()}`,
            created: new Date().toISOString(),
            type: key === FREE_KEY ? 'FREE' : 'VIP'
        };
        newLinks.push(link);
        db.links.push(link);
    }
    
    saveDB(db);
    
    res.json({
        success: true,
        links: newLinks,
        total: newLinks.length,
        remaining: key === FREE_KEY ? 0 : 'Unlimited'
    });
});

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

// ========== 2. API BẢNG XẾP HẠNG + FEED ==========

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
    const { limit = 20, filter = 'all' } = req.query;
    
    let users = [...db.leaderboard];
    
    if (filter !== 'all') {
        const now = new Date();
        let cutoff = new Date();
        if (filter === 'week') cutoff.setDate(now.getDate() - 7);
        else if (filter === 'month') cutoff.setMonth(now.getMonth() - 1);
        else if (filter === 'year') cutoff.setFullYear(now.getFullYear() - 1);
        
        users = users.filter(u => new Date(u.lastActive) > cutoff);
    }
    
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

app.post('/api/feed/add', (req, res) => {
    const { username, action, xp = 0, gems = 0 } = req.body;
    const db = loadDB();
    
    db.feed.push({
        username,
        action,
        xp,
        gems,
        timestamp: new Date().toISOString()
    });
    
    if (db.feed.length > 50) db.feed.shift();
    saveDB(db);
    
    res.json({ success: true });
});

app.post('/api/leaderboard/reset', (req, res) => {
    const { adminKey } = req.body;
    if (adminKey !== ADMIN_PW) {
        return res.status(403).json({ error: 'Admin key sai' });
    }
    
    const db = loadDB();
    db.leaderboard = [];
    db.feed = [];
    saveDB(db);
    
    res.json({ success: true, message: 'Đã reset leaderboard' });
});

// ========== API ADMIN ==========

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
        version: '1.0.0',
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