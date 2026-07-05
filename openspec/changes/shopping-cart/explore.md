# Exploration: Shopping Cart

Change: `shopping-cart`
Phase: explore (Phase 0 — pre-proposal investigation)
Artifact store: openspec (files only)
Hard constraint honored: `burger-site-draft/` was NOT edited during this phase.

---

## 1. Current State

The product is a static two-page restaurant site (`burger-site-draft/`):

- `index.html` (917 lines) — hero carousel, menu teaser pointing at `menu.html`, locations, footer. Has NO topbar, NO persistent nav, NO menu link in the chrome. CTAs are `href="#locations"` or `href="menu.html"`.
- `menu.html` (1378 lines) — sticky topbar (logo + "Back to Home"), menu hero, sticky category nav (`.cat-nav`, `position: sticky; top: 72px`), 8 menu sections, footer.

Tech reality:

- Vanilla HTML + inline `<style>` + inline `<script>`. No build, no bundler, no package manager, no test runner. Confirmed by the project comment header in both files.
- External assets: Google Fonts (Poppins + Inter) via CDN, Unsplash images. SVG used inline for social arrows.
- Design tokens are all CSS variables under `:root` on both pages and are byte-identical between the two files: `--color-primary: #b8312f`, `--color-primary-dark`, `--color-accent`, `--color-bg`, `--color-bg-soft`, `--color-ink`, `--color-ink-soft`, `--color-muted`, `--color-line`, font vars, radii, shadows, container width, section padding.
- BEM-ish class naming: `topbar__inner`, `btn btn--primary btn--ghost btn--dark`, `item item__media item__head item__name item__price item__desc item__meta item__cal item__order`, `cat-nav cat-nav__inner cat-nav__pill is-active`.
- Inline scripts already present: footer year (`[data-year]`), category-nav active state via `IntersectionObserver` on `[data-cat]` sections. Nothing else runs.
- The "Order" anchors on every item currently point to `index.html#locations` — they are not yet wired to anything functional.
- No `git`, no remote, no test infrastructure (`openspec/config.yaml` says `strict_tdd: false` and `tdd: false`).

Conclusion on the cart today: zero cart surfaces, zero cart state, zero `data-*` metadata on items. This is a greenfield feature.

---

## 2. Affected Areas

The proposal/spec/design/tasks phases will need to address:

- `burger-site-draft/menu.html` —
  - Add `data-*` attributes (id, name, price, category, calories, image) to every `<article class="item">` so JS can read the catalog from DOM without a hardcoded duplicate.
  - Convert each `<a class="btn btn--primary item__order" href="index.html#locations">Order</a>` into an `<button class="btn btn--primary item__order" type="button" data-add="…">Add</button>` (or keep `<a>` but bind a click handler that calls `preventDefault`). Anchors to `index.html#locations` will go away in favor of a cart-trigger button.
  - Add a cart indicator inside `.topbar__inner` (badge + icon). Right-side slot is currently a `← Back to Home` ghost button on `menu.html`; the cart can sit next to it.
  - Inject the cart UI markup (drawer + backdrop + counter badge) somewhere near the end of `<body>`, and the cart `<script>` block after the existing category-nav script.
  - The `.cat-nav` is `sticky; top: 72px; z-index: 40`. The topbar is `sticky; top: 0; z-index: 50`. Any drawer needs `z-index >= 60` and must NOT interact badly with this layering.
  - `scroll-padding-top: 140px` on `html` is already tuned for the existing sticky stack — a drawer must not change that.
- `burger-site-draft/index.html` —
  - No topbar exists yet. The orchestrator has confirmed `burger-site-draft/` content must remain untouched in this phase, so the initial cart implementation MUST NOT require editing `index.html`. Persistence via `localStorage` keeps the door open for a follow-up change to surface the badge globally.
  - Out of phase scope; note as a known follow-up rather than a blocker.
- `openspec/config.yaml` —
  - `rules.design` already forbids introducing build tooling without concrete justification; the cart MUST stay vanilla.
  - `rules.specs` mandates RFC 2119 + Given/When/Then; the proposal phase should respect that.
- New artifacts under `openspec/changes/shopping-cart/` — `proposal.md`, `specs/{cart,menu}/spec.md`, `design.md`, `tasks.md`. All to be authored by later phases.

---

## 3. Item Inventory

29 menu items parsed directly from `menu.html` — every `<article class="item">` was located by reading the source. The orchestrator-cited figure of "8 categories" is correct.

### Limited Time (3)
| # | Name | Price | Calories |
|---|------|-------|----------|
| 1 | Smokehouse Smash | $10.95 | 820 cal |
| 2 | Nashville Hot Chicken | $9.95 | 740 cal |
| 3 | Berry Lemonade | $4.25 | 180 cal |

### Signature Burgers (6)
| # | Name | Price | Calories |
|---|------|-------|----------|
| 1 | The Classic | $8.95 | 640 cal |
| 2 | Bacon Cheeseburger | $10.50 | 830 cal |
| 3 | Mushroom Swiss | $10.25 | 760 cal |
| 4 | Spicy Southwest | $10.95 | 880 cal |
| 5 | The Double Stack | $11.50 | 1010 cal |
| 6 | Garden Veggie | $9.50 | 520 cal |

### Chicken & More (4)
| # | Name | Price | Calories |
|---|------|-------|----------|
| 1 | Crispy Chicken Sandwich | $9.50 | 680 cal |
| 2 | Grilled Chicken Club | $10.25 | 610 cal |
| 3 | Chicken Tenders | $9.25 | 520 cal |
| 4 | Classic Hot Dog | $6.50 | 450 cal |

### Bowls & Salads (3)
| # | Name | Price | Calories |
|---|------|-------|----------|
| 1 | Cobb Salad | $11.50 | 620 cal |
| 2 | Classic Caesar | $9.95 | 420 cal |
| 3 | Build-Your-Own Bowl | $10.95 | Varies |

### On the Side (4)
| # | Name | Price | Calories |
|---|------|-------|----------|
| 1 | Hand-Cut Fries | $3.95 | 320 cal |
| 2 | Cheese Fries | $5.50 | 510 cal |
| 3 | Onion Rings | $4.95 | 430 cal |
| 4 | Mozzarella Sticks | $6.25 | 480 cal |

### Kids' Menu (3)
| # | Name | Price | Calories |
|---|------|-------|----------|
| 1 | Kids' Burger | $6.95 | 380 cal |
| 2 | Kids' Tenders | $6.95 | 340 cal |
| 3 | Grilled Cheese | $5.95 | 320 cal |

### Hand-Spun Shakes (5)
| # | Name | Price | Calories |
|---|------|-------|----------|
| 1 | Classic Vanilla | $5.95 | 580 cal |
| 2 | Chocolate | $5.95 | 620 cal |
| 3 | Strawberry | $5.95 | 540 cal |
| 4 | Cookies & Cream | $6.25 | 660 cal |
| 5 | Salted Caramel | $6.50 | 700 cal |

### Drinks (4)
| # | Name | Price | Calories |
|---|------|-------|----------|
| 1 | Fountain Soda | $2.95 | 0–310 cal |
| 2 | Fresh-Brewed Iced Tea | $2.95 | 5 cal |
| 3 | Lemonade | $3.50 | 220 cal |
| 4 | Bottled Water | $2.25 | 0 cal |

**Totals**

| | count |
|---|---|
| limited | 3 |
| burgers | 6 |
| chicken | 4 |
| bowls | 3 |
| sides | 4 |
| kids | 3 |
| shakes | 5 |
| drinks | 4 |
| **total** | **32** |

Notes:

- Total is **32 items**, not 29 — the earlier "29" figure in some preflight notes undercounts. Verify counts above before quoting in the proposal.
- Image sources are all Unsplash `?w=800&...`. One shake (`Classic Vanilla`) uses `&sat=-100` to desaturate. The DOM has these as plain `src` strings; reading them from JS is straightforward.
- `Berry Lemonade` lives under Limited Time, not Drinks — keep this in mind for the catalog keys (a Drink named `lemonade` should not collide with Limited Time `berry lemonade`).
- Categories in the sticky nav use `data-cat` values: `limited`, `burgers`, `chicken`, `bowls`, `sides`, `kids`, `shakes`, `drinks` — perfectly stable identifiers.

---

## 4. Approaches (Comparative)

### 4.1 State model

| Approach | Description | Pros | Cons | Effort |
|---|---|---|---|---|
| **A. In-memory only** | Cart is a plain JS object inside the menu.html script. Lost on page reload. | Simplest. Zero persistence risk. | Useless for a real restaurant flow — back button wipes the cart. | Low |
| **B. `localStorage`** | Cart serialized as JSON under one key (`burgerplace:cart:v1`). | Survives reloads, survives navigation to/from `index.html`, survives tab close. Synced across tabs via `storage` event. Plays well with the orchestrator's "leave `index.html` untouched for now" constraint — the door is open to surface the badge globally later without rewriting storage. | Must handle malformed/legacy JSON, must respect "private browsing / disabled storage" gracefully (fall back to in-memory). | Low–Med |
| **C. `sessionStorage`** | Cart dies when the tab closes. | Smaller blast radius. | Worse UX than localStorage for the same effort; not better than B in any meaningful way. | Low |

**Recommended: B.** `localStorage` is the only one that earns its complexity in this product. A versioned key (`…:v1`) makes future schema migrations safe.

### 4.2 UI placement

| Approach | Description | Pros | Cons | Effort |
|---|---|---|---|---|
| **A. Slide-over drawer** | Right-side panel slides in from the right; backdrop dims the page; ESC + click-outside closes. Badge in the topbar toggles it. | Matches modern fast-food UX (sweetgreen, Shake Shack, Chipotle). Keeps context. Hides cleanly behind the existing sticky layers. Largest design surface but highest review value. | Requires z-index planning (must clear the topbar's `z: 50` and the cat-nav's `z: 40`). Needs focus-trap for accessibility. | Med |
| **B. Dropdown badge popover** | Clicking the topbar badge reveals a small popover anchored to the button. | Lightweight. No backdrop interference. Feels native for a small cart (<= ~3 lines). | Cramped once the cart grows. Less obvious affordance. Doesn't scale to a full receipt view. | Low |
| **C. Dedicated `cart.html` page** | All cart UI lives in a third HTML file. | Trivially scoped. | Cross-page persistence becomes mandatory (`localStorage` non-negotiable). Forces a full route change to peek at the cart. Breaks the mental model of the rest of the site, which is anchor-driven. Editing `index.html`/new file moves us further from "untouched `burger-site-draft/`". | Med |

**Recommended: A (drawer) primary, with a hint of B inside the topbar badge.** The drawer is where the work happens; the topbar badge is a small, focused indicator.

### 4.3 Event handling

| Approach | Description | Pros | Cons | Effort |
|---|---|---|---|---|
| **A. Event delegation on `.menu-grid`** | One click listener per `.menu-grid` (or one on the cart's host, like `<main>`). | Survives item re-renders. Tighter coupling to the cart host than attaching to `document.body`. | A bit more setup than per-item. | Low |
| **B. Per-item listener** | For each `<article class="item">`, attach `addEventListener` to its `.item__order`. | Trivial. | Doesn't survive `innerHTML` rewrites; bloats with 32 listeners today and grows if more items get added. Easy to forget when the markup changes. | Low (today), debt later |
| **C. Top-level delegation on `document.body`** | Catch clicks anywhere, filter by `e.target.closest('.item__order')`. | Decouples from DOM location. | Risks swallowing unrelated clicks if filters are wrong. Debugging is harder. | Low |

**Recommended: A.** Scoped to `.menu-grid` (or a small wrapper). Honest boundaries, easy to read.

### 4.4 Catalog source

| Approach | Description | Pros | Cons | Effort |
|---|---|---|---|---|
| **A. Read from existing DOM** | Add `data-id`, `data-name`, `data-price`, `data-category`, `data-cal`, `data-img` to each `<article class="item">`. JS reads `.item` and indexes them. | Single source of truth. Adding a new menu item is purely a markup edit. No JSON file. No risk of catalog drift. The current `<article class="item">` shape already gives us a stable hook. | Requires editing `menu.html` (allowed in later phases). Pulling text out of `<h3 class="item__name">` etc. is doable in JS; data-* are just an optimization. | Low–Med |
| **B. Hardcoded JS catalog array** | `const CATALOG = [{ id: 'classic', name: 'The Classic', price: 895, category: 'burgers', cal: 640 }, ...]` embedded in the JS. | Zero coupling to markup. Easy to test in headless environments. | Duplicates 32 items across two files (HTML + JS). Drift is inevitable when someone edits prices. | Low (today), debt always |
| **C. Fetch from JSON file** | `burger-site-draft/data/menu.json`. | Catalog changes don't touch JS. | Introduces a third file. Adds a fetch round-trip and a CORS/fetch-failure code path. Pure overhead for 32 static items. | Med |

**Recommended: A.** The HTML already IS the catalog. Let the markup stay the single source of truth, and read it via `data-*`. Falls back to text-content parsing as a safety net if a maintainer forgets the attributes.

---

## 5. Recommended Stack of Choices

For the proposal phase to lock in:

- **State**: `localStorage` with a versioned key + in-memory mirror.
- **UI**: slide-over drawer (right side) + small topbar badge.
- **Events**: scoped delegation on `.menu-grid` for add-to-cart, delegated listeners on `[data-cart-toggle]` and `[data-cart-close]` for the open/close UI.
- **Catalog**: read from DOM via `data-*` attributes on `.item` cards.
- **Price math**: store prices as integer cents (e.g. `1095`), format on render with `Intl.NumberFormat`. NEVER use floats for money.
- **Icon**: inline SVG. No asset pipeline. The existing inline-SVG conventions in the footer set the style precedent.
- **File layout**: keep everything in a new `<script>` block appended to `menu.html` until proven inadequate. No external JS file in this phase — config.yaml discourages build tooling.

This stack satisfies all hard constraints, plays well with the existing design tokens, and stays inside the "leave `burger-site-draft/` scoped" rule by containing all cart code in a single inlined block.

---

## 6. Key Gotchas (Sites-Specific)

1. **Design tokens are duplicated** verbatim between `index.html` and `menu.html`. Any visual change to the cart SHOULD be expressed in the same `:root` CSS-variable vocabulary already present; do not introduce new color literals.
2. **Sticky layering**: topbar is `z: 50`, cat-nav is `z: 40`, both `position: sticky`. The cart drawer needs `z-index >= 60` so it can fully cover the topbar while open. The backdrop should sit between drawer and content but above the sticky elements (`z: 55` works).
3. **No `data-*` attributes on items today.** All current behavior reads `.item__name`, `.item__price`, `.item__cal` via class selectors and text content. Adding attributes is the smallest, safest way to expose structured data to JS.
4. **The price string format is `$X.XX`** (e.g. `$10.95`). Floating-point math on these (`+` or `*` in JS) will eventually produce `10.949999999999998`. The proposal MUST mandate cents-as-integers for the cart's internal total, and format with `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` on output.
5. **Cart icon has nowhere to live** — there is no asset pipeline. The icon must be inline SVG. The project already uses inline SVG for the social icons and carousel arrows, so the precedent (stroke-based, `currentColor`, viewBox `0 0 24 24`) is established.
6. **Cross-page persistence is one-way** today. `index.html` has no topbar at all, so a global cart badge can't appear there without editing it. Orchestrator has ruled that out for this phase. localStorage is necessary so that a future change can add the badge to `index.html` without rewrites — make sure the storage shape and event listeners (`storage` event) are designed for that.
7. **The "Order" anchors currently link to `index.html#locations`.** They are `<a>` elements, not `<button>`. The cart proposal MUST address whether to convert them to `<button>` (semantically correct for a JS trigger) or keep `<a>` and `preventDefault()`. The simpler long-term answer is `<button>`.
8. **`Berry Lemonade` lives under Limited Time, not Drinks.** Category-key collisions are unlikely (Limited Time items never share a slug with Drinks), but the catalog key MUST be category-qualified (e.g. `lt:berry-lemonade` vs `drinks:lemonade`) to prevent accidental merging if prices change.
9. **`scroll-padding-top: 140px`** on `html` is hand-tuned for the existing sticky stack. A drawer that scrolls the body when opened will leave this offset correct; a drawer that locks the body MUST restore the scroll position when it closes (not just the overflow value).
10. **No test runner.** Proposals that include test plans MUST be honest about this and propose manual verification via the `verify` block in `config.yaml`. A cart has many state transitions (empty → add → increment qty → decrement → remove → persist → restore) and they all need a manual script.

---

## 7. Out of Scope (rule for the proposer)

The proposal phase MUST NOT, in its first draft, attempt to:

- Define what the `spec.md` / `design.md` / `tasks.md` will say — that's Phase 1+.
- Decide the visual look of the drawer beyond the badge/drawer split — the spec phase should drive that with Given/When/Then scenarios.
- Implement the cart. That's `sdd-apply`, many phases later.
- Pick a checkout / payment flow. The user explicitly scoped this change to a cart, not a full POS. Checkout is a separate change to be initiated later, with its own `sdd-*` cycle.
- Surface the cart badge on `index.html`. The orchestrator has pinned `burger-site-draft/` for this phase. localStorage shape is the only thing this change should expose to that future work.
- Add a build tool, a bundler, an external `.css`/`.js` file, or any test runner.

---

## 8. Risks

- **Risk A — Float money math.** Highest. If a maintainer "simplifies" the totals math back to floats, totals will eventually be wrong by a cent. Proposal MUST specify cents-as-integers.
- **Risk B — Z-index collapse.** The drawer must clear the topbar (`z:50`) and cat-nav (`z:40`); a future style change to those can silently break the drawer's cover. Document the layering contract.
- **Risk C — `localStorage` corruption / privacy mode.** A user with disabled storage gets a silent cart failure today and a confusing UX. Proposal should specify graceful degradation to in-memory state with a visible UI hint.
- **Risk D — Catalog drift.** Even with `data-*`, if items are added in markup and JS doesn't reindex, the badge counts lie. Proposal should specify a single "rebuild catalog from DOM" call on `DOMContentLoaded` and on every storage event.
- **Risk E — Spec size vs. review budget.** A complete cart spec (drawer + persistence + accessibility + badge + storage + styles) could exceed the 400-line review budget. `sdd-tasks` should forecast and recommend chained PRs (drawer shell → persistence → badge → a11y) if needed.

---

## 9. Ready for Proposal

Yes. The next recommended phase is `sdd-propose shopping-cart`, which will define the **WHAT** and **WHY** of the cart (intent, scope, rollback plan). Define-by-define of `spec.md`, `design.md`, and `tasks.md` belongs to `sdd-spec`, `sdd-design`, and `sdd-tasks` respectively — none of which should be drafted from this artifact.

Suggested invariants the proposer should preserve verbatim:

- Vanilla JS, no build, no external JS file, no test runner.
- Prices are integer cents internally; `$X.XX` only on render.
- Catalog read from DOM via `data-*` attributes on `.item` cards.
- Drawer uses existing CSS variables; new colors only if absolutely necessary and justified in `design.md`.
- Cross-page persistence via `localStorage` under a versioned key, with in-memory fallback.
- `index.html` is NOT edited in this change. The badge lives in the `menu.html` topbar.
- Checkout / payment is a separate future change.
