    /* ---------- Footer year ---------- */
    document.querySelectorAll('[data-year]').forEach(el => {
      el.textContent = new Date().getFullYear();
    });

    /* ---------- Category nav active state on scroll ---------- */
    (function () {
      const navLinks = Array.from(document.querySelectorAll('[data-cat]'));
      const sections = navLinks
        .map(link => document.getElementById(link.dataset.cat))
        .filter(Boolean);

      if (!sections.length) return;

      // Highlight the section closest to the top of the viewport
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const id = entry.target.id;
              navLinks.forEach(link =>
                link.classList.toggle('is-active', link.dataset.cat === id)
              );
            }
          });
        },
        { rootMargin: '-200px 0px -60% 0px', threshold: 0 }
      );

      sections.forEach(s => observer.observe(s));

      // Auto-scroll the active pill into view in the horizontal nav
      navLinks.forEach((link) => {
        link.addEventListener('click', () => {
          navLinks.forEach(l => l.classList.remove('is-active'));
          link.classList.add('is-active');
          link.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });
      });
    })();

    /* === Slice 1 Manual Verification ===
    1. Open menu.html — topbar shows cart icon (left of "← Back to Home"), no drawer visible.
    2. Click cart icon — drawer slides in from right; focus is inside drawer.
    3. Press Tab — focus cycles only inside drawer panel.
    4. Press Shift+Tab from first element — focus wraps to last element inside drawer.
    5. Press ESC — drawer closes; focus returns to cart icon; page scrollY unchanged.
    6. Click backdrop — drawer closes; focus returns to cart icon.
    7. Click × button — drawer closes; focus returns to cart icon.
    8. Badge count shows 0 and is hidden via CSS.
    */

    /* ---------- Cart drawer module (slice 1) ---------- */
    var cartDrawer = (function () {
      var isOpen = false;
      var previouslyFocused = null;
      var el = document.querySelector('[data-cart-drawer]');
      var panel = el && el.querySelector('.cart-drawer__panel');

      var FOCUSABLE_SELECTOR = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ].join(',');

      function queryFocusables() {
        if (!panel) return [];
        return Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
          .filter(function (node) { return !node.hasAttribute('disabled') && node.offsetParent !== null; });
      }

      function focusFirst() {
        var focusables = queryFocusables();
        if (focusables.length) {
          focusables[0].focus();
          return;
        }
        panel.tabIndex = -1;
        panel.focus();
      }

      var savedScrollY = 0;
      function applyScrollLock() {
        savedScrollY = window.scrollY;
        document.body.style.overflow = 'hidden';
      }
      function restoreScroll() {
        document.body.style.overflow = '';
        window.scrollTo(0, savedScrollY);
      }

      var keydownHandler = null;
      function onKeydown(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
          return;
        }
        if (e.key !== 'Tab') return;
        var focusables = queryFocusables();
        if (!focusables.length) {
          e.preventDefault();
          panel.focus();
          return;
        }
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        var active = document.activeElement;
        if (e.shiftKey && (active === first || !panel.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }

      function bindKeydown() {
        keydownHandler = onKeydown;
        document.addEventListener('keydown', keydownHandler);
      }
      function unbindKeydown() {
        if (keydownHandler) {
          document.removeEventListener('keydown', keydownHandler);
          keydownHandler = null;
        }
      }

      function open() {
        if (isOpen) return;
        previouslyFocused = document.activeElement;
        el.setAttribute('aria-hidden', 'false');
        var t = document.querySelector('[data-cart-toggle]');
        if (t) t.setAttribute('aria-expanded', 'true');
        isOpen = true;
        document.body.classList.add('is-cart-open');
        applyScrollLock();
        focusFirst();
        bindKeydown();
      }

      function close() {
        if (!isOpen) return;
        el.setAttribute('aria-hidden', 'true');
        var t = document.querySelector('[data-cart-toggle]');
        if (t) t.setAttribute('aria-expanded', 'false');
        isOpen = false;
        document.body.classList.remove('is-cart-open');
        restoreScroll();
        unbindKeydown();
        if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
      }

      function toggle() { isOpen ? close() : open(); }

      function mount() {
        var _this = this;
        document.querySelectorAll('[data-cart-toggle]').forEach(function (btn) {
          btn.addEventListener('click', _this.toggle);
        });
        document.querySelectorAll('[data-cart-close]').forEach(function (btn) {
          btn.addEventListener('click', close);
        });
      }

      return {
        open: open,
        close: close,
        toggle: toggle,
        isOpen: function () { return isOpen; },
        mount: mount
      };
    })();

    /* Wire cart drawer on DOMContentLoaded */
    document.addEventListener('DOMContentLoaded', function () {
      cartDrawer.mount();
    });

    /* ---------- Slice 2: cart module (money + catalog + storage + cart + app) ---------- */
    (function () {
      'use strict';

      /* --- money --- */
      var money = (function () {
        var formatter = (typeof Intl !== 'undefined' && Intl.NumberFormat)
          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
          : null;

        function formatPrice(cents) {
          var n = Number(cents) | 0;
          if (formatter) return formatter.format(n / 100);
          var sign = n < 0 ? '-' : '';
          var abs = Math.abs(n);
          return sign + '$' + Math.floor(abs / 100) + '.' + String(abs % 100).padStart(2, '0');
        }

        return { formatPrice: formatPrice };
      })();

      /* --- catalog --- */
      var catalog = (function () {
        var items = new Map();

        function parsePriceStrict(raw) {
          if (typeof raw !== 'string') return null;
          var cleaned = raw.replace(/[$,]/g, '').trim();
          if (!/^\d+$/.test(cleaned)) return null;
          var n = parseInt(cleaned, 10);
          return n > 0 && n < 1e6 ? n : null;
        }

        function reindex() {
          var next = new Map();
          document.querySelectorAll('.menu-grid .item').forEach(function (card) {
            var id = card.getAttribute('data-id');
            var name = card.getAttribute('data-name');
            var priceRaw = card.getAttribute('data-price');
            var category = card.getAttribute('data-category');
            var cal = card.getAttribute('data-cal');
            var img = card.getAttribute('data-img');
            if (!id) {
              console.warn('catalog: skipping card — missing data-id', card.textContent.slice(0, 80));
              return;
            }
            if (next.has(id)) {
              console.warn('catalog: duplicate data-id "' + id + '", keeping first');
              return;
            }
            var priceCents = parsePriceStrict(priceRaw);
            if (priceCents === null) {
              console.warn('catalog: skipping "' + id + '" — malformed data-price', priceRaw);
              return;
            }
            next.set(id, Object.freeze({ id: id, name: name || '', priceCents: priceCents, category: category || '', cal: cal || '', img: img || '' }));
          });
          items = next;
        }

        function get(id) { return items.get(id) || null; }
        function has(id) { return items.has(id); }
        function size() { return items.size; }

        return { reindex: reindex, get: get, has: has, size: size };
      })();

      /* --- storage --- */
      var storage = (function () {
        var STORAGE_KEY = 'bp-cart-v1';
        var SCHEMA_VERSION = 1;
        var available = false;
        var onChange = null;

        function detect() {
          try {
            localStorage.setItem('__bp_probe__', '1');
            localStorage.removeItem('__bp_probe__');
            available = true;
          } catch (e) { available = false; }
          return available;
        }

        function validate(state) {
          if (!state || state.v !== SCHEMA_VERSION) return false;
          if (!state.lines || typeof state.lines !== 'object') return false;
          var keys = Object.keys(state.lines);
          for (var i = 0; i < keys.length; i++) {
            var line = state.lines[keys[i]];
            if (!line || typeof line.qty !== 'number' || line.qty <= 0) return false;
          }
          return true;
        }

        function migrate(cart) {
          if (!cart || typeof cart !== 'object') return cart;
          if (cart.v === SCHEMA_VERSION) return cart;
          return cart;
        }

        function read() {
          if (!available) return null;
          try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            var parsed = JSON.parse(raw);
            var migrated = migrate(parsed);
            if (!validate(migrated)) {
              console.warn('bp-cart-v1: malformed payload, resetting');
              return null;
            }
            return migrated;
          } catch (e) {
            console.warn('bp-cart-v1: parse error, resetting');
            return null;
          }
        }

        function write(state) {
          if (!available) return;
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* swallow */ }
        }

        function attachChangeListener(fn) {
          onChange = fn;
          window.addEventListener('storage', function (e) {
            if (e.key === STORAGE_KEY && typeof onChange === 'function') onChange();
          });
        }

        return {
          detect: detect,
          read: read,
          write: write,
          attachChangeListener: attachChangeListener,
          get available() { return available; },
          get STORAGE_KEY() { return STORAGE_KEY; }
        };
      })();

      /* --- cart --- */
      var cart = (function () {
        var lines = {};
        var updatedAt = 0;
        var subscribers = [];

        function persist() {
          updatedAt = Date.now();
          // Include catalog fields so checkout.html can render without re-loading the catalog
          var stored = {};
          Object.keys(lines).forEach(function (id) {
            var item = catalog.get(id);
            if (item) stored[id] = { qty: lines[id].qty, name: item.name, priceCents: item.priceCents };
          });
          storage.write({ v: 1, lines: stored, updatedAt: updatedAt });
          notify();
        }

        function notify() {
          for (var i = 0; i < subscribers.length; i++) {
            subscribers[i]({ lines: lines, subtotalCents: subtotalCents() });
          }
        }

        function subtotalCents() {
          var entries = Object.entries(lines);
          var sum = 0;
          for (var i = 0; i < entries.length; i++) {
            var item = catalog.get(entries[i][0]);
            if (item) sum += item.priceCents * entries[i][1].qty;
          }
          return sum;
        }

        function addItem(id) {
          if (!catalog.has(id)) { console.warn('cart.addItem: unknown id', id); return; }
          if (!lines[id]) lines[id] = { qty: 0 };
          lines[id].qty += 1;
          persist();
        }

        function inc(id) {
          if (!lines[id]) return;
          lines[id].qty += 1;
          persist();
        }

        function dec(id) {
          if (!lines[id]) return;
          if (lines[id].qty <= 1) { remove(id); return; }
          lines[id].qty -= 1;
          persist();
        }

        function remove(id) {
          delete lines[id];
          persist();
        }

        function clear() {
          lines = {};
          persist();
        }

        function hydrate() {
          var saved = storage.read();
          if (saved && saved.lines) {
            lines = saved.lines;
            updatedAt = saved.updatedAt || 0;
          } else {
            lines = {};
          }
          notify();
        }

        function linesArray() {
          var result = [];
          var entryList = Object.entries(lines);
          for (var i = 0; i < entryList.length; i++) {
            var item = catalog.get(entryList[i][0]);
            if (item) {
              result.push(Object.freeze({ id: entryList[i][0], qty: entryList[i][1].qty, item: item }));
            }
          }
          return result;
        }

        function count() {
          var vals = Object.values(lines);
          var s = 0;
          for (var i = 0; i < vals.length; i++) s += vals[i].qty;
          return s;
        }

        function subscribe(fn) { subscribers.push(fn); }

        return { addItem: addItem, inc: inc, dec: dec, remove: remove, clear: clear, hydrate: hydrate, subtotalCents: subtotalCents, lines: linesArray, count: count, subscribe: subscribe };
      })();

      /* --- app --- */
      function updateBadge() {
        var c = cart.count();
        var badge = document.querySelector('[data-cart-count]');
        if (!badge) return;
        badge.textContent = c;
        badge.style.display = c > 0 ? '' : 'none';
      }

      function renderDrawer() {
        var list = document.querySelector('[data-cart-list]');
        var empty = document.querySelector('[data-cart-empty]');
        var foot = document.querySelector('[data-cart-foot]');
        var subtotalEl = document.querySelector('[data-cart-subtotal]');
        if (!list) return;
        var linesArr = cart.lines();
        if (linesArr.length === 0) {
          list.hidden = true;
          if (foot) foot.hidden = true;
          if (empty) empty.hidden = false;
          return;
        }
        if (empty) empty.hidden = true;
        list.hidden = false;
        if (foot) foot.hidden = false;
        list.innerHTML = linesArr.map(function (line) {
          var id = line.id;
          var qty = line.qty;
          var item = line.item;
          var lineTotal = item.priceCents * qty;
          var esc = function (s) {
            return String(s).replace(/[&<">]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); });
          };
          return '<li class="cart-drawer__line">' +
            '<img src="' + esc(item.img) + '" alt="" width="48" height="48" style="object-fit:cover;border-radius:6px;flex-shrink:0;">' +
            '<div style="flex:1;min-width:0;">' +
              '<div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(item.name) + '</div>' +
              '<div style="color:var(--color-ink-soft);font-size:0.875rem;">' + money.formatPrice(item.priceCents) + '</div>' +
            '</div>' +
            '<div class="cart-drawer__qty">' +
              '<button type="button" class="cart-drawer__qty-btn" data-cart-dec="' + esc(id) + '" aria-label="Decrease quantity of ' + esc(item.name) + '">−</button>' +
              '<span>' + qty + '</span>' +
              '<button type="button" class="cart-drawer__qty-btn" data-cart-inc="' + esc(id) + '" aria-label="Increase quantity of ' + esc(item.name) + '">+</button>' +
            '</div>' +
            '<div style="font-weight:600;min-width:60px;text-align:right;">' + money.formatPrice(lineTotal) + '</div>' +
            '<button type="button" class="cart-drawer__remove" data-cart-remove="' + esc(id) + '" aria-label="Remove ' + esc(item.name) + '">×</button>' +
          '</li>';
        }).join('');
        if (subtotalEl) subtotalEl.textContent = money.formatPrice(cart.subtotalCents());
      }

      function wireCartMutations() {
        var listEl = document.querySelector('[data-cart-list]');
        if (!listEl) return;
        listEl.addEventListener('click', function (e) {
          var decBtn = e.target.closest('[data-cart-dec]');
          if (decBtn) { cart.dec(decBtn.getAttribute('data-cart-dec')); return; }
          var incBtn = e.target.closest('[data-cart-inc]');
          if (incBtn) { cart.inc(incBtn.getAttribute('data-cart-inc')); return; }
          var rmBtn = e.target.closest('[data-cart-remove]');
          if (rmBtn) { cart.remove(rmBtn.getAttribute('data-cart-remove')); return; }
        });
      }

      function wireAddButtons() {
        document.querySelectorAll('.menu-grid').forEach(function (grid) {
          grid.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-add]');
            if (!btn) return;
            e.preventDefault();
            var id = btn.getAttribute('data-add');
            if (catalog.has(id)) {
              cart.addItem(id);
            } else {
              console.warn('app: unknown catalog id', id);
            }
          });
        });
      }

      function wireStorageSync() {
        storage.attachChangeListener(function () { cart.hydrate(); });
      }

      function init() {
        storage.detect();
        catalog.reindex();
        cart.hydrate();
        updateBadge();
        wireAddButtons();
        wireCartMutations();
        wireStorageSync();
      }

      cart.subscribe(function () { updateBadge(); renderDrawer(); });

      document.addEventListener('DOMContentLoaded', init);

      window.__bpCart = { catalog: catalog, cart: cart, money: money, storage: storage };

      /* === Slice 2 Manual Verification ===
      PREREQUISITE: Slice 1 is verified and present.

      1. Open DevTools console. Run: __bpCart.catalog.size() — expect 32.
      2. Run: __bpCart.catalog.get('burgers:classic') — expect { priceCents: 895 }.
      3. Click "Add" on The Classic card. Badge shows 1. Open drawer — line shows "The Classic", "$8.95", qty 1.
      4. Click "Add" on The Classic again. Badge shows 2. Line qty is 2, line subtotal "$17.90".
      5. Click + in drawer. Qty becomes 3, subtotal "$26.85".
      6. Click − in drawer once. Qty becomes 2, subtotal "$17.90".
      7. Click − again. Line disappears. Badge shows 0. Empty state shown.
      8. Add "Cheese Fries" (qty 1, $5.50) and "Kids' Burger" (qty 1, $6.95). Drawer subtotal = $12.45.
      9. Reload page. Badge shows 2. Cart content restored. Drawer subtotal still $12.45.
      10. Open second tab to same URL. Add item in tab 1. Tab 2 badge updates automatically (cross-tab sync).
      11. Press ESC with drawer open — closes. Focus returns to toggle.
      12. Click backdrop — closes. Focus returns to toggle.
      */
    })();

    /* ================================================================
       bpCheckoutBridge IIFE (slice 2)
       Wires Checkout CTA, shows one-shot confirmation banner on
       redirect from checkout.html, clears sessionStorage marker.
       ================================================================ */
    (function () {
      'use strict';

      var SUCCESS_KEY = 'bp-checkout-success';

      function showBanner(orderId) {
        var banner = document.querySelector('[data-order-confirmation-banner]');
        var idEl = document.querySelector('[data-order-confirmation-id]');
        if (!banner || !idEl) return;
        idEl.textContent = String(orderId).slice(0, 8);
        banner.hidden = false;
        sessionStorage.removeItem(SUCCESS_KEY);
      }

      function wireDismiss() {
        var btn = document.querySelector('[data-order-confirmation-dismiss]');
        if (!btn) return;
        btn.addEventListener('click', function () {
          var banner = document.querySelector('[data-order-confirmation-banner]');
          if (banner) banner.hidden = true;
        });
      }

      function wireCheckoutCta() {
        document.querySelectorAll('[data-checkout]').forEach(function (btn) {
          btn.addEventListener('click', function () { window.location.href = 'checkout.html'; });
        });
      }

      function init() {
        wireCheckoutCta();
        wireDismiss();
        var hash = window.location.hash || '';
        var m = hash.match(/^#order=([0-9a-f-]{36})$/i);
        var successId = sessionStorage.getItem(SUCCESS_KEY);
        if (m && successId && m[1] === successId) {
          showBanner(successId);
        }
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }

      window.__bpCheckoutBridge = { showBanner: showBanner };
    })();
