/**
 * server.js
 * ----------
 * Minimal Express backend that the storefront page talks to through a Shopify
 * App Proxy. One real endpoint:
 *
 *   POST /apps/creators/order
 *
 * It verifies the request actually came through Shopify, upserts the customer,
 * creates the $0 gift draft order, completes it as paid, and returns the order
 * number to show the creator.
 *
 * Run:  npm install && npm start
 */

const express = require('express');
const crypto = require('crypto');
const {
  upsertCreatorCustomer,
  createGiftDraftOrder,
  completeDraftOrder,
} = require('./shopify');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const APP_SECRET = process.env.SHOPIFY_API_SECRET; // app's API secret (for proxy HMAC)
const MAX_ITEMS = parseInt(process.env.MAX_ITEMS || '5', 10);

/**
 * App Proxy requests are signed by Shopify. We recompute the HMAC over the
 * sorted query params and compare. This proves the request came from Shopify
 * (i.e. from our storefront) and not from a random caller.
 * Docs: Online Store -> App proxies -> "Calculate a digital signature".
 */
function verifyAppProxySignature(query) {
  if (!APP_SECRET) return true; // allow local dev if no secret configured
  const { signature, ...rest } = query;
  if (!signature) return false;

  const message = Object.keys(rest)
    .sort()
    .map((key) => {
      const value = Array.isArray(rest[key]) ? rest[key].join(',') : rest[key];
      return `${key}=${value}`;
    })
    .join('');

  const digest = crypto
    .createHmac('sha256', APP_SECRET)
    .update(message)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Basic shape/sanity validation of the submitted form. */
function validatePayload(body) {
  const errors = [];
  const { customer = {}, shipping = {}, items = [], agreementAccepted } = body;

  if (!customer.firstName) errors.push('First name is required.');
  if (!customer.lastName) errors.push('Last name is required.');
  if (!customer.email || !/.+@.+\..+/.test(customer.email)) errors.push('A valid email is required.');

  if (!shipping.address1) errors.push('Shipping address is required.');
  if (!shipping.city) errors.push('City is required.');
  if (!shipping.country) errors.push('Country is required.');
  if (!shipping.zip) errors.push('ZIP / postal code is required.');

  if (!Array.isArray(items) || items.length < 1) errors.push('Select at least one product.');
  if (Array.isArray(items) && items.length > MAX_ITEMS) errors.push(`You can pick at most ${MAX_ITEMS} products.`);
  if (Array.isArray(items) && items.some((i) => !i.variantId)) errors.push('One of the selected products is missing a variant.');

  if (!agreementAccepted) errors.push('You must accept the influencer agreement.');

  return errors;
}

app.post('/apps/creators/order', async (req, res) => {
  try {
    if (!verifyAppProxySignature(req.query)) {
      return res.status(401).json({ ok: false, error: 'Invalid signature.' });
    }

    const errors = validatePayload(req.body);
    if (errors.length) {
      return res.status(400).json({ ok: false, error: errors.join(' ') });
    }

    const { customer, shipping, social = {}, items, agreementAccepted } = req.body;

    // Reuse the customer name for the shipping name if not provided separately.
    const ship = {
      firstName: shipping.firstName || customer.firstName,
      lastName: shipping.lastName || customer.lastName,
      ...shipping,
    };

    // 1. Customer (account) with socials + agreement saved as metafields.
    const customerId = await upsertCreatorCustomer({
      customer,
      social,
      agreementAccepted,
    });

    // 2. Draft order with every line overwritten to $0.
    const draftOrderId = await createGiftDraftOrder({
      customerId,
      email: customer.email,
      shipping: ship,
      items: items.slice(0, MAX_ITEMS),
      social,
      agreementAccepted,
    });

    // 3. Complete as a paid $0 order -> standard fulfillment.
    const order = await completeDraftOrder(draftOrderId);

    return res.json({ ok: true, orderName: order.name });
  } catch (err) {
    console.error('[creators/order] failed:', err);
    return res.status(500).json({
      ok: false,
      error: 'Something went wrong creating your order. Please try again.',
    });
  }
});

// Simple health check.
app.get('/apps/creators/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Creators partnership backend listening on :${PORT}`);
});
