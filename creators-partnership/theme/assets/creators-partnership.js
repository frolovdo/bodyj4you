/**
 * creators-partnership.js
 * -----------------------
 * Front-end behaviour for the creators page:
 *   - select / deselect products (respecting the max)
 *   - keep a running "cart" (always $0)
 *   - open the form, validate, and submit it to the App Proxy endpoint
 *   - show the resulting order number
 *
 * Plain vanilla JS, no build step, no dependencies.
 */
(function () {
  const root = document.querySelector('[data-creators]');
  if (!root) return;

  const PROXY_URL = root.dataset.proxyUrl;
  const MAX_ITEMS = parseInt(root.dataset.maxItems, 10) || 5;
  const AGREEMENT_URL = root.dataset.agreementUrl;

  // productId -> { variantId, title }
  const selected = new Map();

  // ----- Elements -----
  const bar = root.querySelector('[data-summary-bar]');
  const countEl = root.querySelector('[data-summary-count]');
  const openBtn = root.querySelector('[data-open-form]');
  const modal = root.querySelector('[data-form-modal]');
  const closeBtn = root.querySelector('[data-close-form]');
  const form = root.querySelector('[data-creator-form]');
  const formItems = root.querySelector('[data-form-items]');
  const errorEl = root.querySelector('[data-form-error]');
  const successEl = root.querySelector('[data-success]');
  const orderNameEl = root.querySelector('[data-order-name]');
  const agreementLink = root.querySelector('[data-agreement-link]');

  if (AGREEMENT_URL && agreementLink) agreementLink.href = AGREEMENT_URL;

  // ----- Selection -----
  root.querySelectorAll('.creators-card').forEach((card) => {
    const toggle = card.querySelector('[data-toggle-item]');
    const variantSelect = card.querySelector('[data-variant-select]');
    const productId = card.dataset.productId;
    if (!toggle || !variantSelect) return;

    toggle.addEventListener('click', () => {
      if (selected.has(productId)) {
        selected.delete(productId);
        card.classList.remove('is-selected');
        toggle.textContent = 'Add';
      } else {
        if (selected.size >= MAX_ITEMS) {
          alert('You can pick at most ' + MAX_ITEMS + ' products.');
          return;
        }
        selected.set(productId, {
          variantId: variantSelect.value,
          title: toggle.dataset.productTitle,
        });
        card.classList.add('is-selected');
        toggle.textContent = 'Remove';
      }
      refreshBar();
    });

    // Keep the stored variant in sync if the shopper changes the option.
    variantSelect.addEventListener('change', () => {
      if (selected.has(productId)) {
        selected.get(productId).variantId = variantSelect.value;
      }
    });
  });

  function refreshBar() {
    const n = selected.size;
    countEl.textContent = n;
    bar.hidden = n === 0;
    openBtn.disabled = n === 0;
  }

  // ----- Modal open / close -----
  openBtn.addEventListener('click', () => {
    formItems.innerHTML = '';
    selected.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item.title;
      formItems.appendChild(li);
    });
    successEl.hidden = true;
    form.hidden = false;
    modal.hidden = false;
  });

  closeBtn.addEventListener('click', () => { modal.hidden = true; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.hidden = true; });

  // ----- Submit -----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const submitBtn = form.querySelector('[data-submit-form]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';

    const fd = new FormData(form);
    const payload = {
      customer: {
        firstName: fd.get('firstName'),
        lastName: fd.get('lastName'),
        email: fd.get('email'),
        phone: fd.get('phone'),
      },
      shipping: {
        firstName: fd.get('firstName'),
        lastName: fd.get('lastName'),
        address1: fd.get('address1'),
        address2: fd.get('address2'),
        city: fd.get('city'),
        province: fd.get('province'),
        zip: fd.get('zip'),
        country: fd.get('country'),
        phone: fd.get('phone'),
      },
      social: {
        instagram: fd.get('instagram'),
        tiktok: fd.get('tiktok'),
        youtube: fd.get('youtube'),
        other: fd.get('other'),
      },
      agreementAccepted: fd.get('agreementAccepted') === 'on',
      items: Array.from(selected.values()).map((i) => ({
        variantId: i.variantId,
        quantity: 1,
      })),
    };

    try {
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Could not create the order.');
      }

      orderNameEl.textContent = data.orderName || '';
      form.hidden = true;
      successEl.hidden = false;
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create an order';
    }
  });
})();
