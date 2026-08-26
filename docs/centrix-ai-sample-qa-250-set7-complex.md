# Centrix ERP — Sample AI Q&A Set 7 (250 complex multi-part questions)

Companion to Sets 1–6. **All questions here are new.**  
These are **compound / multi-line** prompts: several intents in one message.  
**Expectation:** Centrix AI answers **every part** in one structured reply (labeled sections), batches tools, and does not invent numbers.

**Import tip (Platform → AI training → Bulk paste):** each block is `Q:` / `A:` / optional `Path:`.

**Hard rules baked into answers:**
- Address each sub-question; don’t drop parts.
- Never invent numbers — use listed tools.
- Names only; branch **name** only if multi-branch.
- In stock ≠ low stock; Saturday alternate shift hours ≠ half-day.
- Charts only when asked for a chart/graph/pie/donut.
- Prefer `search_training_notes` + `find_screen` + domain tools; batch tools for compound asks.

---

## Sales, POS, debtors, loyalty & WhatsApp (compound)

**Q:** I need three things at once:  
1) Shop Debtors vs Accounts Receivable  
2) Open partial debtors  
3) How to quote balances without inventing  
**A:** Answer all parts:  
1) Shop Debtors (/sales/shop-debtors/*) = credit sales-order queues; AR (/accounting/accounts-receivable) = ledger view.  
2) Open /sales/shop-debtors/partial (shop_debtors_default_days window).  
3) Call get_debtors_summary / get_customer_statement — quote returned figures only.  
**Path:** /sales/shop-debtors/partial

**Q:** For cashier PURITY today combine:  
- sales by cashier  
- till health  
- X vs Z report paths  
Names only, no user ids.  
**A:** One reply:  
- get_sales_by_cashier for PURITY — quote tool totals.  
- get_till_health — no invented float/cash.  
- X=/sales/x-report mid-session; Z=/sales/z-report end; ops /sales/till-management.  
Display name/username only.  
**Path:** /sales/till-management

**Q:** Customer @Acme Traders:  
statement highlights,  
credit utilization,  
where to pay multiple invoices.  
**A:** Labeled sections:  
- get_customer_statement for @Acme Traders (name only).  
- get_customer_portfolio utilization — never invent %.  
- Pay/allocate via Shop Debtors or find_screen “customer payment”.  
**Path:** /sales/shop-debtors/unpaid

**Q:** Held POS orders + WhatsApp queue + mobile queue:  
where each lives and restore-held steps.  
**A:** Combined map:  
- Restore held: /sales/pos or /pos held queue.  
- WhatsApp: /sales/orders/queues/whatsapp (+ /sales/whatsapp admin).  
- Mobile: /sales/orders/queues/mobile.  
Don’t invent order numbers.  
**Path:** /sales/orders/queues/whatsapp

**Q:** Retail EOD checklist:  
payments breakdown, EOD screen, still need Z?  
**A:** One procedure:  
1) /sales/payments-breakdown  
2) /sales/end-of-day (or /reports/end-of-day)  
3) Z-close /sales/z-report + /sales/till-management  
Totals from get_till_health/reports only.  
**Path:** /sales/end-of-day

**Q:** Loyalty cards + vouchers on one sale:  
screens, apply order, invent points/codes?  
**A:** Policy combo:  
- /sales/loyalty-cards and /sales/vouchers  
- Apply on cart/POS payment step  
- Never invent points or voucher codes  
**Path:** /sales/loyalty-cards

**Q:** Customer credit notes vs supplier credit notes vs returns report.  
**A:** Map:  
- Customer: /sales/returns, /sales/credit-notes  
- Supplier: /sales/credit-notes/supplier, /suppliers/returns  
- Analytics: /reports/returns  
Label which side you mean.  
**Path:** /sales/returns

**Q:** Proforma vs tax invoice vs reprint from existing order.  
**A:** Documents:  
- Proforma = quote-style from order flow  
- Tax invoice = fiscal/sales invoice  
- Reprint from /sales/orders print actions; layouts Admin→Settings→Printouts  
No invented invoice numbers.  
**Path:** /sales/orders

**Q:** Below-cost on POS + manager approvals settings + don’t invent permissions.  
**A:** Compliance:  
- May block/require approval  
- Admin→Settings→Manager approvals  
- Don’t invent permission keys; /admin/roles if access needed  
**Path:** /admin/settings

**Q:** Daily sales + sales by channel + category sales + which chat tools for “sales today?”  
**A:** Bundle:  
- /reports/daily-sales, /reports/sales-by-channel, /reports/category-sales  
- get_sales_brief (short) or get_sales_summary (fuller); scoped tools as needed  
Never invent totals.  
**Path:** /reports/daily-sales

**Q:** VAT this month + price list + price history for @Product.  
**A:** Trio:  
- get_vat_collected or /reports/vat-collected  
- /reports/price-list  
- get_product_price_history for @Product (name only)  
No invented rates/prices.  
**Path:** /reports/vat-collected

**Q:** AR aging vs top debtors vs invoice payments — when each.  
**A:** Compare:  
- /reports/ar-aging = buckets  
- /reports/top-debtors (+ get_debtors_summary) = ranking  
- /reports/invoice-payments = allocation history  
Customer names only.  
**Path:** /reports/ar-aging

**Q:** Legacy orders, legacy returns, legacy archive reports — vs live orders.  
**A:** Legacy trio:  
- /sales/legacy-orders, /sales/legacy-returns  
- /reports/legacy-archive  
- Live ops stay /sales/orders and /sales/returns  
**Path:** /sales/legacy-orders

**Q:** Loading sheets + picking lists + trip charts — which job.  
**A:** Ops map:  
- /sales/loading-sheets  
- /sales/picking-lists or /fulfillment/picking (find_screen “picking”)  
- /sales/trip-charts  
No invented load qty.  
**Path:** /sales/loading-sheets

**Q:** Sales field attendance vs HR field attendance vs payroll attendance.  
**A:** Keep separate:  
- /sales/field-attendance = distribution field  
- /hr/field-attendance + /hr/attendance = HR/payroll  
Don’t merge totals.  
**Path:** /sales/field-attendance

**Q:** Mobile returns approval + mobile expenses approval + relation to master screens.  
**A:** Approvals:  
- find_screen “mobile returns” / “mobile expenses”  
- Masters remain /sales/returns and /expenses  
Don’t invent approval status.  
**Path:** /sales/returns

**Q:** Investors records + investor reports + invent balances?  
**A:** - /investors  
- /investors/reports  
- Never invent balances  
**Path:** /investors

**Q:** Retail /pos vs /sales/pos vs /hotel-bar-pos — who uses which.  
**A:** - Cashier retail: /pos (/pos/tills)  
- Backoffice cart: /sales/pos  
- Hotel/bar: /hotel-bar-pos  
Don’t cross-send staff.  
**Path:** /pos

**Q:** Retail sales reservations vs hotel reservations.  
**A:** - Sales: /sales/reservations  
- Hotel: /hospitality/reservations (+ /hospitality/front-desk)  
Name the module so the wrong calendar isn’t opened.  
**Path:** /hospitality/reservations

**Q:** Shop debtors unpaid/partial/paid + /customers/shop-debtors shortcut + default days.  
**A:** - Three queues under /sales/shop-debtors/*  
- Shortcut /customers/shop-debtors  
- shop_debtors_default_days ≠ orders_list_default_days  
Balances from tools only.  
**Path:** /sales/shop-debtors/unpaid

**Q:** Sales by product for @Product + sales by customer report + no product codes.  
**A:** - get_sales_by_product → Product|Qty|Amount, names only  
- /reports/sales-by-customer  
- Never SKUs/ids  
**Path:** /reports

**Q:** Credit limit exceeded: POS behaviour, where limit lives, collect/escalate.  
**A:** - POS may block/warn  
- Limit on /customers master — never invent  
- Collect/allocate debtors or manager override if allowed; use statement/portfolio tools  
**Path:** /sales/pos

**Q:** Issue voucher + apply voucher + redeem loyalty on same cart — step order.  
**A:** 1) Masters /sales/vouchers and /sales/loyalty-cards  
2) Apply on /sales/pos or /pos payment  
3) No invented codes/points  
**Path:** /sales/pos

**Q:** Payments breakdown vs till sessions report vs get_till_health.  
**A:** - /sales/payments-breakdown = tenders  
- /reports/till-sessions = history  
- get_till_health = live pulse  
No invented cash-up.  
**Path:** /sales/payments-breakdown

**Q:** Inactive customers this quarter + high credit utilization — names only + edit link.  
**A:** get_customer_portfolio → both slices → link /customers  
Never invent inactivity or %.  
**Path:** /customers

**Q:** Route sales today: get_route_orders + mobile route sales report + fulfillment hub.  
**A:** - get_route_orders debrief  
- /reports/mobile-route-sales  
- /fulfillment hub  
Route names not ids.  
**Path:** /fulfillment

**Q:** Restore held + reprint invoice + open returns — ordered checklist.  
**A:** 1) Restore held on /sales/pos or /pos  
2) Reprint from /sales/orders  
3) /sales/returns if credit note next  
No invented docs.  
**Path:** /sales/orders

**Q:** Sales settings vs shop_debtors_default_days vs orders_list_default_days.  
**A:** - Admin→Settings→Sales  
- Debtor days window separate from orders list days  
Never treat as one setting  
**Path:** /admin/settings

**Q:** /sales/whatsapp vs /platform/whatsapp + WhatsApp order queue.  
**A:** - Tenant: /sales/whatsapp + /sales/orders/queues/whatsapp  
- Platform: /platform/whatsapp  
No invented secrets.  
**Path:** /sales/whatsapp

**Q:** Top products gross profit + P&L paths + profit-loss-by-product.  
**A:** - get_profit_loss tops if returned  
- /accounting/profit-loss, /reports/profit-loss, /reports/profit-loss-by-product  
No invented margins.  
**Path:** /reports/profit-loss

**Q:** Till float + X mid-shift + Z at close — new cashier narrative.  
**A:** Open/float /sales/till-management → X /sales/x-report → Z /sales/z-report  
get_till_health for “is till OK?” — no invented float.  
**Path:** /sales/till-management

**Q:** @Naivas customer statement + @Bidco supplier statement — separated sections.  
**A:** Section A: get_customer_statement @Naivas  
Section B: get_supplier_statement @Bidco  
Names only; don’t cross figures.  
**Path:** /reports/customer-statement

**Q:** Credit sale + loyalty + fiscalize — checks without inventing KRA payloads.  
**A:** - Credit limits + Shop Debtors  
- Loyalty /sales/loyalty-cards  
- Fiscal /admin/kra-settings, /admin/kra-responses, /reports/kra-unfiscalized-sales  
No CU QR/serials invented.  
**Path:** /admin/kra-settings

**Q:** Invoice payments report + debtor allocate + AR screen — one flow.  
**A:** Pay/allocate debtors → confirm /accounting/accounts-receivable → audit /reports/invoice-payments  
**Path:** /reports/invoice-payments

**Q:** Price list vs product master vs POS price mismatch debug.  
**A:** - /products + get_product_price_history / /price-history  
- /reports/price-list  
- Fix UoM/pack (/uoms, /retail-package-settings) — don’t invent POS price  
**Path:** /products

**Q:** EOD failed till still open — Z + close + retry EOD.  
**A:** Z /sales/z-report → close /sales/till-management → retry /sales/end-of-day  
get_till_health for open sessions.  
**Path:** /sales/end-of-day

**Q:** Sales by user report vs get_sales_by_cashier — naming rules.  
**A:** Screen /reports/sales-by-user; named cashier → get_sales_by_cashier with name/username only — never user id.  
**Path:** /reports/sales-by-user

**Q:** Supplier credit note + LPO return + open LPO report.  
**A:** - /sales/credit-notes/supplier, /suppliers/returns  
- LPO flows /lpo  
- /reports/open-lpo + get_purchasing_overview  
**Path:** /lpo

**Q:** Vouchers + loyalty cards + payment methods admin — triple map.  
**A:** /sales/vouchers · /sales/loyalty-cards · /admin/payment-methods — no invented tenders/points.  
**Path:** /admin/payment-methods

**Q:** Manager briefing: /dashboard + /sales hub + get_sales_brief/summary.  
**A:** Totals from tools → link /dashboard and /sales → no invented numbers.  
**Path:** /sales

**Q:** Sales by supplier report vs purchases by supplier — buy vs sell.  
**A:** Sell attribution /reports/sales-by-supplier; buy /reports/purchases-by-supplier — label side; no invented attribution.  
**Path:** /reports/sales-by-supplier

**Q:** Till reopen after Z? + new session + payments breakdown.  
**A:** Usually new session after Z — /sales/till-management; don’t invent reopen. Review /sales/payments-breakdown for day tenders.  
**Path:** /sales/till-management

**Q:** Customer portfolio inactive + statement for one named customer + debtors unpaid queue.  
**A:** Portfolio slice → get_customer_statement for the named customer → work /sales/shop-debtors/unpaid.  
**Path:** /customers

**Q:** X-report now + Z later + till sessions history — same day.  
**A:** Now /sales/x-report; close /sales/z-report; history /reports/till-sessions; pulse get_till_health.  
**Path:** /sales/x-report

**Q:** WhatsApp order stuck + sales WhatsApp admin + queue path.  
**A:** Check /sales/orders/queues/whatsapp; config /sales/whatsapp; platform only if super-admin /platform/whatsapp.  
**Path:** /sales/orders/queues/whatsapp

**Q:** Returns analytics + post a customer return + supplier return caution.  
**A:** Post customer /sales/returns; analytics /reports/returns; don’t use supplier return screens for customer.  
**Path:** /sales/returns

**Q:** Proforma print + printouts tab + company header fields.  
**A:** Print from order; layouts /admin/settings?tab=printouts; header /admin/company — no invented letterhead.  
**Path:** /admin/settings

**Q:** Loyalty redeem fails + card master + payment methods.  
**A:** Check /sales/loyalty-cards status; payment step on POS; tenders /admin/payment-methods — no invented points.  
**Path:** /sales/loyalty-cards

**Q:** Multi-invoice payment + AR aging after + top debtors.  
**A:** Allocate payment → refresh aging /reports/ar-aging → ranking /reports/top-debtors; tools for numbers.  
**Path:** /reports/ar-aging

**Q:** POS hold restore + fiscal reprint + unfiscalized sales check.  
**A:** Restore held → reprint order → if fiscal issue /reports/kra-unfiscalized-sales + /admin/kra-responses.  
**Path:** /sales/pos

## Inventory, GRN & purchasing (compound)

**Q:** In stock vs low stock vs valuation — three meanings, don’t mix.  
**A:** 1) In stock qty>0: get_stock_summary in_stock_items / /reports/items-currently-in-stock  
2) Low: /reports/low-stock  
3) Value: get_inventory_valuation / /reports/stock-valuation; branch_name only if multi_branch  
**Path:** /inventory/stock

**Q:** @Product dossier: details + price history + stock pulse.  
**A:** get_product_details + get_product_price_history + get_stock_summary; name only; /products /inventory/stock.  
**Path:** /products

**Q:** LPO create → GRN receive → open LPO monitor.  
**A:** /lpo/new → /inventory/receipts/receive (find_screen GRN) → /reports/open-lpo; get_purchasing_overview.  
**Path:** /inventory/receipts

**Q:** Branch transfer vs adjustment vs damages — choose document.  
**A:** Transfer /inventory/transfers or branch-transfers/new; adjust /inventory/adjustments; damage /inventory/damages.  
**Path:** /inventory/transfers

**Q:** Stock take + transactions ledger + stock movement report.  
**A:** /inventory/stock-take → verify /inventory/transactions → analytics /reports/stock-movement.  
**Path:** /inventory/stock-take

**Q:** Deleted products + categories + UoMs + VAT codes catalogue map.  
**A:** /products/deleted · /categories · /uoms · /vats · /retail-package-settings — no invented conversions/rates.  
**Path:** /products

**Q:** Supplier @XYZ statement + payments + purchases-by-supplier.  
**A:** get_supplier_statement → /suppliers/payments → /reports/purchases-by-supplier; get_purchasing_overview.  
**Path:** /suppliers/payments

**Q:** Multi-branch valuation reply rules + tool.  
**A:** get_inventory_valuation; branch_name only if multi_branch; never branch_id; screen /reports/stock-valuation.  
**Path:** /reports/stock-valuation

**Q:** POS pack mismatch: product + UoM + retail package settings.  
**A:** Fix /products, /uoms, /retail-package-settings — don’t invent pack qty overrides.  
**Path:** /uoms

**Q:** Stock on hand + stock chain + low stock — one sentence each.  
**A:** On-hand snapshot; chain/trace when enabled; low=reorder only — don’t present low as full on-hand.  
**Path:** /reports/stock-on-hand

**Q:** LPO approval waiting + print LPO + supplier tax PIN.  
**A:** Approver on /lpo; print from LPO; PIN on /suppliers master — never invent PIN.  
**Path:** /lpo

**Q:** Inventory analytics hub vs stock list vs adjustments — audiences.  
**A:** Managers /inventory; clerks /inventory/stock; corrections adjustments/damages; chat stock tools.  
**Path:** /inventory

**Q:** /purchases hub vs /lpo vs /suppliers.  
**A:** LPO=/lpo; suppliers=/suppliers; /purchases may alias — find_screen if unsure; get_purchasing_overview.  
**Path:** /purchases

**Q:** After GRN: receipts confirm + transactions + valuation recheck.  
**A:** /inventory/receipts → /inventory/transactions → get_inventory_valuation — no invented deltas.  
**Path:** /inventory/receipts

**Q:** Supplier returns vs warehouse damages.  
**A:** Return to supplier /suppliers/returns; in-warehouse /inventory/damages — wrong screen wrong effect.  
**Path:** /suppliers/returns

**Q:** Buyer morning: purchasing overview + open LPO + new LPO.  
**A:** get_purchasing_overview → /reports/open-lpo → /lpo/new.  
**Path:** /lpo/new

**Q:** Cost vs sell vs margin — what AI may quote.  
**A:** Only from get_product_details / price history / reports — never invent margins.  
**Path:** /products

**Q:** stock_deduct_on create vs complete vs trip_pick — where look, don’t guess.  
**A:** Platform/org inventory settings control deduct moment — confirm tenant config, never assume.  
**Path:** /admin/settings

**Q:** Transfer in transit + branch transfer + transactions trace.  
**A:** Create transfer → follow /inventory/transactions — no invented in-transit qty.  
**Path:** /inventory/transactions

**Q:** VAT codes + VAT collected report + get_vat_collected.  
**A:** /vats on products → get_vat_collected / /reports/vat-collected — no invented VAT.  
**Path:** /vats

**Q:** Old POS price: price history tool/screen + product master.  
**A:** get_product_price_history + /price-history + /products; refresh cart after fix.  
**Path:** /price-history

**Q:** Restore deleted product + fix category + fix UoM checklist.  
**A:** /products/deleted → /categories → /uoms/product UoM → recheck POS.  
**Path:** /products/deleted

**Q:** Wrong stock reasons: damages vs adjustments vs stock take.  
**A:** Damage events /inventory/damages; corrections /inventory/adjustments; full count /inventory/stock-take.  
**Path:** /inventory/adjustments

**Q:** Supplier payment + AP screen + supplier statement close loop.  
**A:** /suppliers/payments → /accounting/accounts-payable → get_supplier_statement.  
**Path:** /accounting/accounts-payable

**Q:** “What do we still have?” in-stock pattern.  
**A:** get_stock_summary in_stock_items and/or /reports/items-currently-in-stock — not low-stock list.  
**Path:** /reports/items-currently-in-stock

**Q:** Mobile pack mismatch field complaint — masters alignment.  
**A:** Align retail-package-settings, uoms, products; mobile uses same masters + routes — no mobile-only invented packs.  
**Path:** /retail-package-settings

**Q:** Inventory settings tab vs platform stock_deduct_on both.  
**A:** Check Admin→Settings→Inventory and platform org stock_deduct_on — don’t guess which wins without looking.  
**Path:** /admin/settings

**Q:** Teach AI GRN naming via training note + path.  
**A:** Add /platform/ai-training note Path /inventory/receipts; runtime search_training_notes.  
**Path:** /platform/ai-training

**Q:** @Sugar in stock? low stock? last price change? — three facts.  
**A:** On-hand tool; low only if below reorder; get_product_price_history — name only.  
**Path:** /products

**Q:** Shop↔warehouse transfer paths + find_screen fallback.  
**A:** /inventory/transfers or branch-transfers/new; else find_screen “transfer”.  
**Path:** /inventory/transfers

**Q:** Prove adjustment and damage both in transactions.  
**A:** Post both docs → /inventory/transactions → optional /reports/stock-movement.  
**Path:** /inventory/transactions

**Q:** Open LPO count + create + supplier returns afternoon wrap.  
**A:** /reports/open-lpo + overview tool → /lpo/new → /suppliers/returns.  
**Path:** /reports/open-lpo

**Q:** Stock valuation by branch names only — compose reply.  
**A:** Call get_inventory_valuation; label branch_name if multi_branch; never branch_id.  
**Path:** /reports/stock-valuation

**Q:** Receive against LPO vs blind GRN — guidance.  
**A:** Prefer LPO-linked receive; blind GRN via /inventory/receipts when allowed — find_screen GRN/receive LPO.  
**Path:** /inventory/receipts/receive

**Q:** Low stock report + reorder on product + purchasing overview.  
**A:** /reports/low-stock → fix reorder on /products → buy via get_purchasing_overview /lpo — no invented reorders.  
**Path:** /reports/low-stock

**Q:** Stock chain + movement + on hand for auditor.  
**A:** Give all three report paths with purposes; numbers from screens only.  
**Path:** /reports/stock-chain

**Q:** Supplier returns credit + inventory receipt reverse confusion.  
**A:** Supplier returns /suppliers/returns; don’t “fix” via random adjustment — use proper docs.  
**Path:** /suppliers/returns

**Q:** Categories sales impact + category master + category-sales report.  
**A:** Maintain /categories; analytics /reports/category-sales; don’t invent category totals.  
**Path:** /categories

**Q:** UoM conversion wrong affecting GRN and POS — dual impact.  
**A:** Fix /uoms and product UoM; recheck GRN receive and POS sell — no invented factors.  
**Path:** /uoms

**Q:** Deleted product restored still missing on POS — checklist.  
**A:** Confirm restore /products/deleted; active flag; category; stock branch; till refresh — no invented SKU.  
**Path:** /products/deleted

## Accounting, cash, bank & payments (compound)

**Q:** Cash position + bank register + bank reconciliation morning trio.  
**A:** get_cash_position → /accounting/bank-register → /accounting/bank-reconciliation (+ M-Pesa/Equity recon if used).  
**Path:** /accounting/bank-reconciliation

**Q:** M-Pesa settings + paybills + M-Pesa reconciliation.  
**A:** /admin/mpesa-settings + /admin/mpesa-paybills → /accounting/mpesa-reconciliation — no invented paybills.  
**Path:** /admin/mpesa-settings

**Q:** Equity accounts + equity reconciliation.  
**A:** /admin/equity-accounts → /accounting/equity-reconciliation.  
**Path:** /accounting/equity-reconciliation

**Q:** Balanced journal + COA + GL verify.  
**A:** /accounting/chart-of-accounts names (no invented codes) → balanced /accounting/journal-entries → /accounting/general-ledger.  
**Path:** /accounting/journal-entries

**Q:** TB + BS + cash flow + P&L four-statement map.  
**A:** trial-balance, balance-sheet, cash-flow, profit-loss under /accounting (+ report equivalents / get_profit_loss).  
**Path:** /accounting

**Q:** Closed fiscal period + mappings + export queue month-end.  
**A:** /accounting/fiscal-periods → /accounting/account-mappings → /accounting/export-queue — don’t fake closed-period posts.  
**Path:** /accounting/fiscal-periods

**Q:** POS receipt vs Shop Debtors vs accounting customer invoices.  
**A:** POS/sales docs vs /sales/shop-debtors/* vs /accounting/customer-invoices — pick layer; balances from tools.  
**Path:** /accounting/customer-invoices

**Q:** Expenses entry + get_expense_summary + expenses report.  
**A:** /expenses → get_expense_summary → /reports/expenses — no invented GL categories.  
**Path:** /expenses

**Q:** AP screen + AP report + supplier payments triangle.  
**A:** /accounting/accounts-payable · /reports/accounts-payable · /suppliers/payments + get_supplier_statement.  
**Path:** /accounting/accounts-payable

**Q:** Subledger reconciliation + AR + AP control check.  
**A:** /reports/subledger-reconciliation then drill AR/AP screens — no invented differences.  
**Path:** /reports/subledger-reconciliation

**Q:** Missing tender on POS: payment methods + till + M-Pesa.  
**A:** /admin/payment-methods → till session → /admin/mpesa-settings/paybills if M-Pesa.  
**Path:** /admin/payment-methods

**Q:** get_profit_loss + accounting P&L + by-product report.  
**A:** Tool + /accounting/profit-loss + /reports/profit-loss + /reports/profit-loss-by-product.  
**Path:** /reports/profit-loss

**Q:** Payroll bank transfer + cash advances + payroll run.  
**A:** /hr/payroll + /hr/cash-advances + /reports/bank-transfer — statutory from payroll tools only.  
**Path:** /hr/payroll

**Q:** Accounting settings + mappings + company PIN.  
**A:** /accounting/settings · /accounting/account-mappings · /admin/company — no invented PIN.  
**Path:** /accounting/settings

**Q:** calculate_scenario vs run_insight vs get_cash_position.  
**A:** Cash facts get_cash_position; insights run_insight; what-if calculate_scenario — never invent ledger bases.  
**Path:** /dashboard

**Q:** Collections war room: debtors summary + aging + top debtors + unpaid queue.  
**A:** get_debtors_summary + /reports/ar-aging + /reports/top-debtors + /sales/shop-debtors/unpaid.  
**Path:** /reports/top-debtors

**Q:** Accountants asking codes: names policy + COA + GL.  
**A:** Prefer names from COA; don’t invent codes; enquire GL after journals.  
**Path:** /accounting/chart-of-accounts

**Q:** M-Pesa recon mismatch triage with paybill + payments breakdown.  
**A:** mpesa-reconciliation → paybill settings → /sales/payments-breakdown.  
**Path:** /accounting/mpesa-reconciliation

**Q:** Cash flow statement vs get_cash_position pulse.  
**A:** Now=get_cash_position; period=/accounting/cash-flow or /reports/cash-flow — answer both if asked.  
**Path:** /accounting/cash-flow

**Q:** Wrong invoice header: customer invoice + printouts + company.  
**A:** Invoice screen + printouts tab + /admin/company.  
**Path:** /admin/settings

**Q:** Multi-tender close: cash position + bank recon + equity recon.  
**A:** get_cash_position + bank-reconciliation + equity-reconciliation (+ mpesa if used).  
**Path:** /accounting

**Q:** Export stuck: queue + periods + mappings.  
**A:** /accounting/export-queue errors + fiscal-periods + account-mappings.  
**Path:** /accounting/export-queue

**Q:** Owner pack: investors reports + P&L + cash.  
**A:** /investors/reports + get_profit_loss/P&L screens + get_cash_position — labeled sections.  
**Path:** /investors/reports

**Q:** Who owes us: Shop Debtors + AR + customer statement layers.  
**A:** Queue unpaid → /accounting/accounts-receivable → get_customer_statement — don’t silently pick one.  
**Path:** /accounting/accounts-receivable

**Q:** Expense category missing — fix without inventing GL.  
**A:** Fix on /expenses / mappings — never invent category/GL codes.  
**Path:** /expenses

**Q:** Statutory payroll lines vs inventing journals for PAYE/NSSF.  
**A:** Quote get_employee_payroll_preview / statutory reports; verify accounting screens — don’t fabricate JE lines.  
**Path:** /hr/payroll

**Q:** Bank register vs journal vs reconciliation relationship.  
**A:** Register movements → journals to GL → recon matches statement — no invented ticks.  
**Path:** /accounting/bank-register

**Q:** Margin sanity: sales by product + PL by product + stock valuation.  
**A:** get_sales_by_product + PL-by-product/get_profit_loss + get_inventory_valuation.  
**Path:** /reports/profit-loss-by-product

**Q:** CFO vs operator: /accounting hub vs /dashboard.  
**A:** Operator /dashboard; CFO /accounting; chat cash+P&L tools.  
**Path:** /accounting

**Q:** Correcting JE in closed period — safe guidance.  
**A:** Check fiscal-periods; reopen if permitted or post open period; balanced JE — don’t claim posted without confirm.  
**Path:** /accounting/fiscal-periods

**Q:** Equity vs M-Pesa vs bank cash — three recon doors.  
**A:** List three recon screens + get_cash_position overview — no invented cleared amounts.  
**Path:** /accounting

**Q:** Trial balance out of balance advice — what to open.  
**A:** /accounting/trial-balance then journals/GL — never invent balancing figures.  
**Path:** /accounting/trial-balance

**Q:** Customer invoice print + KRA fiscal status together.  
**A:** Print accounting/sales invoice; fiscal via kra-settings/responses/unfiscalized report — no invented QR.  
**Path:** /admin/kra-settings

**Q:** AP aging-style payables + supplier statement + payment.  
**A:** AP screens/reports → get_supplier_statement → /suppliers/payments.  
**Path:** /suppliers/payments

**Q:** Cash position negative + expenses summary + P&L — stress brief.  
**A:** get_cash_position + get_expense_summary + get_profit_loss — labeled, no invented stress numbers.  
**Path:** /dashboard

## Fulfillment, routes & POD (compound)

**Q:** Dispatch morning brief: routes drivers vehicles schedules + tools.  
**A:** Paths /fulfillment/routes|drivers|vehicles|schedules + dispatch/trips; tools get_route_orders/details; hub /fulfillment.  
**Path:** /fulfillment

**Q:** Pick→load→depart→POD pipeline + stock_deduct_on caution.  
**A:** picking → loading-lists → trips/dispatch → pod-records; deduct may be trip_pick/load/depart — confirm config.  
**Path:** /fulfillment/trips

**Q:** POD compliance + driver deliveries + trip cash settlement.  
**A:** Three report paths; also vehicle/driver trip loads — no invented %.  
**Path:** /reports/pod-compliance

**Q:** Dispatch trips vs vehicle trip loads vs driver trip loads.  
**A:** Explain each /reports/* purpose; names not ids.  
**Path:** /reports/dispatch-trips

**Q:** Customer in View Customers but missing Save order — route assignment rule.  
**A:** Assigned-route scoping; fix route assignment; don’t invent GPS as cause.  
**Path:** /customers

**Q:** Live vs cancelled vs expired fulfillment orders.  
**A:** /fulfillment/orders + cancelled/expired views; find_screen if needed; no invented statuses.  
**Path:** /fulfillment/orders

**Q:** Assign driver + drivers master + get_user_details for login.  
**A:** /fulfillment/drivers + trip/dispatch assign; get_user_details name/role only.  
**Path:** /fulfillment/drivers

**Q:** Partial delivery + partial POD + status gates.  
**A:** Follow UI gates; POD /fulfillment/pod-records; don’t invent delivered.  
**Path:** /fulfillment/pod-records

**Q:** Field day close: route orders + mobile route sales + sales field attendance.  
**A:** get_route_orders + /reports/mobile-route-sales + /sales/field-attendance.  
**Path:** /reports/mobile-route-sales

**Q:** /routes legacy vs /fulfillment/routes.  
**A:** Prefer fulfillment routes; legacy /routes may exist; find_screen; get_route_details.  
**Path:** /fulfillment/routes

**Q:** Loading lists vs sales loading sheets.  
**A:** /fulfillment/loading-lists vs /sales/loading-sheets; find_screen loading.  
**Path:** /fulfillment/loading-lists

**Q:** Depart blocked: picking + loading then trip.  
**A:** Complete pick+load then depart — no invented overrides.  
**Path:** /fulfillment/trips

**Q:** Driver linked employee + payroll preview + shift wording.  
**A:** Drivers master may link employee; payroll tools; Sat alternate ≠ half-day.  
**Path:** /fulfillment/drivers

**Q:** Schedules vs dispatch vs trips — plan/execute.  
**A:** schedules plan; dispatch assign; trips lifecycle; get_route_orders debrief.  
**Path:** /fulfillment/dispatch

**Q:** Missing POD photo: pod-records + compliance report.  
**A:** Fix captures on pod-records; monitor pod-compliance — no invented %.  
**Path:** /fulfillment/pod-records

**Q:** Route details + route orders + edit routes master.  
**A:** Tools read; /fulfillment/routes write; names only.  
**Path:** /fulfillment/routes

**Q:** trip_pick deduct vs order_completed deduct comparison.  
**A:** Counter vs distribution deduct modes — read stock_deduct_on, don’t assume.  
**Path:** /admin

**Q:** Fulfillment hub + dispatch trips report manager view.  
**A:** /fulfillment + /reports/dispatch-trips (+ related reports).  
**Path:** /fulfillment

**Q:** Mobile returns while trip open — order of operations.  
**A:** Check trip/order status → approval queue → stock follows docs/config.  
**Path:** /sales/returns

**Q:** Empty vehicles master → empty vehicle trip loads.  
**A:** Create /fulfillment/vehicles → assign on trips → then report data.  
**Path:** /fulfillment/vehicles

**Q:** Driver deliveries vs HR lateness — keep metrics separate.  
**A:** /reports/driver-deliveries vs /hr/lateness — only combine if user asked both.  
**Path:** /reports/driver-deliveries

**Q:** Expired fulfillment orders next steps.  
**A:** Open expired view; recreate per policy; no invented revive API.  
**Path:** /fulfillment/orders

**Q:** Sales picking lists vs fulfillment picking for warehouse.  
**A:** Either path; find_screen picking once; no invented wave ids.  
**Path:** /fulfillment/picking

**Q:** Trip cash settlement vs shop till Z — don’t cross.  
**A:** Van /reports/trip-cash-settlement; shop Z+till-management.  
**Path:** /reports/trip-cash-settlement

**Q:** Route visibility end-to-end for mobile Save order.  
**A:** Route master/tools + assigned route filter — explain assignment.  
**Path:** /fulfillment/routes

**Q:** Cancelled fulfillment + recreate sales order caution.  
**A:** Cancelled view → new order per policy — don’t invent undo.  
**Path:** /fulfillment/orders

**Q:** POD compliance low + driver deliveries + trip charts.  
**A:** Reports + /sales/trip-charts ops view — no invented compliance.  
**Path:** /reports/pod-compliance

**Q:** Schedules empty + dispatch empty — setup order.  
**A:** Routes/drivers/vehicles → schedules → dispatch/trips.  
**Path:** /fulfillment/schedules

**Q:** get_route_orders for two routes in one ask — structure.  
**A:** Call tool per route or filtered; labeled sections by route name; no ids.  
**Path:** /fulfillment

**Q:** Loading sheet qty vs stock on hand before depart.  
**A:** Compare loading docs with get_stock_summary — don’t invent load qty.  
**Path:** /sales/loading-sheets

## Hospitality & F&B (compound)

**Q:** Hotel opening: occupancy/arrivals + front desk + HK dirty.  
**A:** find_screen occupancy/arrivals → /hospitality/front-desk & reservations → /hospitality/housekeeping.  
**Path:** /hospitality/front-desk

**Q:** Walk-in → folio → room status sequence.  
**A:** Walk-in desk/reservations → /hospitality/folios → housekeeping status — no invented rates.  
**Path:** /hospitality/folios

**Q:** Hotel F&B vs bar POS vs retail POS.  
**A:** /hospitality/orders/hotel · /hotel-bar-pos · /pos — don’t cross-send.  
**Path:** /hotel-bar-pos

**Q:** Night audit fail recovery: open checks + folios + retry.  
**A:** Close open checks → fix folios → /hospitality/night-audit.  
**Path:** /hospitality/night-audit

**Q:** Outlets + hospitality payments breakdown + EOD cashier.  
**A:** /hospitality/outlets · payments-breakdown · find_screen hospitality EOD.  
**Path:** /hospitality/payments-breakdown

**Q:** GM pack: room revenue + manager flash + hospitality P&L.  
**A:** find_screen each; quote reports only; don’t merge with retail P&L blindly.  
**Path:** /reports

**Q:** Group booking + split folio + rooms inventory.  
**A:** /hospitality/reservations · folios split UI · /hospitality/rooms — no invented split %.  
**Path:** /hospitality/reservations

**Q:** Voids + open checks + bar orders loss control.  
**A:** Open checks → voids report → /hospitality/orders/bar.  
**Path:** /hospitality/orders/bar

**Q:** Checkout desk vs HK dirty responsibility.  
**A:** Checkout front-desk → HK housekeeping → rooms master.  
**Path:** /hospitality/housekeeping

**Q:** Hospitality settings vs admin hotel settings.  
**A:** /hospitality/settings + /admin/hotel-settings — check both if mismatch.  
**Path:** /hospitality/settings

**Q:** Consumption variance + stock + F&B reports.  
**A:** find_screen consumption variance + stock tools + F&B reports — no invented %.  
**Path:** /reports

**Q:** Orders list vs hotel vs bar queues.  
**A:** /hospitality/orders · /orders/hotel · /orders/bar.  
**Path:** /hospitality/orders

**Q:** Folio balances report + folio screen + payments breakdown.  
**A:** Work folios → balances report → payments-breakdown.  
**Path:** /hospitality/folios

**Q:** Hotel rate plan vs HR Saturday shift — wording.  
**A:** Rate plans ≠ shifts; HR alternate Saturday hours ≠ half-days.  
**Path:** /hr/shifts

**Q:** HK statuses + arrivals + front desk rooms board.  
**A:** housekeeping + arrivals report + front-desk — no invented counts.  
**Path:** /hospitality/rooms

**Q:** Bar variance: stock_deduct_on + bar POS + damages.  
**A:** Confirm deduct config → /hotel-bar-pos → damages/adjustments if breakage.  
**Path:** /hotel-bar-pos

**Q:** Close of house: hub + night audit + manager flash.  
**A:** /hospitality → night-audit after open checks → manager flash.  
**Path:** /hospitality

**Q:** Happy path reservation → room → folio.  
**A:** reservations → rooms → check-in → folios.  
**Path:** /hospitality/reservations

**Q:** F&B by outlet/hour/category without inventing.  
**A:** find_screen those reports; open checks before audit; quote only.  
**Path:** /reports

**Q:** Split pay cash+M-Pesa on folio.  
**A:** Folio/payment UI; M-Pesa needs admin config — no invented auth codes.  
**Path:** /hospitality/folios

**Q:** Currency display hotel vs company profile.  
**A:** hotel-settings + hospitality settings + /admin/company; KES default Kenya — no invented FX.  
**Path:** /admin/hotel-settings

**Q:** Open checks + voids then night audit.  
**A:** Close/investigate → retry night-audit.  
**Path:** /hospitality/night-audit

**Q:** Group folio split across rooms caution.  
**A:** Group reservation → folio UI only — don’t claim saved without confirm.  
**Path:** /hospitality/folios

**Q:** Hospitality P&L vs retail get_profit_loss when both exist.  
**A:** Label which P&L; don’t merge blindly.  
**Path:** /reports

**Q:** Bar POS missing outlet: outlets + hotel settings + payment methods.  
**A:** /hospitality/outlets + hotel settings + /admin/payment-methods.  
**Path:** /hospitality/outlets

## HR, payroll & attendance (compound)

**Q:** @Jane dossier: details + attendance schedule times + payroll preview; Sat ≠ half-day.  
**A:** get_employee_details + get_employee_attendance (scheduled times) + get_employee_payroll_preview — names only; no invented statutory.  
**Path:** /hr/employees

**Q:** Missed/duplicate punches + absents + lateness queues.  
**A:** Map four HR exception screens + attendance/history + lateness/attendance reports.  
**Path:** /hr/attendance

**Q:** Shifts + attendance clock + admin devices.  
**A:** /hr/shifts (Sat alternate ≠ half-day) + /hr/attendance-clock + /admin/attendance-clock.  
**Path:** /hr/shifts

**Q:** Leave screen + leave balance report + invent balances?  
**A:** /hr/leave + /reports/leave-balance — don’t invent balances.  
**Path:** /hr/leave

**Q:** Pending OT → OT → payroll.  
**A:** /hr/pending-overtime → /hr/overtime → /hr/payroll + preview tool.  
**Path:** /hr/pending-overtime

**Q:** Allowances + deductions + cash advances config.  
**A:** Three HR screens then payroll — no invented amounts.  
**Path:** /hr/allowances

**Q:** Statutory pack: payroll summary + statutory + NSSF + bank transfer.  
**A:** Four report paths — never invent Kenyan rates.  
**Path:** /reports/payroll-summary

**Q:** Workforce pack: headcount + turnover + contract expiry + HR KPI.  
**A:** Four reports + employees/departments/positions masters.  
**Path:** /reports/headcount

**Q:** Create org structure order: departments → positions → employees.  
**A:** Ordered paths; optional KPIs; names only.  
**Path:** /hr/employees

**Q:** HR vs sales field attendance in HR-led ask.  
**A:** Payroll HR attendance vs /sales/field-attendance — don’t merge.  
**Path:** /hr/attendance

**Q:** Other deductions report + deductions setup + preview.  
**A:** /hr/deductions + preview tool + /reports/other-deductions.  
**Path:** /hr/deductions

**Q:** Employee KPIs vs HR dashboard KPI report.  
**A:** /hr/kpis vs /reports/hr-dashboard-kpi — no invented scores.  
**Path:** /hr/kpis

**Q:** Attendance register vs get_employee_attendance.  
**A:** Team report vs individual tool; respect alternate Saturday wording.  
**Path:** /reports/attendance-register

**Q:** Cash advances + net pay explanation.  
**A:** Advances may reduce net; confirm payroll preview lines — no invented net.  
**Path:** /hr/cash-advances

**Q:** Contract expiry list + employee details drill.  
**A:** /reports/contract-expiry + get_employee_details — no invented dates.  
**Path:** /reports/contract-expiry

**Q:** Lateness report + missed punches first.  
**A:** Resolve missed punches before concluding lateness — no invented minutes.  
**Path:** /hr/lateness

**Q:** HR settings + shifts + devices why schedule ignored.  
**A:** Admin HR settings + shift assignment + clock devices.  
**Path:** /admin/settings

**Q:** Empty bank transfer report checklist.  
**A:** Run payroll → employee bank fields → /reports/bank-transfer.  
**Path:** /reports/bank-transfer

**Q:** Absents vs leave difference.  
**A:** /hr/leave vs /hr/absents — don’t mislabel scheduled off.  
**Path:** /hr/absents

**Q:** Duplicate punches then OT approval.  
**A:** Clean duplicates → recheck attendance → pending OT.  
**Path:** /hr/duplicate-punches

**Q:** Statutory report macro vs one-employee preview micro.  
**A:** Org statutory reports vs get_employee_payroll_preview — no invented rates.  
**Path:** /reports/statutory-deductions

**Q:** HR hub landing people→time→pay.  
**A:** /hr → employees → attendance/shifts → payroll+preview.  
**Path:** /hr

**Q:** Position change + allowances + next payroll warn.  
**A:** Update positions/assignment → review allowances → preview before commit.  
**Path:** /hr/positions

**Q:** Attendance today + history + clock kiosk surfaces.  
**A:** Three surfaces + named employee tool.  
**Path:** /hr/attendance

**Q:** High turnover response paths.  
**A:** Measure reports → departments/positions → hire employees — no invented %.  
**Path:** /reports/staff-turnover

**Q:** NSSF remittance + statutory deductions + payroll summary together.  
**A:** Three reports after payroll — quote only.  
**Path:** /reports/nssf-remittance

**Q:** Pending OT and lateness same week — structure answer.  
**A:** Separate sections: /hr/pending-overtime vs lateness screens/reports — no blended invented hours.  
**Path:** /hr/pending-overtime

**Q:** Clock device list + missed punches + attendance history.  
**A:** /admin/attendance-clock + missed-punches + history — no invented serials.  
**Path:** /admin/attendance-clock

**Q:** Leave balance report empty + leave screen requests.  
**A:** Check /hr/leave setup/balances; report /reports/leave-balance — don’t invent.  
**Path:** /hr/leave

**Q:** Payroll preview statutory lines + refuse invented housing levy rates.  
**A:** Only quote preview/report statutory lines — never invent housing/PAYE/NSSF rates.  
**Path:** /hr/payroll

## KRA, admin, platform & assistant behaviour (compound)

**Q:** Fiscal offline triage: kra-settings → responses → unfiscalized.  
**A:** Ordered paths; also kra receipts/invoices/compliance reports; no invented CU/QR.  
**Path:** /admin/kra-settings

**Q:** KRA receipts + invoices + compliance summary trio.  
**A:** Three /reports/kra-* paths with settings/responses for troubleshoot.  
**Path:** /reports/kra-compliance-summary

**Q:** Printouts + till printing + reprint invoice.  
**A:** printouts tab · till-printing · reprint from /sales/orders.  
**Path:** /admin/settings

**Q:** Users + roles + audit access trio.  
**A:** /admin/users · roles · audit; no invented permission keys; /profile self.  
**Path:** /admin/roles

**Q:** Company + license + branches + themes starter.  
**A:** Four admin paths; branch names only if multi-branch.  
**Path:** /admin/company

**Q:** Where is the setting? — admin settings tabs router.  
**A:** /admin/settings matching tab (sales/mobile/distribution/inventory/procurement/hr/notifications/security/manager approvals); find_screen if unsure.  
**Path:** /admin/settings

**Q:** AI training ops: paste, Excel, delete all, merge duplicates.  
**A:** /platform/ai-training workflows + credentials + usage paths.  
**Path:** /platform/ai-training

**Q:** Compound ask order of ops: training notes → find_screen → domain tools → labeled reply.  
**A:** Teach this sequence; never invent numbers; answer every part.  
**Path:** /dashboard

**Q:** Streaming + fast mode + max tool rounds vs multi-part depth.  
**A:** Explain latency knobs; still cover each part; batch tools.  
**Path:** /admin

**Q:** Charts only if asked + tables OK — viz rules.  
**A:** Tables for results; charts only on chart/graph/pie/donut ask.  
**Path:** /dashboard

**Q:** Multiple @mentions in one question — sectioned reply.  
**A:** Resolve each; names only; labeled sections per entity.  
**Path:** /dashboard

**Q:** page_context + still tool-verify on filtered screen.  
**A:** Hints from page_context; tools authoritative; answer each sub-ask.  
**Path:** /dashboard

**Q:** Compound create LPO + check stock — split read/write.  
**A:** Stock via tools now; create needs confirm — don’t claim saved.  
**Path:** /lpo

**Q:** Platform WhatsApp + mailbox + email + push map.  
**A:** Four platform paths; tenant sales WhatsApp separate.  
**Path:** /platform/whatsapp

**Q:** Plans subscriptions contracts invoices templates commercial pack.  
**A:** Platform commercial paths — no invented prices.  
**Path:** /platform/subscriptions

**Q:** Org list + org settings deduct/debtor days + AI training workspace.  
**A:** /platform/organizations settings + /platform/ai-training.  
**Path:** /platform/organizations

**Q:** Active users + system issues + health + backups ops pack.  
**A:** Four platform ops paths + platform settings.  
**Path:** /platform/health

**Q:** Report builder + create_custom_report link + also sales today.  
**A:** /reports/builder; on success /reports/custom/{id}; sales via get_sales_brief/summary.  
**Path:** /reports/builder

**Q:** Legacy converter + legacy archive + legacy orders.  
**A:** Three legacy paths — don’t mix into live fiscal advice.  
**Path:** /platform/legacy-import-converter

**Q:** Mixed weather + ERP ask — refuse off-topic, answer ERP parts.  
**A:** Brief decline weather; fully answer Centrix parts with tools.  
**Path:** /dashboard

**Q:** Foundation notes + merge duplicates + export before wipe.  
**A:** Hygiene on /platform/ai-training.  
**Path:** /platform/ai-training

**Q:** Tenant AI settings vs platform credentials two layers.  
**A:** Admin AI settings + /platform/ai-training/credentials; prefer deepseek-chat if DeepSeek.  
**Path:** /admin

**Q:** No alert: inbox + notification settings + audit.  
**A:** /notifications + settings tab + /admin/audit.  
**Path:** /notifications

**Q:** Access denied below-cost: approvals + roles + POS.  
**A:** Manager approvals + roles/users + POS — no invented bypass.  
**Path:** /admin/roles

**Q:** Wrong letterhead on fiscal invoice print/fiscal compound.  
**A:** company + printouts + kra-settings/responses.  
**Path:** /admin/kra-responses

**Q:** AI usage + fast mode + streaming cost/latency.  
**A:** /platform/ai-usage + mode flags; still answer all parts of complex Qs.  
**Path:** /platform/ai-usage

**Q:** find_screen EOD retail vs hospitality night audit.  
**A:** Retail EOD paths vs /hospitality/night-audit — disambiguate with context.  
**Path:** /sales/end-of-day

**Q:** Hub router: dashboard sales inventory fulfillment.  
**A:** Four hubs + matching summary tools.  
**Path:** /dashboard

**Q:** Create product + check stock compound split.  
**A:** Read stock/tools; create needs /products confirm.  
**Path:** /products

**Q:** Training Path field importance + bulk paste format.  
**A:** Q/A/Path blocks; search_training_notes prefers tenant wording.  
**Path:** /platform/ai-training

**Q:** Offboard: disable user + roles + audit.  
**A:** users → roles → audit — no invented kill-session API.  
**Path:** /admin/users

**Q:** Licensed? license admin + subscriptions + company.  
**A:** /admin/license + platform subscriptions/invoices + company — no invented expiry.  
**Path:** /admin/license

**Q:** Brand: themes + printouts + company.  
**A:** Three branding doors — no invented assets.  
**Path:** /admin/themes

**Q:** Meta: expected behaviour for multi-part user messages.  
**A:** Parse parts → batch tools → labeled sections → hard rules → partial refuse only off-topic slices.  
**Path:** /dashboard

**Q:** KRA unfiscalized + reprint + till printing after fix.  
**A:** Clear unfiscalized backlog → reprint → till printing settings if receipt issue.  
**Path:** /reports/kra-unfiscalized-sales

**Q:** Security settings + password policy ask + users admin.  
**A:** Settings→Security + /admin/users — don’t invent policy values.  
**Path:** /admin/settings

**Q:** Distribution settings + mobile settings + fulfillment behaviour mismatch.  
**A:** Check both admin tabs + fulfillment screens — don’t invent flags.  
**Path:** /admin/settings

**Q:** Procurement settings + LPO approval + open LPO report.  
**A:** Settings procurement tab + /lpo approvals + /reports/open-lpo.  
**Path:** /lpo

**Q:** Platform health red + system issues + backups — incident brief.  
**A:** /platform/health + system-issues + database-backups — no invented ETA.  
**Path:** /platform/system-issues

**Q:** Custom report exists + find it + also VAT collected.  
**A:** Open /reports/custom/{id} if known else builder list; VAT get_vat_collected — both parts.  
**Path:** /reports/builder

