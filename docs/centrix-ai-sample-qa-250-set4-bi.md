# Centrix ERP — Sample AI Q&A Set 4 (Business Intelligence)

Business intelligence, profitability, forecasting, recommendations, trends, scenarios, and executive decision-making.  
**New vs Sets 1–3.** Answers use **chat tools implemented in Centrix AI** (Sets 1–3 + BI tools below).

Format: **Q:** / **A:** / **Path:**

---

## Routing legend (for trainers & prompt authors)

| Signal in answers | Meaning |
|-------------------|---------|
| **Chat tool:** `get_*` / `run_insight` / `calculate_scenario` | Floating assistant calls this in `/ai/chat` |
| **Combine:** | Call multiple chat tools in one answer |
| **Report:** `/reports/...` | Open screen for drill-down; chat tool provides the numbers first |
| **Not supported** | No data slice — decline honestly (e.g. sales targets, long-range profit forecast) |

**BI chat tools (implemented):**
- `run_insight` — anomaly_detection, forecast_light, margin_discount_watchdog, exception_radar, customer_360, procurement_companion, collections_playbook, branch_till_benchmarks, product_demand, etc.
- `get_profit_loss` — gross/net profit, margins, COGS, expenses, MoM comparison, top products by gross profit
- `get_expense_summary` — expenses by category with prior-period comparison
- `get_customer_portfolio` — inactive, declining, top customers, high credit utilization
- `get_inventory_valuation` — stock cost/retail value, cash tied in inventory
- `get_cash_position` — till float, payment mix, GL cash/bank, AR, estimated AP
- `calculate_scenario` — price/sales/cost/discount what-if (illustrative)

**Hard rules for the assistant:**
- Never invent profit, margin %, forecasts, or customer portfolio rankings — use the tools above.
- `get_till_health` / `get_cash_position` = operational till + treasury snapshot — **not** the accounting cash flow statement (`/reports/cash-flow`).
- `get_vat_collected` = output VAT on sales — **not** net VAT payable to KRA after input VAT.
- Quantities: always use `qty_label` from tools — never sum mixed UoMs into one number.

---

## Business intelligence / management

**Q:** Why did my sales decrease this month?  
**A:** **Combine:** call `get_sales_brief` with lookback covering the month (or `get_sales_summary` with `relative_date=this_month` vs `last_month`). Quote `sales_total`, `previous_period_total`, and `change_pct`. Explain drivers from `top_products`, `top_customers`, and `daily_sales` in the slice — name what fell, not guesses. If branch/channel breakdown is needed and missing, offer `/reports/daily-sales` or `create_custom_report`.  
**Path:** /reports/daily-sales

**Q:** Why did my sales increase this month?  
**A:** Same as decrease: `get_sales_brief` or month-scoped `get_sales_summary`. Highlight products, customers, and daily pattern that contributed most to `change_pct` > 0.  
**Path:** /reports/daily-sales

**Q:** Why is my profit decreasing even though sales are increasing?  
**A:** **Combine:** `get_sales_brief` (sales trend) + `get_profit_loss` compare_previous_period=true (margin/COGS/expenses MoM) + `run_insight` margin_discount_watchdog (below-cost/discount pressure). Explain rising COGS, discounts, or expenses from tool output.  
**Path:** /reports/profit-loss

**Q:** What are the biggest problems in my business today?  
**A:** **Combine:** `get_stock_summary`, `get_debtors_summary`, `get_till_health`, `get_sales_brief`, `run_insight` exception_radar. Rank by KES impact where tools provide amounts.  
**Path:** /reports

**Q:** What should management focus on today?  
**A:** Prioritize from: `get_debtors_summary` top overdue, `get_stock_summary` critical low stock, `get_till_health` outlier variances, pending LPO/supplier obligations via `get_purchasing_overview`, and **Insight** `exception_radar` for must-act exceptions.  
**Path:** /reports

**Q:** Give me a management briefing for today  
**A:** **Combine:** (1) `get_sales_summary` relative_date=yesterday or today, (2) `get_sales_brief` lookback_days=7, (3) `get_debtors_summary`, (4) `get_stock_summary`, (5) `get_till_health`. Summarize sales, AR, stock risk, till health in bullets. For narrative polish, user can run **Insight** `sales_brief` or enable morning digests under Settings → AI.  
**Path:** /reports

**Q:** What changed in my business compared with yesterday?  
**A:** `get_sales_summary` for today vs yesterday. `get_debtors_summary` for current AR snapshot. Stock count changes are not in one tool — point to `/reports/low-stock` or **Insight** `stock_pulse` for movers/reorder shifts.  
**Path:** /reports/daily-sales

**Q:** What changed in my business compared with last week?  
**A:** `get_sales_brief` lookback_days=7 — uses current vs previous period totals and `change_pct`. Add `get_debtors_summary` and `get_stock_summary` for AR and inventory context.  
**Path:** /reports

**Q:** What are the three biggest financial risks in my business right now?  
**A:** Derive from: `get_debtors_summary` (overdue concentration), `get_supplier_statement` for largest AP if a supplier is named, `get_till_health` (persistent shorts), `get_stock_summary` (stockouts on fast movers), **Insight** `margin_discount_watchdog` (below-cost selling). Rank top 3 with KES amounts from tools only.  
**Path:** /reports

**Q:** What opportunities am I missing in my business?  
**A:** **Combine:** `get_stock_summary` fast_movers vs low_stock (demand without stock), `get_sales_brief` top_customers (upsell targets), **Insight** `procurement_companion` (reorder drafts), **Insight** `product_demand` for SKU focus. Inactive customers: **Not supported** as a portfolio list in chat — use **Insight** `customer_360` per customer or `/reports` custom report.  
**Path:** /reports

**Q:** How is the business doing overall?  
**A:** Start with `get_sales_brief` (7-day default). Add unpaid from same slice or `get_debtors_summary`. Link `/reports` for deeper P&L. Do not give a single invented “health score.”  
**Path:** /reports

**Q:** What is getting better and what is getting worse?  
**A:** `get_sales_brief` → `change_pct` and daily_sales trend. `exception_radar` insight for worsening voids/discounts/unpaid spike. Profit direction → `/reports/profit-loss` — do not invent.  
**Path:** /reports

**Q:** Compare this week to last week  
**A:** `get_sales_brief` lookback_days=7 compares current 7 days vs prior 7 days automatically (`previous_period_total`, `change_pct`).  
**Path:** /reports/daily-sales

**Q:** Compare this month to last month  
**A:** `get_sales_summary` with `relative_date=this_month` and `last_month`, or `get_vat_collected` for both months if tax-focused. For profit: `/reports/profit-loss` with both ranges — no chat tool.  
**Path:** /reports/profit-loss

**Q:** Which area of the business needs the most attention?  
**A:** Run the same stack as “biggest problems”: sales change, AR, stock, till variance, exception_radar. Pick the area with largest KES or operational risk from tool output.  
**Path:** /reports

---

## Profitability

**Q:** Which products make me the most profit?  
**A:** **Report:** `/reports/profit-loss-by-product` for ranked gross profit by SKU. Chat has no org-wide profit ranking tool. **Partial:** `get_sales_by_product` for revenue + `get_product_details` for unit margin (sell − last_cost_price) on named products only.  
**Path:** /reports/profit-loss-by-product

**Q:** Which products have the highest profit margin?  
**A:** **Report:** `/reports/profit-loss-by-product`. **Partial in chat:** `get_product_details` per @Product for sell price vs `last_cost_price` — do not rank entire catalog without the report.  
**Path:** /reports/profit-loss-by-product

**Q:** Which products have high sales but low profit margins?  
**A:** **Report:** `/reports/profit-loss-by-product` sorted by revenue with margin % column. **Insight** `margin_discount_watchdog` flags below-cost lines but not full margin ranking.  
**Path:** /reports/profit-loss-by-product

**Q:** Which products are selling at a loss?  
**A:** **Chat tool:** `run_insight` `margin_discount_watchdog` → `below_cost_lines` (selling_price < last_cost_price). **Report:** `/reports/profit-loss-by-product` for period totals.  
**Path:** /reports/profit-loss-by-product

**Q:** Which products should I stop selling?  
**A:** **Not supported** as an auto-recommendation engine. Present candidates from: low/no sales (`get_sales_by_product` over 90 days), below-cost lines (`margin_discount_watchdog`), excess stock (`get_stock_summary`). Label as “candidates for management review” — never auto-discontinue.  
**Path:** /reports/profit-loss-by-product

**Q:** Which products should I promote?  
**A:** **Combine:** `get_stock_summary` fast_movers + available stock; `get_product_details` for healthy unit margin; avoid promoting below-cost SKUs flagged in `margin_discount_watchdog`.  
**Path:** /products

**Q:** What is my gross profit this month?  
**A:** **Chat tool:** `get_profit_loss` relative_date=this_month — quote `current.gross_profit` and `current.gross_margin_pct`.  
**Path:** /reports/profit-loss

**Q:** What is my gross profit margin this month?  
**A:** **Chat tool:** `get_profit_loss` — quote `current.gross_margin_pct` (or gross_profit ÷ gross_revenue from `current`).  
**Path:** /reports/profit-loss

**Q:** What is my net profit this month?  
**A:** **Chat tool:** `get_profit_loss` — quote `current.net_profit` and `current.net_margin_pct`.  
**Path:** /reports/profit-loss

**Q:** Which branch has the highest profit margin?  
**A:** **Chat tool:** `get_profit_loss` include_branches=true — rank `by_branch` by gross_margin_pct.  
**Path:** /reports/profit-loss

**Q:** Which branch generates the most profit?  
**A:** **Chat tool:** `get_profit_loss` include_branches=true — highest `gross_profit` in `by_branch`.  
**Path:** /reports/profit-loss

**Q:** Why is Branch A less profitable than Branch B?  
**A:** Compare branch filters on `/reports/profit-loss` and `/reports/profit-loss-by-product`. **Insight** `branch_till_benchmarks` for sales mix, till variance, payment mix differences. Explain gaps from report data — do not speculate.  
**Path:** /reports/profit-loss

**Q:** Open profit and loss report  
**A:** /reports/profit-loss  
**Path:** /reports/profit-loss

**Q:** Open P&L by product  
**A:** /reports/profit-loss-by-product  
**Path:** /reports/profit-loss-by-product

**Q:** Are we discounting too much?  
**A:** **Chat tool:** `run_insight` `margin_discount_watchdog` — `discount_by_cashier`, `pending_discount_approvals`. **Combine:** `get_sales_brief` if discount totals appear in exception context via `exception_radar`.  
**Path:** /reports

**Q:** Show me lines sold below cost  
**A:** **Chat tool:** `run_insight` `margin_discount_watchdog` → `below_cost_lines` with order_num, product, sell vs cost. Link `/reports/sales-by-product`.  
**Path:** /reports

---

## Customer intelligence

**Q:** Which customers are most profitable?  
**A:** **Chat tool:** `get_customer_portfolio`  
**Path:** /reports/profit-loss-by-product

**Q:** Which customers have stopped buying from us?  
**A:** **Chat tool:** `get_customer_portfolio` → `inactive_customers`. Per customer: `run_insight` customer_360.  
**Path:** /customers

**Q:** Which customers are at risk of becoming inactive?  
**A:** **Not supported** as bulk list. **Insight** `customer_360` per customer: declining frequency vs history requires comparing statements over time manually, or custom report. Flag `churn_signal: elevated` when days_since_last_order > 45.  
**Path:** /reports

**Q:** Which customers should I follow up with today?  
**A:** **Chat tool:** `get_debtors_summary` → top overdue / “call these” list. **Chat tool:** `run_insight` `collections_playbook` (aging buckets + scripts). **Chat tool:** `run_insight` `debtors_brief` for concentration risk.  
**Path:** /sales/shop-debtors/unpaid

**Q:** Which customers have increased their purchases the most?  
**A:** **Not supported** as auto-ranking. Compare periods with `create_custom_report` or `/reports/sales-by-customer` if available. **Partial:** `get_sales_brief` top_customers for current period only.  
**Path:** /reports

**Q:** Which customers have reduced their purchases the most?  
**A:** **Not supported** as auto-ranking in chat. Use custom report comparing two periods. Do not invent decline lists.  
**Path:** /reports/builder

**Q:** Which customers are buying less frequently than before?  
**A:** **Per customer:** **Insight** `customer_360` — compare `orders_in_period`, `days_since_last_order`, `reorder_signal`. No bulk churn-frequency tool in chat.  
**Path:** /reports

**Q:** Which customers are consistently paying late?  
**A:** **Partial:** `get_customer_statement` for payment history on named customers. **Chat tool:** `run_insight` `collections_playbook` and `debtors_brief` for aging/overdue patterns. Portfolio “slow payer” ranking → custom report.  
**Path:** /reports/ar-aging

**Q:** Which customers are using most of their credit limit?  
**A:** **Per customer:** **Insight** `customer_360` → `credit_utilization_pct`. **Partial:** `get_debtors_summary` for high balances. Full utilization ranking → `/reports/ar-aging` or custom report.  
**Path:** /reports/ar-aging

**Q:** Which customers deserve a higher credit limit?  
**A:** **Not supported** as auto-approval. Present **candidates** from: strong volume in `get_customer_statement`, reliable payment history, low overdue — label “for management approval.” Never raise limits via chat.  
**Path:** /customers

**Q:** Tell me everything about customer C-100  
**A:** **Chat tool:** `get_customer_statement` (balance + purchases). **Chat tool:** `run_insight` `customer_360` with customer_num=C-100 for credit utilization, churn_signal, purchase_mix.  
**Path:** /customers/C-100

**Q:** Is this customer about to churn?  
**A:** **Chat tool:** `run_insight` `customer_360` — if `churn_signal` is `elevated` (>45 days since last order), say so with `days_since_last_order`. Do not predict beyond the slice.  
**Path:** /customers

**Q:** Who should I call to collect money today?  
**A:** `get_debtors_summary` call list + **Insight** `collections_playbook`.  
**Path:** /sales/shop-debtors/unpaid

**Q:** Customer 360 analysis  
**A:** Run **Insight** `customer_360` (requires customer_num). Covers credit, payment habit, purchase mix, churn/reorder signals.  
**Path:** /reports

---

## Inventory intelligence

**Q:** Which products are likely to run out soon?  
**A:** **Combine:** `get_stock_summary` low_stock_items + fast_movers; **Insight** `product_demand` for velocity vs stock; **Insight** `forecast_light` for run-rate vs on-hand. Prioritize low coverage on fast movers.  
**Path:** /reports/low-stock

**Q:** How many days of stock do I have left for product X?  
**A:** **Combine:** `get_product_details` (stock_on_hand_label) + `get_sales_by_product` for recent daily velocity. Days ≈ stock ÷ (qty sold ÷ days in period). Show math and label as estimate.  
**Path:** /products/{code}

**Q:** How many days of stock do I have left overall?  
**A:** **Not supported** as one business-wide number. Compute per SKU as above or use **Insight** `product_demand` / `forecast_light` for top movers.  
**Path:** /reports/stock-on-hand

**Q:** Which products are overstocked?  
**A:** **Partial:** `/reports/stock-on-hand` and low-stock inverse (high qty vs low velocity). **Insight** `product_demand` mentions dead/slow risks. No dedicated “overstock rank” chat tool.  
**Path:** /reports/stock-on-hand

**Q:** How much money is tied up in inventory?  
**A:** **Chat tool:** `get_inventory_valuation` → `summary.cost_value` and `top_products_by_cost_value`.  
**Path:** /reports/stock-on-hand

**Q:** Which products are tying up the most cash?  
**A:** **Report:** stock valuation / stock-on-hand sorted by value (qty × last_cost). **Partial:** `get_product_details` for one product at a time.  
**Path:** /reports/stock-on-hand

**Q:** Which products have not sold recently?  
**A:** **Not supported** as auto-list in chat. **Insight** `product_demand` for focused SKU; `create_custom_report` for no-sales-in-N-days. Compare `get_sales_by_product` over 30/90 days — empty = no sales.  
**Path:** /reports/sales-by-product

**Q:** Which products are dead stock?  
**A:** **Insight** `product_demand` flags slow/dead risks. Custom report: stock on hand > 0 and zero sales in lookback. Do not auto-write off.  
**Path:** /reports/stock-on-hand

**Q:** Which products should I reorder first?  
**A:** **Chat tool:** `run_insight` `procurement_companion` → `lpo_draft_suggestions` prioritized by urgency. **Chat:** `get_stock_summary` low_stock_items.  
**Path:** /lpo

**Q:** How much should I reorder for each product?  
**A:** **Chat tool:** `run_insight` `procurement_companion` suggests `suggested_qty` with `suggested_qty_label`. Based on reorder point and on-hand — user confirms on `/lpo`.  
**Path:** /lpo

**Q:** Which supplier should I buy each low-stock product from?  
**A:** **Chat tool:** `run_insight` `procurement_companion` includes `supplier_name` when product has preferred supplier. **Also:** `get_purchasing_overview` + product supplier on `/products/{code}`.  
**Path:** /suppliers

**Q:** Which products are becoming less popular?  
**A:** Compare `get_sales_by_product` across two periods via custom report or manual two calls. **Insight** `forecast_light` shows run-rates but not automatic “declining” flag except via comparing periods yourself.  
**Path:** /reports/sales-by-product

**Q:** Which products are growing fastest?  
**A:** **Partial:** `get_stock_summary` fast_movers; compare sales-by-product periods with `create_custom_report`. Do not invent growth % without two periods of data.  
**Path:** /reports/sales-by-product

**Q:** Stock pulse summary  
**A:** **Chat tool:** `run_insight` `stock_pulse` — fast_movers + low_stock_items. Same data as `get_stock_summary` in chat.  
**Path:** /reports/low-stock

**Q:** Draft LPO from low stock  
**A:** **Chat tool:** `run_insight` `procurement_companion` — presents draft lines; user must confirm create on `/lpo`.  
**Path:** /lpo

---

## Cash flow / finance

**Q:** How much cash do I have across all payment channels?  
**A:** **Chat tool:** `get_cash_position` — till float, GL cash/bank, AR, AP estimate, recent payment mix. Label each source; do not invent a single grand total if components differ.  
**Path:** /reports/till-sessions

**Q:** What is my current cash position?  
**A:** **Partial:** `get_till_health` + `get_debtors_summary` (incoming) + `get_supplier_statement` or AP report (outgoing). Full position → `/reports/cash-flow` (accounting). Summarize what tools give; note gaps.  
**Path:** /reports/cash-flow

**Q:** Can I afford to pay this supplier today?  
**A:** **Partial:** `get_supplier_statement` for amount owed; `get_till_health` for near-term cash/M-Pesa. Compare available vs payment + flag other urgent obligations from `get_debtors_summary`. **Not supported:** full treasury forecast.  
**Path:** /suppliers/payments

**Q:** How much money should I collect from customers this week?  
**A:** `get_debtors_summary` — total due and top balances. **Chat tool:** `run_insight` `collections_playbook` for week-prioritized call list with suggested ask amounts.  
**Path:** /sales/shop-debtors/unpaid

**Q:** How much do customers owe me compared with what I owe suppliers?  
**A:** **Combine:** `get_debtors_summary` (total AR) + supplier AP from `/reports/supplier-statement` or `get_supplier_statement` for named suppliers. **Not supported:** single tool for both totals — may need two calls or reports. Do not invent AP total if only AR tool ran.  
**Path:** /reports/ar-aging

**Q:** Is my working capital improving?  
**A:** **Not supported** as a computed metric in chat. Compare over time: AR (`get_debtors_summary`), inventory (`/reports/stock-on-hand` value), AP (supplier reports), cash (`/reports/cash-flow`). Explain direction only if user provides two periods or you run reports — do not invent “working capital.”  
**Path:** /reports/cash-flow

**Q:** What is consuming most of my cash?  
**A:** **Partial:** supplier payments and expenses live in accounting/expense modules — `/expenses`, `/suppliers/payments`, payroll `/hr/payroll`. **Chat** has no cash-outflow ranking tool. `get_till_health` shows till-level outflows only.  
**Path:** /expenses

**Q:** Which expenses increased the most this month?  
**A:** **Report:** `/expenses` and accounting expense reports by category — compare MoM on screen. **Not supported** in chat tools.  
**Path:** /expenses

**Q:** Why are my expenses higher this month?  
**A:** Open `/reports/profit-loss` expense section or `/expenses` filtered by month. Identify largest category increases from report — do not invent.  
**Path:** /reports/profit-loss

**Q:** What is my break-even point?  
**A:** **Not supported.** Requires fixed/variable cost modeling not exposed to AI. Offer `/reports/profit-loss` for actuals; suggest accountant for break-even analysis.  
**Path:** /reports/profit-loss

**Q:** Open cash flow report  
**A:** /reports/cash-flow — accounting indirect cash flow (GAAP-style), not POS till cash.  
**Path:** /reports/cash-flow

**Q:** Till cash vs accounting cash flow — what's the difference?  
**A:** `get_till_health` = POS sessions, float, variance, payment mix. `/reports/cash-flow` = GL-based operating/investing/financing. Never conflate them.  
**Path:** /reports/cash-flow

**Q:** M-Pesa collections this month  
**A:** **Partial:** `get_till_health` payment mix; `/reports/till-sessions` or sales payment breakdown reports. May need `create_custom_report` for precise M-Pesa totals.  
**Path:** /reports/till-sessions

**Q:** Prioritize supplier payments with limited cash  
**A:** **Not supported** as optimizer. **Guidance:** sort by due date, overdue status, stock-critical suppliers, early-payment discounts — user supplies cash cap. `get_supplier_statement` per supplier for amounts owed.  
**Path:** /suppliers/payments

---

## Sales KPIs

**Q:** What is my average order value?  
**A:** **Derive:** `get_sales_summary` → total sales ÷ transaction count for the period. State the formula and quote both numbers from the tool.  
**Path:** /reports/daily-sales

**Q:** What is my sales growth rate?  
**A:** `get_sales_brief` → `change_pct` (current vs previous equal-length period). Or two `get_sales_summary` calls and compute % change — show math.  
**Path:** /reports/daily-sales

**Q:** What is my customer growth rate?  
**A:** **Not supported** as active-customer count delta in chat. `create_custom_report` or `/reports` customer analytics if available. Do not invent customer count growth.  
**Path:** /reports/builder

**Q:** What percentage of my sales are credit sales?  
**A:** **Not supported** in one chat tool. `create_custom_report` on sales with credit flag, or credit queue `/sales/shop-debtors/unpaid` for balances — not period credit %.  
**Path:** /reports/builder

**Q:** What percentage of my sales are M-Pesa?  
**A:** **Partial:** `get_till_health` payment mix for till channel; org-wide → payment breakdown report or `create_custom_report`.  
**Path:** /reports/till-sessions

**Q:** Which cashier has the highest average transaction value?  
**A:** **Partial:** `get_sales_by_cashier` returns totals — divide by transaction count only if the tool returns count; otherwise `create_custom_report` or `/reports/sales-by-user`.  
**Path:** /reports/sales-by-user

**Q:** Which cashier gives the most discounts?  
**A:** **Chat tool:** `run_insight` `margin_discount_watchdog` → `discount_by_cashier`.  
**Path:** /reports

**Q:** Which cashier has the highest void rate?  
**A:** **Chat tool:** `run_insight` `exception_radar` → `voids_cancels`; **Insight** `anomaly_detection` for patterns. No dedicated void-rate-by-cashier chat tool.  
**Path:** /reports

**Q:** Which branch has the fastest sales growth?  
**A:** **Chat tool:** `run_insight` `branch_till_benchmarks` compares branch sales. Growth % across periods may need custom report with branch filter.  
**Path:** /reports

**Q:** Top 10 products this month  
**A:** `get_sales_brief` top_products or `get_sales_by_product` with month range.  
**Path:** /reports/sales-by-product

**Q:** Top 10 customers this month  
**A:** `get_sales_brief` top_customers for lookback window covering the month.  
**Path:** /reports/daily-sales

**Q:** Sales by branch  
**A:** **Chat tool:** `run_insight` `branch_till_benchmarks`. Custom report if branch dimension needed in chat.  
**Path:** /reports

**Q:** Credit sales vs cash sales split  
**A:** Custom report or payment/credit breakdown reports — not one built-in chat metric.  
**Path:** /reports/builder

---

## Forecasting

**Q:** What will my sales likely be by the end of this month?  
**A:** **Chat tool:** `run_insight` `forecast_light` includes route run-rates; for total sales extrapolate from `get_sales_summary` month-to-date ÷ days elapsed × days in month. **Label clearly as estimate** — simple run-rate, not ML.  
**Path:** /reports

**Q:** What will my sales look like next month?  
**A:** **Chat tool:** `run_insight` `forecast_light` (`method: simple_daily_run_rate`). Narrate SKU/route run_rate_30d from slice only — do not invent beyond JSON.  
**Path:** /reports

**Q:** What products are likely to sell the most next month?  
**A:** **Chat tool:** `run_insight` `forecast_light` → `sku_forecasts` sorted by `run_rate_30d`. Use `qty_label` when presenting quantities.  
**Path:** /reports/sales-by-product

**Q:** Which products may run out next month?  
**A:** **Combine:** `forecast_light` projected demand + `get_product_details` stock_on_hand. Flag SKUs where run_rate_30d exceeds on-hand. Estimate only.  
**Path:** /reports/low-stock

**Q:** What will my debtor balance likely be at month end?  
**A:** **Not supported** as a forecast tool. **Partial:** current `get_debtors_summary` + collections trend from `collections_playbook`. Do not project month-end AR without a model — state current balance and collection priorities.  
**Path:** /sales/shop-debtors/unpaid

**Q:** What will my cash position look like at month end?  
**A:** **Not supported.** `get_till_health` is point-in-time/recent till only. Decline full cash forecast; offer to summarize current till + AR + known AP.  
**Path:** /reports/cash-flow

**Q:** What are my biggest risks for next month?  
**A:** **Combine insights:** `forecast_light` (stockouts), `get_debtors_summary` (AR), `get_stock_summary`, `get_purchasing_overview` (supply), `margin_discount_watchdog` (margin). Narrative risk list from slices — no invented probabilities.  
**Path:** /reports

**Q:** Demand forecast for next two weeks  
**A:** **Chat tool:** `run_insight` `forecast_light` — quote `run_rate_14d` per SKU/route from slice.  
**Path:** /reports

**Q:** Is forecast ML-based?  
**A:** No. Centrix `forecast_light` uses **simple daily run-rate** (`method: simple_daily_run_rate`) over the lookback window. Say so clearly.  
**Path:** /reports

---

## What-if / scenario analysis

**Q:** What happens if I increase prices by 5%?  
**A:** **Chat tool:** `calculate_scenario` scenario_type=price_increase percent_change=5 — label as illustrative estimate.  
**Path:** /products

**Q:** What happens if sales increase by 10%?  
**A:** **Illustration only:** if current period sales from `get_sales_summary` are X, 10% lift = X × 1.1 — label as hypothetical. Gross profit depends on margin; use `/reports/profit-loss` margin % if estimating profit impact.  
**Path:** /reports/profit-loss

**Q:** What happens if my supplier increases prices by 8%?  
**A:** **Partial:** `get_product_details` last_cost_price × 1.08 for affected SKUs — illustrate margin squeeze vs sell price. Org-wide impact **not supported** without listing products.  
**Path:** /products

**Q:** What happens if I reduce discounts by 2%?  
**A:** **Not supported** as simulator. **Insight** `margin_discount_watchdog` shows current discount totals as baseline. Hypothetical savings require discount base from insight — do not invent.  
**Path:** /reports

**Q:** If I spend KES 100,000 on stock, which products should I buy?  
**A:** **Chat tool:** `run_insight` `procurement_companion` priority list — fit lines within budget by urgency × margin × velocity. User confirms LPO on `/lpo`. Do not auto-spend.  
**Path:** /lpo

**Q:** If I have KES 500,000 available, which supplier payments should I make first?  
**A:** **Not supported** as payment optimizer. Prioritize: overdue AP, stock-critical suppliers, discounts for early pay — list `get_supplier_statement` amounts; user decides.  
**Path:** /suppliers/payments

**Q:** If I transfer stock from Branch A to Branch B, what will happen to their stock levels?  
**A:** **Process answer:** after approved transfer and receipt, Branch A decreases and Branch B increases by transferred qty (with `qty_label`). Live levels: `/inventory/stock` per branch. Chat does not simulate transfer before posting.  
**Path:** /inventory

**Q:** What if we close on Sundays — sales impact?  
**A:** **Not supported.** Compare historical daily_sales from `get_sales_brief` for Sunday vs other days as descriptive only — not a prediction.  
**Path:** /reports/daily-sales

**Q:** Scenario: price up 5% and volume down 10%  
**A:** **Not supported** as engine. Optional manual illustration if user supplies base revenue — label all assumptions explicitly.  
**Path:** /reports/profit-loss

---

## Anomaly / fraud detection

**Q:** Show me unusual sales transactions from today  
**A:** **Chat tool:** `run_insight` `anomaly_detection` — `unusual_large_orders`, `after_hours_sales`, `deep_discounts`, `multi_branch_customers`. **Also:** `exception_radar` for void/discount bursts. **Not in chat tools** — run from Reports → AI Insights.  
**Path:** /reports

**Q:** Are there any suspicious discounts today?  
**A:** **Chat tool:** `run_insight` `anomaly_detection` → `deep_discounts`; **Insight** `margin_discount_watchdog`. Present as **review indicators**, not fraud accusations.  
**Path:** /reports

**Q:** Are there any suspicious refunds today?  
**A:** **Partial:** `/sales/returns` and void patterns in `exception_radar`. No dedicated “refund anomaly” slice — check returns report + anomaly insight for related signals.  
**Path:** /sales/returns

**Q:** Are there any suspicious voids today?  
**A:** **Chat tool:** `run_insight` `exception_radar` → `voids_cancels`; **Insight** `anomaly_detection`. Flag frequency/timing for management review.  
**Path:** /reports

**Q:** Is there unusual activity at any branch today?  
**A:** **Chat tool:** `run_insight` `anomaly_detection` + `branch_till_benchmarks` for branch-level deviation. Compare sales/discounts vs peer branches in slice.  
**Path:** /reports

**Q:** Which cashier has the highest risk indicators?  
**A:** **Chat tool:** `run_insight` `margin_discount_watchdog` (discount totals), `anomaly_detection` (patterns), `get_till_health` (variance). Rank indicators **for review** — never claim fraud.  
**Path:** /reports/till-sessions

**Q:** Exception radar digest  
**A:** **Chat tool:** `run_insight` `exception_radar` — combines low stock, unpaid spike, discount burst, voids. Scheduled morning digest available in Settings → AI.  
**Path:** /reports

**Q:** After-hours sales anomaly  
**A:** **Chat tool:** `run_insight` `anomaly_detection` → `after_hours_sales`. Verify on `/sales/orders` before acting.  
**Path:** /sales/orders

**Q:** Unusually large order today  
**A:** **Chat tool:** `run_insight` `anomaly_detection` compares to `avg_order_total` and `large_order_threshold`.  
**Path:** /sales/orders

---

## Executive / AI assistant

**Q:** What should I do first this morning?  
**A:** Check **Insight** `exception_radar` or morning digests; then `get_debtors_summary` (collections), `get_stock_summary` (stockouts), `get_till_health` (yesterday variances). Order by urgency and KES impact.  
**Path:** /reports

**Q:** Give me the top five actions I should take today  
**A:** Rank from: exception_radar, collections_playbook, procurement_companion suggestions, till variances, LPO approvals (`get_purchasing_overview`). Five concrete actions with links.  
**Path:** /reports

**Q:** Is there anything unusual happening in my business today?  
**A:** **Chat tool:** `run_insight` `anomaly_detection` + `exception_radar`. **Chat partial:** `get_sales_summary` today vs typical day from `get_sales_brief` daily_sales.  
**Path:** /reports

**Q:** What is going well in my business?  
**A:** `get_sales_brief` if `change_pct` > 0; fast_movers in `get_stock_summary`; successful collections if AR down vs `exception_radar` unpaid spike false. Use only positive signals present in data.  
**Path:** /reports

**Q:** What is getting worse in my business?  
**A:** Negative `change_pct` in `get_sales_brief`; `unpaid_spike` in exception_radar; rising voids/discounts; growing below-cost lines in margin_discount_watchdog. Cite each from tools.  
**Path:** /reports

**Q:** Give me a one-minute CEO report  
**A:** **Combine:** yesterday/today sales (`get_sales_summary`), week trend (`get_sales_brief`), AR total (`get_debtors_summary`), low stock count (`get_stock_summary`), till variance flag (`get_till_health`), top exception (`exception_radar` if run). **P&L:** link `/reports/profit-loss` — do not invent net profit. Keep to 6–8 sentences.  
**Path:** /reports

**Q:** Give me a one-minute CEO report with profit  
**A:** **Combine:** `get_profit_loss` + `get_sales_brief` + `get_debtors_summary`. Quote net_profit and gross_margin_pct from tool — no invented figures.  
**Path:** /reports/profit-loss

**Q:** Enable morning AI briefings  
**A:** Settings → AI → Insights → enable digest types (sales_brief, exception_radar, debtors_brief, etc.), channels (email/WhatsApp/SMS), recipients, schedule times.  
**Path:** /admin

**Q:** Branch benchmark report  
**A:** **Chat tool:** `run_insight` `branch_till_benchmarks` — sales, payment mix, till variance by branch.  
**Path:** /reports

**Q:** Analyze the report I'm looking at  
**A:** **Chat tool:** `run_insight` `explain_screen` — uses visible filters/rows from page context. User triggers “Analyze with AI” on report screens.  
**Path:** /reports

---

## VAT & tax intelligence

**Q:** How much VAT did we collect this month?  
**A:** **Chat tool:** `get_vat_collected` relative_date=this_month — quote `vat_collected_total`, `taxable_sales_gross`. Link `/reports/vat-collected`.  
**Path:** /reports/vat-collected

**Q:** Is VAT roughly 16% of taxable sales?  
**A:** After `get_vat_collected`, compute vat ÷ taxable_sales_gross. Explain exemptions/zero-rated can skew the ratio. Do not use find_screen only.  
**Path:** /reports/vat-collected

**Q:** VAT vs profit — are we making money after tax?  
**A:** VAT is pass-through on sales; profit question → `/reports/profit-loss`. Do not subtract VAT from profit incorrectly.  
**Path:** /reports/profit-loss

**Q:** Net VAT payable to KRA this month  
**A:** **Not supported** in chat. `get_vat_collected` is **output VAT on sales** only. Input VAT / net payable → KRA workflow and accounting reports — do not invent net payable.  
**Path:** /reports/vat-collected

---

## Route / mobile / branch

**Q:** How did routes perform today?  
**A:** **Chat tool:** `get_route_orders` for booked vs delivered, unpaid, top SKUs. **Chat tool:** `run_insight` `route_mobile_debrief` for narrative digest.  
**Path:** /fulfillment/dispatch

**Q:** Forecast route sales next week  
**A:** **Chat tool:** `run_insight` `forecast_light` → `route_forecasts` with run_rate_7d. Estimate only.  
**Path:** /fulfillment/routes

**Q:** Which branch is underperforming?  
**A:** **Chat tool:** `run_insight` `branch_till_benchmarks` — compare branch sales and variance. “Underperforming” = bottom quartile in slice, stated factually.  
**Path:** /reports

---

## Custom reports & ad-hoc BI

**Q:** Build a report for sales by payment method  
**A:** **Chat tool:** `create_custom_report` — ask for report name if missing, return `/reports/custom/{id}`.  
**Path:** /reports/builder

**Q:** I need a report you don't have  
**A:** `create_custom_report` for report-builder templates; or `/reports/builder`. For P&L/GL topics, redirect to accounting reports — create_custom_report may refuse pure GL templates.  
**Path:** /reports/builder

**Q:** Compare two custom metrics not in standard reports  
**A:** `create_custom_report` or export from two reports — **not supported** as automatic join in chat.  
**Path:** /reports/builder

---

## Assistant behaviour — BI (must follow)

**Q:** Tell me net profit without checking anything  
**A:** Refuse to invent — call `get_profit_loss` for the period and quote `current.net_profit`.  
**Path:** /reports/profit-loss

**Q:** Just guess my sales forecast  
**A:** Refuse. Call `run_insight` forecast_light or `get_sales_brief` run-rate — label as estimate.  
**Path:** /reports

**Q:** Run anomaly detection in chat  
**A:** Call `run_insight` with insight_type=anomaly_detection. Narrate the returned slice; link `/reports` for the Insights UI.  
**Path:** /reports

**Q:** Is AI Insights the same as chat?  
**A:** Chat can now call `run_insight` for the same data slices as Reports → AI Insights. Scheduled digests still run separately under Settings → AI.  
**Path:** /reports

---

## Implemented BI tools reference

| Tool | Use when |
|------|----------|
| `run_insight` | Anomaly, forecast, margins, exception radar, customer 360, procurement, collections |
| `get_profit_loss` | Gross/net profit, margins, branch/product profit |
| `get_expense_summary` | Expense MoM, category increases |
| `get_customer_portfolio` | Inactive, declining, top customers, credit utilization |
| `get_inventory_valuation` | Cash in stock, top SKUs by value |
| `get_cash_position` | Treasury snapshot |
| `calculate_scenario` | What-if % changes |

Still **not supported:** sales targets/quotas, exact next-quarter profit forecast, ML forecasting (run-rate only via forecast_light).

---

## BI tools — implementation status

All backlog items below are **implemented** as chat tools (backend `AiToolRegistry`):

| Tool | Status |
|------|--------|
| `run_insight` | ✅ Chat tool — insight data slices |
| `get_profit_loss` | ✅ Chat tool |
| `get_expense_summary` | ✅ Chat tool |
| `get_customer_portfolio` | ✅ Chat tool |
| `get_inventory_valuation` | ✅ Chat tool |
| `get_cash_position` | ✅ Chat tool |
| `calculate_scenario` | ✅ Chat tool |

---

## Procurement & supplier intelligence

**Q:** Which suppliers do we owe the most?  
**A:** **Not supported** as ranked AP list in chat. `/reports/supplier-statement` or supplier aging report. **Per supplier:** `get_supplier_statement`.  
**Path:** /reports/supplier-statement

**Q:** Are we buying too much from one supplier?  
**A:** **Partial:** `get_purchasing_overview` recent LPOs; full concentration analysis → custom report on LPO spend by supplier.  
**Path:** /lpo

**Q:** Open LPOs affecting cash this week  
**A:** `get_purchasing_overview` + open `/lpo` for approval queue. Cash impact = expected payments from approved LPOs — not auto-calculated in AI.  
**Path:** /lpo

**Q:** Cost of goods trend this month  
**A:** **Chat tool:** `get_profit_loss` COGS section, or `/reports/profit-loss-by-product`. **Partial:** rising `last_cost_price` on key SKUs via `get_product_details`.  
**Path:** /reports/profit-loss

---

## Payroll & operating expense impact

**Q:** How much will payroll cost this month?  
**A:** **Not supported** as org-wide total in chat. **Per employee:** `get_employee_payroll_preview` for the month. Sum requires HR/payroll report on `/hr/payroll`.  
**Path:** /hr/payroll

**Q:** Are payroll costs hurting profit?  
**A:** Compare `/reports/profit-loss` payroll/expense lines MoM with gross profit trend. Do not invent.  
**Path:** /reports/profit-loss

**Q:** Operating expenses vs sales ratio  
**A:** **Chat tool:** `get_profit_loss` — operating expenses ÷ gross revenue from report totals.  
**Path:** /reports/profit-loss

---

## Hospitality BI (when module enabled)

**Q:** Hotel occupancy and revenue trend  
**A:** **Report:** `/reports/hospitality-*` and `/reports/hospitality-profit-loss`. **Not supported** in standard chat sales tools.  
**Path:** /reports/hospitality-profit-loss

**Q:** Why is hospitality profit down?  
**A:** `/reports/hospitality-profit-loss` for the period — room vs F&B vs expenses. Do not use retail `get_sales_brief`.  
**Path:** /reports/hospitality-profit-loss

**Q:** Night audit exceptions  
**A:** `/hospitality/night-audit` — not in AI tools. Guide with find_screen.  
**Path:** /hospitality/night-audit

---

## Investor & capital (BI angle)

**Q:** Investor capital vs business profit  
**A:** `/investors` for contributions and allocated stock; business P&L on `/reports/profit-loss`. Investor profit share tab on investor detail — no combined chat tool.  
**Path:** /investors

**Q:** Return on investor stock contributions  
**A:** **Not supported** in chat. Investor detail sales/profit views + `/reports/profit-loss`.  
**Path:** /investors

---

## Digests & alerts configuration

**Q:** Which AI digests should a retailer enable?  
**A:** Recommend: `sales_brief`, `exception_radar`, `stock_pulse`, `debtors_brief`, `margin_discount_watchdog`, `anomaly_detection`. Configure Settings → AI → Insights.  
**Path:** /admin

**Q:** Can AI alert me when stock is low in real time?  
**A:** Morning digests (`stock_pulse`) exist; real-time threshold alerts are limited — exception_alerts toggles in AI settings for some signals. Not full push for every SKU.  
**Path:** /admin

**Q:** Send management briefing to WhatsApp every morning  
**A:** Settings → AI → Insights → enable digest types + WhatsApp channel + recipient phones. Requires OpenAI key and WhatsApp configured.  
**Path:** /admin

---

## Permissions & data boundaries

**Q:** Can cashier see profit margins in AI?  
**A:** AI respects permissions. Profit reports need `reports.profit_loss.view`; without it, decline and do not leak figures.  
**Path:** /admin/roles

**Q:** Can AI answer BI for another branch I can't access?  
**A:** No — org/branch permission gates apply to tools and insights. Refuse cross-branch if tool returns permission error.  
**Path:** /

**Q:** Can AI answer BI for another company?  
**A:** Never — refuse cross-tenant. Tools scoped to user's organization only.  
**Path:** /

---

## Month-end & close

**Q:** Month-end management checklist  
**A:** **Combine:** (1) `get_vat_collected` for the month, (2) `get_debtors_summary`, (3) `/reports/profit-loss`, (4) `get_till_health` for open sessions, (5) `/hr/payroll` status, (6) `/inventory` GRN completeness. Ordered checklist — not one tool.  
**Path:** /reports

**Q:** Close-month briefing for the board  
**A:** `/reports/profit-loss` + `get_vat_collected` + `get_debtors_summary` + `get_stock_summary` + sales MoM from `get_sales_brief`. PDF/export from reports. Do not invent board metrics.  
**Path:** /reports/profit-loss

**Q:** Did we hit our sales target this month?  
**A:** **Not supported** — Centrix AI does not store sales targets/quotas (`ai_knowledge.php`). Offer actual `get_sales_summary` for the month and say targets aren't tracked.  
**Path:** /reports/daily-sales

---

## Trend narration examples (how to answer)

**Q:** Narrate sales trend for the last 14 days  
**A:** `get_sales_brief` lookback_days=14 → use `daily_sales` array. Describe direction (up/down/flat), spikes, and link `/reports/daily-sales`. Quote daily KES from tool.  
**Path:** /reports/daily-sales

**Q:** Is unpaid debt getting better or worse?  
**A:** **Insight** `exception_radar` compares `unpaid_now` vs `unpaid_previous_period` and `unpaid_spike` flag. Also `get_debtors_summary` for current total.  
**Path:** /sales/shop-debtors/unpaid

**Q:** Payment mix trend — more M-Pesa or cash?  
**A:** `get_till_health` for recent sessions; **Insight** `branch_till_benchmarks` for branch payment mix. Two-period trend → custom report.  
**Path:** /reports/till-sessions

---

## Edge cases — do not overclaim

**Q:** Predict exact net profit next quarter  
**A:** **Not supported.** Decline long-range profit prediction. Offer historical `/reports/profit-loss` and `forecast_light` for sales/run-rate only.  
**Path:** /reports/profit-loss

**Q:** Which employee is stealing?  
**A:** Never accuse. **Insight** `anomaly_detection` / `margin_discount_watchdog` provide **review indicators** (voids, discounts, variance). Escalate to management investigation.  
**Path:** /reports

**Q:** Auto-approve credit limit increases  
**A:** Never. Present candidates only; human approves on `/customers`.  
**Path:** /customers

**Q:** Auto-create LPO from AI recommendation  
**A:** Never without confirmation. **Insight** `procurement_companion` drafts suggestions; user creates/confirms on `/lpo`.  
**Path:** /lpo

**Q:** Gross margin for a product with no cost price  
**A:** `get_product_details` — if `last_cost_price` missing, say margin unknown; suggest GRN/cost update. Do not assume cost.  
**Path:** /products

**Q:** Blend hospitality and retail sales in one KPI  
**A:** Only if tool/report includes both channels. Retail: `get_sales_brief`. Hotel: hospitality reports. Do not merge unless data slice supports it.  
**Path:** /reports

---

*Count: 182 Q&A pairs (Set 4 — business intelligence). Combined with Sets 1–3 ≈ 900+ training pairs.*
