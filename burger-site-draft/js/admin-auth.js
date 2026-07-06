
  (function () {
    'use strict';

    /* ---------- State ---------- */
    var currentSession = null;
    var currentRole    = null;
    var currentEmail   = null;

    /* ---------- DOM refs ---------- */
    var elLogin         = document.querySelector('[data-admin-auth="login"]');
    var elShell         = document.querySelector('[data-admin-auth="shell"]');
    var elRoleMismatch  = document.querySelector('[data-admin-auth="role-mismatch"]');
    var form            = document.getElementById('admin-login-form');
    var input           = document.getElementById('admin-email');
    var statusEl        = document.querySelector('[data-admin-login-status]');
    var topbarUser      = document.querySelector('[data-admin-topbar-user]');
    var signoutBtn      = document.querySelector('[data-admin-logout]');
    var mismatchSignout = document.querySelector('[data-admin-mismatch-signout]');

    /* ---------- Session detection ---------- */
    async function checkSession() {
      if (!window.supabase) {
        console.warn('[bpAdminAuth] Supabase client not ready');
        return;
      }
      var result = await window.supabase.auth.getSession();
      if (result.error) {
        console.error('[bpAdminAuth] getSession error:', result.error.message);
      }
      applySession(result.data?.session || null);
    }

    /* ---------- Apply session to UI ---------- */
    function applySession(session) {
      currentSession = session;
      if (!session) {
        currentRole  = null;
        currentEmail = null;
        renderState('login');
        return;
      }
      currentEmail = session.user?.email || null;
      currentRole  = session.user?.app_metadata?.role || null;
      if (currentRole === 'admin') {
        renderState('shell');
      } else {
        currentRole = null;
        renderState('role-mismatch');
      }
    }

    /* ---------- Render auth-state visibility ---------- */
    function renderState(state) {
      /* Hide all sections first */
      elLogin.setAttribute('hidden', '');
      elShell.setAttribute('hidden', '');
      elRoleMismatch.setAttribute('hidden', '');

      if (state === 'login') {
        elLogin.removeAttribute('hidden');
        /* Clear stale status */
        statusEl.textContent = '';
        statusEl.setAttribute('hidden', '');
        form.reset();
      } else if (state === 'shell') {
        elShell.removeAttribute('hidden');
        if (topbarUser) topbarUser.textContent = currentEmail || '';
        /* Fire bp-admin-ready so slice 4 can initialise orders */
        window.dispatchEvent(new CustomEvent('bp-admin-ready'));
      } else if (state === 'role-mismatch') {
        elRoleMismatch.removeAttribute('hidden');
      }
    }

    /* ---------- Magic-link submit ---------- */
    async function handleLoginSubmit(e) {
      e.preventDefault();
      if (!window.supabase) return;

      var email = (input.value || '').trim();
      /* Basic format check */
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        statusEl.textContent = 'Please enter a valid email address.';
        statusEl.removeAttribute('hidden');
        return;
      }

      statusEl.textContent = 'Sending\u2026';
      statusEl.removeAttribute('hidden');

      /* Magic-link redirect-to must be the absolute URL of this page */
      var redirectTo = window.location.origin + window.location.pathname;

      var _result = await window.supabase.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: redirectTo
        }
      });

      if (_result.error) {
        statusEl.textContent = 'Couldn\'t send link. Try again or contact support.';
        statusEl.removeAttribute('hidden');
      } else {
        statusEl.textContent = 'Check your inbox for the login link.';
        statusEl.removeAttribute('hidden');
        form.reset();
      }
    }

    /* ---------- Sign out ---------- */
    async function handleSignOut() {
      if (!window.supabase) return;
      await window.supabase.auth.signOut();
      currentSession = null;
      currentRole    = null;
      currentEmail   = null;
      renderState('login');
    }

    /* ---------- Event bindings ---------- */
    form.addEventListener('submit', handleLoginSubmit);
    if (signoutBtn) signoutBtn.addEventListener('click', handleSignOut);
    if (mismatchSignout) mismatchSignout.addEventListener('click', handleSignOut);

    window.supabase.auth.onAuthStateChange(function (event, session) {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        applySession(session);
      } else if (event === 'SIGNED_OUT') {
        applySession(null);
      }
    });

    /* Expose auth internals for slice-4 and DevTools debugging */
    window.__bpAdmin = {
      auth: {
        isAdmin: function () { return currentRole === 'admin'; },
        getEmail: function () { return currentEmail; }
      }
    };

    /* ---------- Init ---------- */
    document.addEventListener('DOMContentLoaded', checkSession);

  })();
  