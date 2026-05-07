// /api/custom-order.js
// Vercel Serverless Function — Custom Order Intake
//
// Receives a custom order request from the bot, sends two emails via Resend:
//   1. To Glo (sales@gloscreations316.com) + BCC to admin (masseyjasonlee@gmail.com)
//   2. Auto-confirmation back to the customer
//
// Required Vercel env vars:
//   RESEND_API_KEY — already set up for abuse alerts
//   ALERT_EMAIL — already set up (used as BCC fallback if needed)
//
// Security:
// - Rate-limited per IP (3 submissions per hour, 5 per day)
// - Honeypot field (botName) — if filled, silently rejected
// - Required fields validated server-side
// - All input sanitized for HTML email

// =================== Rate Limiting ===================
var rateLimitStore = {};
var RATE_LIMIT_HOUR_MAX = 3;
var RATE_LIMIT_DAY_MAX = 5;
var RATE_LIMIT_HOUR_WINDOW = 60 * 60 * 1000;
var RATE_LIMIT_DAY_WINDOW = 24 * 60 * 60 * 1000;

function checkRateLimit(ip) {
  var now = Date.now();
  var record = rateLimitStore[ip];
  if (!record) {
    rateLimitStore[ip] = {
      hourStart: now, hourCount: 1,
      dayStart: now, dayCount: 1
    };
    return { allowed: true };
  }
  if (now - record.hourStart > RATE_LIMIT_HOUR_WINDOW) {
    record.hourStart = now;
    record.hourCount = 0;
  }
  if (now - record.dayStart > RATE_LIMIT_DAY_WINDOW) {
    record.dayStart = now;
    record.dayCount = 0;
  }
  if (record.hourCount >= RATE_LIMIT_HOUR_MAX) {
    return { allowed: false, reason: 'hour' };
  }
  if (record.dayCount >= RATE_LIMIT_DAY_MAX) {
    return { allowed: false, reason: 'day' };
  }
  record.hourCount++;
  record.dayCount++;
  return { allowed: true };
}

// =================== Helpers ===================
// Escape HTML so customer text can't break the email template or inject content
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitize(str, maxLen) {
  if (!str) return '';
  return String(str).trim().substring(0, maxLen || 500);
}

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(email.trim());
}

// Build the HTML email body for Glo
function buildGloEmailHtml(data) {
  var rows = [
    { label: 'Customer name', value: data.customerName },
    { label: 'Customer email', value: data.customerEmail },
    { label: 'Style/theme', value: data.style },
    { label: 'Color palette', value: data.palette },
    { label: 'Earring type', value: data.earringType },
    { label: 'Occasion / inspiration', value: data.occasion },
    { label: 'Budget range', value: data.budget },
    { label: 'Timeline', value: data.timeline },
    { label: 'Reference / additional notes', value: data.references }
  ];

  var html = '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1c1917;">';
  html += '<h2 style="font-family:Georgia,serif;font-size:24px;color:#1c1917;margin-bottom:8px;">New Custom Order Request ✨</h2>';
  html += '<p style="color:#78716c;font-size:14px;margin-bottom:20px;">A customer has submitted a custom order request through Glo\'s Assistant on the website.</p>';
  html += '<table style="width:100%;border-collapse:collapse;border:1px solid #e7e5e4;border-radius:8px;overflow:hidden;">';
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row.value) continue;
    var bg = i % 2 === 0 ? '#fafaf9' : 'white';
    html += '<tr style="background:' + bg + ';">';
    html += '<td style="padding:12px 16px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#78716c;width:160px;border-bottom:1px solid #e7e5e4;vertical-align:top;">' + escapeHtml(row.label) + '</td>';
    html += '<td style="padding:12px 16px;font-size:14px;color:#1c1917;border-bottom:1px solid #e7e5e4;line-height:1.5;">' + escapeHtml(row.value).replace(/\n/g, '<br>') + '</td>';
    html += '</tr>';
  }
  html += '</table>';
  html += '<p style="margin-top:20px;font-size:13px;color:#78716c;">';
  html += 'Reply directly to this email to contact the customer at <strong>' + escapeHtml(data.customerEmail) + '</strong>.';
  html += '</p>';
  html += '<p style="margin-top:8px;font-size:11px;color:#a8a29e;">Submitted at ' + new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' }) + '</p>';
  html += '</div>';
  return html;
}

// Build the auto-confirmation email back to the customer
function buildCustomerConfirmHtml(data) {
  var firstName = (data.customerName || '').split(' ')[0] || 'there';
  var html = '<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1c1917;">';
  html += '<h2 style="font-family:Georgia,serif;font-size:24px;color:#1c1917;margin-bottom:12px;">Thanks for your custom order request, ' + escapeHtml(firstName) + '! ✨</h2>';
  html += '<p style="font-size:15px;color:#44403c;line-height:1.6;">I received your request and I\'m so excited to bring your vision to life. Here\'s a summary of what you shared with me:</p>';

  // Show their submitted info
  var rows = [
    { label: 'Style/theme', value: data.style },
    { label: 'Color palette', value: data.palette },
    { label: 'Earring type', value: data.earringType },
    { label: 'Occasion', value: data.occasion },
    { label: 'Budget range', value: data.budget },
    { label: 'Timeline', value: data.timeline },
    { label: 'Notes', value: data.references }
  ];
  html += '<table style="width:100%;border-collapse:collapse;margin:16px 0;border:1px solid #e7e5e4;border-radius:8px;overflow:hidden;">';
  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].value) continue;
    var bg = i % 2 === 0 ? '#fafaf9' : 'white';
    html += '<tr style="background:' + bg + ';">';
    html += '<td style="padding:10px 14px;font-size:11px;color:#78716c;width:140px;letter-spacing:0.05em;text-transform:uppercase;">' + escapeHtml(rows[i].label) + '</td>';
    html += '<td style="padding:10px 14px;font-size:13px;color:#1c1917;line-height:1.5;">' + escapeHtml(rows[i].value).replace(/\n/g, '<br>') + '</td>';
    html += '</tr>';
  }
  html += '</table>';

  html += '<p style="font-size:15px;color:#44403c;line-height:1.6;">I\'ll personally review this and get back to you within <strong>24-48 hours</strong> with a quote, timeline, and any questions I have. Each piece is one of a kind, and I\'ll work with you to make sure it\'s exactly what you\'re imagining.</p>';
  html += '<p style="font-size:15px;color:#44403c;line-height:1.6;">In the meantime, follow along on Instagram <a href="https://www.instagram.com/gloscreations31_6/" style="color:#1c1917;">@gloscreations31_6</a> for behind-the-scenes peeks at the process.</p>';
  html += '<p style="font-size:15px;color:#44403c;line-height:1.6;margin-top:24px;">With gratitude,<br><em style="font-family:Georgia,serif;font-size:18px;">Glo</em><br><span style="font-size:12px;color:#78716c;">Glo\'s Creations 3:16</span></p>';
  html += '<p style="font-size:11px;color:#a8a29e;margin-top:24px;border-top:1px solid #e7e5e4;padding-top:16px;">If you didn\'t submit this request, please ignore this email — no further action is needed.</p>';
  html += '</div>';
  return html;
}

// =================== Handler ===================
module.exports = async function handler(req, res) {
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

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (allowedOrigins.indexOf(origin) === -1) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  // Rate limit by IP
  var ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
  var limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: limit.reason === 'day'
        ? "You've reached the daily limit for custom order requests. Please email sales@gloscreations316.com directly, or try again tomorrow."
        : "You've submitted multiple requests recently. Please wait an hour, or email sales@gloscreations316.com directly."
    });
  }

  var body = req.body || {};

  // Honeypot check — bots tend to fill every field. We have a hidden "botName"
  // field that real customers never see. If it's filled in, silently reject.
  if (body.botName) {
    return res.status(200).json({ ok: true }); // Pretend success so bot doesn't retry
  }

  // Sanitize and validate input
  var data = {
    customerName: sanitize(body.customerName, 100),
    customerEmail: sanitize(body.customerEmail, 200),
    style: sanitize(body.style, 500),
    palette: sanitize(body.palette, 200),
    earringType: sanitize(body.earringType, 100),
    occasion: sanitize(body.occasion, 500),
    budget: sanitize(body.budget, 100),
    timeline: sanitize(body.timeline, 200),
    references: sanitize(body.references, 1500)
  };

  // Required fields
  if (!data.customerEmail || !isValidEmail(data.customerEmail)) {
    return res.status(400).json({ error: 'Invalid email', message: 'A valid email address is required.' });
  }
  if (!data.style || data.style.length < 3) {
    return res.status(400).json({ error: 'Missing style', message: 'Please describe what style you\'d like.' });
  }

  // Send via Resend
  var resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error('[Custom Order] RESEND_API_KEY not set');
    return res.status(500).json({
      error: 'Service unavailable',
      message: "I'm having trouble submitting your request right now. Please email sales@gloscreations316.com directly with your details."
    });
  }

  var GLO_EMAIL = 'sales@gloscreations316.com';
  var ADMIN_BCC = 'masseyjasonlee@gmail.com';
  // Sender uses the verified gloscreations316.com domain — Resend allows
  // sending to any recipient now that DNS is verified.
  var FROM_ADDRESS = 'Glo Bot <bot@gloscreations316.com>';

  try {
    // Send email #1: To Glo (with admin BCC), reply-to is the customer
    var subject = 'New Custom Order Request — ' + (data.customerName || data.customerEmail);
    var gloEmailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + resendKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [GLO_EMAIL],
        bcc: [ADMIN_BCC],
        reply_to: data.customerEmail,
        subject: subject,
        html: buildGloEmailHtml(data)
      })
    });

    if (!gloEmailRes.ok) {
      var errText = await gloEmailRes.text();
      console.error('[Custom Order] Failed to send to Glo:', gloEmailRes.status, errText);
      return res.status(500).json({
        error: 'Send failed',
        message: "I couldn't submit your request automatically. Please email sales@gloscreations316.com directly with your details — I don't want you to lose what you've shared!"
      });
    }

    // Send email #2: Confirmation back to customer.
    // If this fails, don't fail the whole request — Glo's email already went through.
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + resendKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Glo\'s Creations <hello@gloscreations316.com>',
          to: [data.customerEmail],
          reply_to: GLO_EMAIL,
          subject: 'Thanks for your custom order request! ✨',
          html: buildCustomerConfirmHtml(data)
        })
      });
    } catch (confirmErr) {
      console.warn('[Custom Order] Confirmation to customer failed (non-fatal):', confirmErr);
    }

    console.log('[Custom Order] Request submitted by', data.customerEmail);
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('[Custom Order] Error:', err);
    return res.status(500).json({
      error: 'Server error',
      message: "Something went wrong. Please email sales@gloscreations316.com directly so we don't lose your details."
    });
  }
};
