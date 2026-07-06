
  (function () {
    'use strict';

    /* ---------- State ---------- */
    var allOrders      = [];
    var filter         = { archived: false, status: null };
    var currentDetailId = null;

    /* ---------- DOM refs ---------- */
    var ordersHost      = document.querySelector('[data-admin-orders-host]');
    var emptyEl         = document.querySelector('[data-admin-empty]');
    var detailEl        = document.querySelector('[data-admin-detail]');
    var detailBody      = document.querySelector('[data-admin-detail-body]');
    var detailEmptyEl   = document.querySelector('[data-admin-detail-empty]');
    var detailCloseBtn  = document.querySelector('[data-admin-detail-close]');
    var rtIndicator     = document.querySelector('[data-realtime-indicator]');
    var asideEl         = document.querySelector('[data-admin-aside-skeleton]');

    /* ---------- Helpers ---------- */
    var _priceFmt = null;
    function formatPrice(cents) {
      if (!_priceFmt) _priceFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
      return _priceFmt.format(cents / 100);
    }

    function formatAge(timestamp) {
      var diff = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
      if (diff < 60)  return diff + 's ago';
      if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
      return Math.floor(diff / 86400) + 'd ago';
    }

    function shortId(uuid) {
      return (uuid || '').slice(0, 8);
    }

    /* ---------- URL hash ---------- */
    function applyHash() {
      var hash = window.location.hash.slice(1);
      if (!hash) {
        filter.archived = false;
        filter.status   = null;
        return;
      }
      var parts = hash.split('&');
      filter.archived = parts.indexOf('archived') !== -1;
      var statusPart = parts.find(function (p) { return p.indexOf('status=') === 0; });
      filter.status = statusPart ? statusPart.split('=')[1] : null;
    }

    function writeHash() {
      var parts = filter.archived ? ['archived'] : ['active'];
      if (filter.status) parts.push('status=' + filter.status);
      history.replaceState(null, '', '#' + parts.join('&'));
    }

    /* ---------- Filters ---------- */
    function applyFilters(orders) {
      var result = orders.filter(function (o) {
        if (!filter.archived) {
          if (o.archived_at !== null) return false;
        } else {
          if (o.archived_at === null) return false;
        }
        if (filter.status && o.status !== filter.status) return false;
        return true;
      });
      return result;
    }

    function renderFilters() {
      /* Rebuild aside filter rail */
      asideEl.innerHTML =
        '<div class="admin-shell__filter-group">' +
          '<p class="admin-shell__filter-label">View</p>' +
          '<div class="admin-shell__filter-pills">' +
            '<button class="admin-filter-pill' + (filter.archived === false ? ' is-active' : '') + '" data-filter-archived="false">Active</button>' +
            '<button class="admin-filter-pill' + (filter.archived === true  ? ' is-active' : '') + '" data-filter-archived="true">Archived</button>' +
          '</div>' +
        '</div>' +
        '<div class="admin-shell__filter-group">' +
          '<p class="admin-shell__filter-label">Status</p>' +
          '<div class="admin-shell__filter-pills">' +
            '<button class="admin-filter-pill' + (filter.status === null ? ' is-active' : '') + '" data-filter-status="all">All</button>' +
            '<button class="admin-filter-pill' + (filter.status === 'received'  ? ' is-active' : '') + '" data-filter-status="received">Received</button>' +
            '<button class="admin-filter-pill' + (filter.status === 'preparing' ? ' is-active' : '') + '" data-filter-status="preparing">Preparing</button>' +
            '<button class="admin-filter-pill' + (filter.status === 'ready'     ? ' is-active' : '') + '" data-filter-status="ready">Ready</button>' +
            '<button class="admin-filter-pill' + (filter.status === 'completed' ? ' is-active' : '') + '" data-filter-status="completed">Completed</button>' +
            '<button class="admin-filter-pill' + (filter.status === 'cancelled' ? ' is-active' : '') + '" data-filter-status="cancelled">Cancelled</button>' +
          '</div>' +
        '</div>';
    }

    /* ---------- List rendering ---------- */
    function renderEmpty() {
      ordersHost.innerHTML = '';
      emptyEl.textContent  = 'No orders here.';
      emptyEl.removeAttribute('hidden');
      closeDetail();
    }

    function renderList() {
      var filtered = applyFilters(allOrders);
      if (filtered.length === 0) {
        renderEmpty();
        return;
      }
      emptyEl.setAttribute('hidden', '');
      var html = '';
      filtered.forEach(function (order) {
        var itemsCount = (order.order_items && order.order_items.length)
          ? order.order_items.length + ' item' + (order.order_items.length !== 1 ? 's' : '')
          : '0 items';
        html +=
          '<article class="admin-order' + (order.id === currentDetailId ? ' is-selected' : '') + '" data-order-id="' + order.id + '">' +
            '<span class="admin-order__id">#' + shortId(order.id) + '</span>' +
            '<span class="admin-order__customer">' + escHtml(order.customer_name || '—') + '</span>' +
            '<span class="admin-order__meta">' + itemsCount + '</span>' +
            '<span class="admin-order__total">' + formatPrice(order.total_cents || 0) + '</span>' +
            '<span class="admin-order__status admin-order__status--' + order.status + '">' + order.status + '</span>' +
          '</article>';
      });
      ordersHost.innerHTML = html;
    }

    function escHtml(str) {
      var d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    /* ---------- Detail rendering ---------- */
    function renderDetail(orderId) {
      var order = allOrders.find(function (o) { return o.id === orderId; });
      if (!order) {
        closeDetail();
        return;
      }
      currentDetailId = orderId;
      detailEmptyEl.setAttribute('hidden', '');
      detailEl.removeAttribute('hidden');
      detailEl.classList.remove('is-closed');

      var items = order.order_items || [];
      var itemsHtml = '';
      items.forEach(function (item) {
        itemsHtml +=
          '<div class="admin-shell__detail__item">' +
            '<span class="admin-shell__detail__item-name">' +
              escHtml(item.name || '—') +
              '<span class="admin-shell__detail__item-qty">&#xD7;' + item.qty + '</span>' +
            '</span>' +
            '<span class="admin-shell__detail__item-total">' + formatPrice(item.unit_price_cents * item.qty) + '</span>' +
          '</div>';
      });

      var fulfillmentLabel = order.fulfillment === 'pickup' ? '&#x1F4CB; Pickup' : '&#x1F69A; Delivery';
      var pickupTimeStr = order.pickup_time
        ? new Date(order.pickup_time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
        : '';

      var controlsHtml = renderStatusControls(order);

      detailBody.innerHTML =
        '<div class="admin-shell__detail__customer">' +
          '<p class="admin-shell__detail__customer-name">' + escHtml(order.customer_name || '—') + '</p>' +
          '<p class="admin-shell__detail__customer-meta">' +
            escHtml(order.customer_email || '') + '<br/>' +
            escHtml(order.customer_phone || '') +
          '</p>' +
          '<span class="admin-shell__detail__fulfillment">' + fulfillmentLabel + '</span>' +
          (pickupTimeStr ? '<br/><span class="admin-shell__detail__customer-meta">Pickup: ' + pickupTimeStr + '</span>' : '') +
        '</div>' +
        '<div class="admin-shell__detail__items">' + itemsHtml + '</div>' +
        '<div class="admin-shell__detail__total-row">' +
          '<span>Total</span><span>' + formatPrice(order.total_cents || 0) + '</span>' +
        '</div>' +
        '<div class="admin-shell__detail__controls">' + controlsHtml + '</div>' +
        '<button type="button" class="admin-shell__detail__print-btn" data-admin-print>Print</button>';

      renderList(); /* re-render to update selection highlight */
    }

    function renderStatusControls(order) {
      var terminal = (order.status === 'completed' || order.status === 'cancelled');
      if (terminal) return '';

      var nextBtn = '';
      var cancelBtn = '';

      if (order.status === 'received') {
        nextBtn = '<button type="button" class="admin-shell__detail__action-btn admin-shell__detail__action-btn--primary" data-status-action="preparing" data-order-id="' + order.id + '">Start preparing</button>';
      } else if (order.status === 'preparing') {
        nextBtn = '<button type="button" class="admin-shell__detail__action-btn admin-shell__detail__action-btn--primary" data-status-action="ready" data-order-id="' + order.id + '">Mark ready</button>';
      } else if (order.status === 'ready') {
        nextBtn = '<button type="button" class="admin-shell__detail__action-btn admin-shell__detail__action-btn--primary" data-status-action="completed" data-order-id="' + order.id + '">Complete</button>';
      }

      cancelBtn = '<button type="button" class="admin-shell__detail__action-btn" data-cancel data-order-id="' + order.id + '">Cancel</button>';

      return nextBtn + cancelBtn;
    }

    function closeDetail() {
      currentDetailId = null;
      detailEl.setAttribute('hidden', '');
      detailEl.classList.add('is-closed');
      detailEmptyEl.removeAttribute('hidden');
      detailEmptyEl.textContent = 'Select an order to see its details.';
    }

    /* ---------- Fetch ---------- */
    function openDetail(orderId) {
      renderDetail(orderId);
    }

    async function fetchOrders() {
      var _ref = await window.supabase
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false });
      if (_ref.error) {
        emptyEl.textContent = 'Couldn\'t load orders.';
        return;
      }
      allOrders = _ref.data || [];
      renderList();
    }

    /* ---------- Status action ---------- */
    async function handleStatusAction(orderId, newStatus, evt) {
      if (evt) evt.target.disabled = true;
      var idx     = allOrders.findIndex(function (o) { return o.id === orderId; });
      if (idx === -1) return;
      var snapshot = JSON.parse(JSON.stringify(allOrders[idx]));

      /* Optimistic update */
      allOrders[idx].status = newStatus;
      if (newStatus === 'completed') {
        allOrders[idx].archived_at = new Date().toISOString();
      }
      renderList();
      renderDetail(orderId);

      var updateObj = { status: newStatus };
      if (newStatus === 'completed') updateObj.archived_at = new Date().toISOString();

      var _result = await window.supabase
        .from('orders')
        .update(updateObj)
        .eq('id', orderId)
        .select()
        .single();

      if (_result.error) {
        /* Rollback */
        allOrders[idx] = snapshot;
        renderList();
        renderDetail(orderId);
        showErrorToast('Couldn\'t update status');
      } else {
        allOrders[idx] = _result.data;
        renderList();
        if (currentDetailId === orderId) renderDetail(orderId);
      }
    }

    function showErrorToast(text) {
      var el = document.createElement('div');
      el.className = 'admin-toast';
      el.textContent = text;
      document.body.appendChild(el);
      setTimeout(function () { el.remove(); }, 4000);
    }

    /* ---------- Realtime + polling ---------- */
    var realtimeChannel = null;
    var pollingTimer    = null;

    function startRealtime() {
      realtimeChannel = window.supabase.channel('admin-orders');
      realtimeChannel.on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, function () {
        fetchOrders();
      });
      realtimeChannel.subscribe(function (status) {
        handleChannelStatus(status);
      });
    }

    function handleChannelStatus(status) {
      if (status === 'SUBSCRIBED') {
        if (pollingTimer) { clearInterval(pollingTimer); pollingTimer = null; }
        if (rtIndicator) rtIndicator.setAttribute('hidden', '');
      } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        if (!pollingTimer) pollingTimer = setInterval(fetchOrders, 5000);
        if (rtIndicator) rtIndicator.removeAttribute('hidden');
      }
    }

    function stopRealtime() {
      if (realtimeChannel) { realtimeChannel.unsubscribe(); realtimeChannel = null; }
      if (pollingTimer)    { clearInterval(pollingTimer); pollingTimer = null; }
    }

    /* ---------- Event bindings ---------- */
    ordersHost.addEventListener('click', function (e) {
      var row = e.target.closest('[data-order-id]');
      if (row) openDetail(row.getAttribute('data-order-id'));
    });

    detailEl.addEventListener('click', function (e) {
      /* Close button */
      if (e.target === detailCloseBtn || e.target.getAttribute('data-admin-detail-close') !== null) {
        closeDetail();
        renderList();
        return;
      }
      /* Status action */
      var actionTarget = e.target.closest('[data-status-action]');
      if (actionTarget) {
        var orderId   = actionTarget.getAttribute('data-order-id');
        var newStatus = actionTarget.getAttribute('data-status-action');
        if (newStatus === 'completed' && !window.confirm('Complete this order?')) return;
        handleStatusAction(orderId, newStatus, e);
        return;
      }
      /* Cancel */
      var cancelTarget = e.target.closest('[data-cancel]');
      if (cancelTarget) {
        var cancelId = cancelTarget.getAttribute('data-order-id');
        if (!window.confirm('Cancel this order?')) return;
        handleStatusAction(cancelId, 'cancelled', e);
        return;
      }
      /* Print */
      if (e.target.getAttribute('data-admin-print') !== null) {
        window.print();
      }
    });

    asideEl.addEventListener('click', function (e) {
      var pill = e.target.closest('.admin-filter-pill');
      if (!pill) return;
      if (pill.hasAttribute('data-filter-archived')) {
        filter.archived = pill.getAttribute('data-filter-archived') === 'true';
      }
      if (pill.hasAttribute('data-filter-status')) {
        var s = pill.getAttribute('data-filter-status');
        filter.status = s === 'all' ? null : s;
      }
      writeHash();
      renderFilters();
      renderList();
    });

    window.addEventListener('beforeunload', stopRealtime);

    /* ---------- Init ---------- */
    window.addEventListener('bp-admin-ready', function () {
      applyHash();
      renderFilters();
      fetchOrders();
      startRealtime();
    });

  })();
  