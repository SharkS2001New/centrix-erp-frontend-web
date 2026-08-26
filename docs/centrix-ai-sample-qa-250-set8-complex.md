# Centrix ERP — Sample AI Q&A Set 8 (250 complex multi-part questions)

Companion to Sets 1–7. **Rewritten as true Q&A** (explanations and decisions), not a directory of paths.

Each **Q** combines several intents. Each **A** answers every part in plain language, using tools for figures, with screens mentioned only when they help the user act.

**Import tip:** Platform → AI training → Bulk paste (`Q:` / `A:`).

**Hard rules in answers:**
- Address every sub-question (labeled sections).
- Never invent numbers — use tools.
- Names only (no codes/ids); branch names only if multi-branch.
- In stock ≠ low stock; Saturday alternate hours ≠ half-day.
- Charts only when the user asks for a chart/graph/pie/donut.
- Creates need confirmation — don’t claim saved without success.

---

## Cross-module briefings & triage

**Q:** I’m the GM. In one go tell me:  
how sales look today,  
how much cash we have,  
who owes us the most,  
and what’s actually in stock vs only low-stock warnings.  
Don’t invent figures.  
**A:** Answer in four clear sections and pull live figures from tools (sales brief/summary, cash position, debtors summary, stock summary).  
Sales: give today’s totals from the sales pulse tools only.  
Cash: quote cash position — never guess drawer or bank balances.  
Debtors: list top unpaid customers by name and amounts from debtors tools; separate Shop Debtors (credit sales queue) from ledger AR if both matter.  
Stock: “in stock” means quantity greater than zero. Low stock means at/below reorder. Never substitute a low-stock list when asked what is in stock.  
Use customer and product names only — no codes or ids. Don’t draw a chart unless asked.  

**Q:** Before we open, what should I verify about the till, payment methods, M-Pesa, and fiscal/KRA — without inventing paybills or device serials?  
**A:** Give an opening checklist in plain language:  
Till: open the session and set float from what the till screen shows; use till health for live session status — don’t invent float.  
Payments: confirm which tenders are enabled for POS.  
M-Pesa: confirm integration and paybill setup are configured; don’t invent paybill numbers.  
Fiscal/KRA: confirm the fiscal device/settings look healthy and check recent fiscal errors; if sales failed to fiscalize, use the unfiscalized sales view after open — never invent CU serials or QR data.  

**Q:** Customer Kilimani Distributors:  
What’s on their statement,  
are they high on credit utilization,  
where do I collect,  
and they also have a WhatsApp order waiting — what do I do first?  
**A:** Structure one reply:  
Statement: pull get_customer_statement for Kilimani Distributors and summarize balances/invoices from the tool (name only).  
Credit: check portfolio/utilization from tools — never invent a percentage or limit.  
Collect: work unpaid/partial Shop Debtors (credit sales queue) or customer payment allocation — not by inventing a payment.  
WhatsApp: process the inbound WhatsApp order queue separately from collection. Recommend order of work based on urgency (e.g. collect if blocked on credit, or clear the WhatsApp order if it’s holding fulfilment), but keep the two workflows distinct.  

**Q:** We run a counter and vans. What’s the difference between retail end-of-day, a Z-report, trip cash settlement, and hotel night audit?  
**A:** Don’t mix close procedures:  
Counter: X-report is a mid-session snapshot; Z-report closes the till session; retail end-of-day wraps the shop day after tills are in order.  
Vans: trip cash settlement compares expected vs declared trip cash — it is not a shop Z-report.  
Hotel: night audit closes the hotel business day after open checks/folios are cleared — not the same as retail EOD.  
Ask which channel they’re closing, then give only that procedure, and don’t invent session totals.  

**Q:** For product Maize Flour I need details, recent price changes, sales this period, whether it’s in stock, and separately whether it’s low stock. No SKUs.  
**A:** One product dossier from tools only, five labeled facts:  
Details from product details tool (name “Maize Flour” only).  
Price changes from price history tool — don’t invent prices.  
Sales from sales-by-product tool.  
In stock: only if on-hand qty > 0 from stock summary.  
Low stock: only if at/below reorder — say so in a separate sentence, never as a substitute for “in stock.”  

**Q:** Finance wants a close order: cash pulse, shop payment breakdown, bank recon, M-Pesa recon, Equity recon. How should we sequence it?  
**A:** Recommended sequence:  
1) Cash position pulse for an overview (tool figures only).  
2) Shop payments breakdown for tender split.  
3) Bank reconciliation against the bank register/statement.  
4) M-Pesa reconciliation for mobile-money settlements.  
5) Equity reconciliation if Equity is used.  
Never invent cleared amounts; if a recon screen shows unmatched lines, say to resolve those before declaring close complete.  

**Q:** Driver Otieno is late in HR, delivery KPIs look poor, and his trip is still open. How do I talk about this without mixing metrics?  
**A:** Keep three separate sections:  
Attendance/lateness: HR attendance and lateness queues/reports; use employee attendance tool with scheduled times. Saturday alternate shift hours are scheduled hours — never call them half-days.  
Delivery performance: driver delivery reports — operational KPI, not payroll lateness.  
Trip: open trip on fulfilment/dispatch — close or advance the trip on its own status rules.  
Don’t blend “minutes late” into “deliveries completed,” and don’t invent either number.  

**Q:** Give me a chart of category sales, tell me how category sales reporting works, and also VAT collected this period.  
**A:** Because they asked for a chart, you may render a chart from real category sales data (or say data is missing — never invent series).  
Explain category sales as sales rolled up by product category for the period.  
VAT: quote get_vat_collected / VAT collected reporting only.  
If they hadn’t asked for a chart, you would use a table or prose only.  

**Q:** I want to raise an LPO to Bidco, know stock on the items I’ll buy, and see what’s still open on LPOs — but don’t pretend the LPO is already saved.  
**A:** Split read vs write:  
Stock: quote stock/product tools for the named items (names only).  
Open purchasing: purchasing overview + open LPO list — quote tools/screens only.  
Create: guide creating a new LPO for Bidco and stop at confirm/submit. Never claim it was saved without a successful create confirmation.  

**Q:** On mobile, customers appear under View Customers but not when saving an order; search flickered; GPS is on. What actually controls who I can sell to?  
**A:** Visibility for Save order is driven by assigned routes (customers on the user’s routes), not by GPS.  
View Customers can look wider depending on assignment rules (e.g. unassigned users may see org/branch-wide).  
Search should stay stable (debounce / keep list while filtering); flicker was a UX issue, not a business rule.  
Fix: assign the customer to the correct route. Don’t tell them GPS is filtering the directory.  

**Q:** Night audit failed, the bar has open checks, a folio still has a balance, and the retail till is still open. Triage.  
**A:** Two tracks:  
Hotel: close or resolve open F&B checks, fix folio issues, then retry night audit. Don’t invent audit totals.  
Retail: finish the till with Z-close / till close and retail EOD — night audit does not close a retail till.  
Never apply hotel night-audit steps to the shop till or Z-report steps to the hotel.  

**Q:** For employee Jane: show her shift pattern including Saturday, today’s attendance with scheduled times, and a payroll preview. Don’t call Saturday a half-day.  
**A:** People dossier from tools:  
Employee details / shift schedule by day.  
Attendance including scheduled start/end; if Saturday uses alternate shift hours, describe them as scheduled alternate hours — never “half-day.”  
Payroll preview: quote statutory and earning lines from the preview tool only — never invent PAYE, NSSF, or housing levy rates.  

**Q:** Explain unpaid Shop Debtors vs AR aging vs the accounting AR screen vs a customer statement for Naivas — then how I’d use all four.  
**A:** Layers:  
Shop Debtors unpaid = credit sales orders waiting collection/allocation.  
AR aging = how long receivables have been outstanding (buckets).  
Accounting AR = ledger view of receivables.  
Customer statement for Naivas = that customer’s document-level activity (from statement tool).  
Practical use: work the unpaid queue day-to-day, use aging/top debtors for priorities, confirm ledger AR for accounting, and pull Naivas’s statement when discussing that account. Quote balances only from tools.  

**Q:** A completed counter sale and a van pick happened — when did stock leave? Don’t guess our tenant setting.  
**A:** Stock leaves when your org’s stock-deduct setting says so (examples: on order create, on order complete, on trip pick, load, or depart).  
Say you must check inventory / platform org configuration for this tenant — never assume one global rule.  
Then verify with stock transactions for those documents. Don’t invent quantities.  

**Q:** One checkout may use credit, loyalty, a voucher, and M-Pesa. What do I verify, in order?  
**A:** Verification order:  
1) Credit limit and balance from customer master/statement tools — never invent a limit.  
2) Loyalty card exists and redeemable points come from the system — never invent points.  
3) Voucher is valid — never invent codes.  
4) M-Pesa tender is enabled and configured.  
5) Complete payment on POS/cart. If blocked, say which check failed from real UI/tool data.  

**Q:** Purchasing wrap for Bidco: open LPOs, overview, their statement, how we pay them, and AP.  
**A:** Afternoon wrap in sections:  
Purchasing overview and still-open LPOs (tool/report figures only).  
Supplier statement for Bidco from the statement tool (name only).  
Record/allocate supplier payments on supplier payments.  
Confirm accounts payable ledger view.  
Never invent AP balances.  

**Q:** We’re hybrid hotel + retail. How should I read room revenue / manager flash vs retail profit & loss?  
**A:** Label two profitability worlds:  
Hotel: room revenue, manager flash, and hospitality P&L when those reports exist — quote report outputs only.  
Retail/org: profit & loss tools/reports for shop trading.  
Never merge hotel and retail into one invented profit number. If both were asked, give both sections clearly labeled.  

**Q:** Fiscalization failed offline. How do I find unfiscalized sales, diagnose, and reprint after fix — without inventing QR data?  
**A:** Triage:  
List sales that didn’t fiscalize.  
Inspect KRA/fiscal response errors and settings/device health.  
After the device/config issue is fixed, fiscalize/retry per UI and reprint the invoice/receipt from the order.  
Never invent Control Unit serials, QR payloads, or claim fiscal success without the system confirming it.  

**Q:** Stock take shows a variance. When do I use stock take vs adjustment vs damage, and how do I prove the movement?  
**A:** Choose the document that matches reality:  
Full count variance → stock take posting.  
Known damage/breakage → damage document.  
Other qty/value correction → stock adjustment.  
Then prove it in inventory transactions / stock movement for the period. Never invent variance quantities.  

**Q:** When I send a numbered multi-part ERP question plus an off-topic joke, how should Centrix AI respond?  
**A:** Answer every ERP part with tools and clear labeled sections.  
Briefly decline the off-topic joke and don’t let it block the ERP answers.  
Batch tools where possible; never invent numbers; product/customer/employee names only; charts only if asked.  

**Q:** Walk a new cashier through float, X-report, Z-report, payments breakdown, and end-of-day.  
**A:** Narrative:  
Open till and capture float from the till UI (don’t invent float).  
During the shift, X-report is a mid-session snapshot.  
Payments breakdown shows how tenders split.  
At close, Z-report ends the till session; then complete retail end-of-day.  
Use till health if they ask whether the session looks healthy — quote tool/UI only.  

**Q:** Acme is over credit at POS, utilization looks high, and I need their statement and a way to take payment.  
**A:** Combine:  
Pull statement and portfolio/utilization from tools — never invent %.  
Explain POS may block or warn when the credit limit on the customer master is exceeded.  
Collect/allocate via Shop Debtors / customer payment flows.  
Speak about Acme by name only.  

**Q:** Explain pick → load → depart → POD for vans, and why depart might be blocked.  
**A:** Pipeline in business terms:  
Pick the goods, confirm loading, depart the trip, capture proof of delivery.  
Depart is usually blocked if pick/load isn’t complete — follow status gates; don’t invent overrides.  
Stock may already have left at pick, load, or depart depending on stock-deduct settings — confirm config, don’t guess.  

**Q:** Give me what’s in stock, stock valuation (with branch rules), and low stock — as three different answers.  
**A:** Section 1 — In stock: items with qty > 0 from stock summary / in-stock reporting.  
Section 2 — Valuation: inventory valuation tool/report; if multi-branch, label by branch name only, never branch id; if single-branch, omit branch labels.  
Section 3 — Low stock: only at/below reorder.  
Never swap these lists.  

**Q:** I need the statutory filing pack after payroll, plus a preview for Jane.  
**A:** Org pack from payroll reports: payroll summary, statutory deductions, NSSF remittance, bank transfer listing — quote reports only.  
For Jane: employee payroll preview lines only.  
Never invent Kenyan statutory rates.  

**Q:** What’s the difference between platform WhatsApp, sales WhatsApp admin, the WhatsApp order queue, and the mobile order queue?  
**A:** WhatsApp order queue: inbound WhatsApp orders waiting processing.  
Sales WhatsApp admin: tenant configuration for that channel.  
Platform WhatsApp: super-admin connectivity for the platform.  
Mobile order queue: field-app orders, not WhatsApp.  
Don’t invent webhook secrets or phone numbers.  

**Q:** Invoice letterhead is wrong, till receipts look wrong, and a hotel folio header is wrong. What do I fix conceptually?  
**A:** Three layers:  
Company legal/profile fields drive letterhead data (name, PIN, address).  
Printout/document templates control layout.  
Till printing controls receipt printing behaviour; folio printing is from hospitality folio documents.  
Don’t invent template code — fix master data and print settings.  

**Q:** Cashier says they can’t sell below cost anymore. How do I diagnose approvals vs permissions?  
**A:** Check whether manager-approval rules require approval for below-cost/discount.  
Check the user’s role permissions.  
Retry on POS to see the real block/approval prompt.  
If they claim it worked before, review audit/activity — don’t invent a bypass permission.  

**Q:** Create a custom report and also tell me today’s sales brief. How should that reply look?  
**A:** If a custom report is created successfully, give the user the custom report link/id from the success result.  
In the same reply, quote today’s sales from sales brief/summary tools.  
Never claim the report was created without success confirmation; never invent sales totals.  

**Q:** Expense entry won’t let me pick a category; I also want expense totals and the expenses report. What should AI say?  
**A:** Explain category must exist/be selected on expenses for the org — don’t invent a GL account or category code.  
For totals use expense summary tool; for analytics use the expenses report.  
If mappings are required for posting, point to account mappings without inventing accounts.  

**Q:** Hotel walk-in: check in, put charges on a folio, mark the room dirty, and see hospitality payments. Sequence?  
**A:** Sequence in plain language:  
Walk-in check-in at front desk/reservations.  
Post charges to the guest folio.  
Housekeeping updates room status to dirty (then clean/inspect as they work).  
Review hospitality payments breakdown for tender split.  
Don’t invent room rates or folio balances.  

**Q:** Attendance data is messy: missed punches, duplicates, then someone wants overtime approved. What’s the right order?  
**A:** Clean first:  
Resolve missed punches, clean duplicate punches, recheck attendance.  
Only then review pending overtime.  
Don’t invent overtime hours from dirty punch data.  
Saturday alternate hours remain scheduled hours, not half-days.  

**Q:** Goods are bad — when is it a supplier return, a customer return, or a warehouse damage?  
**A:** Supplier return: goods going back to the supplier (AP/stock to supplier).  
Customer return/credit note: goods coming back from a customer.  
Warehouse damage: breakage/spoilage inside your warehouse (damage document), not a customer or supplier return.  
Using the wrong document posts the wrong stock and financial effect.  

**Q:** Before wiping AI training and re-uploading, what hygiene steps should we take?  
**A:** Export training notes (Excel/PDF) for backup.  
Merge or delete duplicate Q&A clusters (keep the newest).  
Then delete-all & re-upload, or upload into a clean set.  
Use clear question/answer text (and optional path only when navigation truly helps). Runtime search should prefer these tenant notes.  

**Q:** Cash looks tight, expenses look high, profit looks soft — give a stress brief without inventing numbers.  
**A:** Three labeled sections from tools only:  
Cash position.  
Expense summary (+ where expenses are entered).  
Profit & loss / profit tool.  
No charts unless asked; no invented “stress” figures.  

**Q:** Route Eastlands: what is the route setup, what orders ran today, how do mobile route sales look, and where does field attendance fit?  
**A:** Route details from the route tool (route name, not id).  
Today’s debrief from route orders tool.  
Performance from mobile route sales reporting.  
Field attendance for distribution is sales field attendance — not HR payroll attendance. Keep those datasets separate.  

**Q:** Month-end accounting is stuck — periods, mappings, exports, trial balance. What do I check?  
**A:** Check whether the fiscal period is open or closed — don’t advise posting into a closed period as if it worked.  
Confirm account mappings for modules that post to GL.  
Inspect the accounting export queue for failed jobs.  
Use trial balance to see if the ledger is in balance — never invent TB figures.  

**Q:** Where should bar staff, hotel F&B, and retail cashiers work — and what about stock?  
**A:** Retail cashiers use retail POS.  
Hotel F&B uses hotel outlet order flows.  
Bar uses hotel/bar POS — not retail POS.  
Stock movement follows the org’s stock-deduct rules for those sales; don’t invent recipe or bar stock math.  

**Q:** Explain proforma vs tax invoice vs credit note vs reprint in one lifecycle.  
**A:** Proforma is quote-style and not the same as a fiscal tax invoice.  
Tax/sales invoice is the formal invoice after sale rules.  
Credit note/return reverses or credits a customer sale.  
Reprint pulls the existing document again from the order/document actions using your print templates.  
Never invent document numbers.  

**Q:** Platform looks unhealthy — what status areas should a super-admin glance at together?  
**A:** In one status pack: platform health, system issues, database backups, and active users.  
Describe what each is for; don’t invent uptime percentages or ETAs.  

## Sales, POS, debtors & channels

**Q:** I restored a held cart — now apply loyalty, a voucher, and pay by M-Pesa. What’s the safe order?  
**A:** Restore the held cart first.  
Apply loyalty only with real redeemable points from the card/system.  
Apply a real voucher code from issued vouchers — never invent codes.  
Take M-Pesa if that tender is enabled/configured.  
If any step fails, report the real UI error; don’t invent authorisation codes.  

**Q:** What’s the difference between unpaid, partial, and paid Shop Debtors, and what date window applies?  
**A:** Unpaid: credit sales not yet collected.  
Partial: partly paid.  
Paid: fully settled in that queue.  
The default date window is the shop-debtors default days setting — separate from the sales-orders list default days. Quote balances from tools/screens only.  

**Q:** Compare sales-by-cashier for Purity with the sales-by-user report, and what may I say about the user record?  
**A:** For a named cashier, use sales-by-cashier with their name/username and quote those totals.  
Sales-by-user is the broader report view.  
User details may include display name and role — never expose internal user ids.  

**Q:** When do I use legacy orders vs live orders vs legacy archive reporting?  
**A:** Live operations stay on current sales orders/returns.  
Legacy orders/returns are imported or historical records.  
Legacy archive reporting is for archived legacy analytics.  
Don’t treat legacy documents as live fiscal advice.  

**Q:** Owner meeting: investors module plus cash — what can AI say?  
**A:** Explain investors records vs investor reports when the module is enabled.  
Add cash position from the cash tool.  
Never invent investor balances or cash.  

**Q:** Someone asked for “reservations” — retail sales reservation or hotel booking?  
**A:** Disambiguate:  
Sales reservations are retail/sales holds when that feature exists.  
Hotel reservations and front desk are hospitality bookings.  
Ask which they mean if unclear; never send hotel staff to retail reservations by default.  

**Q:** Customer credit note vs supplier credit note vs returns analytics — untangle.  
**A:** Customer credit note/return = money/goods with a customer.  
Supplier credit note/return = with a supplier.  
Returns analytics summarize return activity — it doesn’t replace posting the right document.  
Label which side you’re talking about.  

**Q:** “How are sales today?” vs full sales summary vs daily sales report — which?  
**A:** Short verbal pulse: sales brief tool.  
Fuller totals: sales summary tool.  
Formal report screen: daily sales report.  
Always quote tool/report figures — never invent.  

**Q:** Cooking Oil shows an old price on POS — how do I investigate price list, history, and master data?  
**A:** Check current list pricing and product price history from tools/screens.  
Confirm the product’s sell price and pack/UoM on the product master.  
After correcting masters, refresh/reopen the cart.  
Don’t invent a manual POS price unless the UI allows a controlled override.  

**Q:** I allocated one customer payment across several invoices — what should I check afterward?  
**A:** Confirm the allocation succeeded on the payment/debtors flow.  
Recheck the customer statement and AR/Shop Debtors status.  
Use invoice payments reporting to audit allocation history.  
Don’t invent paid amounts.  

**Q:** Build a collections call list using top debtors, aging, and the unpaid queue.  
**A:** Prioritize with top debtors and aging buckets from reports/tools.  
Work accounts on the unpaid Shop Debtors queue.  
Call customers by name; quote only real outstanding amounts from tools.  

**Q:** Loading sheets, trip charts, and vehicle trip loads — how do they fit one van afternoon?  
**A:** Loading sheets/lists are what should go on the van.  
Trip charts are operational trip views.  
Vehicle trip loads report analyzes loads by vehicle after trips run.  
Don’t invent load quantities.  

**Q:** Field return needs approval — when does stock come back?  
**A:** Mobile/field returns usually need backoffice approval first.  
After approval, the return posts through returns processes.  
Stock impact follows the posted return and stock settings — don’t claim stock is restored before posting.  

**Q:** Voucher pay type doesn’t appear at till — what concepts to check?  
**A:** Vouchers must be issued/valid.  
Payment methods must include the tender you expect.  
The till session must be open and using those methods.  
Don’t invent an enabled tender.  

**Q:** Manager briefing: home dashboard vs sales hub vs channel mix.  
**A:** Business summary home for overall pulse.  
Sales hub for sales analytics.  
Channel mix from sales-by-channel reporting plus sales tools for numbers.  
No invented channel splits.  

**Q:** Till already Z-closed — can I still run X, and what about EOD?  
**A:** X is for an open mid-session snapshot. After Z-close you typically start a new session rather than “reopen” Z.  
Still complete retail end-of-day as required.  
Don’t invent a reopen procedure.  

**Q:** Is Naivas inactive, what’s their utilization, and what’s on their statement?  
**A:** Use customer portfolio for inactive and utilization slices (no invented %).  
Use customer statement for document activity.  
Offer to open the customer master for edits — names only.  

**Q:** When answering sales-by-product, what columns and naming rules?  
**A:** Prefer Product | Qty | Amount style results with product names only — no code/SKU/id column in the reply.  
Figures only from the sales-by-product tool.  

**Q:** Proforma printed without company PIN — what data is missing?  
**A:** Proforma pulls company profile fields for legal/PIN/address.  
Fix company profile and print templates if layout is wrong.  
Never invent a KRA PIN.  

**Q:** WhatsApp order → completed sale → fiscalize. What’s the chain?  
**A:** Process the WhatsApp queue into a real order/sale.  
Complete payment/fulfilment per normal sales rules.  
If fiscalization fails, diagnose fiscal settings/responses and unfiscalized sales — don’t invent fiscal QR data.  

**Q:** Till health looks wrong and payments breakdown doesn’t match — what next?  
**A:** Quote till health as-is.  
Compare payments breakdown tenders for the same session/day.  
Review till session history for open/close anomalies.  
Never invent cash-up figures to “make it match.”  

**Q:** Loyalty redeem fails and cards look empty — how to explain?  
**A:** Redeem needs an active loyalty card and real points balance from the system.  
If cards aren’t set up, maintain loyalty cards first.  
Don’t invent redeemable points.  

**Q:** Customers menu shows Shop Debtors and Sales also has Shop Debtors — same thing?  
**A:** Yes conceptually — credit sales collection queues.  
Unpaid/partial/paid are the statuses.  
Use tools for balances; don’t invent which invoices appear.  

**Q:** We raised a customer’s credit limit — what should be true before POS allows the sale?  
**A:** Limit must be saved on the customer master.  
POS rechecks credit rules against outstanding exposure from real balances.  
Confirm with statement/portfolio tools — never invent the new limit.  

**Q:** Returns report is empty but we know returns happened — what could be going on?  
**A:** Check live returns documents vs report filters/date range.  
Legacy returns may live in legacy history, not live analytics.  
Don’t invent return totals to fill the gap.  

**Q:** Sales-by-supplier vs purchases-by-supplier — I mixed them up.  
**A:** Purchases-by-supplier is what you bought from suppliers.  
Sales-by-supplier is sales attributed to suppliers when products are linked that way.  
Always label buy vs sell; never invent attribution.  

**Q:** Someone opened hospitality payments breakdown thinking it was retail EOD. Correct them.  
**A:** Hospitality payments breakdown is hotel tender split.  
Retail end-of-day closes the shop day; tills use X/Z.  
Point them to the correct close for their channel.  

**Q:** For cashier Purity: who is the user, which till concepts matter, and what did they sell?  
**A:** User details: display name/role only — no internal ids.  
Till: session must be open on an allowed till.  
Sales: sales-by-cashier totals from the tool only.  

**Q:** “Old orders” — held carts vs legacy imported orders.  
**A:** Held/parked = live cart to restore on POS.  
Legacy orders = historical/imported documents.  
Different recovery paths; don’t mix.  

**Q:** Tax/price pack: VAT collected, price list, category sales — one answer.  
**A:** VAT from VAT tool/report.  
Price list for current selling prices.  
Category sales for category rollups.  
All quoted — never invented.  

**Q:** Sales order partly delivered — what should AI say about status and POD?  
**A:** Partial delivery follows fulfilment status gates — don’t invent status names.  
POD captures proof for what was delivered.  
Outstanding lines remain open until delivered/cancelled per rules.  

**Q:** Below-cost needs approval — what does the cashier experience vs admin setup?  
**A:** Cashier sees block or approval request on POS.  
Admins configure manager-approval rules and roles.  
Don’t invent that everyone can override.  

**Q:** Payments breakdown vs cash flow statement vs cash position — three cash views.  
**A:** Payments breakdown: shop tender split for a day/session.  
Cash position: live/overview cash & bank pulse from the tool.  
Cash flow statement: period statement of cash movements.  
Don’t substitute one for another.  

**Q:** Mobile expense awaiting approval vs posted expenses vs expense summary.  
**A:** Approval queue first for field expenses.  
After approval, it becomes a normal expense.  
Totals from expense summary tool — never invent.  

**Q:** Trip charts empty — what has to exist first?  
**A:** Trips must be planned/dispatched with vehicles/drivers.  
Charts and load reports populate after real trip activity.  
Don’t invent trip numbers.  

## Inventory & purchasing

**Q:** We received against an LPO — how do I confirm stock value and the movement trail?  
**A:** Confirm the goods receipt posted.  
Recheck inventory valuation from the valuation tool (branch name rules if multi-branch).  
Prove movements in inventory transactions.  
Don’t invent GRN numbers or value deltas.  

**Q:** Transferring stock between branches — what do I say about valuation labels?  
**A:** Create a branch transfer document for the move.  
When quoting valuation afterward, use branch names only if the org is multi-branch; never branch ids.  
Don’t invent in-transit quantities — use document status.  

**Q:** Buyer afternoon: what’s still open to receive, create a new LPO mindset, Bidco statement, purchases from Bidco.  
**A:** Open LPOs still unreceived.  
New LPO is a create flow needing confirm.  
Supplier statement and purchases-by-supplier for Bidco from tools/reports only.  
Names only; no invented AP.  

**Q:** Explain in-stock list, low-stock list, stock on hand, and stock chain without mixing them.  
**A:** In stock: qty > 0.  
Low stock: at/below reorder.  
Stock on hand: on-hand balances snapshot.  
Stock chain: flow/trace view when enabled.  
Never present low stock as the answer to “what do we still have.”  

**Q:** Wrong UoM is breaking both POS sell qty and GRN receive qty. Fix approach?  
**A:** Correct unit conversions and the product’s UoM/pack settings.  
Recheck POS and receiving after save.  
Don’t tell users to invent conversion factors in chat.  

**Q:** A carton was crushed in the warehouse — stock take, adjustment, or damage?  
**A:** Damage document for crushed/broken goods.  
Stock take when you’re posting a full count variance.  
Adjustment for non-damage corrections.  
Then verify transactions.  

**Q:** Restored a deleted product but POS still doesn’t show it — checklist thinking.  
**A:** Confirm it’s active again, categorized correctly, available for the branch/till catalogue rules, and the POS session refreshed.  
Don’t invent a SKU as the fix.  

**Q:** Paying a supplier and closing the loop into AP and statement.  
**A:** Record/allocate the supplier payment.  
Confirm accounts payable reflects it.  
Re-pull supplier statement from the tool.  
No invented payment amounts.  

**Q:** Purchasing overview vs suppliers vs LPOs — how to not get lost.  
**A:** Overview tool = pulse of purchasing.  
LPOs = purchase orders.  
Suppliers = master, payments, returns.  
If the menu label differs by industry, search for the screen by topic rather than inventing a URL-heavy answer.  

**Q:** Transfer seems in transit — how do I talk about it with movements?  
**A:** Describe the transfer document status honestly from the system.  
Use inventory transactions to show what posted.  
Don’t invent an in-transit quantity that isn’t on the document.  

**Q:** VAT codes, product tax, and VAT collected this month — connect them.  
**A:** VAT codes are reference rates assigned on products.  
VAT collected reporting/tools sum tax on sales for a period.  
Never invent VAT rates or collected amounts.  

**Q:** Field team says pack size on mobile doesn’t match shop POS.  
**A:** Mobile and backoffice should use the same product, UoM, and pack masters.  
Align pack/retail package settings and product setup; route assignment doesn’t create a second pack.  
Don’t invent a mobile-only pack.  

**Q:** Manager wants inventory analytics; clerk needs on-hand and to post an adjustment. Split the advice.  
**A:** Manager: inventory analytics overview and valuation/stock tools for numbers.  
Clerk: on-hand stock list and the correct adjustment/damage/stock-take document.  
Don’t invent quantities for either.  

**Q:** LPO is waiting approval and someone wants it printed — what do I say?  
**A:** If approvals are enabled, it stays waiting until approved.  
Printing uses the LPO print action and org print templates after it’s in a printable state.  
Don’t invent an LPO number or approval.  

**Q:** Three different “PINs”: supplier tax PIN, company PIN, KRA fiscal setup — clarify.  
**A:** Supplier tax PIN lives on the supplier master.  
Company PIN lives on company profile (documents/letterhead).  
Fiscal/KRA setup is separate device/taxpayer configuration.  
Never invent any PIN or CU serial.  

**Q:** User asked “what do we still have?” — exact answer pattern.  
**A:** Use in-stock items (qty > 0) from stock summary / in-stock reporting.  
Explicitly say you are not listing low-stock-only or zero stock unless asked.  
Names only; branch names only if multi-branch.  

**Q:** May AI invent product cost or margin if tools didn’t return them?  
**A:** No. Only quote cost/sell/margin when product details, price history, or P&L tools/reports return them.  
Otherwise say the figure isn’t available and point to product/price screens.  

**Q:** Blind GRN vs receiving against an LPO — when which?  
**A:** Prefer receiving against the LPO so purchasing and stock match.  
Blind GRN only when process allows receiving without a PO.  
Don’t invent receipt quantities.  

**Q:** Margin sanity: sales of a product, profit by product, and stock value.  
**A:** Sales-by-product for quantity/amount.  
Profit/loss by product or profit tool tops for margin — only if returned.  
Inventory valuation for stock value.  
Never invent margins.  

**Q:** Recategorize products and then read category sales — what to warn?  
**A:** Category sales follow the category on products for the period rules of the report.  
After recategorizing, interpret trends carefully; don’t invent historical re-buckets.  

**Q:** Inventory settings and platform stock-deduct disagree in someone’s head — advice?  
**A:** Tell them to verify both inventory settings and platform org stock-deduct configuration.  
Trace actual movements in transactions.  
Never guess which setting “wins” without looking.  

**Q:** Returning goods to a supplier while LPOs are still open — two threads.  
**A:** Supplier returns/credit for the return.  
Open LPOs remain about unreceived purchasing — not automatically closed by a return.  
Don’t invent return quantities.  

**Q:** Stock take posts a value change — what about accounting?  
**A:** Operationally post stock take first.  
If value hits GL, mappings must exist; verify in accounting rather than inventing journal lines.  

**Q:** Sugar: details, in stock?, low?, last price change, sales — one dossier.  
**A:** Labeled tool-backed facts only; name “Sugar”; low stock only if reorder breached; never SKU.  

**Q:** Single-branch company: should valuation answers mention branches?  
**A:** No branch labels if not multi-branch.  
If multi-branch, branch names only — never ids.  

**Q:** Need to move stock shop→warehouse but menu names differ — how to guide without a path dump?  
**A:** Describe creating an inventory transfer between locations/branches.  
If they can’t find it, use screen search for “transfer.”  
Confirm via stock transactions after posting.  

**Q:** Low stock list → we should buy — can AI create the LPO in the same breath?  
**A:** Yes explain the need from low-stock data (quoted).  
Guide LPO creation but require confirm — never claim the LPO exists already.  

**Q:** Catalogue maintenance: VAT, UoM, categories, restoring deleted products — one map in words.  
**A:** Maintain tax codes, units, category tree, and product masters.  
Restore soft-deleted products only if permitted, then verify they’re sellable again.  
Don’t invent codes or conversions.  

**Q:** Purchases-by-supplier is empty though we raised LPOs — possible reasons.  
**A:** LPOs may be unreceived (not yet purchases).  
Date filters may exclude them.  
Use purchasing overview and open LPO views; don’t invent purchase totals.  

**Q:** Posted damage — how should on-hand and movement reports behave?  
**A:** On-hand should drop for that item/location after posting.  
Movement/transactions should show the damage movement.  
If not, the document didn’t post — don’t invent the drop.  

**Q:** Our company calls GRN “Goods In Note.” How should AI learn and answer?  
**A:** Prefer Platform AI training notes for tenant wording.  
Answer using their term while explaining it’s goods receipt into stock.  
Don’t invent alternate document types.  

**Q:** How to present multi-branch valuation in a reply table?  
**A:** Use tool data; product names; branch name column if multi-branch; amounts from valuation only; never branch ids or invented values.  

**Q:** User wants an adjustment but describes breakage — correct them.  
**A:** Breakage/damage should use the damage process.  
Adjustments are for other corrections.  
Wrong document type misstates operations and often accounting.  

**Q:** “Payment methods” for paying Bidco vs POS tenders — different?  
**A:** Paying Bidco is supplier payments (AP).  
POS payment methods are customer tenders at checkout.  
Don’t configure one expecting the other to change.  

**Q:** Auditor asks what stock chain is for.  
**A:** Explain it as a trace/flow view of stock across movements when enabled, used with on-hand and movement reports.  
Quote report outputs only.  

## Accounting, cash & reconciliation

**Q:** User pasted an unbalanced journal and asked me to “post it.” Response?  
**A:** Refuse to treat it as postable until debits equal credits.  
Explain journals must balance.  
Use real chart-of-accounts names — don’t invent account codes.  
Don’t claim posted without confirmation.  

**Q:** Explain bank register, journals, and bank reconciliation as a chain.  
**A:** Bank register shows bank movements.  
Journals/postings hit the GL.  
Reconciliation matches statement lines to register lines.  
Don’t invent reconciliation ticks.  

**Q:** M-Pesa totals don’t match — recon, paybill config, shop payments, cash pulse.  
**A:** Compare M-Pesa reconciliation unmatched items.  
Verify paybill/integration configuration without inventing numbers.  
Cross-check shop payments breakdown tenders.  
Use cash position for overview — still no invented settlements.  

**Q:** Equity reconciliation is empty — what usually has to exist first?  
**A:** Equity accounts/payment setup must be configured and transactions must exist.  
Then reconciliation can match settlements.  
Don’t invent Equity identifiers or cleared amounts.  

**Q:** Owner pack: trial balance, balance sheet, cash flow, P&L, plus live cash and profit tools.  
**A:** Explain each statement’s purpose and quote only screen/tool figures.  
Add cash position and profit tool pulses as labeled extras.  
Never invent statement lines.  

**Q:** Need a correcting journal but the period is closed.  
**A:** Say the period is closed if that’s what fiscal periods show.  
Advise reopen if policy/permissions allow, or post in an open period per policy.  
Prepare a balanced journal — never claim it posted without success.  

**Q:** POS receipt vs Shop Debtors vs accounting customer invoice — which “invoice”?  
**A:** POS receipt/order is the sale document at the counter.  
Shop Debtors tracks credit sales collection.  
Accounting customer invoices are AR documents in the ledger world.  
Clarify which the user needs; balances from tools only.  

**Q:** AP control: payables screen, payables report, paying suppliers, subledger recon.  
**A:** Work payables operationally, report for analytics, pay via supplier payments, and use subledger reconciliation to compare subledgers to controls.  
No invented differences.  

**Q:** Accounting export failed — what cluster of checks?  
**A:** Read export queue errors.  
Confirm period open/closed.  
Confirm account mappings complete.  
Don’t invent file contents.  

**Q:** Expenses feel high vs profit soft vs cash tight — one finance stress answer.  
**A:** Expense summary + profit tool/P&L + cash position, labeled.  
No invented figures; charts only if asked.  

**Q:** Someone wants a what-if cash scenario — how to use scenario vs facts?  
**A:** First state factual cash position from the tool.  
Only then run scenario calculation with allowed inputs.  
Never invent a base ledger balance to feed the story.  

**Q:** Insights said something bold about sales — what else should I do?  
**A:** Treat insights as curated hints.  
Verify with sales brief/summary (and cash/debtors if relevant) before advising action.  

**Q:** Equity tender missing on POS.  
**A:** Enable/configure payment methods and Equity accounts as required, and ensure the till session can use that tender.  
Don’t invent that it’s enabled.  

**Q:** After collecting from a debtor, what reports/tools confirm it?  
**A:** Customer statement, debtors/AR views, aging/top debtors refresh, invoice payments history — all quoted from system.  

**Q:** Invoice shows wrong company details.  
**A:** Fix company profile fields used on documents and print templates.  
Don’t invent legal name/PIN.  

**Q:** Investors report + P&L + cash for owners.  
**A:** Three labeled factual sections; never invent investor or P&L amounts.  

**Q:** Payroll bank transfer list empty after “running payroll.”  
**A:** Confirm payroll actually completed.  
Confirm employees have bank details.  
Regenerate the bank transfer listing — don’t invent IBANs or totals.  

**Q:** Posted a journal — how to verify in GL and TB?  
**A:** Enquire general ledger for the accounts.  
Check trial balance impact — quote screens only.  

**Q:** User asks “cash” vaguely — disambiguate three meanings.  
**A:** Ask/clarify: live cash position, shop tender breakdown, or period cash flow statement — then answer the matched meaning with tools.  

**Q:** Who owes us — AR screen + debtors summary + top debtors together.  
**A:** Ledger AR for accounting view, debtors summary tool for snapshot, top debtors for ranking — customer names only.  

**Q:** Can AI fiscalize an accounting customer invoice the same way as POS?  
**A:** Don’t invent a special fiscal API.  
Guide fiscalization through the org’s KRA/fiscal sales flows and error/unfiscalized views as applicable.  

**Q:** Sales posts but GL looks wrong — mappings?  
**A:** Suspect missing/incorrect account mappings for sales/inventory/tax.  
Don’t invent mapping accounts; have them fix mappings and reassess.  

**Q:** Trial balance vs balance sheet — user mix-up.  
**A:** Trial balance lists account balances to check ledger integrity.  
Balance sheet is the statement of financial position.  
Give both purposes; no invented amounts.  

**Q:** Configure M-Pesa vs reconcile M-Pesa — difference.  
**A:** Configuration = connection/paybill setup.  
Reconciliation = matching settlements to recorded payments.  
Don’t invent either.  

**Q:** User asks AI to invent PAYE journal lines for payroll.  
**A:** Refuse invented rates/journals.  
Quote payroll preview/statutory reports and verify accounting postings on screens.  

**Q:** Owner wants cash, top debtors, and top products by gross profit.  
**A:** Three tool-backed sections: cash position, debtors summary, profit tool tops — names only.  

**Q:** Shop EOD vs unfinished bank recon — priority?  
**A:** Operational shop close (till/EOD) vs finance recon can both be needed; explain both and let role decide order.  
Don’t invent that one auto-finishes the other.  

**Q:** Same day need bank recon and Equity recon.  
**A:** Do both reconciliations; use cash position as overview; no invented cleared marks.  

**Q:** Expense category missing and report empty.  
**A:** Create/select categories properly; check report filters; never invent categories or totals.  

**Q:** User insists on account codes in the answer.  
**A:** Prefer account names from the chart of accounts.  
If a code isn’t returned by the system, don’t invent one.  

## Fulfillment & routes

**Q:** Dispatch morning brief in business language: plan, assign, run, masters.  
**A:** Plan schedules, assign on the dispatch board, run trip lifecycle, keep drivers and vehicles masters accurate.  
Use route orders/details tools for factual debriefs — names only.  

**Q:** POD compliance is low — what operational steps?  
**A:** Capture/fix POD records for deliveries.  
Monitor POD compliance reporting.  
Review driver delivery performance separately.  
Don’t invent compliance percentages.  

**Q:** Trip won’t depart — pick and load not done.  
**A:** Complete picking and loading confirmation first, then depart.  
Don’t invent an override code.  
Mention stock may already deduct at pick/load depending on settings.  

**Q:** Cancelled vs expired fulfilment orders — what next?  
**A:** Cancelled and expired are different end states from live orders.  
Usually recreate/reapprove per policy rather than inventing a revive action.  

**Q:** Debrief Eastlands and Westlands routes in one answer.  
**A:** Two labeled sections from route orders/details tools using route names — no ids; don’t invent stops.  

**Q:** Vehicle trip loads report empty.  
**A:** Vehicles master must exist, trips must assign vehicles, then loads report can show data — no invented loads.  

**Q:** Driver Otieno record vs his login user vs assigning a trip.  
**A:** Driver master is operational.  
Login user details are name/role only — no internal ids.  
Assignment happens on dispatch/trips.  

**Q:** Does stock leave at trip pick, load, or depart for us?  
**A:** It depends on stock-deduct configuration — list possible moments and insist on checking tenant config, then transactions.  

**Q:** Loading sheet under sales vs loading list under fulfilment — same idea?  
**A:** Same operational idea, different menus depending on workspace.  
Describe confirming what was loaded; use screen search if needed; no invented qty.  

**Q:** Old routes menu vs fulfilment routes.  
**A:** Prefer fulfilment routes for distribution ops; some tenants still have legacy routes CRUD.  
Use route details tool for facts.  

**Q:** Partial delivery with partial POD — how to describe status?  
**A:** Only use statuses the system shows.  
POD should match what was delivered.  
Don’t invent “partial delivered” labels.  

**Q:** Trip cash vs shop Z vs company cash position.  
**A:** Trip cash settlement = van.  
Z-report = shop till session.  
Cash position = org cash/bank pulse.  
Keep them separate.  

**Q:** Customer missing on Save order — route explanation end-to-end.  
**A:** Save order filters by assigned routes.  
Confirm route membership via route details/masters.  
Not GPS. Names only.  

**Q:** Manager wants dispatch trip analytics, mobile route sales, and a live route debrief.  
**A:** Three angles: dispatch trips report, mobile route sales report, route orders tool — quote only.  

**Q:** Warehouse asks which picking screen to use.  
**A:** Describe picking work; if dual menus exist, use screen search for “picking” and open what it returns.  
Don’t invent pick wave ids.  

**Q:** Should van field attendance hit payroll attendance?  
**A:** No — sales/distribution field attendance is not HR payroll attendance.  
Keep separate.  

**Q:** Expired fulfilment order but stock was reserved mentally — what to do?  
**A:** Treat expired as not live; create a new order per policy if still needed.  
Check real stock with stock tools before dispatch — don’t invent reservation.  

**Q:** POD photo missing — compliance and recapture.  
**A:** Recapture POD on the POD records process; compliance reports will improve only after real captures.  
No invented %.  

**Q:** Driver linked to employee — can I discuss pay?  
**A:** Yes via payroll preview/HR tools for that employee name.  
Still never invent statutory rates; shift Saturday wording rules apply.  

**Q:** Fulfilment dashboard KPIs look blank — invent?  
**A:** No. Use operational reports (dispatch, loads, POD, settlements) for numbers; say when data isn’t there.  

**Q:** Schedules empty — root setup order.  
**A:** Define routes, drivers, vehicles first; then schedules; then dispatch trips.  

**Q:** Loading quantity exceeds on-hand — advice.  
**A:** Stop and compare load to stock summary on-hand.  
Fix pick/load or replenish; don’t invent stock to allow depart.  

**Q:** Route orders + who is on the route + Save order filter — one explanation.  
**A:** Route master/tools define the route.  
Route orders debrief activity.  
Mobile Save order shows customers in assigned routes.  

**Q:** Fulfilment cancelled but Shop Debtor still open — related?  
**A:** Not automatically. Cancellation doesn’t invent a payment or clear credit.  
Check debtors/AR separately.  

**Q:** Afternoon ops review: driver deliveries, vehicle loads, trip charts.  
**A:** Three factual ops views; no invented KPIs.  

## Hospitality

**Q:** Opening the hotel: arrivals/occupancy, desk, housekeeping dirty rooms.  
**A:** Review arrivals/occupancy reporting, run front desk/reservations, and let housekeeping drive dirty/clean/inspect statuses.  
Don’t invent occupancy %.  

**Q:** Night audit failed — open checks, folio balances, voids.  
**A:** Close/resolve open checks, fix folio problems, review voids if needed, retry night audit.  
No invented audit totals.  

**Q:** Bar stock variance — consumption variance, POS, damages.  
**A:** Investigate theoretical vs actual consumption reporting, bar POS postings, and damage/adjustment if breakage.  
Don’t invent variance %; deduct timing follows stock settings.  

**Q:** Group wants folio split 60/40 — what may AI not do?  
**A:** Guide using folio split tools in the UI.  
Don’t invent percentages as posted and don’t claim saved without confirmation.  

**Q:** Hotel outlet orders vs bar vs combined hospitality orders.  
**A:** Send staff to the matching outlet queue/POS.  
Combined list is for overview.  
Retail POS is the wrong place for bar.  

**Q:** GM pack: flash, room revenue, hospitality P&L vs shop P&L.  
**A:** Provide hotel reports as labeled hotel sections.  
Shop/org P&L separately from profit tools.  
Never merge into one invented profit.  

**Q:** Walk-in rate not in the system — may AI quote a rate?  
**A:** No. Rates come from rate plans/UI.  
Say the rate isn’t available rather than inventing.  

**Q:** Bar POS shows no outlet.  
**A:** Outlets must be defined/enabled and hotel settings aligned; tenders must exist.  
Don’t invent outlet ids.  

**Q:** Guest pays folio half cash half M-Pesa.  
**A:** Post both tenders on the folio/payment UI if allowed.  
M-Pesa depends on real integration config.  
Don’t invent auth codes.  

**Q:** After checkout who marks the room dirty?  
**A:** Front desk checks the guest out; housekeeping updates status.  
Don’t invent housekeeping statuses beyond the board.  

**Q:** Hospitality behaviour mismatch — two config places.  
**A:** Check hospitality module settings and admin hotel settings; describe both without inventing flags.  

**Q:** Hospitality EOD cashier vs retail EOD.  
**A:** Different closes for different businesses; disambiguate and guide the matching one.  

**Q:** Loss control: open checks, voids, bar activity.  
**A:** Clear open checks before audit; review voids; review bar orders — quote reports only.  

**Q:** Guest package “half board” vs employee “half-day.”  
**A:** Half board is a hotel rate/package concept.  
Employee Saturday alternate hours are not half-days.  
Don’t cross the terms.  

**Q:** Hospitality payments breakdown then night audit order.  
**A:** Review tenders, ensure checks/folios ready, then night audit.  

**Q:** Happy path: book, allocate room, check in, charge folio.  
**A:** Reservations → room inventory → front desk check-in → folio charges.  
No invented confirmation numbers.  

**Q:** F&B by outlet/hour/category — how to answer without inventing.  
**A:** Use the hospitality F&B reports; prefer screen search by topic; quote only.  

**Q:** Hotel shows weird currency.  
**A:** Check hotel settings and company profile.  
For Kenya-focused orgs answer in KES unless tools say otherwise — don’t invent FX rates.  

**Q:** Folio balances report vs working folios.  
**A:** Report for oversight; folio screen to work guest accounts — no invented balances.  

**Q:** Retail till still open during hotel night audit.  
**A:** Say they don’t block each other conceptually; give hotel audit triage and separate retail till close advice.  

**Q:** Dirty vs clean vs inspect — brief meanings.  
**A:** Describe as housekeeping board statuses for room readiness; use only statuses the system shows.  

**Q:** Confusion between hospitality order list and posting on bar POS.  
**A:** Lists show orders; bar POS posts bar sales — explain both roles.  

**Q:** Manager flash empty.  
**A:** Often needs night audit/ops completion and real data; don’t invent flash numbers.  

**Q:** Group booking rooms availability + folio split.  
**A:** Check room inventory truthfully; split charges only via folio tools; no invented availability.  

**Q:** Consumption variance plus stock value plus deduct timing.  
**A:** Three labeled factual threads; no invented variance or values; deduct from config not guesses.  

## HR & payroll

**Q:** Compare Jane and Otieno attendance today with schedules; no half-day language.  
**A:** Two labeled attendance sections from the attendance tool including scheduled start/end.  
Alternate Saturday hours = scheduled alternate hours, not half-days.  
Names only; no invented punch times.  

**Q:** Leave balances vs leave requests vs absents.  
**A:** Leave manages requests/balances (don’t invent balances).  
Absents tracks absence differently from approved leave.  
Use leave balance reporting when available.  

**Q:** Configure allowances, deductions, advances, then preview Jane’s pay.  
**A:** Explain those setup areas, then quote payroll preview for Jane only — no invented amounts/rates.  

**Q:** Workforce pack: headcount, turnover, contract expiry, HR KPIs.  
**A:** Explain each report’s purpose and quote only real outputs — no invented turnover %.  

**Q:** Clock device problems + missed punches.  
**A:** Device registration/settings, clock kiosk, then missed-punch resolution.  
Don’t invent device serials or punch times.  

**Q:** Same week: pending overtime and lateness — structure.  
**A:** Separate sections and datasets; clean punches before OT; no blended invented hours.  

**Q:** New department structure: order of setup.  
**A:** Departments, then positions, then employees assigned — optional KPIs later.  

**Q:** Filing pack after payroll run.  
**A:** Payroll summary, statutory deductions, NSSF remittance, bank transfer — quote reports; never invent rates.  

**Q:** Explain Saturday alternate shift hours using shifts + attendance fields.  
**A:** Shifts define per-day schedules including shorter Saturday hours as alternate schedule — not half-days.  
Attendance should show scheduled start/end and alternate flag when present.  

**Q:** Duplicates inflated hours before OT approval.  
**A:** Clean duplicates, recheck attendance, then pending OT — no invented OT.  

**Q:** Payroll question mistakenly using sales field attendance.  
**A:** Redirect to HR attendance for payroll; sales field attendance is distribution ops.  

**Q:** Contracts expiring + who they are + positions.  
**A:** Contract expiry report + employee details tool + positions master — no invented dates.  

**Q:** Bank transfer report empty.  
**A:** Payroll must be completed; bank details on employees; regenerate listing.  

**Q:** Non-statutory deductions trail.  
**A:** Deduction setup, preview lines, other-deductions report — no invented codes.  

**Q:** Team register vs one employee attendance.  
**A:** Attendance register for the team; attendance tool for one person with schedule fields.  

**Q:** Punches ignore shift times.  
**A:** Check HR settings, shift assignment, and clock devices — don’t invent timezone offsets.  

**Q:** Advance outstanding vs net pay.  
**A:** Advances can reduce net; show via payroll preview lines — never invent net pay.  

**Q:** High turnover — what to measure and where hiring happens.  
**A:** Measure with turnover/headcount reports; hire via employees after departments/positions — no invented %.  

**Q:** Statutory report for the company vs preview for one person.  
**A:** Macro filing reports vs micro payroll preview — both without invented rates.  

**Q:** Calling a scheduled off-day “absent.”  
**A:** Don’t. Use leave/absence screens’ real statuses only.  

**Q:** HR manager landing briefing: people, time, pay.  
**A:** People masters → attendance/shifts/exceptions → payroll and previews — tool-backed numbers only.  

**Q:** Mid-month position change and allowances.  
**A:** Update position/assignment; review allowance applicability; preview next payroll before committing — no invented deltas.  

**Q:** Lateness list but clock failed that morning.  
**A:** Fix missed punches/data quality first; then interpret lateness — no invented minutes.  

**Q:** Employee KPIs vs HR dashboard KPI report.  
**A:** Individual/team KPI tracking vs workforce KPI report — don’t invent scores.  

**Q:** User asks AI to state housing levy rate from memory.  
**A:** Refuse. Only quote statutory lines returned by payroll preview/reports for this run/tenant.  

## Admin, platform & assistant behaviour

**Q:** How should AI handle a 4-part ERP question methodologically?  
**A:** Parse each part; search training notes for process wording; find screens when navigation is unclear; call domain tools for figures; reply in labeled sections matching the user’s parts; never invent numbers; charts only if asked.  

**Q:** Fiscal offline AND wrong letterhead AND bad till receipts — one triage narrative.  
**A:** Fiscal: settings, responses, unfiscalized sales — no QR invention.  
Letterhead: company profile + document templates.  
Till receipts: till printing settings.  
Keep the three fixes distinct.  

**Q:** Fast mode and streaming on — can you still answer a 4-part question fully?  
**A:** Yes. Batch tools and still cover every part.  
Streaming improves time-to-first-token; fast mode trims context; tool-round caps limit loops — they don’t justify dropping parts.  

**Q:** Where do tenant AI model settings differ from platform AI credentials and usage?  
**A:** Tenant chooses provider/model/use-platform-AI in admin AI settings.  
Platform credentials are super-admin secrets — never invent or echo keys.  
Usage monitoring shows consumption.  

**Q:** Offboard a user properly.  
**A:** Disable the user, review role access, check audit for last actions.  
Don’t invent a secret session-kill API.  

**Q:** “Are we licensed/paid?” across tenant and platform.  
**A:** Tenant license status, platform subscriptions/invoices if SaaS, company legal profile — no invented expiry dates.  

**Q:** Stock timing debate: mobile, distribution, inventory settings.  
**A:** Those settings tabs can all influence field/distribution/stock behaviour; platform stock-deduct may also apply.  
Verify rather than guessing.  

**Q:** User got no notification.  
**A:** Check inbox, notification settings, and whether permissions/audit suggest delivery/access issues — don’t invent delivery logs.  

**Q:** Brand looks wrong in UI and on documents.  
**A:** UI theme vs document print templates vs company profile fields — three different fixes.  

**Q:** Platform communications map: WhatsApp, mailbox, email, push.  
**A:** Explain each as platform-level connectivity; tenant sales WhatsApp remains separate for sales ops.  
No invented API keys.  

**Q:** Commercial platform: plans, subscriptions, contracts, invoices.  
**A:** Explain the commercial objects at a high level; never invent prices.  

**Q:** Per-tenant debtor days and stock deduct live where conceptually?  
**A:** In the tenant’s platform/org configuration (and related admin settings).  
AI training notes can be workspace-scoped.  
Don’t invent flag values.  

**Q:** Incident pack for platform ops.  
**A:** Health, system issues, backups, active users — factual status only.  

**Q:** Legacy import vs legacy archive vs legacy sales documents.  
**A:** Converter utilities, archive reporting, and legacy order/return history — don’t mix into live fiscalization advice.  

**Q:** One question @mentions a product, supplier, customer, and employee.  
**A:** Resolve each mention; run the right tools; answer in four labeled sections; names only — no codes/ids.  

**Q:** User is on a filtered list screen and asks for totals + another module question.  
**A:** Page context is a hint only; verify totals with tools; still answer the other module part fully.  

**Q:** “Create product, check stock, and remind me how we name GRNs.”  
**A:** Stock check via tools now.  
Create product requires confirm — don’t claim created.  
GRN naming from training notes / tenant wording.  

**Q:** Custom report + VAT + cash in one reply.  
**A:** Custom report only with real id/link after success.  
VAT tool figures.  
Cash position figures.  
Labeled sections.  

**Q:** Message mixes weather and “what’s in stock / today’s sales.”  
**A:** Decline weather briefly; fully answer in-stock (qty>0) and sales tools — don’t drop ERP parts.  

**Q:** AI knowledge hygiene: foundation notes, duplicates, export.  
**A:** Install foundation notes if desired; merge/delete duplicates; export before wipe/re-upload.  

**Q:** DeepSeek: chat vs reasoner for Centrix speed.  
**A:** Prefer the fast chat model over a reasoner model for lower latency in ops Q&A.  
Don’t invent API keys; configure via tenant/platform AI settings.  

**Q:** Below-cost denied: approvals, roles, POS, audit.  
**A:** Full access tree in words; no invented bypass.  

**Q:** Throughout today’s answers, how should branches be named?  
**A:** Only if multi-branch, and only by branch name — never branch id. Single-branch: omit.  

**Q:** Security settings during offboarding.  
**A:** Review security/session policies as configured; disable user; audit — don’t invent policy values.  

**Q:** KRA compliance overview + receipts/invoices lists + error log mindset.  
**A:** Compliance summary for overview; receipts/invoices listings for detail; responses/errors for diagnosis — no invented fiscal payloads.  

**Q:** Navigation unknown inside a multi-part question.  
**A:** Use screen search for ambiguous parts; still answer factual parts with tools in the same reply.  

**Q:** How to write training Q&A so answers aren’t path directories?  
**A:** Questions should be real user problems; answers should explain decisions, rules, and tool-backed facts.  
Mention a screen only when it helps the user act — not as a directory dump.  

**Q:** User asked for a chart of AR aging and also the top debtor names.  
**A:** Because they asked for a chart, chart real aging data if available.  
Also list top debtor names/amounts from tools — never invent.  

**Q:** Compound message includes “create LPO” and “create journal.”  
**A:** Answer any reads with tools.  
For each create, require confirmation and don’t claim saved without action success.  

**Q:** Which hub for which manager: business, sales, inventory, fulfilment, accounting, HR, hotel?  
**A:** Match the manager to the module hub and pair with the right summary tools — explain in words, not a path list.  

**Q:** Documents print wrong; till prints wrong; need reprint of last invoice.  
**A:** Fix templates/profile for documents; till printing for receipts; reprint from the existing order/document — no invented invoice numbers.  

**Q:** Someone asks to paste platform AI API keys in chat.  
**A:** Refuse to invent or expose secrets.  
Only authorized admins should use the credentials UI.  

**Q:** Active users spiked with health warnings.  
**A:** Look at active users, health, and system issues together; don’t invent a root cause.  

**Q:** Stock left at unexpected time — which settings cluster to review?  
**A:** Inventory settings, distribution/mobile settings if field ops, and platform stock-deduct — verify with transactions.  

**Q:** Final expectation for complex multi-line Centrix questions.  
**A:** Parse every part; batch tools; answer in labeled sections with real explanations and figures from tools; keep hard rules (names only, no invented numbers, in-stock ≠ low-stock, Saturday alternate ≠ half-day, charts only when asked); mention screens sparingly when useful; refuse only non-ERP slices, not the whole message.  

