# Centrix ERP — Sample AI Q&A Set 6 (250 new questions)

Companion to Sets 1–5. **All questions here are new and different.**  
Emphasis this set: tills/X-Z/EOD, loyalty & WhatsApp queues, KRA/eTIMS, M-Pesa/Equity, printouts, fulfillment/POD reports, hospitality F&B, HR reports, platform admin, and assistant tools.

**Import tip (Platform → AI training → Bulk paste):** each block is `Q:` / `A:` / optional `Path:`.

**Hard rules baked into answers:**
- Never invent numbers — use chat tools when listed.
- Products/customers/suppliers/employees: **names only** (no codes/ids in replies).
- Branches: **branch name only**, and only if the org has multiple branches.
- “In stock” ≠ low stock / zero / reorder.
- Saturday alternate shift hours ≠ half-day.
- Charts only when the user asks for a chart/graph/pie/donut.
- Prefer `find_screen` / `search_training_notes` when unsure of a path.

---

## Sales, POS, tills, loyalty & WhatsApp

**Q:** Where do I open or close a till session?  
**A:** Use Till Management at /sales/till-management for open/close and session controls. Prefer find_screen “till” if unsure.  
**Path:** /sales/till-management

**Q:** What is an X-report vs a Z-report?  
**A:** X-report (/sales/x-report) is a mid-session snapshot; Z-report (/sales/z-report) is end-of-session. Never invent till totals — use get_till_health or open the report screens.  
**Path:** /sales/x-report

**Q:** How do I see payments breakdown for the day?  
**A:** Open /sales/payments-breakdown (or hospitality equivalent). Quote tool totals only if get_sales_summary / till tools return them.  
**Path:** /sales/payments-breakdown

**Q:** Where is End of Day for retail sales?  
**A:** Open /sales/end-of-day (also /reports/end-of-day). Prefer find_screen “end of day”.  
**Path:** /sales/end-of-day

**Q:** How do I manage POS tills list?  
**A:** Open /pos/tills for till definitions used by the cashier POS workspace.  
**Path:** /pos/tills

**Q:** Retail POS vs hotel bar POS — which URL?  
**A:** Retail cashier workspace is /pos; hotel/bar POS is /hotel-bar-pos. Don’t send bar staff to retail /pos by mistake.  
**Path:** /hotel-bar-pos

**Q:** Where are loyalty cards managed?  
**A:** Open /sales/loyalty-cards. Points rules come from org settings — don’t invent point balances in chat.  
**Path:** /sales/loyalty-cards

**Q:** Customer wants to redeem loyalty points at checkout  
**A:** Apply loyalty on the cart/POS payment step when enabled. Card master lives at /sales/loyalty-cards; never invent redeemable points.  
**Path:** /sales/pos

**Q:** Where do WhatsApp sales orders queue?  
**A:** Open /sales/orders/queues/whatsapp for inbound WhatsApp orders. Admin/config may also use /sales/whatsapp.  
**Path:** /sales/orders/queues/whatsapp

**Q:** Where is the mobile orders queue?  
**A:** Open /sales/orders/queues/mobile for field/mobile-captured orders awaiting backoffice action.  
**Path:** /sales/orders/queues/mobile

**Q:** How do I configure sales WhatsApp?  
**A:** Use /sales/whatsapp for sales-side WhatsApp admin; platform WhatsApp lives under /platform/whatsapp for super-admin.  
**Path:** /sales/whatsapp

**Q:** Where are sales reservations (non-hotel)?  
**A:** Open /sales/reservations for retail/sales reservations when that feature is enabled.  
**Path:** /sales/reservations

**Q:** Legacy sales orders archive — where?  
**A:** Open /sales/legacy-orders for imported/legacy order history. Prefer find_screen “legacy orders”.  
**Path:** /sales/legacy-orders

**Q:** Legacy returns screen  
**A:** Open /sales/legacy-returns for historical return records from legacy import.  
**Path:** /sales/legacy-returns

**Q:** Supplier credit notes vs customer credit notes  
**A:** Customer returns/credit notes: /sales/returns or /sales/credit-notes. Supplier-side: /sales/credit-notes/supplier or /suppliers/returns.  
**Path:** /sales/credit-notes

**Q:** How do I print a till receipt layout?  
**A:** Till/receipt printing settings: /admin/till-printing or /sales/till-printing; document layouts under Admin → Settings → Printouts.  
**Path:** /admin/till-printing

**Q:** Investors module — where?  
**A:** Open /investors for investor records; investor reports at /investors/reports when enabled.  
**Path:** /investors

**Q:** Shop debtors shortcut under customers  
**A:** Some orgs expose /customers/shop-debtors as a shortcut into the debtor queues — same Shop Debtors concept as /sales/shop-debtors/*.  
**Path:** /customers/shop-debtors

**Q:** Can AI invent a till float amount?  
**A:** No. Float and session cash come from till open/close and get_till_health — never invent cash in drawer.  
**Path:** /sales/till-management

**Q:** Sales by channel report  
**A:** Open /reports/sales-by-channel (or find_screen “sales by channel”). Don’t invent channel splits in chat.  
**Path:** /reports/sales-by-channel

**Q:** Sales by user report path  
**A:** Open /reports/sales-by-user. For a named cashier in chat, prefer get_sales_by_cashier with username/name only.  
**Path:** /reports/sales-by-user

**Q:** Category sales report  
**A:** Open /reports/category-sales for sales rolled up by product category.  
**Path:** /reports/category-sales

**Q:** VAT collected this month  
**A:** Call get_vat_collected for the period, or open /reports/vat-collected. Quote tool/report figures only.  
**Path:** /reports/vat-collected

**Q:** Invoice payments report  
**A:** Open /reports/invoice-payments for payment allocation history against invoices.  
**Path:** /reports/invoice-payments

**Q:** Top debtors report  
**A:** Open /reports/top-debtors or call get_debtors_summary. List customer names only — no ids.  
**Path:** /reports/top-debtors

**Q:** AR aging report path  
**A:** Open /reports/ar-aging for aged receivables buckets. Pair with get_debtors_summary in chat when useful.  
**Path:** /reports/ar-aging

**Q:** Returns report  
**A:** Open /reports/returns for returns analytics; operational returns stay at /sales/returns.  
**Path:** /reports/returns

**Q:** Price list report  
**A:** Open /reports/price-list for current selling prices. Product price history tool: get_product_price_history.  
**Path:** /reports/price-list

**Q:** How do I see till sessions history?  
**A:** Open /reports/till-sessions for historical till open/close sessions.  
**Path:** /reports/till-sessions

**Q:** Customer statement report screen  
**A:** Open /reports/customer-statement or call get_customer_statement with the customer name/@mention.  
**Path:** /reports/customer-statement

**Q:** Sales by customer report  
**A:** Open /reports/sales-by-customer. In chat, use sales tools + customer name only.  
**Path:** /reports/sales-by-customer

**Q:** Sales by supplier report meaning  
**A:** Open /reports/sales-by-supplier when products are linked to suppliers — don’t invent supplier attribution.  
**Path:** /reports/sales-by-supplier

**Q:** Loading sheets for vans  
**A:** Open /sales/loading-sheets for van loading sheets used in distribution sales.  
**Path:** /sales/loading-sheets

**Q:** Picking lists under sales  
**A:** Open /sales/picking-lists (sales) or /fulfillment/picking depending on workspace — prefer find_screen “picking”.  
**Path:** /sales/picking-lists

**Q:** Trip charts screen  
**A:** Open /sales/trip-charts for trip chart views used with mobile/distribution ops.  
**Path:** /sales/trip-charts

**Q:** Field attendance under sales vs HR  
**A:** Sales field attendance is /sales/field-attendance; HR field attendance is /hr/field-attendance — don’t mix them.  
**Path:** /sales/field-attendance

**Q:** Approve mobile returns  
**A:** Use find_screen “mobile returns” / approval queues for field returns awaiting backoffice approval.  
**Path:** /sales/returns

**Q:** Approve mobile expenses  
**A:** Field/mobile expense approvals: find_screen “mobile expenses”; master expenses still at /expenses.  
**Path:** /expenses

**Q:** Proforma vs tax invoice  
**A:** Proforma is a quote-style document from the order flow; tax invoice is the fiscal/sales invoice. Don’t treat them as the same.  
**Path:** /sales/orders

**Q:** Can I reopen a Z-closed till?  
**A:** Usually no after Z-close — org policy may require a new session. Check Till Management; don’t invent reopen steps.  
**Path:** /sales/till-management

## Inventory, catalogue, GRN & purchasing

**Q:** Where is stock take?  
**A:** Open /inventory/stock-take for count sheets and variance posting.  
**Path:** /inventory/stock-take

**Q:** How do I receive a GRN?  
**A:** Open /inventory/receipts or /inventory/receipts/receive. Prefer find_screen “GRN”.  
**Path:** /inventory/receipts

**Q:** Branch transfer new document  
**A:** Create via /inventory/branch-transfers/new or /inventory/transfers depending on nav.  
**Path:** /inventory/branch-transfers/new

**Q:** Stock adjustments path  
**A:** Open /inventory/adjustments for quantity/value adjustments with reason codes.  
**Path:** /inventory/adjustments

**Q:** Damaged stock write-off  
**A:** Open /inventory/damages for damage recording — don’t invent write-off quantities.  
**Path:** /inventory/damages

**Q:** Inventory transactions ledger  
**A:** Open /inventory/transactions for movement history (receipts, issues, transfers, adjustments).  
**Path:** /inventory/transactions

**Q:** Deleted products recycle  
**A:** Open /products/deleted to review/restore soft-deleted products when permitted.  
**Path:** /products/deleted

**Q:** Where are UoMs maintained?  
**A:** Open /uoms for units of measure. Don’t invent conversion factors in chat.  
**Path:** /uoms

**Q:** Product categories path  
**A:** Open /categories for the product category tree used in catalogue and reports.  
**Path:** /categories

**Q:** Retail package settings  
**A:** Open /retail-package-settings for pack/size retail packaging rules when enabled.  
**Path:** /retail-package-settings

**Q:** Price history screen  
**A:** Open /price-history or call get_product_price_history for a named/@mentioned product.  
**Path:** /price-history

**Q:** VAT codes reference  
**A:** Open /vats for VAT rate codes used on products and documents.  
**Path:** /vats

**Q:** Items currently in stock report  
**A:** Open /reports/items-currently-in-stock or use get_stock_summary in_stock_items — qty > 0 only, not low-stock.  
**Path:** /reports/items-currently-in-stock

**Q:** Low stock report vs in stock  
**A:** Low stock: /reports/low-stock (at/below reorder). In stock: qty > 0. Never swap those meanings.  
**Path:** /reports/low-stock

**Q:** Stock valuation report  
**A:** Open /reports/stock-valuation or call get_inventory_valuation. Mention branch_name only if multi-branch.  
**Path:** /reports/stock-valuation

**Q:** Stock movement report  
**A:** Open /reports/stock-movement for period movements by product/warehouse.  
**Path:** /reports/stock-movement

**Q:** Stock on hand report  
**A:** Open /reports/stock-on-hand for on-hand balances snapshot.  
**Path:** /reports/stock-on-hand

**Q:** Stock chain report  
**A:** Open /reports/stock-chain for chain/trace views of stock flow when enabled.  
**Path:** /reports/stock-chain

**Q:** Product details in chat for @Flour  
**A:** Call get_product_details with the @mentioned product. Reply with product name only — never SKU/code/id.  
**Path:** /products

**Q:** Stock summary pulse in chat  
**A:** Call get_stock_summary. Use in_stock_items for “what’s in stock”; use low-stock slice only when asked for low stock.  
**Path:** /inventory/stock

**Q:** Can AI invent reorder levels?  
**A:** No. Reorder levels live on product/stock masters. Open /products or /inventory/stock.  
**Path:** /products

**Q:** Multi-branch stock — which branch to show?  
**A:** If tools return multi_branch, mention branch names only (never branch_id). Single-branch orgs: omit branch labels.  
**Path:** /inventory/stock

**Q:** Damages vs adjustments — when which?  
**A:** Use /inventory/damages for damage events; /inventory/adjustments for general qty/value corrections.  
**Path:** /inventory/damages

**Q:** Open LPO still not received  
**A:** Open /reports/open-lpo or /lpo and filter unreceived. Purchasing overview: get_purchasing_overview.  
**Path:** /reports/open-lpo

**Q:** Purchases by supplier report  
**A:** Open /reports/purchases-by-supplier. In chat prefer get_purchasing_overview + supplier name.  
**Path:** /reports/purchases-by-supplier

**Q:** Supplier statement in chat  
**A:** Call get_supplier_statement with supplier name/@mention, or open /reports/supplier-statement.  
**Path:** /reports/supplier-statement

**Q:** Supplier payments screen  
**A:** Open /suppliers/payments to record/allocate supplier payments.  
**Path:** /suppliers/payments

**Q:** Supplier returns path  
**A:** Open /suppliers/returns (or LPO supplier-return flow) for goods returned to suppliers.  
**Path:** /suppliers/returns

**Q:** Purchases hub alias  
**A:** Some menus use /purchases as a hub into LPO/suppliers — prefer find_screen if links differ by industry.  
**Path:** /purchases

**Q:** New LPO create path  
**A:** Open /lpo/new (or /lpo → New). Don’t invent PO numbers.  
**Path:** /lpo/new

**Q:** LPO print  
**A:** From an LPO on /lpo use print actions; templates come from printouts settings.  
**Path:** /lpo

**Q:** Receive against LPO  
**A:** Use LPO receive / GRN receive linked to the LPO — find_screen “receive LPO” or /inventory/receipts/receive.  
**Path:** /inventory/receipts/receive

**Q:** Inventory analytics dashboard  
**A:** Open /inventory for the inventory analytics hub (not the same as /inventory/stock list).  
**Path:** /inventory

**Q:** Product cost vs selling price in AI answers  
**A:** Only quote costs/prices returned by get_product_details / price history tools — never invent margins.  
**Path:** /products

**Q:** UoM conversion wrong on POS  
**A:** Fix pack/UoM on /products and /uoms; don’t tell the user to override qty inventively in chat.  
**Path:** /uoms

## Accounting, cash, bank & payments

**Q:** Chart of accounts path  
**A:** Open /accounting/chart-of-accounts to maintain GL accounts.  
**Path:** /accounting/chart-of-accounts

**Q:** Post a journal entry  
**A:** Open /accounting/journal-entries; debits must equal credits — AI must not invent unbalanced journals.  
**Path:** /accounting/journal-entries

**Q:** General ledger enquiry  
**A:** Open /accounting/general-ledger for account movement enquiry.  
**Path:** /accounting/general-ledger

**Q:** Customer invoices in accounting  
**A:** Open /accounting/customer-invoices for AR invoice documents (distinct from POS receipt).  
**Path:** /accounting/customer-invoices

**Q:** Accounts payable screen  
**A:** Open /accounting/accounts-payable (report also at /reports/accounts-payable).  
**Path:** /accounting/accounts-payable

**Q:** Bank register path  
**A:** Open /accounting/bank-register for bank account movements.  
**Path:** /accounting/bank-register

**Q:** Bank reconciliation  
**A:** Open /accounting/bank-reconciliation to match statements to register lines.  
**Path:** /accounting/bank-reconciliation

**Q:** M-Pesa reconciliation  
**A:** Open /accounting/mpesa-reconciliation for M-Pesa settlement matching.  
**Path:** /accounting/mpesa-reconciliation

**Q:** Equity reconciliation  
**A:** Open /accounting/equity-reconciliation for Equity bank settlement matching when enabled.  
**Path:** /accounting/equity-reconciliation

**Q:** Trial balance  
**A:** Open /accounting/trial-balance. Don’t invent TB figures — use the screen/export.  
**Path:** /accounting/trial-balance

**Q:** Balance sheet screen  
**A:** Open /accounting/balance-sheet for the statement of financial position.  
**Path:** /accounting/balance-sheet

**Q:** P&L accounting vs reports P&L  
**A:** Accounting P&L: /accounting/profit-loss. Report/tool P&L: /reports/profit-loss or get_profit_loss.  
**Path:** /accounting/profit-loss

**Q:** Cash flow statement  
**A:** Open /accounting/cash-flow or /reports/cash-flow. Chat cash snapshot: get_cash_position.  
**Path:** /accounting/cash-flow

**Q:** Fiscal periods  
**A:** Open /accounting/fiscal-periods to open/close periods. Don’t post into closed periods without saying so.  
**Path:** /accounting/fiscal-periods

**Q:** Account mappings  
**A:** Open /accounting/account-mappings for module-to-GL mappings (sales, inventory, tax, etc.).  
**Path:** /accounting/account-mappings

**Q:** Accounting export queue  
**A:** Open /accounting/export-queue for outbound accounting export jobs.  
**Path:** /accounting/export-queue

**Q:** Accounting settings  
**A:** Open /accounting/settings for accounting module options.  
**Path:** /accounting/settings

**Q:** Cash position in chat  
**A:** Call get_cash_position. Never invent cash/bank balances.  
**Path:** /accounting

**Q:** Expense summary in chat  
**A:** Call get_expense_summary for the period; manage expenses at /expenses.  
**Path:** /expenses

**Q:** Subledger reconciliation report  
**A:** Open /reports/subledger-reconciliation to compare subledgers to control accounts.  
**Path:** /reports/subledger-reconciliation

**Q:** Profit loss by product report  
**A:** Open /reports/profit-loss-by-product. Chat may use get_profit_loss top products by gross profit.  
**Path:** /reports/profit-loss-by-product

**Q:** Expenses report path  
**A:** Open /reports/expenses for expense analytics alongside /expenses operational entry.  
**Path:** /reports/expenses

**Q:** Where are M-Pesa paybills configured?  
**A:** Open /admin/mpesa-paybills (and /admin/mpesa-settings for connection options).  
**Path:** /admin/mpesa-paybills

**Q:** M-Pesa settings admin  
**A:** Open /admin/mpesa-settings for STK/C2B and related payment integration settings.  
**Path:** /admin/mpesa-settings

**Q:** Equity accounts admin  
**A:** Open /admin/equity-accounts for Equity payment account setup.  
**Path:** /admin/equity-accounts

**Q:** Payment methods admin  
**A:** Open /admin/payment-methods for tender types available on POS/checkout.  
**Path:** /admin/payment-methods

**Q:** Can AI invent PAYE or NSSF rates?  
**A:** No. Use get_employee_payroll_preview statutory lines / payroll screens — never invent Kenyan statutory rates.  
**Path:** /hr/payroll

**Q:** Investor reports path  
**A:** Open /investors/reports when the investors module is enabled.  
**Path:** /investors/reports

**Q:** Accounting hub dashboard  
**A:** Open /accounting for the accounting module hub.  
**Path:** /accounting

**Q:** What does calculate_scenario do?  
**A:** AI tool calculate_scenario runs what-if style calculations from allowed inputs — still don’t invent base ledger balances.  
**Path:** /dashboard

**Q:** run_insight tool purpose  
**A:** run_insight returns curated operational insights; still verify critical numbers with dedicated tools.  
**Path:** /dashboard

**Q:** Never invent journal account codes  
**A:** Always use names/descriptions from chart of accounts; open /accounting/chart-of-accounts rather than guessing codes.  
**Path:** /accounting/chart-of-accounts

**Q:** Closed fiscal period posting  
**A:** If period is closed on /accounting/fiscal-periods, guide the user to reopen (if permitted) or post to an open period — don’t fake a post.  
**Path:** /accounting/fiscal-periods

**Q:** Customer invoice vs shop debtor invoice  
**A:** Shop Debtors tracks credit sales orders; /accounting/customer-invoices is the AR document view — explain both without inventing balances.  
**Path:** /accounting/customer-invoices

**Q:** Bank transfer payroll report  
**A:** Open /reports/bank-transfer for payroll bank transfer listings after payroll run.  
**Path:** /reports/bank-transfer

## Fulfillment, routes & POD

**Q:** Fulfillment routes master  
**A:** Open /fulfillment/routes for delivery route definitions (legacy CRUD may also use /routes).  
**Path:** /fulfillment/routes

**Q:** Drivers master  
**A:** Open /fulfillment/drivers. Link drivers by name — never invent driver ids in replies.  
**Path:** /fulfillment/drivers

**Q:** Vehicles master  
**A:** Open /fulfillment/vehicles for fleet/vehicle records used on trips.  
**Path:** /fulfillment/vehicles

**Q:** Fulfillment schedules  
**A:** Open /fulfillment/schedules for planned delivery schedules.  
**Path:** /fulfillment/schedules

**Q:** Fulfillment orders list  
**A:** Open /fulfillment/orders (also cancelled/expired variants). Prefer find_screen “fulfillment orders”.  
**Path:** /fulfillment/orders

**Q:** Dispatch board  
**A:** Open /fulfillment/dispatch to assign/release dispatches.  
**Path:** /fulfillment/dispatch

**Q:** Trips screen  
**A:** Open /fulfillment/trips for trip lifecycle (load, depart, settle).  
**Path:** /fulfillment/trips

**Q:** Fulfillment picking  
**A:** Open /fulfillment/picking for pick waves/lists tied to dispatch.  
**Path:** /fulfillment/picking

**Q:** Loading lists  
**A:** Open /fulfillment/loading-lists for load confirmation lists.  
**Path:** /fulfillment/loading-lists

**Q:** POD records  
**A:** Open /fulfillment/pod-records for proof-of-delivery captures.  
**Path:** /fulfillment/pod-records

**Q:** Route orders debrief in chat  
**A:** Call get_route_orders for the date/route. Quote route/customer names — no internal ids.  
**Path:** /fulfillment

**Q:** Route details tool  
**A:** Call get_route_details for a named route; open /fulfillment/routes to edit masters.  
**Path:** /fulfillment/routes

**Q:** Mobile route sales report  
**A:** Open /reports/mobile-route-sales for field route sales performance.  
**Path:** /reports/mobile-route-sales

**Q:** Dispatch trips report  
**A:** Open /reports/dispatch-trips for trip dispatch analytics.  
**Path:** /reports/dispatch-trips

**Q:** Vehicle trip loads report  
**A:** Open /reports/vehicle-trip-loads for loads by vehicle.  
**Path:** /reports/vehicle-trip-loads

**Q:** Driver trip loads report  
**A:** Open /reports/driver-trip-loads for loads by driver name.  
**Path:** /reports/driver-trip-loads

**Q:** Trip cash settlement report  
**A:** Open /reports/trip-cash-settlement for cash settlement vs trip expectations.  
**Path:** /reports/trip-cash-settlement

**Q:** POD compliance report  
**A:** Open /reports/pod-compliance for POD completion compliance.  
**Path:** /reports/pod-compliance

**Q:** Driver deliveries report  
**A:** Open /reports/driver-deliveries for delivery performance by driver.  
**Path:** /reports/driver-deliveries

**Q:** stock_deduct_on trip_pick meaning  
**A:** When platform stock_deduct_on includes trip_pick, stock leaves at pick — confirm org platform config; don’t guess.  
**Path:** /admin

**Q:** Cancelled fulfillment orders  
**A:** Open the cancelled fulfillment orders view under /fulfillment/orders (cancelled filter/route).  
**Path:** /fulfillment/orders

**Q:** Expired fulfillment orders  
**A:** Use the expired orders view under fulfillment orders — find_screen “expired fulfillment”.  
**Path:** /fulfillment/orders

**Q:** Assign driver to trip  
**A:** Use /fulfillment/trips or dispatch board assignment — don’t invent trip numbers.  
**Path:** /fulfillment/trips

**Q:** Customer not on driver’s route  
**A:** Mobile/customer directory is scoped to assigned routes. Unassigned users may see org/branch-wide customers.  
**Path:** /customers

**Q:** Partial POD upload  
**A:** POD captures live on /fulfillment/pod-records; partial deliveries follow status gates — don’t invent statuses.  
**Path:** /fulfillment/pod-records

**Q:** Fulfillment overview dashboard  
**A:** Open /fulfillment for the distribution ops dashboard when enabled.  
**Path:** /fulfillment

**Q:** Legacy routes CRUD  
**A:** Some tenants still use /routes for route CRUD alongside /fulfillment/routes.  
**Path:** /routes

**Q:** Trip depart without load  
**A:** Status gates usually require load/pick before depart — follow trip UI validation; don’t invent overrides.  
**Path:** /fulfillment/trips

**Q:** Who can approve field returns?  
**A:** Depends on roles/manager approvals under Admin → Settings. Prefer find_screen “mobile returns approve”.  
**Path:** /admin/settings

**Q:** get_user_details for a cashier  
**A:** Call get_user_details with username/name; reply with display name/role — never dump internal user ids.  
**Path:** /admin/users

## Hospitality & F&B

**Q:** Hospitality rooms master  
**A:** Open /hospitality/rooms for room inventory and types.  
**Path:** /hospitality/rooms

**Q:** Reservations front office  
**A:** Open /hospitality/reservations for booking calendar/list.  
**Path:** /hospitality/reservations

**Q:** Front desk workspace  
**A:** Open /hospitality/front-desk for check-in/out and day operations.  
**Path:** /hospitality/front-desk

**Q:** Guest folios  
**A:** Open /hospitality/folios for guest account folios and charges.  
**Path:** /hospitality/folios

**Q:** Housekeeping board  
**A:** Open /hospitality/housekeeping to update room dirty/clean/inspect statuses.  
**Path:** /hospitality/housekeeping

**Q:** Hotel F&B orders  
**A:** Open /hospitality/orders/hotel for hotel outlet orders; bar orders at /hospitality/orders/bar.  
**Path:** /hospitality/orders/hotel

**Q:** Bar orders path  
**A:** Open /hospitality/orders/bar (and /hotel-bar-pos for bar POS).  
**Path:** /hospitality/orders/bar

**Q:** Hospitality payments breakdown  
**A:** Open /hospitality/payments-breakdown for tender breakdown in hotel ops.  
**Path:** /hospitality/payments-breakdown

**Q:** Hospitality outlets  
**A:** Open /hospitality/outlets for F&B outlet definitions.  
**Path:** /hospitality/outlets

**Q:** Night audit  
**A:** Open /hospitality/night-audit; fix open checks/folios before retrying a failed audit.  
**Path:** /hospitality/night-audit

**Q:** Hospitality settings  
**A:** Open /hospitality/settings (also /admin/hotel-settings for hotel admin options).  
**Path:** /hospitality/settings

**Q:** Hotel settings under admin  
**A:** Open /admin/hotel-settings for org-level hotel configuration.  
**Path:** /admin/hotel-settings

**Q:** Occupancy / arrivals report  
**A:** Open the hospitality occupancy/arrivals report under /reports (find_screen “occupancy”).  
**Path:** /reports

**Q:** Folio balances report  
**A:** Find_screen “folio balances” or open the hospitality folio balances report under /reports.  
**Path:** /reports

**Q:** Room revenue report  
**A:** Use hospitality room revenue report via find_screen “room revenue”.  
**Path:** /reports

**Q:** Manager flash report  
**A:** Open hospitality manager flash via find_screen “manager flash”.  
**Path:** /reports

**Q:** F&B checks by outlet  
**A:** Use F&B outlet/hour/category reports under hospitality reports — prefer find_screen.  
**Path:** /reports

**Q:** Open checks report  
**A:** Find_screen “open checks” for unclosed F&B checks before night audit.  
**Path:** /reports

**Q:** Voids report hospitality  
**A:** Use hospitality voids report (find_screen “voids”) — don’t invent void reasons/totals.  
**Path:** /reports

**Q:** Hospitality EOD cashier  
**A:** Find_screen “hospitality EOD” / EOD cashier report for outlet cashiers.  
**Path:** /reports

**Q:** Hospitality P&L  
**A:** Open hospitality P&L report when enabled — separate from retail get_profit_loss unless tools say otherwise.  
**Path:** /reports

**Q:** Consumption variance  
**A:** Hospitality consumption variance report compares theoretical vs actual — find_screen “consumption variance”.  
**Path:** /reports

**Q:** Room status dirty after checkout  
**A:** Housekeeping should mark dirty on /hospitality/housekeeping after checkout from front desk.  
**Path:** /hospitality/housekeeping

**Q:** Split folio charges  
**A:** Use folio tools on /hospitality/folios — don’t invent split percentages.  
**Path:** /hospitality/folios

**Q:** Group booking  
**A:** Create/manage via /hospitality/reservations group options when enabled.  
**Path:** /hospitality/reservations

**Q:** Bar POS stock deduct  
**A:** Follow org stock_deduct_on and outlet inventory links — don’t invent bar stock math.  
**Path:** /hotel-bar-pos

**Q:** Hospitality hub  
**A:** Open /hospitality for the hospitality module dashboard.  
**Path:** /hospitality

**Q:** Hotel orders general list  
**A:** Open /hospitality/orders for the combined hospitality orders list.  
**Path:** /hospitality/orders

**Q:** Check-in without reservation  
**A:** Walk-in check-in is done from front desk/reservations flows — prefer find_screen “walk-in”.  
**Path:** /hospitality/front-desk

**Q:** Don’t call Saturday hotel half-day rate a half-day shift  
**A:** Hotel rate plans ≠ HR work shifts. For employees, Saturday alternate shift hours are not half-days.  
**Path:** /hr/shifts

## HR, payroll & attendance

**Q:** HR employees list  
**A:** Open /hr/employees. Use employee names only in chat answers.  
**Path:** /hr/employees

**Q:** Departments master  
**A:** Open /hr/departments for org structure departments.  
**Path:** /hr/departments

**Q:** Positions master  
**A:** Open /hr/positions for job positions.  
**Path:** /hr/positions

**Q:** Attendance today board  
**A:** Open /hr/attendance; history at /hr/attendance/history.  
**Path:** /hr/attendance

**Q:** Attendance clock kiosk  
**A:** Open /hr/attendance-clock (devices also under /admin/attendance-clock).  
**Path:** /hr/attendance-clock

**Q:** Missed punches queue  
**A:** Open /hr/missed-punches to resolve missing clock events.  
**Path:** /hr/missed-punches

**Q:** Duplicate punches  
**A:** Open /hr/duplicate-punches to clean duplicate clock events.  
**Path:** /hr/duplicate-punches

**Q:** Absents list  
**A:** Open /hr/absents for absence tracking.  
**Path:** /hr/absents

**Q:** Lateness list  
**A:** Open /hr/lateness or /reports/lateness-list.  
**Path:** /hr/lateness

**Q:** Leave management  
**A:** Open /hr/leave; leave balance report at /reports/leave-balance — don’t invent balances.  
**Path:** /hr/leave

**Q:** Work shifts  
**A:** Open /hr/shifts. Alternate Saturday hours are scheduled shift hours — never call them half-days.  
**Path:** /hr/shifts

**Q:** Pending overtime  
**A:** Open /hr/pending-overtime for overtime awaiting approval; approved at /hr/overtime.  
**Path:** /hr/pending-overtime

**Q:** Payroll run screen  
**A:** Open /hr/payroll. Preview with get_employee_payroll_preview for a named employee.  
**Path:** /hr/payroll

**Q:** Allowances setup  
**A:** Open /hr/allowances for earning/allowance types.  
**Path:** /hr/allowances

**Q:** Deductions setup  
**A:** Open /hr/deductions for deduction types (non-statutory and configured).  
**Path:** /hr/deductions

**Q:** Cash advances  
**A:** Open /hr/cash-advances for employee advances.  
**Path:** /hr/cash-advances

**Q:** Employee KPIs  
**A:** Open /hr/kpis for KPI tracking when enabled.  
**Path:** /hr/kpis

**Q:** Attendance register report  
**A:** Open /reports/attendance-register.  
**Path:** /reports/attendance-register

**Q:** Payroll summary report  
**A:** Open /reports/payroll-summary after payroll processing.  
**Path:** /reports/payroll-summary

**Q:** Statutory deductions report  
**A:** Open /reports/statutory-deductions — quote report/tool lines only.  
**Path:** /reports/statutory-deductions

**Q:** NSSF remittance report  
**A:** Open /reports/nssf-remittance for NSSF filing extracts.  
**Path:** /reports/nssf-remittance

**Q:** Other deductions report  
**A:** Open /reports/other-deductions for non-statutory deduction listings.  
**Path:** /reports/other-deductions

**Q:** Staff turnover report  
**A:** Open /reports/staff-turnover.  
**Path:** /reports/staff-turnover

**Q:** Headcount report  
**A:** Open /reports/headcount.  
**Path:** /reports/headcount

**Q:** Contract expiry report  
**A:** Open /reports/contract-expiry for upcoming contract ends.  
**Path:** /reports/contract-expiry

**Q:** HR dashboard KPI report  
**A:** Open /reports/hr-dashboard-kpi.  
**Path:** /reports/hr-dashboard-kpi

**Q:** Employee attendance in chat  
**A:** Call get_employee_attendance. Include scheduled_start/end when present; don’t label alternate Saturday hours as half-days.  
**Path:** /hr/attendance

**Q:** Employee details tool  
**A:** Call get_employee_details for a named/@mentioned employee — names only in the reply.  
**Path:** /hr/employees

**Q:** Admin attendance clock devices  
**A:** Open /admin/attendance-clock for device registration/settings.  
**Path:** /admin/attendance-clock

**Q:** HR module hub  
**A:** Open /hr for the HR dashboard hub.  
**Path:** /hr

## KRA/eTIMS, printouts & admin settings

**Q:** KRA settings where?  
**A:** Open /admin/kra-settings for eTIMS/fiscal device and taxpayer settings.  
**Path:** /admin/kra-settings

**Q:** KRA responses log  
**A:** Open /admin/kra-responses to inspect fiscalization responses/errors.  
**Path:** /admin/kra-responses

**Q:** KRA receipts report  
**A:** Open /reports/kra-receipts for fiscalized receipt listings.  
**Path:** /reports/kra-receipts

**Q:** KRA invoices report  
**A:** Open /reports/kra-invoices.  
**Path:** /reports/kra-invoices

**Q:** KRA compliance summary  
**A:** Open /reports/kra-compliance-summary for compliance overview.  
**Path:** /reports/kra-compliance-summary

**Q:** Unfiscalized sales report  
**A:** Open /reports/kra-unfiscalized-sales to find sales missing fiscalization.  
**Path:** /reports/kra-unfiscalized-sales

**Q:** Fiscal offline — what should AI say?  
**A:** Guide user to /admin/kra-settings and /admin/kra-responses; don’t invent CU serials or QR payloads.  
**Path:** /admin/kra-settings

**Q:** Printouts templates tab  
**A:** Admin → Settings → Printouts (/admin/settings?tab=printouts) for receipt/invoice/document layouts.  
**Path:** /admin/settings

**Q:** Company profile admin  
**A:** Open /admin/company for legal name, PIN, address used on documents.  
**Path:** /admin/company

**Q:** License admin  
**A:** Open /admin/license for subscription/license status.  
**Path:** /admin/license

**Q:** Branches admin  
**A:** Open /admin/branches. In AI replies use branch names only when multi-branch.  
**Path:** /admin/branches

**Q:** Themes admin  
**A:** Open /admin/themes for UI theme branding.  
**Path:** /admin/themes

**Q:** Users admin  
**A:** Open /admin/users to create/disable users and assign roles.  
**Path:** /admin/users

**Q:** Roles & permissions  
**A:** Open /admin/roles. Don’t invent permission keys — describe by screen capability.  
**Path:** /admin/roles

**Q:** Audit log  
**A:** Open /admin/audit for user activity/audit trails.  
**Path:** /admin/audit

**Q:** Manager approvals settings  
**A:** Admin → Settings → Manager approvals for below-cost, discount, and similar gates.  
**Path:** /admin/settings

**Q:** Notifications settings  
**A:** Admin → Settings → Notifications; user inbox at /notifications.  
**Path:** /notifications

**Q:** Security settings tab  
**A:** Admin → Settings → Security for password/session related options.  
**Path:** /admin/settings

**Q:** Distribution settings tab  
**A:** Admin → Settings → Distribution for trip/POD/mobile distribution flags.  
**Path:** /admin/settings

**Q:** Mobile settings tab  
**A:** Admin → Settings → Mobile for field app behaviour (routes, GPS, etc.).  
**Path:** /admin/settings

**Q:** Inventory settings tab  
**A:** Admin → Settings → Inventory for stock deduct timing and inventory rules.  
**Path:** /admin/settings

**Q:** Procurement settings  
**A:** Admin → Settings → Procurement for LPO/GRN related options.  
**Path:** /admin/settings

**Q:** HR settings tab  
**A:** Admin → Settings → HR for attendance/payroll related org flags.  
**Path:** /admin/settings

**Q:** Sales settings tab  
**A:** Admin → Settings → Sales for POS/order defaults (including list day windows where configured).  
**Path:** /admin/settings

**Q:** Profile page  
**A:** Open /profile for the signed-in user’s profile preferences.  
**Path:** /profile

## Platform, reports builder & assistant behaviour

**Q:** Platform AI training screen  
**A:** Super-admin: /platform/ai-training for Q&A knowledge notes, bulk paste, Excel upload, export, duplicate merge.  
**Path:** /platform/ai-training

**Q:** AI training credentials  
**A:** Open /platform/ai-training/credentials for provider credentials used by platform AI.  
**Path:** /platform/ai-training/credentials

**Q:** AI usage monitoring  
**A:** Open /platform/ai-usage for token/usage monitoring across orgs.  
**Path:** /platform/ai-usage

**Q:** Platform WhatsApp  
**A:** Open /platform/whatsapp for platform-level WhatsApp connectivity.  
**Path:** /platform/whatsapp

**Q:** Platform mailbox  
**A:** Open /platform/mailbox for shared mailbox ops.  
**Path:** /platform/mailbox

**Q:** Platform email settings  
**A:** Open /platform/email for outbound email configuration.  
**Path:** /platform/email

**Q:** Platform push notifications  
**A:** Open /platform/push for push notification provider settings.  
**Path:** /platform/push

**Q:** Platform invoice templates  
**A:** Open /platform/invoice-templates for SaaS invoice templates.  
**Path:** /platform/invoice-templates

**Q:** Platform invoices  
**A:** Open /platform/invoices for platform billing invoices to tenants.  
**Path:** /platform/invoices

**Q:** Plans & subscriptions  
**A:** Open /platform/plans and /platform/subscriptions for commercial plans.  
**Path:** /platform/subscriptions

**Q:** Platform contracts  
**A:** Open /platform/contracts for tenant contracts.  
**Path:** /platform/contracts

**Q:** Active users platform view  
**A:** Open /platform/active-users for cross-org active sessions/users.  
**Path:** /platform/active-users

**Q:** System issues  
**A:** Open /platform/system-issues for tracked platform incidents.  
**Path:** /platform/system-issues

**Q:** Database backups  
**A:** Open /platform/database-backups for backup jobs/status.  
**Path:** /platform/database-backups

**Q:** Platform health  
**A:** Open /platform/health for health checks.  
**Path:** /platform/health

**Q:** Platform settings  
**A:** Open /platform/settings for global platform flags.  
**Path:** /platform/settings

**Q:** Legacy import converter  
**A:** Open /platform/legacy-import-converter for legacy data conversion utilities.  
**Path:** /platform/legacy-import-converter

**Q:** Org platform settings deep link  
**A:** Open /platform/organizations/{id}/settings for per-tenant platform config (stock_deduct_on, debtor days, etc.).  
**Path:** /platform/organizations

**Q:** Custom report builder  
**A:** Open /reports/builder; after create_custom_report success always share /reports/custom/{id}.  
**Path:** /reports/builder

**Q:** Legacy archive reports  
**A:** Open /reports/legacy-archive for archived legacy report access.  
**Path:** /reports/legacy-archive

**Q:** find_screen when path unknown  
**A:** Call find_screen with the user’s topic words before guessing a URL.  
**Path:** /dashboard

**Q:** search_training_notes first for how-to  
**A:** For process how-tos, call search_training_notes so Platform AI training overrides generic guesses.  
**Path:** /platform/ai-training

**Q:** Charts only on request  
**A:** Do not auto-render charts unless the user asks for a chart, graph, pie, or donut.  
**Path:** /dashboard

**Q:** Sales brief vs sales summary  
**A:** get_sales_brief is a short pulse; get_sales_summary is fuller. Prefer brief for “how are sales today?” style asks.  
**Path:** /sales

**Q:** Business summary dashboard  
**A:** Open /dashboard for the main business summary home.  
**Path:** /dashboard

