    /* ================================================================
       checkoutForm IIFE — validation, draft, idempotency, submit
       ================================================================ */
    (function () {
      'use strict';

      // crypto.randomUUID is universally available since 2022; no Math.random fallback (slice bug produced malformed UUIDs).
      var SUBMIT_TOKEN_KEY = 'bp-submit-token';

      function ensureSubmitToken() {
        var existing = null;
        try { existing = sessionStorage.getItem(SUBMIT_TOKEN_KEY); } catch (ex) {}
        if (existing) { window.__bpIdempotencyToken = existing; return; }
        var fresh = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
          ? crypto.randomUUID()
          : null;
        if (!fresh) throw new Error('crypto.randomUUID unavailable; checkout cannot run safely');
        try { sessionStorage.setItem(SUBMIT_TOKEN_KEY, fresh); } catch (ex) {}
        window.__bpIdempotencyToken = fresh;
      }

      // After any order lands (fresh insert OR silent dedup redirect), invalidate the
      // submit token so the NEXT submit generates a fresh UUID. Without this, every
      // submit from the same tab would dedup-match the previous order's row and bounce
      // the user back to that old order id — silently swallowing the new attempt.
      function rotateSubmitToken() {
        var fresh = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
          ? crypto.randomUUID()
          : null;
        if (!fresh) return;
        try { sessionStorage.setItem(SUBMIT_TOKEN_KEY, fresh); } catch (ex) {}
        window.__bpIdempotencyToken = fresh;
      }

      try {
        ensureSubmitToken();
      } catch (tokenErr) {
        // M-C: surface a user-readable error instead of leaving the form silently dead.
        // crypto.randomUUID has been universal since mid-2022; if it's missing, the
        // browser is too old to safely place an order. Do NOT touch the `submitting`
        // flag — it hasn't been set yet (we're still on page mount).
        var initErrEl = document.getElementById('checkout-form-errors');
        if (initErrEl) {
          initErrEl.textContent = 'This browser cannot complete checkout. Please use a recent version of Chrome, Firefox, Safari, or Edge.';
          initErrEl.hidden = false;
        }
        var initSubmitBtn = document.getElementById('checkout-submit');
        if (initSubmitBtn) initSubmitBtn.disabled = true;
      }

      var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      var PHONE_RE = /^[+0-9\s\-()]{6,}$/;
      var MAX_NAME_LEN = 100;
      var CART_KEY = 'bp-cart-v1';
      var DRAFT_KEY = 'bp-checkout-draft';
      var SUCCESS_KEY = 'bp-checkout-success';
      var supabase = null;
      var submitting = false;

      /* --- readCart: handles both legacy array shape and versioned object shape ---
         Legacy: [{ id, qty, name, priceCents }, ...]
         Versioned (menu.html cart module): { v: 1, lines: { id: { qty, name, priceCents } } }
         Returns an array of { id, qty, name, priceCents } or null if empty/invalid. */
      function readCart() {
        var raw = null;
        try { raw = localStorage.getItem(CART_KEY); } catch (ex) { return null; }
        if (!raw) return null;
        var parsed = null;
        try { parsed = JSON.parse(raw); } catch (ex) { return null; }
        if (Array.isArray(parsed)) return parsed.length ? parsed : null;
        if (parsed && parsed.lines && typeof parsed.lines === 'object') {
          var ids = Object.keys(parsed.lines);
          if (!ids.length) return null;
          return ids.map(function (id) { return Object.assign({ id: id }, parsed.lines[id]); });
        }
        return null;
      }

      /* --- formatPrice (DUPLICATED from menu.html) --- */
      var _fmt = (typeof Intl !== 'undefined' && Intl.NumberFormat)
        ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }) : null;
      function formatPrice(cents) {
        var n = Number(cents) | 0;
        if (_fmt) return _fmt.format(n / 100);
        var s = n < 0 ? '-' : ''; var a = Math.abs(n);
        return s + '$' + Math.floor(a / 100) + '.' + String(a % 100).padStart(2, '0');
      }

      /* --- Validation --- */
      function validate(field) {
        var val = (field.value || '').trim();
        if (field.name === 'customer_name') {
          if (!val) return 'Name is required';
          if (val.length > MAX_NAME_LEN) return 'Name must be 100 characters or fewer';
          return null;
        }
        if (field.name === 'customer_email') {
          if (!val) return 'Email is required';
          if (!EMAIL_RE.test(val)) return 'Enter a valid email address';
          return null;
        }
        if (field.name === 'customer_phone') {
          if (!val) return 'Phone is required';
          if (!PHONE_RE.test(val)) return 'Enter a valid phone number';
          return null;
        }
        if (field.name === 'pickup_time') {
          var ful = document.querySelector('input[name="fulfillment"]:checked');
          if (ful && ful.value === 'pickup') {
            if (!val) return 'Pickup time is required';
            var d = new Date(val);
            if (isNaN(d.getTime())) return 'Pickup time is required';
            if (d <= new Date()) return 'Pickup time must be in the future';
          }
          return null;
        }
        return null;
      }

      function setFieldError(field, msg) {
        var errEl = document.getElementById(field.id + '_error');
        if (errEl) errEl.textContent = msg || '';
        field.classList.toggle('is-invalid', !!msg);
      }

      function attachBlurValidation() {
        document.querySelectorAll('#checkout-form input').forEach(function (f) {
          f.addEventListener('blur', function () {
            setFieldError(f, validate(f));
            persistDraft();
          });
        });
      }

      function updateButtonState() {
        if (submitting) return;
        var allValid = true;
        document.querySelectorAll('#checkout-form input[name]').forEach(function (f) {
          if (f.type === 'radio') return;
          if (validate(f)) allValid = false;
        });
        var ful = document.querySelector('input[name="fulfillment"]:checked');
        if (!ful) allValid = false;
        document.getElementById('checkout-submit').disabled = !allValid;
      }

      function attachSubmitGuard() {
        document.querySelectorAll('#checkout-form input').forEach(function (f) {
          f.addEventListener('change', updateButtonState);
          f.addEventListener('input', updateButtonState);
        });
        document.getElementById('checkout-form').addEventListener('submit', function (e) {
          e.preventDefault();
          if (submitting) return;
          var firstErr = null;
          document.querySelectorAll('#checkout-form input[name]').forEach(function (f) {
            if (f.type === 'radio') return;
            var err = validate(f);
            setFieldError(f, err);
            if (err && !firstErr) firstErr = f;
          });
          if (firstErr) { firstErr.focus(); return; }
          submitting = true;
          document.getElementById('checkout-submit').disabled = true;
          submitOrder({
            customer_name: document.getElementById('customer_name').value.trim(),
            customer_email: document.getElementById('customer_email').value.trim(),
            customer_phone: document.getElementById('customer_phone').value.trim(),
            fulfillment: document.querySelector('input[name="fulfillment"]:checked').value,
            pickup_time: document.getElementById('pickup_time').value || null
          });
        });
      }

      /* --- Draft persistence --- */
      function persistDraft() {
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({
            customer_name: document.getElementById('customer_name').value,
            customer_email: document.getElementById('customer_email').value,
            customer_phone: document.getElementById('customer_phone').value,
            fulfillment: (document.querySelector('input[name="fulfillment"]:checked') || {}).value || 'pickup',
            pickup_time: document.getElementById('pickup_time').value
          }));
        } catch (ex) {}
      }

      function hydrateDraft() {
        try {
          var d = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
          if (d.customer_name) document.getElementById('customer_name').value = d.customer_name;
          if (d.customer_email) document.getElementById('customer_email').value = d.customer_email;
          if (d.customer_phone) document.getElementById('customer_phone').value = d.customer_phone;
          if (d.fulfillment) { var r = document.querySelector('input[name="fulfillment"][value="'+d.fulfillment+'"]'); if (r) r.checked = true; }
          if (d.pickup_time) document.getElementById('pickup_time').value = d.pickup_time;
        } catch (ex) {}
      }

      /* --- Idempotency dedup (SECURITY DEFINER RPC, bypasses RLS) --- */
      /**
       * Look up an existing non-cancelled, non-archived order placed within
       * the last 24h that shares this tab's submit token.
       *
       * Implementation notes:
       *  - `.rpc(...)` calls the SECURITY DEFINER function `find_order_by_submit_token`,
       *    which runs as the function owner and bypasses RLS so anon can read the
       *    matching row. The function itself filters `created_at >= now() - 24h`,
       *    `status NOT IN ('cancelled')`, `archived_at IS NULL` server-side.
       *  - `.single()` unwraps the TABLE response to one object or null.
       *  - In PostgREST <12 (and some edge configurations), `.single()` returns
       *    `PGRST116` in `error` on a zero-row result instead of `data: null`.
       *    The `if (sel.error)` branch below intentionally swallows that — it
       *    means "no match", which is the expected happy path. We do NOT log it
       *    because it would generate noise on every fresh submit.
       *
       * @param {string} token UUID string from sessionStorage['bp-submit-token']
       * @returns {Promise<{data: {id:string,created_at:string}|null, error: object|null}>}
       */
      function findExistingOrderForToken(token) {
        return supabase.rpc('find_order_by_submit_token', { p_token: token }).single();
      }

      function silentRedirectToExisting(id) {
        rotateSubmitToken();
        try { sessionStorage.setItem(SUCCESS_KEY, id); } catch (ex) {}
        window.location.href = 'menu.html#order=' + id;
        // NOTE: do NOT clear cart or draft on duplicate (spec delta).
      }

      /* --- Submit + Supabase insert --- */
      function submitOrder(formData) {
        var cart = readCart();
        if (!cart) { redirectToMenu(); return; }

        var itemsPayload = cart.map(function (l) {
          var qty = Number(l.qty) || 1, price = Number(l.priceCents) || 0;
          return { catalog_id: String(l.id||''), name_snapshot: String(l.name||''), qty: qty,
            unit_price_cents: price, line_total_cents: qty * price };
        });
        var subtotal = itemsPayload.reduce(function (s, i) { return s + i.line_total_cents; }, 0);

        var orderPayload = {
          customer_name: formData.customer_name,
          customer_email: formData.customer_email,
          customer_phone: formData.customer_phone,
          fulfillment: formData.fulfillment,
          pickup_time: formData.fulfillment === 'pickup' ? formData.pickup_time : null,
          subtotal_cents: subtotal,
          total_cents: subtotal,
          submit_token: window.__bpIdempotencyToken
        };

        findExistingOrderForToken(window.__bpIdempotencyToken)
        .then(function (sel) {
          if (sel.error) {
            // RPC failed (network, transient, or PGRST116 no-match — see findExistingOrderForToken).
            // Fall through to INSERT — best-effort. Worst case: duplicate row, dedup'd on next
            // reload when the user retries within the 24h window.
            console.warn('[checkout] dedup RPC failed', sel.error);
          } else if (sel.data) {
            // Server-side filter already excluded cancelled + archived orders.
            // Any match is a live, active order — safe to silently redirect.
            silentRedirectToExisting(sel.data.id);
            return;
          }
          // Atomic insert via SECURITY DEFINER RPC. Bypasses RLS round-trip
          // (the previous .from('orders').insert().select().single() flow hit
          // 42501 because PostgREST runs a follow-up SELECT to return the row,
          // and admin_select_orders is authenticated-only). The RPC returns the
          // new order_id directly. Order + items land in a single transaction.
          return supabase.rpc('place_order', { p_order: orderPayload, p_items: itemsPayload })
            .then(function (res) {
              if (res.error) throw res.error;
              var orderId = res.data;
              rotateSubmitToken();
              try { localStorage.removeItem(CART_KEY); } catch (ex) {}
              try { localStorage.removeItem(DRAFT_KEY); } catch (ex) {}
              try { sessionStorage.setItem(SUCCESS_KEY, orderId); } catch (ex) {}
              window.location.href = 'menu.html#order=' + orderId;
            })
            .catch(function (err) {
              console.error('[checkout] submit failed:', err);
              var detail = (err && err.message) ? ' (' + err.message + ')' : '';
              var msg = 'We couldn\'t place your order' + detail + '. Please try again, or contact the restaurant if the problem persists.';
              var errEl = document.getElementById('checkout-form-errors');
              if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
              submitting = false;
              document.getElementById('checkout-submit').disabled = false;
            });
        });
      }

      /* --- Cart summary rendering --- */
      function renderCartSummary() {
        var cart = readCart();
        var linesEl = document.querySelector('[data-checkout-summary-lines]');
        var subtotalEl = document.querySelector('[data-checkout-subtotal]');
        var summaryEl = document.querySelector('[data-checkout-summary]');
        var emptyEl = document.querySelector('[data-checkout-empty]');
        var formEl = document.querySelector('[data-checkout-form]');
        if (!cart) {
          if (linesEl) linesEl.innerHTML = '';
          if (subtotalEl) subtotalEl.textContent = '$0.00';
          if (summaryEl) summaryEl.hidden = true;
          if (emptyEl) emptyEl.hidden = false;
          if (formEl) formEl.hidden = true;
          return;
        }
        if (emptyEl) emptyEl.hidden = true;
        if (summaryEl) summaryEl.hidden = false;
        if (formEl) formEl.hidden = false;
        var subtotal = 0, html = '';
        cart.forEach(function (l) {
          var qty = Number(l.qty)||1, price = Number(l.priceCents)||0, line = qty * price;
          subtotal += line;
          html += '<li class="checkout-summary__line">' +
            '<span class="checkout-summary__name">'+l.name+'</span>' +
            '<span class="checkout-summary__qty"> ×'+qty+'</span>' +
            '<span class="checkout-summary__price">'+formatPrice(price)+'</span></li>';
        });
        if (linesEl) linesEl.innerHTML = html;
        if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);
      }

      function redirectToMenu() { window.location.href = 'menu.html'; }

      /* --- Init --- */
      function initCheckout() {
        var cart = readCart();
        if (!cart) { redirectToMenu(); return; }

        // Initialize Supabase client. The SDK exposes window.supabase.createClient();
        // we assign the resulting client to the local `supabase` variable (not window.supabase,
        // which is the SDK global and must be preserved for createClient calls).
        if (window.supabase && typeof window.supabase.createClient === 'function' && window.__bpSupabase) {
          supabase = window.supabase.createClient(
            window.__bpSupabase.url,
            window.__bpSupabase.publishableKey,
            { auth: { persistSession: true, autoRefreshToken: true } }
          );
        }
        if (!supabase) {
          var initErrEl = document.getElementById('checkout-form-errors');
          if (initErrEl) {
            initErrEl.textContent = 'Checkout is unavailable: Supabase client failed to initialize. Check supabase-config.js.';
            initErrEl.hidden = false;
          }
          document.getElementById('checkout-submit').disabled = true;
          return;
        }

        attachBlurValidation();
        attachSubmitGuard();
        renderCartSummary();
        hydrateDraft();

        // Fulfillment radio → pickup-time visibility
        document.querySelectorAll('input[name="fulfillment"]').forEach(function (r) {
          r.addEventListener('change', function () {
            var wrap = document.getElementById('pickup_time_wrap');
            if (wrap) wrap.classList.toggle('is-visible', r.value === 'pickup');
          });
        });
        var checked = document.querySelector('input[name="fulfillment"]:checked');
        if (checked) {
          var wrap = document.getElementById('pickup_time_wrap');
          if (wrap) wrap.classList.toggle('is-visible', checked.value === 'pickup');
        }
      }

      window.addEventListener('storage', function (e) { if (e.key === CART_KEY) renderCartSummary(); });

      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCheckout);
      else initCheckout();
    })();

    /* ================================================================
       Slice 2 Manual Verification (customer checkout + cart bridge)
       PREREQUISITES:
         - Slice 1 is merged (PR #1 to main, commit 77b9e34)
         - Chef has manually pasted SQL migrations 001, 002, 003 into
           Supabase Studio SQL Editor (in numeric order)
         - supabase-config.js is filled with real .env values

       STEPS (run in a browser):
       1. Open menu.html — add 2 items to cart — click Checkout CTA →
          navigates to checkout.html with itemized summary visible.
       2. Submit with empty fields → inline "Name is required" etc. per field.
       3. Fill name "Juan", email "juan@test.com", phone "555-1234",
          pickup radio selected → pickup_time field appears.
       4. Set pickup_time to a future date/time. Submit → order placed.
       5. Redirected to menu.html, green confirmation banner visible with
          order id prefix (first 8 chars).
       6. Reload menu.html → banner is gone.
       7. Open checkout with empty cart → redirected to menu.html.
       8. Two-tab: tab A has checkout.html open with items; tab B add item to
          cart in menu.html → tab A summary re-renders (storage event).
       9. Submit with network offline → error toast shown, cart NOT cleared,
          draft pre-filled on retry.
      10. Double-click submit button → second request blocked while first
          is in-flight (submitting flag).
      ================================================================ */
