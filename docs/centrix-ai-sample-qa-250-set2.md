# Centrix ERP — Sample AI Q&A Set 2 (250 new questions)

Companion to `centrix-ai-sample-qa-250.md`. All questions here are **new and different**.  
Same format for Platform → AI training bulk import.

**Import tip:** each block is `Q:` / `A:` / optional `Path:`.

---

## Sales orders / quotes / queues

**Q:** Where is the all-orders queue?  
**A:** Open /sales/orders for backend sales order queue (permission sales.order_queue_all.view).  
**Path:** /sales/orders

**Q:** Filter sales orders to only booked status  
**A:** On /sales/orders use status filters; do not invent statuses outside Centrix pipeline.  
**Path:** /sales/orders

**Q:** How do I duplicate yesterday’s order for the same customer?  
**A:** Open the prior order and use copy/reorder if available, or recreate lines from customer statement purchases.  
**Path:** /sales/orders

**Q:** Cancel a sales order that was never dispatched  
**A:** Open the order → cancel/void per status rules; stock reservations release when configured.  
**Path:** /sales/orders

**Q:** Why can’t I edit a completed sale?  
**A:** Completed/fiscalized sales are locked; use credit note/return or payment adjust flows instead.  
**Path:** /sales/orders

**Q:** Show partially paid shop debtors  
**A:** /sales/shop-debtors/partial  
**Path:** /sales/shop-debtors/partial

**Q:** List fully paid debtors this week  
**A:** /sales/shop-debtors/paid with date filters if shown.  
**Path:** /sales/shop-debtors/paid

**Q:** Jump to unpaid shop debtors screen  
**A:** /sales/shop-debtors/unpaid  
**Path:** /sales/shop-debtors/unpaid

**Q:** What does “shop debtor” mean in Centrix?  
**A:** Credit/sales customers with outstanding AR on shop/backoffice sales channels.  
**Path:** /sales/shop-debtors/unpaid

**Q:** Apply a voucher on checkout  
**A:** At POS/cart enter voucher code under /sales/vouchers rules; validate expiry and balance.  
**Path:** /sales/vouchers

**Q:** Create a sales voucher for a promotion  
**A:** /sales/vouchers → create; set value, validity, usage limits.  
**Path:** /sales/vouchers

**Q:** Where are credit notes / returns?  
**A:** /sales/returns  
**Path:** /sales/returns

**Q:** Issue a return for damaged goods only  
**A:** /sales/returns against the original sale; choose lines/qty; stock may return to shop/store.  
**Path:** /sales/returns

**Q:** Sales analytics dashboard  
**A:** /sales (sales dashboard) if module enabled.  
**Path:** /sales

**Q:** Can I park a backoffice cart like POS hold?  
**A:** Use Hold on checkout when enabled; otherwise save as draft/booked order per workflow.  
**Path:** /sales/pos

**Q:** Change selling price on one line at checkout  
**A:** Line price override if user has discount/price permission; may need approval.  
**Path:** /pos

**Q:** Split payment cash + M-Pesa on one order  
**A:** Add multiple tenders at checkout until paid; remaining shows as balance.  
**Path:** /pos

**Q:** Customer wants invoice PDF after sale  
**A:** Open completed order → print/download invoice; local print uses Print Agent.  
**Path:** /sales/orders

**Q:** Find order by customer phone  
**A:** Search customers by phone then open their orders, or order queue search if supported.  
**Path:** /customers

**Q:** Mark order as delivered  
**A:** Fulfillment/dispatch status update on the order or trip.  
**Path:** /fulfillment/dispatch

**Q:** Why is checkout blocked for credit customer?  
**A:** Likely over credit limit or overdue terms — check customer AR and limit.  
**Path:** /customers/{id}

**Q:** Add delivery notes on an order  
**A:** Order notes / fulfillment notes field before dispatch.  
**Path:** /sales/orders

**Q:** Convert quotation to order  
**A:** If quotes exist, open quote → convert; else create order from agreed lines.  
**Path:** /sales/orders

**Q:** Sales by channel POS vs mobile yesterday  
**A:** Daily sales or channel breakdown for yesterday; or payments/sales reports by channel.  
**Path:** /reports/daily-sales

**Q:** Who voided sales yesterday?  
**A:** Sales audit / void report or exception radar style void bursts for yesterday.  
**Path:** /reports

---

## Customers / CRM-ish

**Q:** Merge two duplicate customer records  
**A:** Prefer keep one customer and stop using the duplicate; merge tooling if your org has it — do not invent merge APIs.  
**Path:** /customers

**Q:** Customer tax PIN missing for KRA invoice  
**A:** Edit customer → tax PIN; retry fiscalization.  
**Path:** /customers/{id}

**Q:** Set customer as cash-only (no credit)  
**A:** Clear/zero credit limit and set payment terms to cash in customer profile.  
**Path:** /customers/{id}

**Q:** Customer town/address for delivery  
**A:** Customer profile address/town fields.  
**Path:** /customers/{id}

**Q:** Export customer list  
**A:** Customers screen export if available, or report builder customer source.  
**Path:** /customers

**Q:** New walk-in customer at POS  
**A:** Quick-create customer or use Walk-in/default cash customer per org settings.  
**Path:** /pos

**Q:** Customer statement PDF for March  
**A:** get_customer_statement month=march + open customer profile print/export if offered.  
**Path:** /customers/{id}

**Q:** Did this customer bounce a cheque?  
**A:** Review payment history/notes on customer; record failed payment if tracked.  
**Path:** /customers/{id}

**Q:** Assign customer to a sales route  
**A:** Customer or route assignment screens under fulfillment/routes.  
**Path:** /fulfillment/routes

**Q:** Blacklist a bad debtor  
**A:** Deactivate customer or set credit limit 0 and note reason; follow org credit policy.  
**Path:** /customers/{id}

**Q:** Customers in Nairobi only  
**A:** Filter customers by town/city if field exists.  
**Path:** /customers

**Q:** Last payment date for @Customer  
**A:** get_customer_statement payments list — latest payment date.  
**Path:** /customers/{id}

**Q:** Average days to pay for @Customer  
**A:** Infer from statement invoices vs payments; do not invent if tool lacks metric.  
**Path:** /customers/{id}

**Q:** Send debt reminder SMS  
**A:** Org messaging debt reminder job/settings; ensure Africa’s Talking configured.  
**Path:** /admin

**Q:** Customer bought on credit but paid cash later — how to clear?  
**A:** Record payment against the unpaid order/invoice until balance zero.  
**Path:** /sales/shop-debtors/unpaid

---

## POS / tills / cashiers

**Q:** Till management screen  
**A:** /sales/till-management  
**Path:** /sales/till-management

**Q:** Assign cashier to till 3  
**A:** Till management / user till assignment; user needs POS login channel.  
**Path:** /sales/till-management

**Q:** Cashier terminal URL  
**A:** /pos  
**Path:** /pos

**Q:** Create order from sales POS path  
**A:** /sales/pos when that entry is enabled.  
**Path:** /sales/pos

**Q:** Opening float was entered wrong  
**A:** Correct only if session still open and policy allows; else note variance at close.  
**Path:** /pos

**Q:** Mid-day cash drop / skim  
**A:** Record cash movement if supported on till session; otherwise document outside and reflect at close.  
**Path:** /pos

**Q:** Switch till without closing  
**A:** Usually not allowed with open session — close or transfer per policy.  
**Path:** /sales/till-management

**Q:** POS offline mode  
**A:** Local offline DB queues sales until online sync; check connectivity banner.  
**Path:** /pos

**Q:** Price not updating on POS after product edit  
**A:** Refresh catalog/cache; offline POS may need sync.  
**Path:** /products

**Q:** Scan barcode not found  
**A:** Verify product barcode field; add barcode on product edit.  
**Path:** /products

**Q:** Sell in retail mode vs wholesale  
**A:** Retail packaging / sell-on-retail settings control POS entry and markups.  
**Path:** /retail-package-settings

**Q:** Manager override for discount  
**A:** Approval request or manager PIN if discount exceeds cashier limit.  
**Path:** /pos

**Q:** End of day email to owner  
**A:** Hospitality/POS email reports schedule or AI digests — configure recipients.  
**Path:** /admin

**Q:** Till session still open from yesterday  
**A:** Close previous session before opening today; investigate abandoned session.  
**Path:** /reports/till-sessions

**Q:** Expected cash formula  
**A:** Opening float + cash sales − cash outs/refunds (org-specific); quote till report fields.  
**Path:** /reports/till-sessions

**Q:** Cashier sold below cost  
**A:** Margin/discount watchdog; review permissions and approvals.  
**Path:** /reports/discount-summary

**Q:** Multiple payment methods report for a session  
**A:** Payments breakdown filtered by till session/cashier.  
**Path:** /reports/payments-breakdown

**Q:** Reprint EOD for till 1  
**A:** End of day / till session report print for that session.  
**Path:** /reports/till-sessions

**Q:** Float denomination breakdown  
**A:** If UI captures notes/coins, enter at open/close; else total only.  
**Path:** /pos

**Q:** Lock screen on POS idle  
**A:** Org security screen_lock_minutes; unlock with PIN if enabled.  
**Path:** /admin

---

## Catalogue / pricing / categories

**Q:** Create a subcategory under Cooking Oil  
**A:** Categories/subcategories admin then assign products.  
**Path:** /products

**Q:** Bulk update selling prices by 5%  
**A:** Use import/price update tooling if org has advanced import; else edit products carefully.  
**Path:** /products

**Q:** Product image not showing on POS  
**A:** Upload image on product; clear cache/reload POS.  
**Path:** /products/{code}

**Q:** Deactivate seasonal SKU  
**A:** Product is_active false — hides from selling but keeps history.  
**Path:** /products/{code}

**Q:** Alternative barcode for same product  
**A:** Add secondary barcode if schema supports; otherwise one primary barcode.  
**Path:** /products/{code}

**Q:** Default VAT rate for new products  
**A:** Pick vat_id from / reference vats (e.g. 16%); required on create.  
**Path:** /products

**Q:** Cost price vs last cost  
**A:** last_cost_price from purchases; selling price is separate; margin = sell − cost.  
**Path:** /products/{code}

**Q:** Product search by supplier  
**A:** Filter products by preferred supplier if linked.  
**Path:** /products

**Q:** Units of measure list  
**A:** /uoms  
**Path:** /uoms

**Q:** Create UoM “Crate of 24”  
**A:** /uoms → full pack Crate, base pcs, conversion_factor 24.  
**Path:** /uoms

**Q:** Middle packaging between bag and kg  
**A:** Configure middle pack label/factor on UoM.  
**Path:** /uoms

**Q:** Retail package tier 1 markup 10%  
**A:** /retail-package-settings tiers; product must allow sell on retail.  
**Path:** /retail-package-settings

**Q:** Why POS asks retail qty differently  
**A:** Sell-on-retail uses packaging tiers, not only UoM packs.  
**Path:** /retail-package-settings

**Q:** Hide product from mobile sales only  
**A:** Channel/visibility flags if present; else deactivate or permission catalog scope.  
**Path:** /products

**Q:** Duplicate product code error  
**A:** Codes must be unique per org; choose new code or edit existing.  
**Path:** /products

**Q:** Import products CSV  
**A:** Advanced data import if licensed; map columns including VAT and UoM.  
**Path:** /admin

**Q:** Category sales report  
**A:** Category sales report under reports.  
**Path:** /reports

**Q:** Price list for wholesale customers  
**A:** Customer pricing/price lists if module exists; else standard sell price.  
**Path:** /customers

**Q:** Bundle / combo product  
**A:** Only if kit/bundle feature enabled — otherwise sell components separately.  
**Path:** /products

**Q:** Track serial numbers  
**A:** Only if serial tracking enabled for SKU; otherwise not available.  
**Path:** /products

---

## Inventory movements / multi-location

**Q:** Shop qty vs store qty for @Product  
**A:** Current stock screen shows shop and store separately; quote both with labels.  
**Path:** /inventory/stock

**Q:** Transfer 10 bags store → shop  
**A:** Inventory transfer; qty follows UoM — confirm base vs pack entry.  
**Path:** /inventory

**Q:** Stock adjustment reason “breakage”  
**A:** Post adjustment with reason code/notes for audit.  
**Path:** /inventory

**Q:** Active stock reservations report  
**A:** Stock reservations report if listed under inventory reports.  
**Path:** /reports

**Q:** Reservation stuck after abandoned cart  
**A:** Reservations expire by TTL or clear cart/release job.  
**Path:** /inventory

**Q:** Inter-branch transfer  
**A:** Branch transfer workflow if multi-branch inventory enabled.  
**Path:** /inventory

**Q:** GRN partial receive  
**A:** Receive only some lines/qty; LPO stays partial until fully received.  
**Path:** /inventory/receipts

**Q:** Wrong GRN qty posted  
**A:** Correct via supplier return or stock adjust + AP fix per policy — do not silent-edit history.  
**Path:** /inventory/receipts

**Q:** Putaway after GRN  
**A:** If locations used, move received stock to bin; else shop/store buckets.  
**Path:** /inventory

**Q:** Cycle count for one category  
**A:** Stock take filtered by category; post variances.  
**Path:** /inventory

**Q:** Freeze stock during stock take  
**A:** Follow org stock-take mode (lock sales if configured).  
**Path:** /inventory

**Q:** Reorder list for purchasing meeting  
**A:** /reports/low-stock export + velocity notes.  
**Path:** /reports/low-stock

**Q:** Negative stock on POS line  
**A:** Blocked unless allow_negative_stock; fix GRN or reduce qty.  
**Path:** /pos

**Q:** Batch/lot expiry  
**A:** Only if batch tracking on; investor batches are capital batches, not FEFO lots unless configured.  
**Path:** /inventory

**Q:** Damaged stock write-off approval  
**A:** Adjustment may require approval action request.  
**Path:** /inventory

---

## Purchasing / AP deep cuts

**Q:** Supplier payments list  
**A:** /suppliers/payments  
**Path:** /suppliers/payments

**Q:** Pay supplier by M-Pesa reference  
**A:** Record supplier payment with reference; allocate to LPOs.  
**Path:** /suppliers/payments

**Q:** Three-way match PO–GRN–invoice  
**A:** Compare LPO, receipts, supplier invoice fields on LPO; resolve discrepancies before pay.  
**Path:** /lpo

**Q:** Supplier invoice number on LPO  
**A:** Capture on LPO supplier invoice fields when entering AP docs.  
**Path:** /lpo

**Q:** Blanket LPO for monthly supply  
**A:** Create LPO with estimated lines; receive multiple GRNs until closed.  
**Path:** /lpo

**Q:** Cancel LPO with partial receive  
**A:** Close remaining qty per workflow; received stock stays.  
**Path:** /lpo

**Q:** Supplier statement vs our AP  
**A:** get_supplier_statement and reconcile to supplier’s PDF.  
**Path:** /reports/supplier-statement

**Q:** Prefer supplier on product  
**A:** Product supplier_id / preferred supplier field.  
**Path:** /products/{code}

**Q:** Minimum order value from supplier  
**A:** Enforce via buyer process/notes; Centrix may not hard-block unless custom rule.  
**Path:** /suppliers/{id}

**Q:** Lead time 7 days — when to reorder?  
**A:** Use forecast/low stock + lead time judgment; AI can narrate velocity vs stock.  
**Path:** /reports/low-stock

**Q:** Landed cost on import container  
**A:** Allocate extra costs into unit cost if your costing process supports it; else adjust cost manually.  
**Path:** /lpo

**Q:** Debit note to supplier  
**A:** Supplier return / debit documentation against overcharge or short supply.  
**Path:** /lpo

**Q:** AP aging 30/60/90  
**A:** Supplier balances by age if report exists; else list open LPO balances.  
**Path:** /suppliers

**Q:** Hold payment pending quality check  
**A:** Don’t post supplier payment until GRN QC complete; note on LPO.  
**Path:** /suppliers/payments

**Q:** Duplicate supplier codes  
**A:** supplier_code unique per org — fix master data.  
**Path:** /suppliers

---

## Accounting / bank / expenses

**Q:** Finance overview  
**A:** /accounting  
**Path:** /accounting

**Q:** Post opening balances  
**A:** Journal entries with opening balance accounts per accountant guidance.  
**Path:** /accounting/journal-entries

**Q:** Bank reconciliation unmatched deposits  
**A:** /accounting/bank-reconciliation match statement lines to receipts.  
**Path:** /accounting/bank-reconciliation

**Q:** Create expense for transport  
**A:** /expenses → new expense; category, amount, payment method; approval if required.  
**Path:** /expenses

**Q:** Approve pending expenses  
**A:** Expenses approval queue / action requests.  
**Path:** /expenses

**Q:** Accounts receivable ledger  
**A:** /accounting/accounts-receivable  
**Path:** /accounting/accounts-receivable

**Q:** Accrue electricity bill  
**A:** Journal debit expense credit accrual; reverse on payment.  
**Path:** /accounting/journal-entries

**Q:** Chart of accounts inactive account  
**A:** Soft-deactivate account; keep history.  
**Path:** /accounting/chart-of-accounts

**Q:** VAT control account balance  
**A:** Review COA VAT accounts + /reports/vat-collected operational total.  
**Path:** /accounting/chart-of-accounts

**Q:** Petty cash replenishment  
**A:** Expense or journal from bank to petty cash; document vouchers.  
**Path:** /expenses

**Q:** Fixed asset purchase via LPO  
**A:** Receive as asset-capex process if configured; else expense/capitalize via journal.  
**Path:** /lpo

**Q:** Month-end close checklist in accounting  
**A:** Reconcile bank, AR, AP, VAT report, post accruals, lock period if available.  
**Path:** /accounting

**Q:** Multi-currency invoice  
**A:** Centrix is KES-focused; do not invent FX unless org enabled it.  
**Path:** /accounting

**Q:** Attach receipt image to expense  
**A:** Upload attachment on expense if UI supports.  
**Path:** /expenses

**Q:** Recurring rent journal  
**A:** Manual monthly journal or recurring tool if present.  
**Path:** /accounting/journal-entries

---

## HR / payroll / compliance Kenya

**Q:** HR overview home  
**A:** /hr  
**Path:** /hr

**Q:** Departments list  
**A:** /hr/departments  
**Path:** /hr/departments

**Q:** Create morning and evening shifts  
**A:** /hr/shifts with start/end and lunch rules.  
**Path:** /hr/shifts

**Q:** Lateness report today  
**A:** /hr/lateness  
**Path:** /hr/lateness

**Q:** Absents register  
**A:** /hr/absents  
**Path:** /hr/absents

**Q:** Previous attendance history  
**A:** /hr/attendance/history  
**Path:** /hr/attendance/history

**Q:** Field attendance for sales reps  
**A:** /sales/field-attendance  
**Path:** /sales/field-attendance

**Q:** Approve annual leave  
**A:** /hr/leave approve action with hr.leave.approve.  
**Path:** /hr/leave

**Q:** Housing levy on payslip  
**A:** Payroll engine includes housing where configured; preview via get_employee_payroll_preview.  
**Path:** /hr/payroll

**Q:** SHA contribution flag off for intern  
**A:** Employee pays_sha false on profile; preview reflects it.  
**Path:** /hr/employees/{id}

**Q:** NSSF remittance file  
**A:** /reports/nssf-remittance  
**Path:** /reports/nssf-remittance

**Q:** Other deductions by period  
**A:** /reports/other-deductions  
**Path:** /reports/other-deductions

**Q:** Payroll summary PDF  
**A:** /reports/payroll-summary  
**Path:** /reports/payroll-summary

**Q:** Employee bank account for salary  
**A:** Employee banks on profile; bank transfer report uses them.  
**Path:** /hr/employees/{id}

**Q:** Terminate employee and keep history  
**A:** Set employment_status inactive; login disabled if linked user.  
**Path:** /hr/employees/{id}

**Q:** KPI targets for employee  
**A:** Employee KPIs panel if HR KPIs enabled.  
**Path:** /hr/employees/{id}

**Q:** Clock device download zip name  
**A:** CentrixAttendanceAgent-{device}.zip from Admin attendance clock.  
**Path:** /admin/attendance-clock

**Q:** Agent status page port  
**A:** http://127.0.0.1:9251 on the office PC only.  
**Path:** /admin/attendance-clock

**Q:** Punches upload window Nairobi time  
**A:** Agent uploads roughly 06:00–02:00 next day Africa/Nairobi; heartbeats continue.  
**Path:** /admin/attendance-clock

**Q:** Two employees same fingerprint enrollment  
**A:** Re-enroll unique biometric; map correct employee codes on device.  
**Path:** /admin/attendance-clock

**Q:** Manual attendance correction  
**A:** HR attendance edit if permitted; audit who changed.  
**Path:** /hr/attendance

**Q:** Public holiday calendar  
**A:** Organization holidays affect expected days/payroll.  
**Path:** /hr

**Q:** Overtime calculation  
**A:** Only if OT rules configured in payroll; else state not configured.  
**Path:** /hr/payroll

**Q:** Payslip email to staff  
**A:** If mail templates enabled; else print from payroll.  
**Path:** /hr/payroll

**Q:** Link user account to employee  
**A:** Employee user_id / create login from employee.  
**Path:** /hr/employees/{id}

---

## Fulfillment / fleet

**Q:** Fulfillment dashboard  
**A:** /fulfillment  
**Path:** /fulfillment

**Q:** Dispatch board  
**A:** /fulfillment/dispatch  
**Path:** /fulfillment/dispatch

**Q:** Trips / shipment tracking  
**A:** /fulfillment/trips  
**Path:** /fulfillment/trips

**Q:** Drivers master list  
**A:** /fulfillment/drivers  
**Path:** /fulfillment/drivers

**Q:** Define delivery routes  
**A:** /fulfillment/routes  
**Path:** /fulfillment/routes

**Q:** Load van for morning run  
**A:** Trip load / route loading — assign orders and quantities.  
**Path:** /fulfillment/trips

**Q:** Driver closed trip with shortages  
**A:** Record returns/short delivery; adjust order fulfillment status.  
**Path:** /fulfillment/trips

**Q:** GPS proof of delivery  
**A:** Mobile/driver app delivery confirm if enabled.  
**Path:** /fulfillment/dispatch

**Q:** Reschedule failed delivery  
**A:** Move order to next trip/route date.  
**Path:** /fulfillment/dispatch

**Q:** Vehicle capacity exceeded  
**A:** Split load across trips; respect vehicle limits in UI if shown.  
**Path:** /fulfillment/trips

**Q:** Third-party courier handoff  
**A:** Mark dispatched with carrier note; tracking outside Centrix unless integrated.  
**Path:** /fulfillment/dispatch

**Q:** Cold-chain delivery flag  
**A:** Use order/product notes; no inventing sensors.  
**Path:** /sales/orders

**Q:** Route profitability  
**A:** Combine route sales vs costs manually or custom report.  
**Path:** /reports/builder

**Q:** Driver cash collection on delivery  
**A:** COD payment on mobile delivery; reconcile vs trip.  
**Path:** /fulfillment/trips

**Q:** Undeliverable address  
**A:** Failed delivery reason; customer service update address.  
**Path:** /customers/{id}

---

## Hospitality deeper

**Q:** Hospitality overview  
**A:** /hospitality  
**Path:** /hospitality

**Q:** Room out of order  
**A:** Set room status OOO in /hospitality/rooms.  
**Path:** /hospitality/rooms

**Q:** Group reservation  
**A:** /hospitality/reservations with multiple rooms.  
**Path:** /hospitality/reservations

**Q:** Early check-out refund policy  
**A:** Folio adjustments per hotel policy; post credit on folio.  
**Path:** /hospitality/folios

**Q:** Charge laundry to room  
**A:** Post folio charge from front desk/outlet.  
**Path:** /hospitality/folios

**Q:** Bar order for room 12  
**A:** /hospitality/orders/bar linked to room/folio.  
**Path:** /hospitality/orders/bar

**Q:** Hotel restaurant checks  
**A:** /hospitality/orders/hotel  
**Path:** /hospitality/orders/hotel

**Q:** All F&B checks list  
**A:** /hospitality/orders  
**Path:** /hospitality/orders

**Q:** Housekeeping dirty rooms  
**A:** /hospitality/housekeeping board.  
**Path:** /hospitality/housekeeping

**Q:** Occupancy KPI report  
**A:** /reports/hospitality-kpi-occupancy  
**Path:** /reports/hospitality-kpi-occupancy

**Q:** Room status occupancy report  
**A:** /reports/hospitality-occupancy  
**Path:** /reports/hospitality-occupancy

**Q:** No-show marking  
**A:** Reservation no-show status; release inventory.  
**Path:** /hospitality/reservations

**Q:** City ledger vs guest folio  
**A:** Folio settlement to city ledger/AR if configured.  
**Path:** /hospitality/folios

**Q:** Complimentary room night  
**A:** Zero/comp rate with manager approval on reservation.  
**Path:** /hospitality/reservations

**Q:** Mini-bar posting  
**A:** Folio charge or outlet sale to room.  
**Path:** /hospitality/folios

---

## Investors set 2

**Q:** Soft-delete investor by mistake  
**A:** Restore only if admin undelete exists; else recreate and migrate notes carefully.  
**Path:** /investors

**Q:** Investor cash pool negative  
**A:** Spends exceeded cash contributions — review spends tab.  
**Path:** /investors/{id}

**Q:** Two investors share one SKU batch  
**A:** Allowed via separate investor_product_batches rows per investor.  
**Path:** /investors

**Q:** Investor money-flow report  
**A:** Investor detail money-flow tab/API.  
**Path:** /investors/{id}

**Q:** Stock contribution without LPO yet  
**A:** Record stock contribution amount; allocate products later when LPO known.  
**Path:** /investors/{id}

**Q:** Edit investor contact only  
**A:** Edit drawer on /investors — profile fields, not contributions.  
**Path:** /investors

**Q:** Investor inactive but batches remain  
**A:** is_active false hides from new deals; historical batches remain.  
**Path:** /investors

**Q:** Profit share calculation  
**A:** Use investor sales/profit report; agree formula outside if custom.  
**Path:** /investors/{id}

**Q:** Path for investors reports hub  
**A:** /investors/reports if enabled.  
**Path:** /investors/reports

**Q:** Why Form column shows both Cash and Stock  
**A:** Investor has both contribution types; badges reflect that.  
**Path:** /investors

---

## Platform / WhatsApp / M-Pesa / print / AI ops

**Q:** Admin home  
**A:** /admin  
**Path:** /admin

**Q:** Roles and permissions matrix  
**A:** /admin/roles  
**Path:** /admin/roles

**Q:** Attendance clock admin (not HR day view)  
**A:** /admin/attendance-clock  
**Path:** /admin/attendance-clock

**Q:** WhatsApp training phrases  
**A:** Platform WhatsApp training for bot utterances.  
**Path:** /platform

**Q:** Simulate WhatsApp order  
**A:** Platform WhatsApp preview/simulate tools.  
**Path:** /platform

**Q:** M-Pesa till number config  
**A:** Org payment / M-Pesa settings (not invent credentials).  
**Path:** /admin

**Q:** Callback IP allowlist for M-Pesa  
**A:** Server middleware EnsureMpesaCallbackIp — platform/ops config.  
**Path:** /platform

**Q:** System issue digest email  
**A:** Platform system issue alert settings (email/WhatsApp).  
**Path:** /platform

**Q:** Database backup to R2  
**A:** Platform database backup settings.  
**Path:** /platform

**Q:** AI credential test failed  
**A:** Platform/org AI settings — check API key, model, base URL.  
**Path:** /platform/ai-training

**Q:** Gemini vs OpenAI for org  
**A:** Org AI provider settings; platform may force Gemini.  
**Path:** /admin

**Q:** Disable get_vat_collected tool for tenant  
**A:** Org module_settings.ai.tools.get_vat_collected false.  
**Path:** /admin

**Q:** AI rate limit hit  
**A:** Wait decay window; platform has higher limit for training.  
**Path:** /

**Q:** Log slow API as system issue  
**A:** Automatic for tracked paths; view in system issues.  
**Path:** /platform

**Q:** Reverb realtime notifications down  
**A:** Platform health / Reverb reachability.  
**Path:** /platform

**Q:** FCM push not arriving  
**A:** Mobile device token + FCM config; in-app still works.  
**Path:** /admin

**Q:** Cookie auth for web  
**A:** WEB_COOKIE_AUTH / API token cookie — ops setting.  
**Path:** /platform

**Q:** Single session elsewhere error  
**A:** User already logged in another device; force logout or wait idle.  
**Path:** /

**Q:** Passkey login  
**A:** Use passkey if enrolled; MFA may be satisfied by authenticator.  
**Path:** /

**Q:** Platform super admin bootstrap password  
**A:** Only super admin may view bootstrap password match — never share in chat.  
**Path:** /platform

---

## Troubleshooting / “why is it broken?”

**Q:** Save investor does nothing on bottom button  
**A:** Fixed FormDrawer wiring — use single Save; ensure Name filled.  
**Path:** /investors

**Q:** AI answered LPO for a VAT question  
**A:** Should call get_vat_collected; if still wrong, reinstall foundation VAT note.  
**Path:** /reports/vat-collected

**Q:** AI declined unpaid Vivian  
**A:** Topic guard fixed for “who is unpaid”; redeploy backend.  
**Path:** /sales/shop-debtors/unpaid

**Q:** Agent Running but last check-in yesterday  
**A:** Heartbeat failing (token/network); Test on :9251; login prune bug fixed for agent tokens.  
**Path:** /admin/attendance-clock

**Q:** Report empty for August but sales exist  
**A:** Check date basis (placed vs other), branch filter, archived/legacy exclusions.  
**Path:** /reports/daily-sales

**Q:** Permission denied on VAT report  
**A:** Need reports.vat_collected.view (or admin).  
**Path:** /admin/roles

**Q:** Custom report create failed nameless  
**A:** create_custom_report asks for name then creates /reports/custom/{id}.  
**Path:** /reports/builder

**Q:** Qty shows raw 100 but label 2 Bag  
**A:** Always prefer qty_label in answers; 100 is base units.  
**Path:** /inventory/stock

**Q:** Wrong timezone on “today” sales  
**A:** Org timezone via general settings; AI tools use AiSalesDateResolver.  
**Path:** /admin

**Q:** Duplicate LPO after double-click Save  
**A:** Check for two LPOs; void duplicate; UI should disable double submit.  
**Path:** /lpo

**Q:** Payment posted twice  
**A:** Reverse/void one payment per finance policy; check audit.  
**Path:** /sales/shop-debtors/unpaid

**Q:** Stock not moving after GRN  
**A:** Confirm receive posted, correct branch, not draft; refresh stock.  
**Path:** /inventory/stock

**Q:** Mobile app sees old prices  
**A:** Force sync/catalog refresh on device.  
**Path:** /products

**Q:** WhatsApp order missing customer  
**A:** Bot must capture phone; map to customer master.  
**Path:** /customers

**Q:** Night audit blocked  
**A:** Close open folios/checks per night audit checklist.  
**Path:** /hospitality/night-audit

**Q:** Folio won’t settle  
**A:** Clear open charges/payments; check folio status.  
**Path:** /hospitality/folios

**Q:** Driver app can’t see trip  
**A:** Assign driver to trip; mobile driver channel permission.  
**Path:** /fulfillment/trips

**Q:** Payroll preview differs from final pay  
**A:** Final run may include manual adjustments after preview.  
**Path:** /hr/payroll

**Q:** Leave balance negative  
**A:** Over-taken leave — HR correction or policy advance.  
**Path:** /reports/leave-balance

**Q:** Search training notes returns nothing  
**A:** Install foundation notes / add org Q&A in Platform AI training.  
**Path:** /platform/ai-training

---

## Scenario blends (unique)

**Q:** Close month: VAT, debtors, and low stock in one briefing  
**A:** Run get_vat_collected this_month, get_debtors_summary, get_stock_summary; three sections + paths.  
**Path:** /reports

**Q:** Customer @Acme unpaid and also low on their usual SKU  
**A:** Statement for Acme + stock for their top products from purchases_by_product.  
**Path:** /customers/{id}

**Q:** Supplier overdue and LPO awaiting approval  
**A:** Supplier statement + /lpo approval filter.  
**Path:** /lpo

**Q:** Cashier variance and discount spike same day  
**A:** Till health + discount summary for that day.  
**Path:** /reports/till-sessions

**Q:** Investor stock batch vs warehouse on-hand mismatch  
**A:** Investor batches are capital tracking; warehouse stock is inventory — reconcile intentionally.  
**Path:** /investors/{id}

**Q:** Hotel occupancy low but F&B strong  
**A:** Occupancy KPI + F&B checks reports.  
**Path:** /reports/hospitality-manager-flash

**Q:** Route unpaid COD and shop debtors  
**A:** Route orders unpaid + /sales/shop-debtors/unpaid.  
**Path:** /fulfillment/trips

**Q:** New branch go-live checklist  
**A:** Branch, tills, users, stock transfer, POS print agent, opening floats.  
**Path:** /admin/branches

**Q:** Audit trail who changed product price  
**A:** Audit logger / product history if enabled.  
**Path:** /products/{code}

**Q:** Prepare board pack: sales WoW, VAT MoM, AR  
**A:** Sales summaries both weeks, VAT this vs last month, debtors summary.  
**Path:** /reports

**Q:** Tax PIN customer vs cash sale  
**A:** Cash sales may still fiscalize; PIN needed when legally required — follow KRA settings.  
**Path:** /reports/kra-compliance-summary

**Q:** Training a new cashier first day  
**A:** Open till, sell, hold/recall, split tender, close till, EOD — link each screen.  
**Path:** /pos

**Q:** Procurement meeting agenda from Centrix  
**A:** Low stock, open LPOs, supplier balances, fast movers.  
**Path:** /reports/low-stock

**Q:** HR month-end: attendance then payroll  
**A:** Confirm attendance sync → absents/lateness → payroll run → statutory reports.  
**Path:** /hr/payroll

**Q:** After power outage: tills and attendance agent  
**A:** Reopen/close orphan till sessions; wait for agent heartbeat on :9251.  
**Path:** /admin/attendance-clock

---

## Phrasing variants users actually type

**Q:** how much VAT for August?  
**A:** VAT August → get_vat_collected month=august; answer in KES.  
**Path:** /reports/vat-collected

**Q:** give me customer John's statement  
**A:** get_customer_statement for John; clarify if multiple Johns.  
**Path:** /customers

**Q:** how much cooking oil stock left  
**A:** Find oil products; get_product_details / stock with qty_label.  
**Path:** /inventory/stock

**Q:** who hasn't paid?  
**A:** Unpaid debtors → get_debtors_summary / shop-debtors unpaid.  
**Path:** /sales/shop-debtors/unpaid

**Q:** where is the LPO?  
**A:** /lpo  
**Path:** /lpo

**Q:** how to add user to the system  
**A:** /admin/users  
**Path:** /admin/users

**Q:** show me money for today  
**A:** Ambiguous — ask sales vs cash in till; default get_sales_summary today + offer till health.  
**Path:** /reports/daily-sales

**Q:** sales report  
**A:** Sales reports hub / daily sales.  
**Path:** /reports/daily-sales

**Q:** employee so-and-so salary  
**A:** get_employee_details for name; quote basic_salary.  
**Path:** /hr/employees

**Q:** fingerprint not working  
**A:** Attendance agent + device connectivity checklist.  
**Path:** /admin/attendance-clock

**Q:** printer not working  
**A:** Centrix Print Agent on till PC.  
**Path:** /admin

**Q:** mpesa came in but order unpaid  
**A:** Match M-Pesa to order manually.  
**Path:** /sales/orders

**Q:** room not available but empty  
**A:** Check OOOH/dirty/reserved status on rooms board.  
**Path:** /hospitality/rooms

**Q:** investor cash or stock?  
**A:** Contribution type on Add contribution; list Form badges.  
**Path:** /investors

**Q:** AI digest email not arriving  
**A:** AI Insights channels + recipient emails + org SMTP.  
**Path:** /admin

---

*Count: 250 new Q&A pairs (Set 2). Pair with `centrix-ai-sample-qa-250.md` for 500 total.*
