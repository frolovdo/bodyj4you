/**
 * shopify.js
 * -----------
 * Thin wrapper around the Shopify Admin GraphQL API plus the few mutations
 * this app needs:
 *
 *   1. upsertCreatorCustomer()  -> find-or-create the customer and store their
 *                                  social handles + agreement as metafields.
 *   2. createGiftDraftOrder()   -> create a draft order whose line items are
 *                                  100% discounted (price overwritten to $0).
 *   3. completeDraftOrder()     -> turn the draft into a real, already-PAID
 *                                  order so it goes out with normal fulfillment.
 *
 * No SDK is used on purpose - it is just `fetch` so the moving parts are easy
 * to read and change later.
 */

const SHOP = process.env.SHOPIFY_SHOP;                 // e.g. bodyj4you.myshopify.com
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;         // Admin API access token
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-01';

const ENDPOINT = `https://${SHOP}/admin/api/${API_VERSION}/graphql.json`;

/** Run a GraphQL query/mutation against the Admin API. */
async function adminGraphQL(query, variables = {}) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();

  // Top-level GraphQL errors (bad query, auth, throttling, ...)
  if (json.errors) {
    throw new Error('Shopify GraphQL error: ' + JSON.stringify(json.errors));
  }
  return json.data;
}

/** Turn a numeric variant id from the storefront into an Admin GID. */
function toVariantGID(id) {
  const clean = String(id).trim();
  return clean.startsWith('gid://')
    ? clean
    : `gid://shopify/ProductVariant/${clean}`;
}

/**
 * Build the metafield list we attach to the customer. Only handles that were
 * actually filled in are written, so we never overwrite an existing value with
 * an empty string.
 */
function buildCreatorMetafields(social, agreementAccepted) {
  const fields = [];
  const push = (key, value) => {
    if (value && String(value).trim()) {
      fields.push({
        namespace: 'creator',
        key,
        type: 'single_line_text_field',
        value: String(value).trim(),
      });
    }
  };

  push('instagram', social.instagram);
  push('tiktok', social.tiktok);
  push('youtube', social.youtube);
  push('other', social.other);

  // Agreement acceptance, stored as a real boolean + timestamp.
  fields.push({
    namespace: 'creator',
    key: 'agreement_accepted',
    type: 'boolean',
    value: agreementAccepted ? 'true' : 'false',
  });
  fields.push({
    namespace: 'creator',
    key: 'agreement_accepted_at',
    type: 'date_time',
    value: new Date().toISOString(),
  });

  return fields;
}

/**
 * Find a customer by email, or create one. Either way we (re)write the creator
 * metafields so the account always carries the latest social info + agreement.
 * Returns the customer GID.
 */
async function upsertCreatorCustomer({ customer, social, agreementAccepted }) {
  const metafields = buildCreatorMetafields(social, agreementAccepted);

  // 1. Look for an existing customer with this email.
  const found = await adminGraphQL(
    `query findCustomer($q: String!) {
      customers(first: 1, query: $q) { edges { node { id } } }
    }`,
    { q: `email:${customer.email}` }
  );

  const existing = found.customers.edges[0]?.node?.id;

  if (existing) {
    const updated = await adminGraphQL(
      `mutation updateCustomer($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }`,
      {
        input: {
          id: existing,
          // Make these accounts easy to find/segment later.
          tags: ['creator', 'creator-gift'],
          metafields,
        },
      }
    );
    throwOnUserErrors(updated.customerUpdate.userErrors);
    return existing;
  }

  // 2. No match -> create a brand new customer (a normal Shopify account).
  const created = await adminGraphQL(
    `mutation createCustomer($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone || null,
        tags: ['creator', 'creator-gift'],
        metafields,
      },
    }
  );
  throwOnUserErrors(created.customerCreate.userErrors);
  return created.customerCreate.customer.id;
}

/**
 * Create the draft order. Each line references a real catalog variant and gets
 * a 100% applied discount, which overwrites the price to $0 with no coupon.
 * Social info + agreement are mirrored onto the order so ops can see them.
 */
async function createGiftDraftOrder({ customerId, email, shipping, items, social, agreementAccepted }) {
  const lineItems = items.map((item) => ({
    variantId: toVariantGID(item.variantId),
    quantity: Math.max(1, parseInt(item.quantity, 10) || 1),
    appliedDiscount: {
      title: 'Creator Gift',
      description: 'Creator partnership - complimentary',
      valueType: 'PERCENTAGE',
      value: 100,
    },
  }));

  // Surface the creator's details directly on the order page.
  const customAttributes = [
    { key: 'Instagram', value: social.instagram || '-' },
    { key: 'TikTok', value: social.tiktok || '-' },
    { key: 'YouTube', value: social.youtube || '-' },
    { key: 'Other social', value: social.other || '-' },
    { key: 'Influencer agreement', value: agreementAccepted ? 'Accepted' : 'NOT accepted' },
  ];

  const shippingAddress = {
    address1: shipping.address1,
    address2: shipping.address2 || null,
    city: shipping.city,
    province: shipping.province || null,
    country: shipping.country,
    zip: shipping.zip,
    firstName: shipping.firstName,
    lastName: shipping.lastName,
    phone: shipping.phone || null,
  };

  const data = await adminGraphQL(
    `mutation createDraft($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        customerId,
        email,
        lineItems,
        shippingAddress,
        useCustomerDefaultAddress: false,
        tags: ['creator-gift'],
        note: 'Creator partnership gift order (price overwritten to $0).',
        customAttributes,
      },
    }
  );

  throwOnUserErrors(data.draftOrderCreate.userErrors);
  return data.draftOrderCreate.draftOrder.id;
}

/**
 * Complete the draft order as PAID (paymentPending: false). For a $0 total this
 * produces a normal, fully-paid order ready for standard fulfillment.
 * Returns the public order name (e.g. "#1023").
 */
async function completeDraftOrder(draftOrderId) {
  const data = await adminGraphQL(
    `mutation completeDraft($id: ID!) {
      draftOrderComplete(id: $id, paymentPending: false) {
        draftOrder {
          order { id name }
        }
        userErrors { field message }
      }
    }`,
    { id: draftOrderId }
  );

  throwOnUserErrors(data.draftOrderComplete.userErrors);
  return data.draftOrderComplete.draftOrder.order;
}

function throwOnUserErrors(userErrors) {
  if (userErrors && userErrors.length) {
    throw new Error('Shopify userErrors: ' + JSON.stringify(userErrors));
  }
}

module.exports = {
  upsertCreatorCustomer,
  createGiftDraftOrder,
  completeDraftOrder,
};
