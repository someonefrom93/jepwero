<!-- Synced from `openspec/changes/shopping-cart/specs/menu-catalog/spec.md` on 2026-07-04. Original change: shopping-cart (verifier: slice-1 + slice-2). -->
# Menu Catalog Spec

> SDD capability: `menu-catalog` — DOM-derived item index consumed by the `cart` capability. Authored inline by the orchestrator after two failed sub-agent launches (`sdd-spec`); content is unchanged from the proposal and the spec contract.

## Purpose

`menu-catalog` builds an in-memory index of every menu item by reading `data-*` attributes from `<article class="item">` elements. It exists so the cart and any future catalog consumer never need a hardcoded duplicate of the 32-item menu.

## Requirements

### Attribute contract

- Every `<article class="item">` on `menu.html` MUST carry the following `data-*` attributes:
  - `data-id` — a `<category>:<slug>` identifier (e.g. `burgers:classic`, `lt:berry-lemonade`). The `lt` prefix MUST be used for the Limited Time category.
  - `data-name` — the display name exactly as it appears in the `<h3 class="item__name">`.
  - `data-price` — the integer-cent price (e.g. `1095` for `$10.95`). MUST NOT contain `$`, commas, or decimals.
  - `data-category` — one of `limited`, `burgers`, `chicken`, `bowls`, `sides`, `kids`, `shakes`, `drinks`.
  - `data-cal` — the calorie string as shown in the card (e.g. `820 cal`).
  - `data-img` — the `<img src>` value (full URL, as used on the card).

### Indexing behavior

- The catalog MUST reindex on `DOMContentLoaded`.
- The catalog MUST reindex when a `storage` event fires (so the `cart` capability's cross-tab updates can also trigger reindex if a future change mutates the DOM).
- The catalog MUST be exposed as a `Map<id, item>` where `item` is a frozen object containing `{ id, name, priceCents, category, cal, img }`.
- Reindexing MUST be idempotent: two consecutive runs on the same DOM MUST produce catalogs whose entries are equal by deep comparison.

### Resilience

- If an item card is missing any required attribute, the catalog MUST skip it silently and MUST emit a single `console.warn` per card whose message includes the card's `textContent` so the missing attributes can be diagnosed.
- The catalog MUST NOT throw during indexing under any circumstance.

### `data-id` uniqueness

- `data-id` MUST be category-qualified so two cards with the same slug in different categories cannot collide (e.g. `drinks:lemonade` and `lt:berry-lemonade` are different items).
- The catalog MUST reject a card whose `data-id` is already present and MUST emit a `console.warn` noting the duplicate.

### Price integrity

- `data-price` MUST be parsed as a base-10 integer. Non-integer values (e.g. `10.95`, `1,095`, `$1095`) MUST be treated as malformed; the card MUST be skipped and the warning emitted.
- All consumers of `data-price` MUST receive integer cents, never a parsed float.

### Consumer contract

- Consumers (e.g. the `cart` capability) MUST obtain item metadata via `catalog.get(id)` returning a frozen item object.
- Consumers MUST NOT mutate the returned object. Updates MUST go through the catalog's `reindex()` method, which is the only path that mutates the index.

## Scenarios

#### DOMContentLoaded produces the full 32-item catalog
- Given `menu.html` is freshly loaded and contains all 32 item cards with required `data-*` attributes
- When `DOMContentLoaded` fires
- Then `catalog.size` MUST be `32`
- And every entry MUST have a non-empty `name`, a positive integer `priceCents`, a valid `category`, and a non-empty `img`
- And the entry for `The Classic` MUST have `id === 'burgers:classic'` and `priceCents === 895`

#### Reindex is idempotent
- Given the catalog has been built from the current DOM
- When `reindex()` is called a second time without any DOM change
- Then the resulting catalog MUST have the same `size`
- And every entry MUST be deeply equal to its prior value
- And no `console.warn` MUST be emitted

#### Missing data-price is skipped with a warning
- Given a card `X` exists with all required attributes except `data-price`
- And the DOM contains 31 other well-formed cards
- When `reindex()` runs
- Then the catalog MUST contain exactly `31` items (the 31 well-formed cards)
- And exactly one `console.warn` MUST be emitted whose message contains the card's `textContent` (truncated to ~80 chars if very long)
- And no other error MUST be thrown

#### Category-qualified ids prevent collisions
- Given one card with `data-id="lt:berry-lemonade"` (Limited Time)
- And another card with `data-id="drinks:lemonade"` (Drinks)
- When `reindex()` runs
- Then both entries MUST be present in the catalog
- And `catalog.get('lt:berry-lemonade')` MUST return the Limited Time item
- And `catalog.get('drinks:lemonade')` MUST return the Drinks item
- And they MUST NOT collide

## Out of scope

- Any HTTP fetch of an external JSON menu file
- Server-side aggregation
- Caching across pages (this capability is per-page-load by design; cross-page persistence belongs to the `cart` capability)
- Search, filter, sort, or any user-facing query API
- Localization or multi-language catalog entries

## Dependencies

- Reads only from the live DOM of `burger-site-draft/menu.html`. It has no dependency on the `cart` capability, but `cart` depends on `menu-catalog`.
