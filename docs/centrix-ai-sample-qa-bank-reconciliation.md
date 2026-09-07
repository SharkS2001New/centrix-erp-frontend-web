# Centrix AI — Bank reconciliation Q&A (50)

Use for **Platform → AI training** bulk import (paste or upload).  
Each block is `Q:` then `A:` then optional `Path:`.  
Workspace: **accounting**. These notes teach Centrix native **Bank reconciliation** (GL statement matching) — not M-Pesa, Equity, or Centrix Payments recon hubs.

**Screen:** `/accounting/bank-reconciliation`  
**Related:** Bank register `/accounting/bank-register`

---

## What it is / where to go

**Q:** What is bank reconciliation in Centrix?  
**A:** Bank reconciliation proves your GL bank/cash account matches the bank’s statement for a period. You import statement lines as CSV, match them to posted book transactions, then Finish when Difference is zero. Open Accounting → Bank reconciliation.  
**Path:** /accounting/bank-reconciliation

**Q:** Where do I do bank reconciliation?  
**A:** Go to /accounting/bank-reconciliation. Click New reconciliation to start, or open an in-progress recon to continue matching. The Bank register at /accounting/bank-register shows running balance and cleared/uncleared status after you finish.  
**Path:** /accounting/bank-reconciliation

**Q:** How is bank reconciliation different from the bank register?  
**A:** The bank register is the checkbook view (running balance, cleared flags). Bank reconciliation is the period workflow: statement ending balance, import CSV lines, match/exclude, then Finish so matched items clear. Use both: recon to close the period; register to review history.  
**Path:** /accounting/bank-register

**Q:** Is bank reconciliation the same as M-Pesa reconciliation?  
**A:** No. Bank reconciliation matches a bank/cash GL account to a bank statement CSV. M-Pesa reconciliation and Equity / Centrix Payments recon are separate payment-channel tools. For GL bank matching use /accounting/bank-reconciliation only.  
**Path:** /accounting/bank-reconciliation

**Q:** Do I need the native ledger for bank reconciliation?  
**A:** Yes. In-app bank reconciliation works with Centrix native posting (auto-post / journals on the bank account). If finance is set to external QuickBooks-only export, use QBO for statement matching instead of this screen.  
**Path:** /accounting/bank-reconciliation

**Q:** Which permissions do I need for bank reconciliation?  
**A:** View needs accounting.bank_reconciliation.view. Create, import, match, adjust, and finish need accounting.bank_reconciliation.manage (or broader accounting manage). Without manage you can open the list but cannot complete a recon.  
**Path:** /accounting/bank-reconciliation

---

## Starting a reconciliation

**Q:** How do I start a new bank reconciliation?  
**A:** Open /accounting/bank-reconciliation → New reconciliation. Choose the bank/cash asset account, enter the statement date (period end), and the statement ending balance from the bank. Optionally set period start, title, and notes. You can import the statement CSV on create or later on the Bank statement tab.  
**Path:** /accounting/bank-reconciliation

**Q:** What is statement ending balance?  
**A:** The closing balance printed on your bank statement for that statement date. Centrix compares it to your books (GL balance ± uncleared items). The banner shows Statement ending balance, Cleared balance, and Difference — Finish only when Difference is about zero (within 0.02).  
**Path:** /accounting/bank-reconciliation

**Q:** Which account should I pick for reconciliation?  
**A:** Pick the GL asset account that represents that bank or cash account (chart of accounts bank/cash). Do not pick AR, AP, or income accounts. The account must have posted journal activity for matches to appear.  
**Path:** /accounting/chart-of-accounts

**Q:** Can I reconcile two bank accounts in one session?  
**A:** No. Each reconciliation is for one bank/cash account and one statement period. Start a separate New reconciliation per account (or per statement).  
**Path:** /accounting/bank-reconciliation

**Q:** Can I edit a completed reconciliation?  
**A:** No. Once status is Completed, matching is locked and cleared items stay cleared for that period. Fix mistakes before Finish, or post a correcting journal and handle the next statement period.  
**Path:** /accounting/bank-reconciliation

---

## CSV format & upload

**Q:** What file format does bank statement import accept?  
**A:** CSV or plain text only (.csv / .txt). Excel .xlsx is not supported for bank statements — export or Save As CSV from Excel first. Paste into the import box is also allowed. AI training accepts Excel; bank recon does not.  
**Path:** /accounting/bank-reconciliation

**Q:** What CSV columns does Centrix expect for bank statements?  
**A:** Preferred headers: date, description, reference, amount. Example:  
date,description,reference,amount  
2026-06-01,Deposit,DEP-1,1500  
Also accepted: transaction_date / value_date; narrative / particulars / memo; ref / cheque_no; or separate debit/credit (or money_in/money_out) instead of a single amount.  
**Path:** /accounting/bank-reconciliation

**Q:** Give me a sample bank statement CSV for Centrix.  
**A:** Use:  
date,description,reference,amount  
2026-08-01,Opening transfer,TRF-100,50000  
2026-08-03,Customer deposit,RCPT-88,12500.50  
2026-08-05,Supplier payment,CHQ-441,-8200  
Amounts: deposits positive; withdrawals/payments negative. Or use debit and credit columns instead of amount.  
**Path:** /accounting/bank-reconciliation

**Q:** Can I use debit and credit columns instead of amount?  
**A:** Yes. Headers like debit / money_in / deposit (positive in) and credit / money_out / withdrawal (stored as negative) work. You do not need a single amount column if both debit and credit are present.  
**Path:** /accounting/bank-reconciliation

**Q:** What date formats work on statement import?  
**A:** Prefer YYYY-MM-DD (e.g. 2026-08-15). Day/month/year like 15/08/2026 is also parsed as D/M/Y. Ambiguous exports can skip or mis-date rows — convert to ISO dates when unsure. Rows without a valid date and amount are skipped.  
**Path:** /accounting/bank-reconciliation

**Q:** My CSV uses semicolons or tabs — will it import?  
**A:** Yes. Delimiters comma, semicolon, and tab are accepted. BOM from Excel export is stripped. Amounts may include commas or parentheses for negatives.  
**Path:** /accounting/bank-reconciliation

**Q:** Where do I upload the bank statement after creating the recon?  
**A:** Open the reconciliation → Bank statement tab → upload or paste CSV → Import CSV. You can also attach a file when starting New reconciliation. Imported lines appear as unmatched until you match or exclude them.  
**Path:** /accounting/bank-reconciliation

**Q:** Import says “No valid statement lines” — what went wrong?  
**A:** Usually missing date+amount, wrong headers, Excel file instead of CSV, or empty rows. Check the first row has recognizable headers (date, description, reference, amount or debit/credit). Convert .xlsx to CSV and retry. Headerless files are treated as date, description, reference, amount by column order.  
**Path:** /accounting/bank-reconciliation

**Q:** Import says it could not parse the file — how do I fix it?  
**A:** Re-export as UTF-8 CSV, ensure a header row, remove merged cells/titles above the header, and use one transaction per row. Confirm amounts are numbers (not “KES 1,200” text in a way that breaks parsing — plain 1200 or 1,200 is fine).  
**Path:** /accounting/bank-reconciliation

**Q:** Should withdrawals be positive or negative in the amount column?  
**A:** With a single amount column: money in (deposits) positive, money out (withdrawals, cheques, bank charges) negative. If you use separate debit/credit columns, Centrix stores credits/money_out as negative automatically.  
**Path:** /accounting/bank-reconciliation

---

## Matching & reconciling

**Q:** How do I reconcile after uploading the statement?  
**A:** On the Reconcile tab: review Suggested matches, confirm good ones, or manually select one statement line and one book line whose amounts match within 0.02. Exclude statement lines that do not belong to this period. Watch Difference until it is ~0, then Finish now.  
**Path:** /accounting/bank-reconciliation

**Q:** What are suggested matches?  
**A:** Centrix auto-suggests pairs when absolute amounts match within 0.02 and dates are within about 7 days, with optional boost from matching reference or description. Review suggestions before accepting — the first unused book line wins for each suggestion.  
**Path:** /accounting/bank-reconciliation

**Q:** Why won’t my statement line match a book transaction?  
**A:** Amounts must agree within 0.02. Dates should be close (suggestions use ~7 days). The book line must be a posted journal on that bank account through the statement date and not already matched. Post missing journals or fix the amount, then retry.  
**Path:** /accounting/bank-reconciliation

**Q:** What are uncleared book transactions?  
**A:** Posted GL lines on the bank account up through period end that are not yet matched in this reconciliation (and not cleared by a prior completed recon). They appear for matching against statement lines.  
**Path:** /accounting/bank-reconciliation

**Q:** How do I exclude a bank statement line?  
**A:** On the Bank statement / Reconcile workspace, exclude lines that are not part of this recon (duplicates, wrong account, future-dated noise). Excluded lines drop out of matching without posting a book entry. Prefer exclude over forcing a bad match.  
**Path:** /accounting/bank-reconciliation

**Q:** Can I unmatch if I matched the wrong lines?  
**A:** Yes, while the reconciliation is still In progress. Unmatch the pair, then rematch correctly. After Finish (Completed), you cannot unmatch — correct via a new period or adjusting journals.  
**Path:** /accounting/bank-reconciliation

**Q:** What does Difference mean on the reconciliation banner?  
**A:** Difference is statement ending balance versus adjusted book balance (GL at period end adjusted for still-uncleared receipts/payments). Finish when |Difference| is under 0.02. If it stays open, find unmatched statement lines, uncleared books, or missing journals.  
**Path:** /accounting/bank-reconciliation

**Q:** Why is Difference not zero after I matched everything I see?  
**A:** Common causes: wrong statement ending balance typed in, missing CSV lines, excluded lines that should have been matched, unmatched book items (timing), or a real bank fee/interest not yet journaled. Use Add adjustment for an immaterial balancing entry, or post the missing fee/interest journal then match.  
**Path:** /accounting/bank-reconciliation

**Q:** What is Add adjustment on bank reconciliation?  
**A:** Add adjustment posts a small balancing journal for remaining difference (e.g. bank charge or interest) so you can Finish. Use only when the amount is understood and immaterial to investigate further. It affects the GL — prefer posting a proper expense/income journal and matching when possible.  
**Path:** /accounting/bank-reconciliation

**Q:** When can I click Finish now?  
**A:** Only when |Difference| is within 0.02. Then status becomes Completed and matched book lines are cleared for the bank register / future recons. You cannot Finish with an open difference.  
**Path:** /accounting/bank-reconciliation

**Q:** What happens after I finish bank reconciliation?  
**A:** The recon is Completed (read-only). Matched transactions show as cleared on the bank register. Start the next period with New reconciliation and the next statement ending balance.  
**Path:** /accounting/bank-register

---

## Workflow & month-end

**Q:** What is the recommended bank recon workflow each month?  
**A:** 1) Ensure sales, receipts, payments, and expenses auto-posted for the period. 2) Download the bank statement and save as CSV. 3) New reconciliation with correct ending balance. 4) Import CSV. 5) Accept/review suggested matches; manual match the rest. 6) Exclude noise; journal missing fees. 7) Finish when Difference ≈ 0. 8) Review bank register.  
**Path:** /accounting/bank-reconciliation

**Q:** Should I reconcile before running financial statements?  
**A:** Yes. Reconcile the bank (and AR/AP subledgers) before trusting trial balance, balance sheet, P&L, and cash flow for month-end. Unreconciled cash is a common cause of wrong cash on the balance sheet.  
**Path:** /accounting/trial-balance

**Q:** How do bank reconciliation and trial balance relate?  
**A:** Trial balance checks that debits equal credits across all accounts. Bank reconciliation checks that one bank account matches the external statement. Do both: recon for cash accuracy, trial balance for overall balance.  
**Path:** /accounting/trial-balance

**Q:** Where do unmatched deposits show and what should I do?  
**A:** Unmatched deposits stay on the Bank statement tab as unmatched. Match them to the customer receipt / deposit journal on the books, or investigate if the receipt was never posted. Do not Finish until they are matched, excluded for a valid reason, or adjusted.  
**Path:** /accounting/bank-reconciliation

**Q:** Bank shows a charge but Centrix has no book line — what now?  
**A:** Post a journal (or expense) for the bank charge to the bank account and the fee expense account, then match the statement line to that new book line. Or use Add adjustment if your policy allows a recon adjustment for that amount.  
**Path:** /accounting/journal-entries

**Q:** Customer paid into the bank but I don’t see a book match.  
**A:** Confirm the payment was recorded in Centrix (customer payment / deposit) and auto-posted to this bank GL account. If it posted to the wrong account, reclass with a journal. Then match on the Reconcile tab.  
**Path:** /accounting/accounts-receivable

---

## Troubleshooting

**Q:** Why are there no book transactions to match?  
**A:** The selected GL account has no posted journal lines through the statement date, or all lines are already cleared in a prior completed recon. Check auto-post settings, account mapping on payments, and that you picked the correct bank account.  
**Path:** /accounting/journal-entries

**Q:** Suggested matches are wrong — what should I do?  
**A:** Do not accept them. Manually select the correct statement line and book line (amounts within 0.02). Suggestions are helpers only; always verify reference and payee.  
**Path:** /accounting/bank-reconciliation

**Q:** Can two statement lines match one book deposit?  
**A:** Manual match is one statement line to one book line with amounts within 0.02. If the bank split one deposit, you may need a journal that mirrors the bank’s split, or match only after books reflect the same split.  
**Path:** /accounting/bank-reconciliation

**Q:** I imported the wrong CSV — how do I fix it?  
**A:** While In progress, remove or exclude bad lines if the UI allows, or delete the in-progress reconciliation (if permitted) and start New reconciliation with the correct file. Do not Finish a recon built on the wrong statement.  
**Path:** /accounting/bank-reconciliation

**Q:** Difference is a few cents — can I finish?  
**A:** Finish is allowed when |Difference| is under 0.02 (two cents). Larger gaps need another match, exclude, journal, or Add adjustment — do not ignore material differences.  
**Path:** /accounting/bank-reconciliation

**Q:** Excel file won’t upload to bank reconciliation.  
**A:** Expected. Statement import is CSV/text only. In Excel: File → Save As → CSV (UTF-8), then Import CSV on the Bank statement tab.  
**Path:** /accounting/bank-reconciliation

**Q:** How do I teach the AI about our bank recon process?  
**A:** Platform admins can add notes at Platform → AI training (bulk paste these Q&As or Install foundation notes). Users in Accounting can ask Centrix AI: “How do I upload a bank statement?” or “What CSV format for bank reconciliation?”  
**Path:** /platform/ai-training

---

## Short how-to prompts users will ask

**Q:** How do I upload a bank statement in Centrix?  
**A:** Accounting → Bank reconciliation → open or create a recon → Bank statement tab → choose CSV/txt or paste → Import CSV. Columns: date, description, reference, amount (or debit/credit). Not Excel.  
**Path:** /accounting/bank-reconciliation

**Q:** How do I match bank statement lines to Centrix?  
**A:** Open the recon → Reconcile tab → use Suggested matches or pick one statement line + one book line with the same amount (within 0.02) → match. Exclude lines that don’t belong. Finish when Difference ≈ 0.  
**Path:** /accounting/bank-reconciliation

**Q:** Walk me through bank reconciliation step by step.  
**A:** 1) New reconciliation: bank account, statement date, ending balance. 2) Import statement CSV. 3) Review Suggested matches. 4) Manual match remaining lines. 5) Exclude non-period items; journal missing fees. 6) Optional Add adjustment. 7) Finish now when Difference is ~0. 8) Confirm cleared items on Bank register.  
**Path:** /accounting/bank-reconciliation

**Q:** What does cleared mean after bank reconciliation?  
**A:** Cleared means the book transaction was matched and the reconciliation was Completed. Those items drop out of the next period’s uncleared list and show as cleared on the bank register.  
**Path:** /accounting/bank-register

**Q:** Help me reconcile August bank statement.  
**A:** Open /accounting/bank-reconciliation → New reconciliation for that bank account with August statement date and ending balance → import August CSV → match suggested/manual until Difference ≈ 0 → Finish now. Link the workspace when they have an in-progress recon id.  
**Path:** /accounting/bank-reconciliation

**Q:** Bank reconciliation unmatched deposits  
**A:** Open the in-progress recon at /accounting/bank-reconciliation. On Reconcile / Bank statement, find unmatched deposit lines and match each to the corresponding receipt/deposit journal (amounts within 0.02). If no book line exists, record the customer payment or deposit first, then match.  
**Path:** /accounting/bank-reconciliation

**Q:** Explain statement ending balance vs cleared balance.  
**A:** Statement ending balance is what you typed from the bank. Cleared balance reflects books after matches for this recon. Difference = how far apart they still are. Drive Difference to ~0 before Finish.  
**Path:** /accounting/bank-reconciliation

**Q:** Can Centrix AI import my bank CSV for me?  
**A:** No. The assistant explains the format and steps; you upload on /accounting/bank-reconciliation (Bank statement → Import CSV). There is no AI tool that uploads or auto-finishes a recon.  
**Path:** /accounting/bank-reconciliation

**Q:** What reports relate to bank reconciliation?  
**A:** Use Bank reconciliation and Bank register for the match itself. For month-end, also run Trial balance, Balance sheet, and Cash flow after reconciling. Subledger recon (AR/AP) is separate from bank statement matching.  
**Path:** /accounting/bank-reconciliation

**Q:** Best practices for clean bank reconciliations.  
**A:** Post daily; use consistent bank GL accounts; export bank CSV with clear headers; reconcile shortly after month-end; never Finish with unexplained difference; investigate fees/interest promptly; don’t confuse M-Pesa recon with GL bank recon.  
**Path:** /accounting/bank-reconciliation
