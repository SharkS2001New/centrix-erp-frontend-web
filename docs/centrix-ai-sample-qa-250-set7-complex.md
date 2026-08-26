# Centrix ERP — Sample AI Q&A Set 7 (250 complex multi-part questions)

Companion to Sets 1–6. **True Q&A** — explanations and decisions, **not** a directory of paths.

Each answer addresses the question in plain language and uses tools for figures. Mention a screen only when it helps the user act.

**Import:** Platform → AI training → Bulk paste (`Q:` / `A:`).

**Hard rules:** Answer every part; never invent numbers; names only; in stock ≠ low stock; Saturday alternate ≠ half-day; charts only if asked; creates need confirmation.

---

## Compound Q&A across Centrix ERP

**Q:** I need Shop Debtors vs AR explained, and how to quote balances safely.  
**A:** Shop Debtors is the credit-sales collection queue. AR is the ledger view of receivables. Quote amounts only from debtors/statement tools—never invent. Customer names only.  

**Q:** Purity’s sales, till health, and X vs Z—together.  
**A:** Sales-by-cashier for Purity (name only, no user id). Till health for session status—don’t invent float. X is mid-session; Z closes the session.  

**Q:** Acme statement, utilization, and multi-invoice payment.  
**A:** Statement tool for Acme; portfolio for utilization (no invented %); collect/allocate via Shop Debtors/payment flows—don’t invent payment refs.  

**Q:** Held carts vs WhatsApp queue vs mobile queue; restore held.  
**A:** Held=live parked cart to restore on POS. WhatsApp=inbound chat orders. Mobile=field app orders. Restore from held list—no invented order numbers.  

**Q:** EOD: tenders, end-of-day, still need Z?  
**A:** Review tender breakdown, Z-close till sessions, then retail EOD. Use till health/reports—never invent totals.  

**Q:** Loyalty + voucher on one sale—what can’t AI invent?  
**A:** Points and voucher codes. Apply only real system values at payment.  

**Q:** Customer return vs supplier return vs returns analytics.  
**A:** Customer credit/return vs supplier return vs analytics summary—label the side; analytics doesn’t replace posting.  

**Q:** Proforma vs tax invoice vs reprint.  
**A:** Proforma is quote-style; tax invoice is formal/fiscal sale invoice; reprint re-outputs an existing document. Never invent numbers.  

**Q:** Below-cost blocked on POS—diagnosis.  
**A:** Check manager-approval rules and role permissions. Don’t invent a bypass.  

**Q:** “Sales today” vs full summary vs daily/channel/category views.  
**A:** Brief for pulse; summary for fuller totals; channel/category from those reports/tools—quote only.  

**Q:** VAT, price list, and price history for a named product.  
**A:** VAT tool/report; price list; price history for that product name only—no invented prices.  

**Q:** Aging vs top debtors vs invoice payments.  
**A:** Aging=time buckets; top debtors=who owes most; invoice payments=allocation history—names and tool figures only.  

**Q:** Legacy vs live orders.  
**A:** Live ops on current orders; legacy=imported/history; don’t fiscalize legacy as live advice.  

**Q:** Picking vs loading vs trip charts.  
**A:** Pick prepares; loading confirms van load; trip charts are trip views—no invented load qty.  

**Q:** Sales field attendance vs HR attendance.  
**A:** Field ops vs payroll attendance—don’t merge totals.  

**Q:** Mobile returns/expenses approval.  
**A:** Approve first; then normal returns/expenses; don’t claim posted early.  

**Q:** Investors—invent balances?  
**A:** No. Only quote investor screens/reports.  

**Q:** Retail POS vs backoffice cart vs bar POS.  
**A:** Retail cashiers→retail POS; backoffice cart for backoffice create; bar→hotel/bar POS.  

**Q:** Reservations shop vs hotel.  
**A:** Disambiguate sales reservations vs hotel reservations/front desk.  

**Q:** Unpaid/partial/paid debtors and date window.  
**A:** Three credit-sales statuses; window uses shop-debtors default days≠orders-list days; balances from tools.  

**Q:** Sales by product + by customer naming rules.  
**A:** Names only; Product|Qty|Amount style; never codes/ids; tool totals only.  

**Q:** Credit limit exceeded at checkout.  
**A:** POS may block/warn from master limit+exposure; quote statement/portfolio; collect or follow approvals—never invent limit.  

**Q:** Voucher then loyalty on same cart.  
**A:** Real codes and real points only; if fail, check masters—don’t invent.  

**Q:** Payments breakdown vs till sessions vs till health.  
**A:** Tenders vs history vs live pulse—no invented cash-up.  

**Q:** Inactive customers + high utilization.  
**A:** Both from portfolio tools—names only; no invented %.  

**Q:** Route sales debrief + analytics.  
**A:** Route orders tool + mobile route sales reporting; names only.  

**Q:** Restore held, reprint, then return.  
**A:** Restore→reprint existing→post return if needed—no invented docs.  

**Q:** Debtors default days vs orders list days.  
**A:** Different settings for different lists—don’t conflate.  

**Q:** WhatsApp queue vs tenant WhatsApp vs platform WhatsApp.  
**A:** Queue=orders; tenant admin=config; platform=super-admin connectivity—no secrets invented.  

**Q:** Top GP products + P&L.  
**A:** Profit tool tops if returned + P&L views—never invent margins.  

**Q:** Float, X, Z for new cashier.  
**A:** Float from UI; X mid-shift; Z closes—till health for status; no invented float.  

**Q:** Naivas customer statement + Bidco supplier statement.  
**A:** Two labeled tool sections; don’t cross figures; names only.  

**Q:** Credit + loyalty + fiscal checks.  
**A:** Real credit/points; fiscal via settings/errors/unfiscalized—never invent QR/CU.  

**Q:** After multi-invoice allocate—confirm how?  
**A:** Statement/debtors/AR + invoice payments history—system only.  

**Q:** POS old price debug.  
**A:** Master price, packs/UoM, price history; refresh cart; no invented override.  

**Q:** EOD failed till open.  
**A:** Z-close session then retry EOD; till health for open sessions.  

**Q:** Sales-by-user vs sales-by-cashier.  
**A:** Report vs named cashier tool; name/username only—never user id.  

**Q:** Supplier return + open LPOs.  
**A:** Separate threads: returns vs unreceived POs; purchasing overview for open—no invented counts.  

**Q:** Vouchers vs loyalty vs payment methods.  
**A:** Issue/redeem vs points vs which tenders appear—don’t invent rules/tenders.  

**Q:** Manager briefing home + sales + brief tool.  
**A:** Business summary + sales analytics + sales brief/summary figures—no invented totals.  

**Q:** In stock vs low stock vs valuation.  
**A:** Qty>0 vs reorder breach vs value; branch names only if multi-branch; never swap lists.  

**Q:** Product details + price history + stock.  
**A:** Three tool sections; name only; don’t invent on-hand/prices.  

**Q:** LPO create, receive, monitor open.  
**A:** Create needs confirm; receive posts stock; open LPO views for leftovers—no invented PO numbers.  

**Q:** Transfer vs adjustment vs damage.  
**A:** Move vs correct vs breakage—wrong doc wrong effect.  

**Q:** Stock take audit trail.  
**A:** Post count; prove in transactions; movement analytics—no invented variance.  

**Q:** Catalogue maintenance map.  
**A:** Categories, UoMs, VAT codes, restore deleted if allowed—no invented conversions.  

**Q:** Supplier statement + pay + purchases-by-supplier.  
**A:** Statement tool + supplier payments + report—names only.  

**Q:** Multi-branch labeling rules.  
**A:** Branch names only if multi-branch; never branch ids.  

**Q:** Pack mismatch POS.  
**A:** Align product/UoM/pack masters—don’t invent pack qty.  

**Q:** On hand vs chain vs low stock.  
**A:** Snapshot vs trace vs reorder-only.  

**Q:** LPO approval + print + supplier PIN.  
**A:** Wait for approval if required; print when printable; PIN on supplier master—never invent PIN.  

**Q:** Manager analytics vs clerk on-hand.  
**A:** Valuation/analytics vs stock list + posting docs; chat via stock tools.  

**Q:** LPOs vs suppliers vs purchases hub.  
**A:** Orders vs supplier master/payments vs hub alias—explain roles.  

**Q:** After GRN confirm value and movements.  
**A:** Receipt→transactions→valuation tool—no invented deltas.  

**Q:** Supplier return vs warehouse damage.  
**A:** Back to supplier vs in-house damage doc.  

**Q:** Buyer morning routine.  
**A:** Overview pulse; open LPOs; new LPO only with confirm.  

**Q:** Cost/sell/margin policy.  
**A:** Only from tools/reports—never invent margins.  

**Q:** Stock deduct timing.  
**A:** Tenant stock-deduct config (create/complete/trip pick/load/depart)—never guess.  

**Q:** In-transit transfer talk.  
**A:** Document status + transactions—no invented qty.  

**Q:** VAT codes and VAT collected.  
**A:** Codes on products; collected from VAT tool—no invented VAT.  

**Q:** Old price on POS.  
**A:** History + master + packs; refresh cart.  

**Q:** Deleted product restored but missing on POS.  
**A:** Active, categorized, sellable, refresh POS—no invented SKU.  

**Q:** Choose damage/adjustment/stock take.  
**A:** Match reason; prove in transactions.  

**Q:** Supplier payment close loop.  
**A:** Pay→AP reflects→statement tool.  

**Q:** “What do we still have?”  
**A:** In-stock qty>0; not low-stock-only unless asked.  

**Q:** Mobile pack ≠ shop pack.  
**A:** Same masters; align packs; routes don’t create alternate packs.  

**Q:** Settings vs platform stock-deduct conflict.  
**A:** Verify both; trace transactions; don’t guess winner.  

**Q:** Teach AI our GRN name.  
**A:** Platform training note with tenant wording; prefer training at runtime.  

**Q:** Valuation reply format.  
**A:** Tool values; branch names if multi-branch; never ids.  

**Q:** Buyer afternoon wrap.  
**A:** Open LPOs; new LPO with confirm; pending supplier returns—no invented counts.  

**Q:** Sugar dossier: stock, low?, price change.  
**A:** Labeled tool facts; name only; low only if true.  

**Q:** Shop→warehouse move.  
**A:** Inventory transfer; confirm transactions; search “transfer” if needed.  

**Q:** Buy vs sell by supplier reports.  
**A:** Label sides; never invent attribution.  

**Q:** Prove adjustment and damage posted.  
**A:** Both in transactions/movement—or they didn’t post.  

**Q:** Cash morning trio.  
**A:** Cash position; bank movements; bank recon (+ M-Pesa/Equity if used)—no invented clears.  

**Q:** M-Pesa configure vs settle.  
**A:** Config/paybill setup vs reconciliation matching—no invented paybills.  

**Q:** Equity setup vs recon.  
**A:** Configure accounts then reconcile—no invented ids.  

**Q:** Journal posting rules.  
**A:** Must balance; COA names not invented codes; verify GL; no false posted.  

**Q:** Four statements map.  
**A:** TB integrity; BS position; CF period cash; P&L performance—quote only.  

**Q:** Month-end blockers.  
**A:** Period open/closed; mappings; export errors—don’t fake closed-period posts.  

**Q:** Receipt vs debtors vs AR invoice.  
**A:** Three layers—clarify which; tool balances only.  

**Q:** Expenses entry/summary/report.  
**A:** Real categories; summary tool; expenses report—no invented GL.  

**Q:** AP triangle.  
**A:** Payables view, report, supplier payments + statement.  

**Q:** Subledger recon purpose.  
**A:** Compare subledgers to controls—no invented differences.  

**Q:** Missing POS tender.  
**A:** Payment methods + till session + M-Pesa/Equity if relevant.  

**Q:** Profit views together.  
**A:** Profit tool + P&L + by-product—label; no invented margins.  

**Q:** Advances, payroll, bank transfer list.  
**A:** Advances may cut net; complete payroll; bank listing—statutory from tools only.  

**Q:** Mappings and company PIN.  
**A:** Fix mappings; company profile for PIN—never invent PIN.  

**Q:** Scenario vs insight vs cash facts.  
**A:** Cash facts first; insights verify; scenario only with allowed inputs.  

**Q:** Collections war room.  
**A:** Debtors summary + aging + top debtors + unpaid queue—names only.  

**Q:** Account codes request.  
**A:** Prefer COA names; don’t invent codes.  

**Q:** M-Pesa mismatch triage.  
**A:** Recon unmatched → config → payments breakdown.  

**Q:** CF statement vs cash position.  
**A:** Period vs now—answer both if asked.  

**Q:** Wrong invoice header.  
**A:** Company profile + print templates.  

**Q:** Multi-tender finance close.  
**A:** Cash pulse + bank + M-Pesa/Equity recon as used.  

**Q:** Export stuck.  
**A:** Queue errors + period + mappings.  

**Q:** Owner investors + P&L + cash.  
**A:** Three factual labeled sections.  

**Q:** Who owes us layers.  
**A:** Shop Debtors + ledger AR + customer statement—don’t pick one silently.  

**Q:** Missing expense category.  
**A:** Select/create real category—don’t invent codes.  

**Q:** Invent PAYE journals?  
**A:** No—quote payroll preview/reports; verify accounting UI.  

**Q:** Register vs journal vs recon.  
**A:** Explain chain; no invented ticks.  

**Q:** Margin sanity set.  
**A:** Sales-by-product + profit-by-product + valuation.  

**Q:** CFO vs operator home.  
**A:** Accounting statements vs business home; chat cash+P&L tools.  

**Q:** JE in closed period.  
**A:** Respect closed; reopen if allowed or open period; balanced; no false posted.  

**Q:** Dispatch morning brief.  
**A:** Masters; schedules; dispatch/trips; route tools for facts—names only.  

**Q:** Pick load depart POD + deduct caution.  
**A:** Pipeline; blocked depart if incomplete; deduct moment from config—don’t guess.  

**Q:** POD compliance + deliveries + trip cash.  
**A:** Three different reports—no invented %.  

**Q:** Dispatch vs vehicle loads vs driver loads.  
**A:** Explain each; names not ids.  

**Q:** Save order missing customers.  
**A:** Assigned routes—not GPS; fix assignment.  

**Q:** Cancelled/expired vs live fulfilment.  
**A:** Different end states; recreate per policy; no revive invention.  

**Q:** Driver master vs login vs assign.  
**A:** Ops master; display name/role only; assign on trips.  

**Q:** Partial delivery + POD.  
**A:** Status gates; POD matches delivered; don’t invent statuses.  

**Q:** Field day close.  
**A:** Route debrief + route sales analytics + sales field attendance≠HR.  

**Q:** Legacy routes vs fulfilment routes.  
**A:** Prefer fulfilment; legacy may exist; route details for facts.  

**Q:** Loading sheets vs loading lists.  
**A:** Same idea different menus—confirm load; no invented qty.  

**Q:** Depart blocked.  
**A:** Finish pick+load first.  

**Q:** Driver-employee pay + Saturday wording.  
**A:** HR payroll tools; alternate Saturday hours ≠ half-day.  

**Q:** Plan vs dispatch vs trips.  
**A:** Schedules plan; dispatch assigns; trips lifecycle.  

**Q:** Missing POD photo.  
**A:** Recapture; compliance needs real captures.  

**Q:** Route read vs edit.  
**A:** Tools read; editing changes masters; names only.  

**Q:** trip_pick vs order_completed deduct.  
**A:** Distribution vs counter—read tenant config.  

**Q:** Fulfilment KPIs blank.  
**A:** Don’t invent; use ops reports.  

**Q:** Mobile returns while trip open.  
**A:** Check status; approve; stock follows posted docs.  

**Q:** Empty vehicles → empty loads report.  
**A:** Create/assign vehicles on trips first.  

**Q:** Deliveries vs lateness.  
**A:** Keep separate unless both asked.  

**Q:** Expired fulfilment next step.  
**A:** Recreate per policy—no invent revive.  

**Q:** Which picking screen.  
**A:** Describe picking; search if dual menus; no wave ids.  

**Q:** Trip cash vs Z-report.  
**A:** Van ≠ shop till.  

**Q:** Route visibility end-to-end.  
**A:** Route membership drives Save order filter.  

**Q:** Hotel open brief.  
**A:** Arrivals/occupancy; front desk; HK dirty/clean—no invented %.  

**Q:** Walk-in folio room status.  
**A:** Check-in; folio charges; HK status—no invented rates.  

**Q:** F&B vs bar vs retail POS.  
**A:** Route staff to correct workspace.  

**Q:** Night audit recovery.  
**A:** Open checks → folios → retry—no invented totals.  

**Q:** Hospitality tenders and EOD.  
**A:** Payments breakdown; hospitality cashier EOD ≠ retail EOD.  

**Q:** GM flash/revenue vs retail P&L.  
**A:** Label hotel vs retail; never merge invented profit.  

**Q:** Group split folio.  
**A:** UI split only; don’t invent % or claim saved.  

**Q:** Voids open checks bar.  
**A:** Loss control trio; quote only.  

**Q:** Checkout vs HK.  
**A:** Desk out; HK marks dirty/clean.  

**Q:** Two hotel config places.  
**A:** Module + admin hotel settings.  

**Q:** Consumption variance.  
**A:** Theo vs actual + stock evidence—no invented %.  

**Q:** Order queues hotel/bar/combined.  
**A:** Match outlet.  

**Q:** Folio balances vs work vs payments.  
**A:** Oversight vs work vs tenders.  

**Q:** Half board vs half-day.  
**A:** Hotel package ≠ HR half-day; Sat alternate ≠ half-day.  

**Q:** Rooms board.  
**A:** HK + arrivals + desk—no invented counts.  

**Q:** Bar variance triage.  
**A:** Deduct config + bar POS + damages if breakage.  

**Q:** Close of house.  
**A:** Clear blockers; night audit; flash from real data.  

**Q:** Reservation happy path.  
**A:** Book→room→check-in→folio—no invented confirmations.  

**Q:** F&B reports.  
**A:** Use reports; quote only.  

**Q:** Folio cash+M-Pesa.  
**A:** Real tenders; config needed; no invented auth.  

**Q:** Weird currency.  
**A:** Hotel/company settings; KES default Kenya; no invented FX.  

**Q:** Open checks + voids then audit.  
**A:** Clear/investigate then retry.  

**Q:** Group split caution.  
**A:** UI only; no false saved.  

**Q:** Both P&Ls.  
**A:** Label; don’t merge.  

**Q:** Missing bar outlet.  
**A:** Enable outlets/settings/tenders.  

**Q:** Jane: shift, attendance, payroll; Sat≠half-day.  
**A:** Tools; scheduled times; alternate hours wording; statutory from preview only.  

**Q:** Attendance exception queues.  
**A:** Missed/duplicate/absents/lateness purposes—no invented punches.  

**Q:** Shifts clocks devices.  
**A:** Schedules; capture; devices—Sat alternate ≠ half-day.  

**Q:** Leave balances invent?  
**A:** No—use leave screens/reports.  

**Q:** OT to payroll.  
**A:** Pending→approved→payroll; preview; no invented OT.  

**Q:** Allowances deductions advances.  
**A:** Setup then payroll—no invented amounts.  

**Q:** Statutory filing pack.  
**A:** Summary/statutory/NSSF/bank transfer—never invent rates.  

**Q:** Workforce pack.  
**A:** Headcount/turnover/contracts/HR KPIs—no invented %.  

**Q:** Dept→position→employee.  
**A:** That create order.  

**Q:** HR question using sales field attendance.  
**A:** Redirect to HR attendance for payroll.  

**Q:** Other deductions trail.  
**A:** Setup + preview + report.  

**Q:** KPIs vs HR dashboard KPI.  
**A:** Different; no invented scores.  

**Q:** Register vs individual attendance.  
**A:** Team vs person; Saturday wording.  

**Q:** Advances vs net.  
**A:** May reduce net; preview lines—no invented net.  

**Q:** Contract expiry briefing.  
**A:** Report + employee details—no invented dates.  

**Q:** Lateness with bad punches.  
**A:** Fix punches first.  

**Q:** Punches ignore shift.  
**A:** Settings + assignment + devices.  

**Q:** Empty bank transfer report.  
**A:** Payroll done? Bank details? Regenerate.  

**Q:** Absents vs leave.  
**A:** Don’t mislabel scheduled off.  

**Q:** Duplicates before OT.  
**A:** Clean→recheck→OT.  

**Q:** Macro vs micro statutory.  
**A:** Company reports vs employee preview.  

**Q:** HR landing briefing.  
**A:** People→time→pay with tool numbers.  

**Q:** Position change mid-month.  
**A:** Update; review allowances; preview before commit.  

**Q:** Attendance surfaces.  
**A:** Today/history/clock + named tool.  

**Q:** High turnover plan.  
**A:** Measure; structure; hire—no invented %.  

**Q:** Fiscal offline triage.  
**A:** Health/errors/unfiscalized/reprint—no QR invention.  

**Q:** KRA lists vs compliance.  
**A:** Detail vs overview—quote only.  

**Q:** Print templates vs till print vs reprint.  
**A:** Documents vs receipts vs reprint existing.  

**Q:** Users roles audit.  
**A:** Access who/what/did—don’t invent permission keys.  

**Q:** Company license branches themes.  
**A:** Legal, license, branches (names if multi), UI theme.  

**Q:** Where is the setting?  
**A:** Explain settings areas in words; search if unsure—don’t invent flag names.  

**Q:** AI training hygiene ops.  
**A:** Import Q&A; export; merge/delete duplicates; wipe/re-upload safely.  

**Q:** Complex ask method.  
**A:** Training notes→screen search→tools→labeled answers; never invent.  

**Q:** Fast/stream vs completeness.  
**A:** Still answer every part; batch tools.  

**Q:** Charts/tables rules.  
**A:** Tables OK; charts only if asked.  

**Q:** Multiple @mentions.  
**A:** Section per entity; names only.  

**Q:** Page context vs tools.  
**A:** Hint vs authoritative; answer all parts.  

**Q:** Create + read compound.  
**A:** Read now; create needs confirm.  

**Q:** Platform comms map.  
**A:** WhatsApp/mailbox/email/push vs tenant sales WhatsApp—no keys.  

**Q:** Commercial platform objects.  
**A:** Plans/subscriptions/contracts/invoices—no invented prices.  

**Q:** Tenant flags + training workspace.  
**A:** Org config for deduct/debtor days; training may filter—don’t invent flags.  

**Q:** Platform ops status pack.  
**A:** Health/issues/backups/active users—no invented ETA.  

**Q:** Custom report + sales today.  
**A:** Real link on success; sales from tools.  

**Q:** Legacy trio.  
**A:** Converter/archive/legacy docs—don’t mix into live fiscal advice.  

**Q:** Off-topic + ERP.  
**A:** Decline off-topic; fully answer ERP.  

**Q:** Foundation notes + duplicates + export.  
**A:** Hygiene before wipe.  

**Q:** Tenant AI vs platform credentials.  
**A:** Two layers; never echo secrets; prefer fast chat models.  

**Q:** No notification.  
**A:** Inbox + settings + audit if needed.  

**Q:** Below-cost denied tree.  
**A:** Approvals + roles + POS—no bypass invention.  

**Q:** Wrong letterhead on fiscal invoice.  
**A:** Profile + templates + fiscal diagnosis separate.  

**Q:** Usage + latency knobs.  
**A:** Monitor usage; modes affect latency/cost; still cover all parts.  

**Q:** Retail EOD vs night audit.  
**A:** Disambiguate by business.  

**Q:** Manager hubs.  
**A:** Match hub to role + summary tools—in words.  

**Q:** Create product + stock check.  
**A:** Stock tools now; create needs confirm.  

**Q:** Q&A should teach decisions not directories.  
**A:** Answers explain rules/tools/facts; mention screens only when helpful.  

**Q:** Offboard user.  
**A:** Disable; roles; audit.  

**Q:** Are we licensed/paid?  
**A:** License + subscriptions/invoices + company—no invented expiry.  

**Q:** Brand UI vs documents.  
**A:** Theme vs templates vs company fields.  

**Q:** Meta expectation for compound questions.  
**A:** Parse all parts; batch tools; explanatory labeled answers; hard rules; refuse only non-ERP slices.  

**Q:** Z already done—can I X?  
**A:** X needs open session; after Z usually new session; still do EOD if required.  

**Q:** Collections coaching unpaid/partial/paid.  
**A:** Work unpaid then partials; paid is history; real balances only.  

**Q:** Held + reprint + unfiscalized.  
**A:** Restore; reprint; diagnose fiscal backlog—no QR invention.  

**Q:** Loyalty redeem fail checklist.  
**A:** Card/points/payment step real—don’t invent points.  

**Q:** Sales-by-supplier vs purchases-by-supplier.  
**A:** Sell attribution vs buy history—label.  

**Q:** VAT + price list + category sales.  
**A:** Three factual sections.  

**Q:** Hotel audit while retail till open.  
**A:** Separate tracks—don’t merge closes.  

**Q:** Driver lateness + open trip.  
**A:** HR metric ≠ trip ops—separate sections.  

**Q:** In-stock + valuation naming.  
**A:** Qty>0 separate from values; branch names only if multi-branch.  

**Q:** OT pending + duplicate punches.  
**A:** Clean first then OT.  

**Q:** M-Pesa tender missing.  
**A:** Methods + config + open till.  

**Q:** Blind GRN vs LPO receive.  
**A:** Prefer against LPO; blind only if allowed.  

**Q:** Owner cash + debtors + top GP.  
**A:** Three tool sections; names only.  

**Q:** Walk-in without rate in system.  
**A:** Don’t invent rates; use plans/UI or say unknown.  

**Q:** Contracts expiring + missing bank details.  
**A:** Address both threads if asked—expiry report vs bank-transfer prerequisites.  

**Q:** Custom report unsaved.  
**A:** Don’t share link until success.  

**Q:** Weather + stock + sales.  
**A:** Decline weather; answer in-stock and sales fully.  

**Q:** DeepSeek chat vs reasoner.  
**A:** Prefer chat for ops speed; no invented keys.  

**Q:** Group 50/50 without confirm.  
**A:** Guide UI; don’t claim saved.  

**Q:** Stock left unexpectedly.  
**A:** Review deduct settings cluster; prove with transactions.  

**Q:** Proforma missing PIN.  
**A:** Fix company profile—never invent PIN.  

**Q:** Aging then unpaid queue.  
**A:** Prioritize then work queue with real amounts.  

**Q:** Bar staff on retail POS.  
**A:** Redirect to bar/hotel POS.  

**Q:** Invent housing levy rate?  
**A:** No—only payroll preview/report lines.  

**Q:** Scenario without cash facts.  
**A:** Cash position first, then scenario.  

**Q:** Invent in-transit qty.  
**A:** Refuse; use document/transactions.  

**Q:** Inactive + utilization + statement.  
**A:** Portfolio + statement; names only.  

**Q:** Night audit after voids.  
**A:** Review voids if needed; clear blockers; retry.  

**Q:** Wipe training without export.  
**A:** Export first, then wipe/re-upload.  

**Q:** Auto chart without ask.  
**A:** Don’t; tables/prose OK until user asks for a chart.  

**Q:** Create LPO and JE together.  
**A:** Reads OK; each create needs confirm.  

**Q:** Invent POD %.  
**A:** No—compliance report only.  

**Q:** Half-board vs employee half-day.  
**A:** Different meanings; Sat alternate ≠ half-day.  

**Q:** Three “cash” meanings.  
**A:** Tenders vs cash position vs cash flow statement—disambiguate.  

**Q:** Account code not in system.  
**A:** Use names; don’t invent codes.  

**Q:** GM wants sales, cash, debtors, stock in one briefing.  
**A:** Four labeled tool-backed sections; in-stock≠low-stock; no charts unless asked.  

**Q:** Opening checklist till payments M-Pesa fiscal.  
**A:** Open till/float from UI; enabled tenders; M-Pesa configured; fiscal healthy—no invented serials/paybills.  

