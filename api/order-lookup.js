// /api/order-lookup.js
// Vercel Serverless Function — Order Status Lookup
//
// Looks up a Shopify order by order number + email.
// Returns status, tracking, and basic order info.
//
// Security:
// - SHOPIFY_ADMIN_TOKEN stays secret on the server
// - Requires BOTH order number AND matching email (prevents random guessing)
// - Rate-limited per IP
// - Returns minimal info (no address, no payment details)
// - CORS restricted to your domains

var rateLimitStore = {};
var RATE_LIMIT_MAX = 5;             // max lookups per IP per hour (lower than chat — sensitive data)
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
    // After 3 failed attempts, treat as exhausted to prevent guessing
    if (record.failures >= 3) {
      record.count = RATE_LIMIT_MAX;
    }
  }
}

// Normalize order number — strip "#", whitespace
function normalizeOrderNumber(num) {
  return String(num || '').replace(/[#\s]/g, '').trim();
}

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

// Format a date for human display
function formatDate(isoString) {
  if (!isoString) return null;
  try {
    var d = new Date(isoString);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch(e) { return null; }
}

// Build a friendly summary of the order
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
      // Generic search
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

  var shopifyToken = process.env.SHOPIFY_ADMIN_TOKEN;
  var shopDomain = process.env.SHOPIFY_SHOP_DOMAIN || 'glos-creations-2.myshopify.com';
  if (!shopifyToken) {
    console.error('[Order Lookup] SHOPIFY_ADMIN_TOKEN not set');
    return res.status(500).json({
      error: 'Service unavailable',
      message: "Order lookup is temporarily unavailable. Please email sales@gloscreations316.com with your order number."
    });
  }

  try {
    // Shopify accepts order # with or without "#". Search by name (= order number with #)
    var searchUrl = 'https://' + shopDomain + '/admin/api/2024-10/orders.json' +
      '?name=' + encodeURIComponent('#' + orderNumber) +
      '&status=any&limit=5';

    var response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': shopifyToken,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('[Order Lookup] Shopify API error:', response.status);
      return res.status(500).json({
        error: 'Lookup failed',
        message: "I couldn't reach our order system right now. Please email sales@gloscreations316.com."
      });
    }

    var data = await response.json();
    var orders = data.orders || [];

    // Find an order matching BOTH the order number AND the email
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
