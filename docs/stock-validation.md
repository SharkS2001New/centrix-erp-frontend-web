# Stock Validation QA Checklist

Use this checklist to validate stock behavior across channels and retail/wholesale routing.

Quick steps
- Pick a product with known `stock_available_shop` and `stock_available_store` values.
- Test retail (shop) and wholesale (store) sales separately.

Checks
1. Retail POS
   - Sell quantity <= `stock_available_shop` → allowed
   - Sell quantity > `stock_available_shop` → blocked with insufficient stock message
   - Completing the sale deducts from shop stock

2. Wholesale POS
   - Sell quantity <= `stock_available_store` → allowed
   - Sell quantity > `stock_available_store` → blocked
   - Completing the sale deducts from store stock

3. Mixed product
   - Verify per-line retail routing sends retail lines to shop and wholesale lines to store

4. Cart reservation
   - Adding product to cart reserves stock and blocks oversells from other sessions
   - Removing from cart releases reservation

5. Mobile & Backend
   - Mobile orders follow same checks and obey workflow reserve/deduct timing
   - Backend-created orders apply the same validation before final save

6. Admin toggles
   - Toggle negative stock and verify oversell behavior

Notes
- For automated checks, see `src/lib/pos-stock.test.js` which covers basic availability logic.
