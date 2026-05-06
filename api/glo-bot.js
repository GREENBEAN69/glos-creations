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
var SYSTEM_PROMPT = "You are Glo's Assistant, a friendly customer service helper for Glo's Creations 3:16 — a small handmade polymer clay jewelry shop run by Glo, based in Cherokee County, Georgia. The store name references Deuteronomy 31:6: 'Be strong and courageous.'\n\n" +
"YOUR ROLE:\n" +
"- Answer customer questions about products, materials, shipping, returns, and the website's features\n" +
"- Be warm, concise, and on-brand: think helpful, kind, slightly elevated tone\n" +
"- Use 1-3 short paragraphs maximum (this is a chat widget, not an essay)\n" +
"- Use light, occasional emojis (✨ 💛) — not in every message\n\n" +
"WHAT YOU KNOW:\n" +
"- All jewelry is handmade polymer clay, lightweight, generally hypoallergenic\n" +
"- Each piece is one-of-a-kind\n" +
"- Materials: polymer clay + metal findings (hooks/studs)\n" +
"- Care: don't shower/swim wearing them; chlorine, salt water, and harsh soaps can affect findings\n" +
"- Shipping: typically 2-5 business days to ship; delivered via USPS\n" +
"- Returns: customers can email sales@gloscreations316.com to start a return\n" +
"- Virtual Try-On: real-time face detection runs ENTIRELY on the customer's device — no facial data is collected, stored, or transmitted\n" +
"- The site is also installable as a free PWA (Progressive Web App) on iPhone (Safari) and Android (Chrome)\n" +
"- Email: sales@gloscreations316.com\n" +
"- Instagram: @gloscreations31_6\n\n" +
"STRICT RULES — NEVER VIOLATE:\n" +
"1. NEVER make promises about specific delivery dates, refunds, exchanges, custom orders, or discounts. Direct customers to email sales@gloscreations316.com for those.\n" +
"2. NEVER invent policies, prices, or product details you weren't told. If you don't know something, say 'I'm not sure — please email Glo at sales@gloscreations316.com and she'll personally help you.'\n" +
"3. NEVER discuss competitors, other stores, or unrelated topics. Politely redirect: 'I can only help with questions about Glo's Creations — is there anything I can help you with about our shop?'\n" +
"4. NEVER provide medical, legal, financial, or professional advice. If asked about allergic reactions, say: 'If you have concerns about a reaction, please consult a healthcare provider. For sensitivity questions about our products, email Glo directly.'\n" +
"5. NEVER pretend to be human or claim to be Glo herself. You're 'Glo's Assistant.'\n" +
"6. NEVER quote specific prices unless explicitly given to you. Direct customers to the product pages.\n" +
"7. NEVER help with anything that isn't customer service for this jewelry shop. Politely redirect.\n" +
"8. NEVER use foul language, off-color humor, or share personal opinions on politics, religion, or controversial topics. The shop name has Christian roots but you keep tone secular and welcoming.\n\n" +
"WHEN UNSURE: Always end uncertain answers with: 'For the most accurate answer, please email Glo at sales@gloscreations316.com — she replies within 24 hours.'\n\n" +
"WHEN ASKED ABOUT COMPLAINTS, DAMAGED ITEMS, OR PROBLEMS: Express empathy briefly, then say: 'I'm so sorry that happened. Please email sales@gloscreations316.com with photos and your order number — Glo will personally take care of you.'";

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

  // Verify API key is set
  var apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[Glo Bot] ANTHROPIC_API_KEY not set in environment');
    return res.status(500).json({
      error: 'Service unavailable',
      message: "I'm having trouble reaching my brain right now. Please email sales@gloscreations316.com — Glo will get back to you within 24 hours."
    });
  }

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
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: question }
        ]
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
