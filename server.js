const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Daftar domain yang didukung
const SUPPORTED_DOMAINS = [
    'v.gd', 'is.gd', 'sfl.gl', 'linkvertise.com', 'sub2unlock.com',
    'sub2unlock.me', 'sub2unlock.io', 'bit.ly', 'cutt.ly', 'tinyurl.com',
    'shorturl.at', 'ouo.io', 'adf.ly', 'rb.gy', 'shorte.st', 'bc.vc'
];

// Fungsi bypass untuk berbagai layanan
async function bypassLinkvertise(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            maxRedirects: 5
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Cari link target di script atau meta
        let originalUrl = null;
        $('script').each((i, script) => {
            const content = $(script).html();
            if (content && content.includes('window.location')) {
                const match = content.match(/window\.location\s*=\s*["']([^"']+)["']/);
                if (match) originalUrl = match[1];
            }
        });
        
        // Cek meta refresh
        if (!originalUrl) {
            const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
            if (metaRefresh) {
                const match = metaRefresh.match(/url=(.+)/i);
                if (match) originalUrl = match[1];
            }
        }
        
        return originalUrl || url;
    } catch(e) {
        return null;
    }
}

async function bypassSub2Unlock(url) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Extract destination URL dari berbagai pola
        let destination = null;
        
        // Cek atribut data-href
        $('[data-href]').each((i, el) => {
            const val = $(el).attr('data-href');
            if (val && (val.startsWith('http') || val.includes('://'))) {
                destination = val;
            }
        });
        
        // Cek link di iframe
        if (!destination) {
            $('iframe').each((i, iframe) => {
                const src = $(iframe).attr('src');
                if (src && src.includes('go.php')) {
                    destination = src;
                }
            });
        }
        
        return destination || url;
    } catch(e) {
        return null;
    }
}

async function bypassSimpleShortener(url) {
    try {
        const response = await axios.get(url, {
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        // Ambil location header
        if (response.headers.location) {
            return response.headers.location;
        }
        
        // Atau cek HTML
        if (typeof response.data === 'string') {
            const html = response.data;
            const $ = cheerio.load(html);
            const metaUrl = $('meta[http-equiv="refresh"]').attr('content');
            if (metaUrl) {
                const match = metaUrl.match(/url=(.+)/i);
                if (match) return decodeURIComponent(match[1]);
            }
        }
        
        return url;
    } catch(e) {
        if (e.response && e.response.headers.location) {
            return e.response.headers.location;
        }
        return null;
    }
}

// API endpoint bypass
app.post('/api/bypass', async (req, res) => {
    const { url } = req.body;
    
    if (!url) {
        return res.json({ success: false, error: 'URL diperlukan' });
    }
    
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        
        let originalUrl = null;
        
        // Pilih metode bypass berdasarkan domain
        if (domain.includes('linkvertise')) {
            originalUrl = await bypassLinkvertise(url);
        } 
        else if (domain.includes('sub2unlock')) {
            originalUrl = await bypassSub2Unlock(url);
        }
        else if (SUPPORTED_DOMAINS.some(d => domain.includes(d))) {
            originalUrl = await bypassSimpleShortener(url);
        }
        else {
            return res.json({ success: false, error: 'Domain tidak didukung' });
        }
        
        if (originalUrl && originalUrl !== url) {
            res.json({ success: true, original_url: originalUrl });
        } else {
            res.json({ success: false, error: 'Gagal mendapatkan link asli' });
        }
        
    } catch(e) {
        res.json({ success: false, error: e.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', bypass_mode: 'active' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Bypass server running on http://localhost:${PORT}`);
    console.log(`⚡ Supported domains: ${SUPPORTED_DOMAINS.join(', ')}`);
});
