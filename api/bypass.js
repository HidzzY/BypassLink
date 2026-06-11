const axios = require('axios');
const cheerio = require('cheerio');

const SUPPORTED_DOMAINS = [
    'v.gd', 'is.gd', 'sfl.gl', 'linkvertise.com', 'sub2unlock.com',
    'sub2unlock.me', 'sub2unlock.io', 'bit.ly', 'cutt.ly', 'tinyurl.com',
    'shorturl.at', 'ouo.io', 'rb.gy', 'shorte.st', 'tiny.cc'
];

async function bypassLinkvertise(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 20000
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Pattern 1: window.location
        let originalUrl = null;
        $('script').each((i, script) => {
            const content = $(script).html();
            if (content) {
                const patterns = [
                    /window\.location\s*=\s*["']([^"']+)["']/,
                    /window\.location\.href\s*=\s*["']([^"']+)["']/,
                    /location\.replace\(["']([^"']+)["']\)/,
                    /setTimeout\(function\(\)\s*{\s*window\.location\.href\s*=\s*["']([^"']+)["']/,
                    /data: ["']([^"']+\.(?:mp4|jpg|png|zip|rar|pdf))["']/
                ];
                
                for (const pattern of patterns) {
                    const match = content.match(pattern);
                    if (match && match[1] && !match[1].includes('undefined')) {
                        originalUrl = match[1];
                        break;
                    }
                }
            }
        });
        
        // Pattern 2: meta refresh
        if (!originalUrl) {
            const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
            if (metaRefresh) {
                const match = metaRefresh.match(/url=(.+)/i);
                if (match) originalUrl = decodeURIComponent(match[1]);
            }
        }
        
        // Pattern 3: iframe src
        if (!originalUrl) {
            $('iframe').each((i, iframe) => {
                const src = $(iframe).attr('src');
                if (src && (src.includes('go.php') || src.includes('redirect') || src.includes('link'))) {
                    originalUrl = src;
                }
            });
        }
        
        return originalUrl || null;
    } catch(e) {
        return null;
    }
}

async function bypassSub2Unlock(url) {
    try {
        const response = await axios.get(url, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Referer': 'https://google.com/'
            },
            timeout: 15000
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        let destination = null;
        
        // Cek berbagai atribut
        $('[data-href], [data-url], [data-link], [data-destination]').each((i, el) => {
            const val = $(el).attr('data-href') || $(el).attr('data-url') || 
                       $(el).attr('data-link') || $(el).attr('data-destination');
            if (val && (val.startsWith('http') || val.includes('://'))) {
                destination = val;
            }
        });
        
        // Cek di dalam div atau a tag
        if (!destination) {
            $('a[href*="go"], a[href*="redirect"], a[href*="out"]').each((i, el) => {
                const href = $(el).attr('href');
                if (href && href.startsWith('http')) {
                    destination = href;
                }
            });
        }
        
        return destination || null;
    } catch(e) {
        return null;
    }
}

async function bypassSimpleShortener(url) {
    try {
        // Follow redirects manual
        const response = await axios.get(url, {
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        // Check location header
        if (response.headers.location) {
            let location = response.headers.location;
            if (location.startsWith('/')) {
                const urlObj = new URL(url);
                location = `${urlObj.protocol}//${urlObj.host}${location}`;
            }
            return location;
        }
        
        // Check HTML meta refresh
        if (typeof response.data === 'string') {
            const html = response.data;
            const $ = cheerio.load(html);
            const metaUrl = $('meta[http-equiv="refresh"]').attr('content');
            if (metaUrl) {
                const match = metaUrl.match(/url=(.+)/i);
                if (match) return decodeURIComponent(match[1]);
            }
            
            // Check JavaScript redirect
            let jsUrl = null;
            $('script').each((i, script) => {
                const content = $(script).html();
                if (content) {
                    const match = content.match(/window\.location\.(?:href|replace)\s*=\s*["']([^"']+)["']/);
                    if (match) jsUrl = match[1];
                }
            });
            if (jsUrl) return jsUrl;
        }
        
        return null;
    } catch(e) {
        if (e.response && e.response.headers.location) {
            return e.response.headers.location;
        }
        return null;
    }
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }
    
    const { url } = req.body;
    
    if (!url) {
        return res.status(400).json({ success: false, error: 'URL diperlukan' });
    }
    
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '');
        
        let originalUrl = null;
        
        if (domain.includes('linkvertise')) {
            originalUrl = await bypassLinkvertise(url);
        } 
        else if (domain.includes('sub2unlock')) {
            originalUrl = await bypassSub2Unlock(url);
        }
        else if (SUPPORTED_DOMAINS.some(d => domain === d || domain.includes(d))) {
            originalUrl = await bypassSimpleShortener(url);
        }
        else {
            return res.status(400).json({ success: false, error: `Domain ${domain} tidak didukung` });
        }
        
        if (originalUrl && originalUrl !== url) {
            return res.json({ 
                success: true, 
                original_url: originalUrl,
                domain: domain,
                bypass_method: domain.includes('linkvertise') ? 'linkvertise' : 
                              (domain.includes('sub2unlock') ? 'sub2unlock' : 'redirect_follow')
            });
        } else {
            return res.json({ success: false, error: 'Gagal mendapatkan link asli' });
        }
        
    } catch(e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};
