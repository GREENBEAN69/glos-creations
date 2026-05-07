// /api/order-lookup.js
// Vercel Serverless Function — Order Status Lookup
//
// Uses Shopify OAuth 2.0 Client Credentials Grant (the modern replacement for
// legacy custom app `shpat_` tokens, which were deprecated Jan 2026).
//
// Flow:
//   1. Exchange CLIENT_ID + CLIENT_SECRET for a 24-hour access token
//   2. Cache that token in memory (Vercel function instance)
//   3. Auto-refresh when expiring
//   4. Use the token to query the Shopify Admin API
//
// Required Vercel env vars:
//   SHOPIFY_CLIENT_ID      — from Dev Dashboard
//   SHOPIFY_CLIENT_SECRET  — from Dev Dashboard (revealed from Settings page)
//   SHOPIFY_SHOP_DOMAIN    — optional, defaults to glos-creations-2.myshopify.com
//
// Security:
// - Both credentials stay server-side
// - Requires BOTH order number AND matching email (prevents random guessing)
// - Rate-limited per IP (5/hr) with 3-strike lockout for failed attempts
// - Returns minimal info (no addresses, no payment details)

// =================== Token Cache ===================
// Vercel keeps function instances "warm" between requests for ~5-15 minutes.
// During that time we reuse the token instead of refreshing on every call.
// Worst case: each cold start does one OAuth call (~100ms) before serving.
var tokenCache = {
  accessToken: null,
  expiresAt: 0   // unix ms timestamp
};

async function getShopifyAccessToken() {
  var now = Date.now();
  // Refresh 5 min before expiry to avoid race conditions
  if (tokenCache.accessToken && tokenCache.expiresAt > now + 5 * 60 * 1000) {
    return tokenCache.accessToken;
  }

  var clientId = process.env.SHOPIFY_CLIENT_ID;
  var clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  var shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || 'glos-creations-2.myshopify.com';

  if (!clientId || !clientSecret) {
    throw new Error('Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET in environment');
  }

  var tokenUrl = 'https://' + shopDomain + '/admin/oauth/access_token';
  var body = 'grant_type=client_credentials' +
    '&client_id=' + encodeURIComponent(clientId) +
    '&client_secret=' + encodeURIComponent(clientSecret);

  var response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: body
  });

  if (!response.ok) {
    var errBody = await response.text();
    console.error('[Order Lookup] OAuth token request failed:', response.status, errBody);
    throw new Error('OAuth token request failed: ' + response.status);
  }

  var data = await response.json();
  if (!data.access_token) {
    console.error('[Order Lookup] OAuth response missing access_token:', data);
    throw new Error('OAuth response missing access_token');
  }

  // Cache the token. Shopify returns expires_in in seconds (typically 86399).
  var expiresInMs = (data.expires_in || 86400) * 1000;
  tokenCache.accessToken = data.access_token;
  tokenCache.expiresAt = now + expiresInMs;
  console.log('[Order Lookup] Got new access token, expires in', Math.floor(expiresInMs / 60000), 'minutes');

  return data.access_token;
}

// =================== Rate Limiting ===================
var rateLimitStore = {};
var RATE_LIMIT_MAX = 5;
var RATE_LIMIT_WINDOW = 60 * 60 * 1000;

function checkRateLimit(ip) {
  var now = Date.now();
  var record = rateLimitStore[ip];
  if (!record || now - record.firstRequest > RATE_LIMIT_WINDOW) {
    rateLimitStore[ip] = { firstRequest: now, count: 1, failures: 0 };
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (record.count >= RATE_LIMIT_MAX) {
    return { allowed: false, resetIn: RATE_LIMIT_WINDOW - (now - record.firstRequest) };
  }
  record.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - record.count };
}

function recordFailure(ip) {
  var record = rateLimitStore[ip];
  if (record) {
    record.failures = (record.failures || 0) + 1;
    if (record.failures >= 3) {
      record.count = RATE_LIMIT_MAX; // lock out further attempts
    }
  }
}

// =================== Helpers ===================
function normalizeOrderNumber(num) {
  return String(num || '').replace(/[#\s]/g, '').trim();
}

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function formatDate(isoString) {
  if (!isoString) return null;
  try {
    var d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch(e) { return null; }
}

function buildOrderSummary(order) {
  var fulfillments = order.fulfillments || [];
  var lineItems = order.line_items || [];

  var status = 'Pending';
  var tracking = null;
  var carrier = null;
  var shipDate = null;

  if (fulfillments.length > 0) {
    var lastFulfillment = fulfillments[fulfillments.length - 1];
    if (lastFulfillment.tracking_number) {
      tracking = lastFulfillment.tracking_number;
      carrier = lastFulfillment.tracking_company || 'USPS';
    }
    if (lastFulfillment.shipment_status === 'delivered') {
      status = 'Delivered';
    } else if (lastFulfillment.shipment_status === 'in_transit' || lastFulfillment.shipment_status === 'out_for_delivery') {
      status = 'In Transit';
    } else if (lastFulfillment.status === 'success') {
      status = 'Shipped';
    }
    shipDate = formatDate(lastFulfillment.created_at);
  } else {
    if (order.financial_status === 'paid') {
      status = 'Paid — Preparing for Shipment';
    } else if (order.financial_status === 'pending') {
      status = 'Payment Pending';
    } else if (order.cancelled_at) {
      status = 'Cancelled';
    }
  }

  // Build tracking URL based on carrier
  var trackingUrl = null;
  if (tracking) {
    var carrierLower = (carrier || '').toLowerCase();
    if (carrierLower.indexOf('usps') !== -1) {
      trackingUrl = 'https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=' + encodeURIComponent(tracking);
    } else if (carrierLower.indexOf('ups') !== -1) {
      trackingUrl = 'https://www.ups.com/track?tracknum=' + encodeURIComponent(tracking);
    } else if (carrierLower.indexOf('fedex') !== -1) {
      trackingUrl = 'https://www.fedex.com/fedextrack/?trknbr=' + encodeURIComponent(tracking);
    } else {
      trackingUrl = 'https://www.google.com/search?q=' + encodeURIComponent(carrier + ' ' + tracking);
    }
  }

  return {
    orderNumber: order.order_number || order.name,
    status: status,
    placedDate: formatDate(order.created_at),
    shippedDate: shipDate,
    tracking: tracking,
    carrier: carrier,
    trackingUrl: trackingUrl,
    itemCount: lineItems.length,
    items: lineItems.map(function(li) { return li.title || li.name || 'Item'; }).slice(0, 5),
    cancelled: !!order.cancelled_at
  };
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

  var ip = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown').split(',')[0].trim();
  var limit = checkRateLimit(ip);
  if (!limit.allowed) {
    var minutes = Math.ceil(limit.resetIn / 60000);
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: 'Too many lookup attempts. Please wait ' + minutes + ' minutes, or email sales@gloscreations316.com.'
    });
  }

  var body = req.body || {};
  var orderNumber = normalizeOrderNumber(body.orderNumber);
  var email = normalizeEmail(body.email);

  if (!orderNumber || !email || orderNumber.length < 3 || email.length < 5 || email.indexOf('@') === -1) {
    return res.status(400).json({
      error: 'Invalid input',
      message: 'Please provide both your order number and the email address you used at checkout.'
    });
  }

  // Check that credentials are configured
  if (!process.env.SHOPIFY_CLIENT_ID || !process.env.SHOPIFY_CLIENT_SECRET) {
    console.error('[Order Lookup] Missing SHOPIFY_CLIENT_ID or SHOPIFY_CLIENT_SECRET');
    return res.status(500).json({
      error: 'Service unavailable',
      message: "Order lookup is temporarily unavailable. Please email sales@gloscreations316.com with your order number."
    });
  }

  try {
    // Step 1: Get a valid access token (cached or fresh)
    var accessToken = await getShopifyAccessToken();

    // Step 2: Query Shopify Admin API for the order
    var shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || 'glos-creations-2.myshopify.com';
    var searchUrl = 'https://' + shopDomain + '/admin/api/2024-10/orders.json' +
      '?name=' + encodeURIComponent('#' + orderNumber) +
      '&status=any&limit=5';

    var response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    });

    // If the token was rejected (e.g. revoked since cached), clear cache and retry once
    if (response.status === 401) {
      console.log('[Order Lookup] Token rejected, clearing cache and retrying once');
      tokenCache.accessToken = null;
      tokenCache.expiresAt = 0;
      accessToken = await getShopifyAccessToken();
      response = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json'
        }
      });
    }

    if (!response.ok) {
      var errText = await response.text();
      console.error('[Order Lookup] Shopify API error:', response.status, errText);
      return res.status(500).json({
        error: 'Lookup failed',
        message: "I couldn't reach our order system right now. Please email sales@gloscreations316.com."
      });
    }

    var data = await response.json();
    var orders = data.orders || [];

    // Step 3: Find an order matching BOTH the order number AND the email
    var matchedOrder = null;
    for (var i = 0; i < orders.length; i++) {
      var ord = orders[i];
      var ordEmail = normalizeEmail(ord.email);
      var ordContactEmail = normalizeEmail(ord.contact_email);
      if (ordEmail === email || ordContactEmail === email) {
        matchedOrder = ord;
        break;
      }
    }

    if (!matchedOrder) {
      recordFailure(ip);
      return res.status(404).json({
        error: 'Not found',
        message: "I couldn't find an order matching that combination. Please double-check your order number (it's in your confirmation email) and the email address you used at checkout. If you keep having trouble, email sales@gloscreations316.com."
      });
    }

    var summary = buildOrderSummary(matchedOrder);
    return res.status(200).json({ order: summary });

  } catch (err) {
    console.error('[Order Lookup] Error:', err);
    return res.status(500).json({
      error: 'Server error',
      message: "Something went wrong. Please email sales@gloscreations316.com with your order number."
    });
  }
};
