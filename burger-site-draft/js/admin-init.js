
    (function () {
      'use strict';
      // Slice 1: initialize the client globally so slices 3 and 4 can use it.
      // Full auth session detection and order-fetching logic lands in slice 3.
      if (typeof window.supabase !== 'undefined' && window.__bpSupabase) {
        window.supabase = window.supabase.createClient(
          window.__bpSupabase.url,
          window.__bpSupabase.publishableKey,
          {
            auth: {
              persistSession: true,
              autoRefreshToken: true,
              storage: window.localStorage,
              detectSessionInUrl: true
            }
          }
        );
        console.info('[admin] Supabase client initialized. Auth + orders in slices 3–4.');
      } else {
        console.warn('[admin] supabase-config.js not loaded — check .env and supabase-config.js');
      }
    })();
  