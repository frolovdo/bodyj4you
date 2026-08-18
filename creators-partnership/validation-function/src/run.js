// @ts-check

/**
 * Cart & Checkout Validation function — protects the free "creator gift" products.
 *
 * The storefront page only validates in the browser, which a direct visitor can
 * bypass (open the product URL, add any quantity, check out free). This runs
 * server-side on EVERY checkout and hard-enforces, for any cart containing a
 * creator-gift product:
 *   - it must be the ONLY item in the cart,
 *   - quantity exactly 1,
 *   - a valid social handle + accepted agreement must be present (cart attributes
 *     set by the Creator Partnership page).
 *
 * Carts with no creator-gift product are ignored, so normal shopping is unaffected.
 *
 * NOTE: cart attributes are technically client-settable, so the social/agreement
 * checks are a strong deterrent rather than cryptographic proof. The quantity = 1,
 * single-item, and "gift-only cart" rules ARE hard guarantees — combined with the
 * Flow fulfillment hold (manual operator approval), abuse is fully contained.
 */

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  /** @type {{localizedMessage: string, target: string}[]} */
  const errors = [];
  const lines = (input.cart && input.cart.lines) || [];

  const isGiftLine = (line) => {
    const m = line.merchandise;
    return (
      m &&
      m.__typename === "ProductVariant" &&
      m.product &&
      m.product.creatorGift &&
      m.product.creatorGift.value === "true"
    );
  };

  const giftLines = lines.filter(isGiftLine);

  // Not a creator-gift cart — don't interfere with normal orders.
  if (giftLines.length === 0) {
    return { errors: [] };
  }

  const giftQty = giftLines.reduce((sum, l) => sum + l.quantity, 0);

  // One free gift, quantity 1.
  if (giftLines.length > 1 || giftQty > 1) {
    errors.push({
      localizedMessage: "Only one free creator gift is allowed per order.",
      target: "$.cart",
    });
  }

  // A gift cart must contain ONLY the single free item.
  if (lines.length > giftLines.length) {
    errors.push({
      localizedMessage: "A creator gift order can only contain the one free item.",
      target: "$.cart",
    });
  }

  // Required info captured by the Creator Partnership page.
  const val = (a) => (a && a.value ? String(a.value).trim() : "");
  const handle = (v) => !!v && /[a-zA-Z]/.test(v) && v.replace(/^@+/, "").length >= 2;
  const hasSocial =
    handle(val(input.cart.instagram)) ||
    handle(val(input.cart.tiktok)) ||
    handle(val(input.cart.youtube));

  if (!hasSocial) {
    errors.push({
      localizedMessage:
        "Please claim your gift on the Creator Partnership page — a valid Instagram, TikTok, or YouTube is required.",
      target: "$.cart",
    });
  }

  if (val(input.cart.agreement).toLowerCase() !== "accepted") {
    errors.push({
      localizedMessage:
        "The influencer agreement must be accepted. Please claim your gift on the Creator Partnership page.",
      target: "$.cart",
    });
  }

  return { errors };
}
