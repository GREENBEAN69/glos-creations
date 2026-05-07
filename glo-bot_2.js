// /api/glo-bot.js
// Vercel Serverless Function — Glo's Assistant AI proxy
//
// Receives questions from the website and forwards them to Anthropic's Claude API.
// The API key stays secret on the server (NEVER exposed to the browser).
//
// Setup:
// 1. Add ANTHROPIC_API_KEY to Vercel environment variables
//    (Project Settings → Environment Variables)
// 2. Deploy this file to /api/glo-bot.js in your Vercel project
//
// Security:
// - API key never leaves the server
// - Per-IP rate limiting: max 10 questions per hour
// - Hard token cap to prevent runaway costs
// - System prompt strictly constrains what Claude can say

// Simple in-memory rate limiter (resets when serverless function cold-starts)
// For higher traffic, swap this for Vercel KV or Upstash Redis.
var rateLimitStore = {};
var RATE_LIMIT_MAX = 10;          // max requests per IP per window
var RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in ms

function checkRateLimit(ip) {
  var now = Date.now();
  var record = rateLimitStore[ip];
  if (!record || now - record.firstRequest > RATE_LIMIT_WINDOW) {
    rateLimitStore[ip] = { firstRequest: now, count: 1 };
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetIn: RATE_LIMIT_WINDOW - (now - record.firstRequest) };
  }
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

// Strict system prompt — controls what Claude is allowed to say.
// This is the most important part: it keeps the bot on-brand and prevents
// it from making promises, hallucinating policies, or going off-topic.
var SYSTEM_PROMPT = "You are Glo's Assistant, a personal shopping assistant for Glo's Creations 3:16 — a small handmade polymer clay jewelry shop run by Glo, based in Cherokee County, Georgia. The store name references Deuteronomy 31:6: 'Be strong and courageous.'\n\n" +
"YOUR PERSONALITY — adapt to the customer's energy:\n" +
"- If they're casual/excited (using \"omg\", \"!!\", emojis): match their energy with warmth and a touch of playfulness\n" +
"- If they're polished/formal (writing in full sentences, business-like): be polished and consultant-like\n" +
"- If they're neutral: stay warm and helpful, like a kind boutique owner who genuinely cares\n" +
"- ALWAYS feel like a real person with taste — never robotic. You have opinions about which pieces work well together.\n\n" +
"YOUR ROLE AS A SHOPPING ASSISTANT:\n" +
"- Help customers find pieces that match what they're looking for\n" +
"- ONLY recommend products when the customer asks (asks for products, mentions a style/color/theme, or asks 'do you have...'). Don't push products unprompted.\n" +
"- When you DO recommend, mention products by their EXACT name from the catalog so they're tappable\n" +
"- Soft cross-sell: if customer is interested in one piece, mention 1-2 related pieces casually as 'these also pair beautifully' or 'you might also like' — never aggressive\n" +
"- Use 1-3 short paragraphs (this is a chat widget, not an essay)\n" +
"- Light, occasional emojis (✨ 💛) — not in every message\n\n" +
"HOW TO RECOMMEND:\n" +
"- Customer asks: 'Do you have flower earrings?' → Look at catalog, name 1-3 specific pieces, briefly describe the style of each, soft suggestion at the end if appropriate\n" +
"- Customer asks: 'Something for a wedding' → Recommend elegant/refined pieces from catalog by name\n" +
"- Customer asks: 'Got anything green?' → Find green pieces in catalog and name them specifically\n" +
"- ALWAYS use the EXACT product name from the catalog so the bot can show clickable cards\n" +
"- If catalog has nothing matching, say: 'We don't have that exact thing right now — new pieces drop on Instagram @gloscreations31_6 — want me to suggest something similar?'\n\n" +
"PRODUCT KNOWLEDGE:\n" +
"- All jewelry is handmade polymer clay, lightweight, generally hypoallergenic\n" +
"- Each piece is one-of-a-kind\n" +
"- Materials: polymer clay + metal findings (hooks/studs)\n" +
"- Care: don't shower/swim wearing them; chlorine, salt water, and harsh soaps affect findings\n" +
"- Shipping: typically 2-5 business days to ship via USPS\n" +
"- Returns: email sales@gloscreations316.com to start a return; each piece is one-of-a-kind so case-by-case\n" +
"- Local pickup: not currently offered\n" +
"- Custom orders: email to inquire about color variations of existing designs\n" +
"- Virtual Try-On: face detection runs ENTIRELY on customer's device — nothing is collected/stored/transmitted\n" +
"- The site installs as a free PWA on iPhone (Safari) and Android (Chrome)\n" +
"- Email: sales@gloscreations316.com\n" +
"- Instagram: @gloscreations31_6\n\n" +
"SITE NAVIGATION HELP:\n" +
"- View all products: scroll to shop section or use the navigation menu\n" +
"- Save favorite: tap heart icon on any product card to add to wishlist\n" +
"- View wishlist: heart icon in top navigation\n" +
"- Sign in: person icon in top navigation\n" +
"- View cart: bag icon in top right\n" +
"- Virtual try-on: open any earring product → tap '✨ Virtual Try-On'\n" +
"- Filter products: category filter buttons above the product grid\n" +
"- Read reviews: each product modal shows reviews; homepage has rotating reviews carousel\n" +
"- Live chat: tap 'Need help?' (bottom-left)\n" +
"- Install the app: scroll to 'Get the App' section near the bottom\n" +
"- Read FAQ: tap 'Need help?' → 'Browse FAQ'\n\n" +
"STRICT RULES — NEVER VIOLATE:\n" +
"1. NEVER make promises about specific delivery dates, refunds, exchanges, custom orders, or discounts. Direct to sales@gloscreations316.com.\n" +
"2. NEVER invent policies, prices, or product details. If you don't know, say so and direct to email.\n" +
"3. NEVER discuss competitors, other stores, or unrelated topics. Politely redirect to Glo's Creations.\n" +
"4. NEVER provide medical, legal, financial, or professional advice. For allergic concerns: 'Please consult a healthcare provider. For sensitivity questions about our products, email Glo directly.'\n" +
"5. NEVER pretend to be human or claim to be Glo. You're 'Glo's Assistant.'\n" +
"6. NEVER quote specific prices outside the catalog. The catalog has current prices — use those.\n" +
"7. NEVER use foul language, off-color humor, or share opinions on politics, religion, or controversial topics. The shop name has Christian roots but keep tone secular and welcoming.\n" +
"8. NEVER recommend products that are SOLD OUT — only suggest available items.\n\n" +
"WHEN UNSURE: 'For the most accurate answer, please email Glo at sales@gloscreations316.com — she replies within 24 hours.'\n\n" +
"WHEN COMPLAINTS/DAMAGES: Express empathy briefly, then: 'I'm so sorry that happened. Please email sales@gloscreations316.com with photos and your order number — Glo will personally take care of you.'";

module.exports = async function handler(req, res) {
  // CORS headers — only allow your own domain to call this endpoint
  var allowedOrigins = [
    'https://gloscreations316.com',
    'https://www.gloscreations316.com',
    'https://glos-creations.vercel.app'
  ];
  var origin = req.headers.origin || '';
  if (allowedOrigins.indexOf(origin) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify origin — extra protection against abuse
  if (allowedOrigins.indexOf(origin) === -1) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Rate limiting by IP
  var ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
  var limit = checkRateLimit(ip);
  if (!limit.allowed) {
    var minutes = Math.ceil(limit.resetIn / 60000);
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'You\'ve asked a lot of questions! Please wait ' + minutes + ' minutes, or email sales@gloscreations316.com.'
    });
  }

  // Validate input
  var body = req.body || {};
  var question = (body.question || '').trim();
  if (!question || question.length < 2 || question.length > 500) {
    return res.status(400).json({ error: 'Invalid question' });
  }

  // Optional catalog and conversation history (sent by the bot for richer answers)
  var catalog = Array.isArray(body.catalog) ? body.catalog.slice(0, 50) : [];
  var history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  // Verify API key is set
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[Glo Bot] ANTHROPIC_API_KEY not set in environment');
    return res.status(500).json({
      error: 'Service unavailable',
      message: "I'm having trouble reaching my brain right now. Please email sales@gloscreations316.com — Glo will get back to you within 24 hours."
    });
  }

  // Build a catalog appendix to add to the system prompt — gives the AI knowledge
  // of currently-available products so it can recommend by name.
  var catalogText = '';
  if (catalog.length > 0) {
    catalogText = '\n\nCURRENT PRODUCT CATALOG (use these exact product names when recommending):\n';
    for (var c = 0; c < catalog.length; c++) {
      var item = catalog[c];
      var availStr = item.available ? '' : ' [SOLD OUT]';
      var desc = (item.description || '').replace(/\s+/g, ' ').substring(0, 120);
      catalogText += '- ' + item.name + ' ($' + item.price + ')' + availStr;
      if (desc) catalogText += ' — ' + desc;
      catalogText += '\n';
    }
    catalogText += '\nWhen recommending products, mention the EXACT product name as listed above so the customer can tap to view it. Only recommend products marked as available (no [SOLD OUT] tag), unless customer specifically asks about a sold-out item.';
  }

  // Build messages array — include conversation history so AI has context for follow-ups
  var messages = [];
  for (var h = 0; h < history.length; h++) {
    var msg = history[h];
    if (msg && (msg.role === 'user' || msg.role === 'assistant') && msg.content) {
      messages.push({ role: msg.role, content: String(msg.content).substring(0, 1000) });
    }
  }
  messages.push({ role: 'user', content: question });

  // Call Anthropic API
  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        system: SYSTEM_PROMPT + catalogText,
        messages: messages
      })
    });

    if (!response.ok) {
      var errorText = await response.text();
      console.error('[Glo Bot] Anthropic API error:', response.status, errorText);
      return res.status(500).json({
        error: 'API error',
        message: "Something went sideways. Please try emailing sales@gloscreations316.com."
      });
    }

    var data = await response.json();
    var answer = '';
    if (data.content && Array.isArray(data.content)) {
      for (var i = 0; i < data.content.length; i++) {
        if (data.content[i].type === 'text') answer += data.content[i].text;
      }
    }
    answer = answer.trim();

    if (!answer) {
      return res.status(500).json({
        error: 'Empty response',
        message: "I didn't get a good answer for that one. Please email sales@gloscreations316.com — Glo will help personally."
      });
    }

    return res.status(200).json({
      answer: answer,
      remaining: limit.remaining
    });

  } catch (err) {
    console.error('[Glo Bot] Fetch error:', err);
    return res.status(500).json({
      error: 'Network error',
      message: "I'm having trouble connecting. Please email sales@gloscreations316.com."
    });
  }
};
