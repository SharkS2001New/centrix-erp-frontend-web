# Centrix ERP — Sample AI Q&A (250 questions)

Use for Platform → AI training bulk import, demos, or prompt evaluation.  
Answers cite real Centrix paths where possible. Prefer live tools for numbers (sales, VAT, stock, statements).

**Import tip:** each block is `Q:` then `A:` then optional `Path:`.

---

## Sales / customers / credit

**Q:** What were today’s sales?  
**A:** Call get_sales_summary with relative_date=today. Reply with gross sales and transaction count in KES. Link /reports/daily-sales for detail.  
**Path:** /reports/daily-sales

**Q:** Top 10 products sold this week?  
**A:** Use get_sales_by_product or sales brief / product demand for the last 7 days. List products with qty_label and amounts; do not invent UoM.  
**Path:** /reports/sales-by-product

**Q:** Who are my biggest customers this month?  
**A:** Use debtors/sales tools or customer analytics for this_month. Rank by sales or outstanding as asked.  
**Path:** /reports

**Q:** Customer statement for @Customer for August  
**A:** Call get_customer_statement with customer from @mention, month=august (and year). Show balance, purchases_by_product with qty_label, payments.  
**Path:** /customers/{id}

**Q:** What did @Customer buy last month?  
**A:** get_customer_statement for last_month; table of line items / purchases_by_product with qty_label.  
**Path:** /customers/{id}

**Q:** Who is unpaid / overdue right now?  
**A:** Call get_debtors_summary. List top overdue with balances and suggest call list.  
**Path:** /reports (debtors / AR)

**Q:** Check any other Vivian who is unpaid  
**A:** Search debtors/customers named Vivian via get_debtors_summary or customer tools; list unpaid balances. This is an ERP credit question, not off-topic.  
**Path:** /customers

**Q:** Show debtors aging over 60 days  
**A:** Use debtors/aging tools or reports; filter/list buckets > 60 days with amounts.  
**Path:** /reports

**Q:** Record a payment for invoice INV-1024  
**A:** Guide to customer payments / order payment screen; find order INV-1024 and post payment. Confirm amount and method.  
**Path:** /sales

**Q:** How do I create a credit note?  
**A:** Open sales returns / credit notes flow for the original order; explain credit note vs refund.  
**Path:** /sales

**Q:** Sales by cashier today  
**A:** get_sales_by_cashier with relative_date=today; show usernames/full names, never numeric user ids.  
**Path:** /reports/sales-by-user

**Q:** Hold this order and recall it later — how?  
**A:** On POS/backoffice checkout, use Hold; recall from held orders queue on the same till/user rules.  
**Path:** /pos

**Q:** What’s the unpaid balance for @Customer?  
**A:** get_customer_statement or debtors data; quote current balance exactly in KES.  
**Path:** /customers/{id}

**Q:** Compare this week vs last week sales  
**A:** get_sales_summary or sales_brief for both periods; state both totals and delta.  
**Path:** /reports/daily-sales

**Q:** Which customers haven’t ordered in 30 days?  
**A:** Use customer activity / churn-style insights if available; otherwise guide to customer list filters and reports.  
**Path:** /customers

**Q:** How do I set a credit limit?  
**A:** Edit the customer record and set credit limit / terms; orders may block when over limit per org settings.  
**Path:** /customers

**Q:** Open all unpaid invoices for today  
**A:** Sales/debtors queues filtered by unpaid; summarize count and total outstanding.  
**Path:** /sales

**Q:** Generate a collections call list for tomorrow  
**A:** get_debtors_summary / collections playbook style: top overdue, suggested ask amounts.  
**Path:** /reports

**Q:** Did @Customer hit their credit limit?  
**A:** Load customer profile + balance; compare outstanding to credit limit; do not invent limits.  
**Path:** /customers/{id}

**Q:** Sales channels breakdown this month  
**A:** Sales by channel report or summary for this_month (POS, mobile, backend, WhatsApp if used).  
**Path:** /reports

---

## POS / till / cash

**Q:** How do I open a till?  
**A:** POS → select till → enter opening float → start session.  
**Path:** /pos

**Q:** Why is till over/short?  
**A:** Compare expected cash (sales − non-cash + float) to counted close; use get_till_health / till sessions report.  
**Path:** /reports/till-sessions

**Q:** M-Pesa vs cash split today  
**A:** Till health or payments breakdown for today.  
**Path:** /reports/payments-breakdown

**Q:** How do I blind-close a till?  
**A:** Close session without seeing expected amount if blind-close is enabled in settings; count cash then submit.  
**Path:** /pos

**Q:** Float for till 2 looks wrong  
**A:** Check till session opening float and adjustments; open till sessions report.  
**Path:** /reports/till-sessions

**Q:** Reprint the last receipt  
**A:** From completed sale / POS history, Reprint; print agent must be running on the till PC.  
**Path:** /pos

**Q:** How do hold orders work on POS?  
**A:** Hold parks the cart; recall from Held; stock reservation rules depend on org inventory settings.  
**Path:** /pos

**Q:** End of day for my till  
**A:** Run EOD / close till session; review VAT, tenders, variance.  
**Path:** /reports

**Q:** Centrix Print Agent offline  
**A:** On the till PC open print agent status; restart Windows service; Test connection in Local printing settings.  
**Path:** /admin (Local printing)

**Q:** Can two cashiers share one till session?  
**A:** Usually one open session per till; follow org policy — explain single-session rules.  
**Path:** /pos

---

## Inventory / products / UoM

**Q:** What’s low stock right now?  
**A:** get_stock_summary; list low_stock items with qty_label; link /reports/low-stock.  
**Path:** /reports/low-stock

**Q:** Stock on hand for @Product  
**A:** get_product_details / stock tools; quote stock_on_hand_label exactly.  
**Path:** /inventory/stock

**Q:** How is qty shown — kg/bags/UoM?  
**A:** Stock is stored in base UoM; display uses qty_label (e.g. "2 Bag, 40 kg"). Use get_product_details; never invent packs.  
**Path:** /uoms

**Q:** Product details and packaging for HALISI-20L  
**A:** get_product_details for that code: UoM hierarchy + retail packaging tiers.  
**Path:** /products/HALISI-20L

**Q:** Transfer stock shop to store  
**A:** Inventory transfer screen; choose product, qty in base/display units, from shop to store.  
**Path:** /inventory

**Q:** How do I do a stock take?  
**A:** Stock take / count workflow; post variances to adjust on-hand.  
**Path:** /inventory

**Q:** Who adjusted stock yesterday?  
**A:** Stock adjustment / audit reports for yesterday.  
**Path:** /inventory

**Q:** Fast movers last 14 days  
**A:** Stock pulse / sales by product for 14 days.  
**Path:** /reports/sales-by-product

**Q:** Dead stock / slow movers  
**A:** Slow-mover or inventory insights; list SKUs with low velocity vs stock.  
**Path:** /inventory/stock

**Q:** Create product WIDGET-01 selling at 500  
**A:** Create product with code/name/price, subcategory, UoM, VAT; confirm create form if AI create is used.  
**Path:** /products

**Q:** Where do I set reorder point?  
**A:** Product edit → reorder point; low stock uses per-product and/or global threshold.  
**Path:** /products

**Q:** Can we sell below cost?  
**A:** Depends on org settings and discount approvals; margin watchdog flags below-cost lines.  
**Path:** /admin (sales settings)

**Q:** Difference between UoM and retail packaging?  
**A:** UoM = how stock is counted; retail packaging = POS retail markup tiers at /retail-package-settings.  
**Path:** /retail-package-settings

**Q:** Is this product sold in bags or kg?  
**A:** get_product_details; explain conversion_factor and labels; quote qty_label from stock.  
**Path:** /uoms

**Q:** Receive goods against LPO  
**A:** GRN at /inventory/receipts against the LPO; quantities update stock in base units.  
**Path:** /inventory/receipts

**Q:** Allow negative stock?  
**A:** Org inventory setting allow_below_stock / allow negative; warn about oversell risk.  
**Path:** /admin

**Q:** Stock reservation on POS cart  
**A:** When enabled, cart lines reserve stock until checkout/clear/expiry.  
**Path:** /inventory

**Q:** Where is current stock by branch?  
**A:** /inventory/stock with branch filter.  
**Path:** /inventory/stock

**Q:** Convert 3 bags to base units  
**A:** Use product UoM conversion_factor (e.g. 1 bag = 50 kg → 150 kg base); do not guess factor.  
**Path:** /uoms

**Q:** Print bin labels / stock list  
**A:** Stock report export or print from inventory screens; ensure print agent if local print.  
**Path:** /inventory/stock

---

## Purchasing / suppliers / LPO

**Q:** Supplier statement for @Supplier for August  
**A:** get_supplier_statement with period; balance due, LPOs, payments, purchases_by_product with qty_label.  
**Path:** /reports/supplier-statement

**Q:** What did we buy from @Supplier this month?  
**A:** get_supplier_statement this_month; table of products and amounts.  
**Path:** /suppliers/{id}

**Q:** Open LPOs awaiting approval  
**A:** LPO list filtered by awaiting approval; count and link /lpo.  
**Path:** /lpo

**Q:** How do I receive an LPO / GRN?  
**A:** Open LPO → receive / GRN at /inventory/receipts; enter received qty.  
**Path:** /inventory/receipts

**Q:** Balance due to @Supplier  
**A:** get_supplier_statement summary current_balance_due.  
**Path:** /suppliers/{id}

**Q:** Create an LPO for low-stock items  
**A:** Suggest draft from low stock + velocity; user confirms supplier and lines on /lpo create.  
**Path:** /lpo

**Q:** Which suppliers are overdue for payment?  
**A:** AP / supplier balances; list positive balance_due.  
**Path:** /suppliers

**Q:** Link supplier payment to LPO  
**A:** Supplier payments screen; allocate payment to open LPOs.  
**Path:** /suppliers

**Q:** Supplier return  
**A:** Supplier return document against received goods; adjusts stock and AP as configured.  
**Path:** /lpo

**Q:** Where are suppliers managed?  
**A:** /suppliers — create, edit, statements, payments.  
**Path:** /suppliers

**Q:** LPO status meaning  
**A:** Draft → approval → ordered → partial/received → closed/cancelled per workflow statuses.  
**Path:** /lpo

**Q:** Approve this LPO  
**A:** Open approval request / LPO approval action if user has permission.  
**Path:** /lpo

**Q:** Last cost price for @Product  
**A:** Product details / last purchase cost from LPO lines.  
**Path:** /products/{code}

**Q:** Purchase orders this week  
**A:** get_purchasing_overview or LPO list filtered by week.  
**Path:** /lpo

**Q:** Supplier tax PIN  
**A:** On supplier profile (tax_pin); needed for compliance docs.  
**Path:** /suppliers/{id}

---

## Accounting / VAT / finance

**Q:** How much VAT sales do I have for this month?  
**A:** get_vat_collected relative_date=this_month; quote vat_collected_total and taxable_sales_gross in KES; link /reports/vat-collected.  
**Path:** /reports/vat-collected

**Q:** Total VAT I need to pay for August  
**A:** get_vat_collected month=august year=…; this is output VAT on Centrix sales. Mention net KRA payable may subtract input VAT if tracked in accounting.  
**Path:** /reports/vat-collected

**Q:** Open VAT collected report  
**A:** Direct path /reports/vat-collected with date range.  
**Path:** /reports/vat-collected

**Q:** How do I post a journal entry?  
**A:** Accounting journals screen; debit/credit balanced entry.  
**Path:** /accounting (journals)

**Q:** Chart of accounts — where is it?  
**A:** Accounting → chart of accounts.  
**Path:** /accounting

**Q:** Expense claims pending approval  
**A:** Expenses / approvals queue.  
**Path:** /expenses

**Q:** VAT summary for this month  
**A:** Same as get_vat_collected this_month + report link.  
**Path:** /reports/vat-collected

**Q:** Bank reconciliation status  
**A:** Banking / reconciliation screens; unmatched M-Pesa if used.  
**Path:** /accounting

**Q:** Profit this month vs last month  
**A:** P&L / sales vs COGS reports for both months; do not invent.  
**Path:** /reports

**Q:** How do customer receipts hit the books?  
**A:** Payments reduce AR; postings follow finance settings / payment methods.  
**Path:** /accounting

**Q:** KRA / eTIMS invoice failed  
**A:** Check KRA compliance report and sale fiscalization error; retry or fix PIN/item tax.  
**Path:** /reports/kra-compliance-summary

**Q:** Discount summary this week  
**A:** /reports/discount-summary for the range.  
**Path:** /reports/discount-summary

**Q:** Payment collection report  
**A:** /reports/payment-collection.  
**Path:** /reports/payment-collection

**Q:** What is output vs input VAT in Centrix?  
**A:** VAT collected report = VAT on sales (output). Purchase/input VAT may live in AP/accounting, not that report.  
**Path:** /reports/vat-collected

**Q:** Expenses by category this month  
**A:** Expense reports filtered this_month.  
**Path:** /expenses

---

## HR / payroll / attendance

**Q:** Employee basic salary for @Employee  
**A:** get_employee_details; use pay.basic_salary / base_salary — never invent.  
**Path:** /hr/employees/{id}

**Q:** Who was absent today?  
**A:** get_employee_attendance relative_date=today; list absents.  
**Path:** /hr/attendance

**Q:** Attendance for August for EMP#0001  
**A:** get_employee_attendance with employee code + month/year.  
**Path:** /reports/attendance-register

**Q:** How do I sync Hikvision punches?  
**A:** CentrixAttendanceAgent on office LAN PC must be Running and checking in; Manage Hikvision device; sync attendance.  
**Path:** /hr (attendance clock devices)

**Q:** Leave balance for @Employee  
**A:** Leave balances report or employee leave tab.  
**Path:** /reports/leave-balance

**Q:** Run payroll for this month — steps?
**A:** Ensure attendance → approve pending overtime (only approved OT is paid) → payroll run → review statutory → approve/pay; preview with get_employee_payroll_preview.  
**Path:** /hr/payroll

**Q:** Does pending overtime count in payroll?
**A:** No — only approved overtime is included in payroll runs and get_employee_payroll_preview. Pending OT must be approved first; denied OT never pays.  
**Path:** /hr/payroll

**Q:** Show expenses as a pie chart
**A:** Only when the user asks for a chart/graph/pie — use a markdown table plus optional ```chart fence with type matching their request (pie/donut/bar). items must be separate objects. UI also has Bar/Pie/Donut toggle. Otherwise table only.  
**Path:** /expenses

**Q:** NSSF / PAYE deductions explained  
**A:** Statutory from payroll engine; reports under statutory deductions / NSSF remittance.  
**Path:** /reports/statutory-deductions

**Q:** Who is on leave next week?  
**A:** Leave calendar / approved leave days in range.  
**Path:** /hr

**Q:** Clock-in device offline — what now?  
**A:** Check agent last check-in; open http://127.0.0.1:9251 on office PC; Test connection; do not re-download after normal reboot.  
**Path:** /hr

**Q:** Add a new employee with shift  
**A:** /hr/employees create; assign department, position, shift, base salary.  
**Path:** /hr/employees

**Q:** How much would @Employee earn this month?  
**A:** get_employee_payroll_preview for year_month; quote engine totals, days, SHA/PAYE/NSSF.  
**Path:** /hr/payroll

**Q:** Map fingerprint ID to employee  
**A:** Hikvision device → employees sync/map; employee code on terminal must match Centrix.  
**Path:** /hr

**Q:** Forgotten clock-out  
**A:** Attendance exception / reconciler; HR can correct per policy.  
**Path:** /hr/attendance

**Q:** Bank transfer file for payroll  
**A:** /reports/bank-transfer after payroll.  
**Path:** /reports/bank-transfer

**Q:** Headcount by department  
**A:** /reports/headcount.  
**Path:** /reports/headcount

**Q:** Contract expiry this quarter  
**A:** /reports/contract-expiry.  
**Path:** /reports/contract-expiry

**Q:** Staff turnover report  
**A:** /reports/staff-turnover.  
**Path:** /reports/staff-turnover

**Q:** Does this employee pay SHA?  
**A:** get_employee_details → pays_sha flag.  
**Path:** /hr/employees/{id}

**Q:** Shift times for @Employee  
**A:** get_employee_details shift schedule.  
**Path:** /hr/employees/{id}

**Q:** Attendance agent last check-in blank  
**A:** Agent never reached Centrix — reinstall package for device once; verify API URL/token and internet.  
**Path:** /hr

---

## Logistics / routes / mobile sales

**Q:** Routes for today  
**A:** Dispatch / routes screens for today.  
**Path:** /fulfillment or routes

**Q:** Unpaid orders on the van route  
**A:** get_route_orders; highlight unpaid.  
**Path:** /sales (mobile/route)

**Q:** Dispatch status for order SO-889  
**A:** Open order fulfillment status / trip load.  
**Path:** /fulfillment

**Q:** Driver trips not closed  
**A:** Dispatch trips summary; list open trips.  
**Path:** /reports

**Q:** Field rep attendance vs office  
**A:** Mobile/field attendance HR sync vs clock devices.  
**Path:** /hr/attendance

**Q:** How does mobile sales checkout work?  
**A:** Mobile app cart → checkout with GPS/customer rules; stock/credit checks apply.  
**Path:** mobile sales app

**Q:** Route loading summary  
**A:** Route loading report.  
**Path:** /reports

**Q:** Delivered vs booked on route yesterday  
**A:** get_route_orders relative yesterday / debrief.  
**Path:** /reports

**Q:** Assign order to vehicle  
**A:** Fulfillment / trip load assign vehicle & driver.  
**Path:** /fulfillment

**Q:** Mobile order failed stock check  
**A:** Insufficient available stock (on-hand − reservations); replenish or reduce qty.  
**Path:** /inventory/stock

---

## Reports / AI digests / builder

**Q:** Open the low stock report  
**A:** /reports/low-stock  
**Path:** /reports/low-stock

**Q:** Daily sales report for yesterday  
**A:** /reports/daily-sales with yesterday; or get_sales_summary.  
**Path:** /reports/daily-sales

**Q:** Sales by user this week  
**A:** /reports/sales-by-user or get_sales_by_cashier for range.  
**Path:** /reports/sales-by-user

**Q:** Build a custom report of unpaid invoices  
**A:** create_custom_report after naming; open /reports/custom/{id}.  
**Path:** /reports/builder

**Q:** Explain this report screen  
**A:** Use on-screen AI explain / visible filters; summarize KPIs on the page.  
**Path:** current report

**Q:** Turn on morning stock pulse digest  
**A:** Settings → AI → enable Stock pulse + email/WhatsApp recipients + schedule time.  
**Path:** /admin (AI settings)

**Q:** What AI digests can managers get?  
**A:** Stock pulse, sales brief, debtors, exception radar, till health, collections, anomaly, forecast, branch benchmarks, etc.  
**Path:** /admin (AI)

**Q:** Report hub  
**A:** /reports lists available reports by permission.  
**Path:** /reports

**Q:** Export VAT collected to Excel  
**A:** Open /reports/vat-collected → export.  
**Path:** /reports/vat-collected

**Q:** Manager flash / hospitality KPI  
**A:** Hospitality report paths if module enabled.  
**Path:** /reports/hospitality-manager-flash

---

## Admin / settings / users / security

**Q:** How do I add a user and role?  
**A:** Admin → Users; set role, login channels (backoffice/POS/mobile), branch/till.  
**Path:** /admin/users

**Q:** Permissions for stock clerk  
**A:** Roles → grant inventory/stock permissions only; test with that role.  
**Path:** /admin/roles

**Q:** Enable Investors for this organization  
**A:** Platform/org module settings enable_investors; then Investors menu appears.  
**Path:** /platform or org settings

**Q:** Where are notification / SMS settings?  
**A:** Org messaging / notification settings (Africa’s Talking, templates).  
**Path:** /admin

**Q:** Change organization logo / theme  
**A:** Branding / theme settings.  
**Path:** /admin

**Q:** Branch list and managers  
**A:** /admin/branches; assign manager employee.  
**Path:** /admin/branches

**Q:** Reset a user’s password  
**A:** User admin reset or forgot-password flow; sessions refresh.  
**Path:** /admin/users

**Q:** Difference between POS and backoffice login?  
**A:** login_channel restricts APIs/screens; POS till vs full backoffice.  
**Path:** /admin/users

**Q:** Session idle timeout  
**A:** Org security settings session_idle_minutes; lock screen vs server revoke.  
**Path:** /admin

**Q:** Download CentrixAttendanceAgent  
**A:** Attendance clock device → Download agent once; install with BUILD-AND-INSTALL.bat as Admin.  
**Path:** /hr

**Q:** AI Insights not showing  
**A:** Enable AI Insights in Settings → AI; user needs AI permission; credentials configured.  
**Path:** /admin (AI)

**Q:** Platform AI training notes  
**A:** Platform → AI training: add Q&A, bulk paste, install foundation notes.  
**Path:** /platform/ai-training

**Q:** Organization license expired  
**A:** Users blocked until platform renews licence; contact platform admin.  
**Path:** /platform

**Q:** Two-factor authentication  
**A:** User security / org policy; email or authenticator when enabled.  
**Path:** /admin

**Q:** Act as another organization (platform)  
**A:** Super-admin act-as org for support; tenant data stays isolated.  
**Path:** /platform

---

## Investors

**Q:** How do I add an investor?  
**A:** /investors → Add investor (name required). Amounts come later as contributions.  
**Path:** /investors

**Q:** Record cash contribution for an investor  
**A:** Open investor → Add contribution → Type Cash + amount + date.  
**Path:** /investors/{id}

**Q:** Record stock contribution (paid supplier)  
**A:** Add contribution → Type Stock + amount; then allocate products / link LPO.  
**Path:** /investors/{id}

**Q:** Investor stock value vs cash pool  
**A:** List shows Cash in, Stock in, Stock value (on hand), Cash pool; badges Cash/Stock.  
**Path:** /investors

**Q:** Investor sales and profit report  
**A:** Investor detail → Sales & profit / reports tabs.  
**Path:** /investors/{id}

**Q:** Why are there no amount fields on Add investor?  
**A:** By design: create profile first; capital is contributions (cash or stock).  
**Path:** /investors

**Q:** Link investor spend to expense  
**A:** Investor → Link spend.  
**Path:** /investors/{id}

**Q:** Allocate LPO lines to investor batch  
**A:** Stock contribution → Allocate products (from LPO or manual lines).  
**Path:** /investors/{id}

**Q:** Investors module disabled  
**A:** Ask platform to enable Investors for the org.  
**Path:** /platform

**Q:** Open batches for investor  
**A:** Investor → Product batches tab; qty remaining / stock value.  
**Path:** /investors/{id}

---

## Hospitality (if enabled)

**Q:** Room availability tonight  
**A:** /hospitality/rooms or occupancy report.  
**Path:** /hospitality/rooms

**Q:** Check in a guest  
**A:** Front desk check-in → folio.  
**Path:** /hospitality/front-desk

**Q:** Night audit — what does it do?  
**A:** Closes hotel day, posts room charges, rolls date; run from night audit screen.  
**Path:** /hospitality/night-audit

**Q:** POS for restaurant outlet  
**A:** Hospitality outlets / hotel POS for F&B checks.  
**Path:** /hospitality/outlets

**Q:** Open folio balances  
**A:** /reports/hospitality-folio-balances.  
**Path:** /reports/hospitality-folio-balances

**Q:** Arrivals and departures today  
**A:** /reports/hospitality-arrivals-departures.  
**Path:** /reports/hospitality-arrivals-departures

**Q:** Housekeeping room status  
**A:** /hospitality/housekeeping.  
**Path:** /hospitality/housekeeping

**Q:** F&B check sales  
**A:** /reports/hospitality-fnb-checks.  
**Path:** /reports/hospitality-fnb-checks

**Q:** Reservation for walk-in  
**A:** /hospitality/reservations create then check in.  
**Path:** /hospitality/reservations

**Q:** Manager flash report  
**A:** /reports/hospitality-manager-flash.  
**Path:** /reports/hospitality-manager-flash

---

## Returns / credits / WhatsApp / integrations

**Q:** Process a customer return  
**A:** Sales return against order; stock and credit/refund per policy.  
**Path:** /sales

**Q:** Credit note vs refund  
**A:** Credit note reduces AR / issues credit; refund returns cash/M-Pesa.  
**Path:** /sales

**Q:** eTIMS / KRA invoice failed — why?  
**A:** Check compliance log, item tax, customer PIN, connectivity; open KRA report.  
**Path:** /reports/kra-compliance-summary

**Q:** How do tax rates apply on POS?  
**A:** Product VAT rate; totals include product_vat; VAT collected rolls to report.  
**Path:** /products

**Q:** WhatsApp order came in — where is it?  
**A:** WhatsApp conversations / sales orders from WhatsApp channel.  
**Path:** /admin (WhatsApp) or /sales

**Q:** Print agent not connecting  
**A:** Till PC print agent service + Test connection; firewall/localhost port.  
**Path:** /admin

**Q:** Attendance agent last check-in?  
**A:** Device screen shows last_seen; must be recent for online.  
**Path:** /hr

**Q:** M-Pesa payment not matched to invoice  
**A:** M-Pesa match queue / manual allocate to sale.  
**Path:** /sales or accounting

**Q:** WhatsApp bot handoff  
**A:** Resolve handoff in WhatsApp admin; agent resumes or human closes.  
**Path:** /admin

**Q:** Database backup status  
**A:** Platform/org backup settings; confirm last successful backup.  
**Path:** /platform

---

## Navigation / how-to / AI behaviour

**Q:** Where do I find customer statements?  
**A:** Customer profile or ask AI get_customer_statement; reports may include AR.  
**Path:** /customers

**Q:** How do I approve an LPO?  
**A:** Open LPO approval / action centre with purchasing.approve permission.  
**Path:** /lpo

**Q:** Take me to payroll settings  
**A:** HR payroll settings / org HR module settings.  
**Path:** /hr

**Q:** Workflow to receive goods  
**A:** Create LPO → approve → GRN receive → stock updates.  
**Path:** /inventory/receipts

**Q:** Explain credit limits for customers  
**A:** Limit on customer; checkout blocks or warns when AR + cart exceeds limit.  
**Path:** /customers

**Q:** Map fingerprint users to employees  
**A:** Hikvision manage → map device user no to employee code.  
**Path:** /hr

**Q:** Where is the collections playbook?  
**A:** AI Insights collections digest and/or debtors reports.  
**Path:** /reports

**Q:** Can AI draft a reorder LPO from low stock?  
**A:** Procurement companion / suggest lines; user must confirm create on /lpo.  
**Path:** /lpo

**Q:** What can Centrix AI help with?  
**A:** ERP only: sales, stock, purchasing, accounting, HR, logistics, reports, admin — not weather/trivia.  
**Path:** /

**Q:** Switch AI workspace  
**A:** Top bar workspace switcher to change module focus for create actions.  
**Path:** /

**Q:** Confirm AI create product  
**A:** Review draft fields (name, UoM, VAT, price) then Confirm; AI will not invent codes silently.  
**Path:** /products

**Q:** Why did AI say it can only help with Centrix ERP?  
**A:** Off-topic guard; rephrase as ERP task. Unpaid customer names are in-scope.  
**Path:** /

**Q:** Find screen for suppliers  
**A:** find_screen → /suppliers.  
**Path:** /suppliers

**Q:** Find screen for GRN  
**A:** /inventory/receipts.  
**Path:** /inventory/receipts

**Q:** Open report builder  
**A:** /reports/builder.  
**Path:** /reports/builder

**Q:** Show me modules we have enabled  
**A:** From capabilities / module catalog in context; list enabled modules only.  
**Path:** /admin

**Q:** Keyboard shortcut for AI assist  
**A:** Use floating assistant / AI panel in app chrome (per UI).  
**Path:** /

**Q:** Train AI that bags are 50kg  
**A:** Platform AI training note or product UoM conversion_factor=50; do not hardcode in chat.  
**Path:** /platform/ai-training

**Q:** Bulk import training Q&A  
**A:** Platform → AI training → bulk paste Q:/A: pairs.  
**Path:** /platform/ai-training

**Q:** Install foundation AI notes  
**A:** Platform → AI training → Install foundation notes (safe skip existing).  
**Path:** /platform/ai-training

---

## Mixed scenario / edge cases

**Q:** Sales today and low stock in one answer  
**A:** Call get_sales_summary today + get_stock_summary; two short sections with paths.  
**Path:** /reports

**Q:** VAT August and top debtors  
**A:** get_vat_collected for August + get_debtors_summary; do not mix figures.  
**Path:** /reports/vat-collected

**Q:** @Product sales and current stock  
**A:** get_sales_by_product + get_product_details stock labels.  
**Path:** /products

**Q:** @Customer balance and last purchases  
**A:** get_customer_statement.  
**Path:** /customers/{id}

**Q:** @Supplier AP and open LPOs  
**A:** get_supplier_statement.  
**Path:** /suppliers/{id}

**Q:** @Employee salary and August attendance  
**A:** get_employee_details + get_employee_attendance month.  
**Path:** /hr/employees/{id}

**Q:** Payroll preview if absent 3 days  
**A:** get_employee_payroll_preview — engine applies attendance proration.  
**Path:** /hr/payroll

**Q:** Branch comparison sales  
**A:** Branch/till benchmarks or sales by branch reports.  
**Path:** /reports

**Q:** Unusual discounts yesterday  
**A:** Exception radar / margin watchdog / discount summary.  
**Path:** /reports/discount-summary

**Q:** After-hours sales anomaly  
**A:** Anomaly detection insight or sales filtered by time if available.  
**Path:** /reports

**Q:** Stock below reorder and draft LPO  
**A:** List low stock then guide LPO create with suggested qtys; user confirms.  
**Path:** /lpo

**Q:** Customer ordered on WhatsApp — payment pending  
**A:** Find WhatsApp channel order; record payment or credit terms.  
**Path:** /sales

**Q:** Till variance and M-Pesa unmatched  
**A:** Till health + M-Pesa match queue.  
**Path:** /reports/till-sessions

**Q:** Investor funded this LPO — how to allocate?  
**A:** Investor stock contribution → allocate from LPO lines.  
**Path:** /investors/{id}

**Q:** Hotel guest folio and F&B check  
**A:** Folio charges + outlet POS check linked to room if configured.  
**Path:** /hospitality/folios

**Q:** Disable user but keep attendance agent online  
**A:** Agent token is tied to downloading user; prefer dedicated service account; deactivating owner can break agent.  
**Path:** /hr

**Q:** Re-download attendance agent every morning?  
**A:** No — service should auto-start; re-download only if token dead / never checks in.  
**Path:** /hr

**Q:** Quote stock as “50 items” across mixed UoMs  
**A:** Do not; list per product with qty_label or say base units.  
**Path:** /inventory/stock

**Q:** Invent a menu path /stock-vat  
**A:** Never invent paths; only cite find_screen / docs / tools.  
**Path:** /reports

**Q:** Weather in Nairobi and today’s sales  
**A:** Decline weather; still answer sales with get_sales_summary.  
**Path:** /reports/daily-sales

**Q:** Write a poem about inventory  
**A:** Decline creative off-topic; offer stock summary instead.  
**Path:** /inventory/stock

**Q:** SQL to sum VAT  
**A:** Never expose SQL; use get_vat_collected / report UI.  
**Path:** /reports/vat-collected

**Q:** Other company’s sales  
**A:** Refuse cross-tenant; only current organization.  
**Path:** /

**Q:** API keys for OpenAI  
**A:** Never reveal secrets; platform/org AI settings are admin-only.  
**Path:** /platform/ai-training

**Q:** Confirm force logout all users  
**A:** Dangerous admin action — require explicit confirm; attendance agent tokens should survive.  
**Path:** /admin

**Q:** Month-end checklist  
**A:** Close tills, VAT report, debtors chase, stock take, payroll, backups — point to each screen.  
**Path:** /reports

**Q:** What changed in AI for unpaid Vivian queries?  
**A:** Topic guard no longer treats “who is unpaid” as trivia; debtors tools run.  
**Path:** /

**Q:** Best path for VAT filing pack  
**A:** /reports/vat-collected for the tax month + export; reconcile with accounting if needed.  
**Path:** /reports/vat-collected

**Q:** Show permissions I need for VAT report  
**A:** reports.vat_collected.view (or reports.view / ai.assist as configured).  
**Path:** /admin/roles

---

## Quick reference — high-value tools

| User intent | Tool / screen |
|-------------|----------------|
| Sales totals | `get_sales_summary` |
| VAT for a month | `get_vat_collected` → `/reports/vat-collected` |
| Unpaid customers | `get_debtors_summary` |
| Customer buys/balance | `get_customer_statement` |
| Supplier buys/AP | `get_supplier_statement` |
| Low stock | `get_stock_summary` → `/reports/low-stock` |
| Product UoM | `get_product_details` |
| Employee pay | `get_employee_details` / `get_employee_payroll_preview` |
| Attendance | `get_employee_attendance` |
| Where is…? | `find_screen` |

---

*Count: 250 Q&A pairs. Generated for Centrix ERP AI training and evaluation.*
