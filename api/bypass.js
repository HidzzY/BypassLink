const axios = require('axios');
const cheerio = require('cheerio');

const SUPPORTED_DOMAINS = [
    'v.gd', 'is.gd', 'sfl.gl', 'linkvertise.com', 'sub2unlock.com',
    'sub2unlock.me', 'sub2unlock.io', 'bit.ly', 'cutt.ly', 'tinyurl.com',
    'shorturl.at', 'ouo.io', 'rb.gy', 'shorte.st', 'tiny.cc', 'adf.ly',
    'bc.vc', 'goo.gl', 'ow.ly', 'buff.ly', 's.id', 'rb.gy'
];

// ==================== BYPASS SFL.GL ====================
async function bypassSflGl(url) {
    try {
        // Ekstrak kode dari URL
        const match = url.match(/sfl\.gl\/([A-Za-z0-9]+)/);
        if (!match) return null;
        
        const code = match[1];
        
        // Method 1: Langsung ke endpoint API JSON
        try {
            const apiUrl = `https://sfl.gl/links/api/${code}`;
            const apiResponse = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                timeout: 10000
            });
            
            if (apiResponse.data && apiResponse.data.url) {
                return apiResponse.data.url;
            }
            if (apiResponse.data && apiResponse.data.link) {
                return apiResponse.data.link;
            }
        } catch(e) {}
        
        // Method 2: Coba dengan parameter skip
        const skipParams = ['?skip=1', '?direct=1', '?noads=1', '?no_ads=1', '?adblock=0'];
        for (const param of skipParams) {
            try {
                const skipUrl = `https://sfl.gl/${code}${param}`;
                const response = await axios.get(skipUrl, {
                    maxRedirects: 0,
                    validateStatus: (status) => status === 301 || status === 302 || status === 200,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                        'Accept': 'text/html'
                    }
                });
                
                if (response.headers.location) {
                    return response.headers.location;
                }
            } catch(e) {
                if (e.response && e.response.headers.location) {
                    return e.response.headers.location;
                }
            }
        }
        
        // Method 3: Ambil dari HTML dengan parser lebih agresif
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });
        
        const html = response.data;
        const $ = cheerio.load(html);
        
        // Cari di berbagai tempat
        let foundUrl = null;
        
        // 3a: Cari di elemen dengan class tertentu
        const selectors = [
            'a[class*="skip"]', 'a[class*="continue"]', 'a[class*="button"]',
            'a[id*="skip"]', 'a[id*="continue"]', '.skip-link', '.continue-link',
            'a[data-url]', 'a[data-href]', 'div[data-url]', 'div[data-href]'
        ];
        
        for (const selector of selectors) {
            $(selector).each((i, el) => {
                const href = $(el).attr('href') || $(el).attr('data-url') || $(el).attr('data-href');
                if (href && (href.startsWith('http') || href.includes('://'))) {
                    foundUrl = href;
                    return false;
                }
            });
            if (foundUrl) break;
        }
        
        // 3b: Cari di script yang mengandung destination
        if (!foundUrl) {
            $('script').each((i, script) => {
                const content = $(script).html();
                if (content) {
                    const patterns = [
                        /var\s+destination\s*=\s*["']([^"']+)["']/,
                        /var\s+url\s*=\s*["']([^"']+)["']/,
                        /window\.location\s*=\s*["']([^"']+)["']/,
                        /data-destination=["']([^"']+)["']/,
                        /"destination":"([^"]+)"/,
                        /"url":"([^"]+)"/
                    ];
                    for (const pattern of patterns) {
                        const match = content.match(pattern);
                        if (match && match[1] && match[1].includes('http')) {
                            foundUrl = match[1];
                            return false;
                        }
                    }
                }
            });
        }
        
        // 3c: Cari di meta refresh
        if (!foundUrl) {
            const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
            if (metaRefresh) {
                const match = metaRefresh.match(/url=(.+)/i);
                if (match) foundUrl = decodeURIComponent(match[1]);
            }
        }
        
        return foundUrl || null;
        
    } catch(e) {
        return null;
    }
}

// ==================== BYPASS LINKVERTISE ====================
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
        
        let originalUrl = null;
        
        $('script').each((i, script) => {
            const content = $(script).html();
            if (content) {
                const patterns = [
                    /window\.location\s*=\s*["']([^"']+)["']/,
                    /window\.location\.href\s*=\s*["']([^"']+)["']/,
                    /location\.replace\(["']([^"']+)["']\)/,
                    /setTimeout\(function\(\)\s*{\s*window\.location\.href\s*=\s*["']([^"']+)["']/,
                    /data: ["']([^"']+\.(?:mp4|jpg|png|zip|rar|pdf))["']/,
                    /href:\s*["']([^"']+)["']/
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
        
        if (!originalUrl) {
            const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
            if (metaRefresh) {
                const match = metaRefresh.match(/url=(.+)/i);
                if (match) originalUrl = decodeURIComponent(match[1]);
            }
        }
        
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

// ==================== BYPASS SUB2UNLOCK ====================
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
        
        $('[data-href], [data-url], [data-link], [data-destination]').each((i, el) => {
            const val = $(el).attr('data-href') || $(el).attr('data-url') || 
                       $(el).attr('data-link') || $(el).attr('data-destination');
            if (val && (val.startsWith('http') || val.includes('://'))) {
                destination = val;
            }
        });
        
        if (!destination) {
            $('a[href*="go"], a[href*="redirect"], a[href*="out"]').each((i, el) => {
                const href = $(el).attr('href');
                if (href && href.startsWith('http')) {
                    destination = href;
                }
            });
        }
        
        if (!destination) {
            const match = html.match(/window\.location\.(?:href|replace)\s*=\s*["']([^"']+)["']/);
            if (match && match[1]) destination = match[1];
        }
        
        return destination || null;
    } catch(e) {
        return null;
    }
}

// ==================== BYPASS SIMPLE SHORTENER ====================
async function bypassSimpleShortener(url) {
    try {
        const response = await axios.get(url, {
            maxRedirects: 0,
            validateStatus: (status) => status >= 200 && status < 400,
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'text/html,application/xhtml+xml'
            }
        });
        
        if (response.headers.location) {
            let location = response.headers.location;
            if (location.startsWith('/')) {
                const urlObj = new URL(url);
                location = `${urlObj.protocol}//${urlObj.host}${location}`;
            }
            return location;
        }
        
        if (typeof response.data === 'string') {
            const html = response.data;
            const $ = cheerio.load(html);
            
            const metaUrl = $('meta[http-equiv="refresh"]').attr('content');
            if (metaUrl) {
                const match = metaUrl.match(/url=(.+)/i);
                if (match) return decodeURIComponent(match[1]);
            }
            
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

// ==================== BYPASS OUO.IO ====================
async function bypassOuoIo(url) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const html = response.data;
        const match = html.match(/var\s+_url\s*=\s*atob\(["']([^"']+)["']\)/);
        if (match) {
            const encoded = match[1];
            const decoded = Buffer.from(encoded, 'base64').toString();
            return decoded;
        }
        
        return null;
    } catch(e) {
        return null;
    }
}

// ==================== BYPASS ADF.LY ====================
async function bypassAdfLy(url) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        
        const html = response.data;
        const match = html.match(/var\s+click_url\s*=\s*atob\(["']([^"']+)["']\)/);
        if (match) {
            const encoded = match[1];
            const decoded = Buffer.from(encoded, 'base64').toString();
            return decoded;
        }
        
        return null;
    } catch(e) {
        return null;
    }
}

// ==================== MAIN HANDLER ====================
module.exports = async (req, res) => {
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
        let methodUsed = 'unknown';
        
        // Pilih metode bypass berdasarkan domain
        if (domain.includes('sfl.gl')) {
            originalUrl = await bypassSflGl(url);
            methodUsed = 'sfl.gl_special';
        }
        else if (domain.includes('linkvertise')) {
            originalUrl = await bypassLinkvertise(url);
            methodUsed = 'linkvertise';
        }
        else if (domain.includes('sub2unlock')) {
            originalUrl = await bypassSub2Unlock(url);
            methodUsed = 'sub2unlock';
        }
        else if (domain.includes('ouo.io')) {
            originalUrl = await bypassOuoIo(url);
            methodUsed = 'ouo.io';
        }
        else if (domain.includes('adf.ly')) {
            originalUrl = await bypassAdfLy(url);
            methodUsed = 'adf.ly';
        }
        else if (SUPPORTED_DOMAINS.some(d => domain === d || domain.includes(d))) {
            originalUrl = await bypassSimpleShortener(url);
            methodUsed = 'redirect_follow';
        }
        else {
            return res.status(400).json({ success: false, error: `Domain ${domain} tidak didukung` });
        }
        
        if (originalUrl && originalUrl !== url && originalUrl !== '') {
            return res.json({ 
                success: true, 
                original_url: originalUrl,
                domain: domain,
                bypass_method: methodUsed
            });
        } else {
            return res.json({ success: false, error: 'Gagal mendapatkan link asli' });
        }
        
    } catch(e) {
        return res.status(500).json({ success: false, error: e.message });
    }
};
