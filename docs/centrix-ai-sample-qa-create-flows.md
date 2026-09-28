# Centrix ERP — Sample AI Q&A: create / help-me-create flows (~110)

Companion for Talk + Assistant. Fixes the failure mode where *"can you help me create an LPO"* was treated as a supplier name.

**Import tip (Platform → AI training → Bulk paste):** each block is \`Q:\` / \`A:\` / optional \`Path:\`.

**Also:** Platform → AI training → **Install foundation notes** (includes these after backend deploy).

---

**Q: Can you help me create an LPO?**  
**A: Yes — start a create_lpo draft. Ask for the **supplier** and **line items** (product + qty, or a sales order to copy from). Do **not** treat this whole question as a supplier name. Never ask for confirm/save on this first turn. Offer **show form** only if they ask. Path: /lpo.**  
**Path:** /lpo

**Q: Can you help me create a purchase order?**  
**A: Same as create LPO. Collect supplier + lines in chat first; confirm only when both are set. Never invent supplier names from the help question. Path: /lpo.**  
**Path:** /lpo

**Q: Help me raise an LPO**  
**A: Start create_lpo. Ask which supplier and which products/quantities. Do not match the phrase “help me raise an LPO” as a supplier. Path: /lpo.**  
**Path:** /lpo

**Q: I want to create an LPO**  
**A: Start create_lpo conversationally — ask supplier + lines. No confirm yet. Path: /lpo.**  
**Path:** /lpo

**Q: Please create a PO for me**  
**A: Treat as create_lpo. Ask supplier and products. “PO” / “purchase order” / “LPO” are the same create flow. Path: /lpo.**  
**Path:** /lpo

**Q: How do I create an LPO with Centrix Talk?**  
**A: Say you want an LPO, then name the supplier and products with quantities (e.g. “Supplier Bidco, Sugar x 20”). Reply **confirm** only after those are collected. Path: /lpo.**  
**Path:** /lpo

**Q: Create LPO from sales order SO-100**  
**A: Start create_lpo with order_num/sale reference so lines copy from that sales order at last cost. Still need a supplier if not implied. Confirm when ready. Path: /lpo.**  
**Path:** /lpo

**Q: Make an LPO for Bidco with Kamande x 10**  
**A: create_lpo with supplier Bidco and line Kamande qty 10. Resolve names from catalog; then ask confirm when ready. Path: /lpo.**  
**Path:** /lpo

**Q: Submit this LPO for approval**  
**A: Use submit_lpo_for_approval with the LPO number after confirming which draft. Path: /lpo.**  
**Path:** /lpo

**Q: Approve LPO 4521**  
**A: approve_lpo for that number after user confirms. Path: /lpo.**  
**Path:** /lpo

**Q: Mark LPO sent to supplier**  
**A: mark_lpo_sent for the given LPO number after confirm. Offer PDF link. Path: /lpo.**  
**Path:** /lpo

**Q: Receive goods on this LPO**  
**A: receive_lpo_goods (receive_all by default) after confirm. Path: /lpo or /inventory/receipts.**  
**Path:** /inventory/receipts

**Q: Can you help me create a product?**  
**A: Start create_product. Ask product name and key fields (UoM, VAT, selling/cost if known). Do not treat the whole help question as the product name. Confirm only when required fields are set. Path: /products.**  
**Path:** /products

**Q: Help me add a new product**  
**A: create_product — collect name first, then prices/UoM/VAT. Never invent SKUs; product_code can auto-generate. Path: /products.**  
**Path:** /products

**Q: I want to create a product called Cooking Oil 20L**  
**A: create_product with product_name Cooking Oil 20L; ask remaining required fields then confirm. Path: /products.**  
**Path:** /products

**Q: Change the selling price of Sugar to 250**  
**A: update_product — resolve product Sugar, set unit_price 250 KES, confirm before save. Path: /products.**  
**Path:** /products

**Q: Can you update product cost for Bidco Oil?**  
**A: update_product last_cost_price after resolving the product by name. Confirm before save. Path: /products.**  
**Path:** /products

**Q: Which products have cost higher than selling?**  
**A: Call find_catalogue_exceptions check=cost_above_selling; quote the table. Path: /products.**  
**Path:** /products

**Q: Can you help me create a supplier?**  
**A: Start create_supplier. Ask supplier name and contacts. Do not treat “help me create a supplier” as the supplier_name. Confirm when ready. Path: /suppliers.**  
**Path:** /suppliers

**Q: Add a new supplier called Nairobi Hardware**  
**A: create_supplier with supplier_name Nairobi Hardware; ask phone/email if useful, then confirm. Path: /suppliers.**  
**Path:** /suppliers

**Q: How do I pay a supplier?**  
**A: Open /suppliers/payments or guide record supplier payment against outstanding LPOs. Do not invent balances. Path: /suppliers/payments.**  
**Path:** /suppliers/payments

**Q: What did we buy from Bidco this month?**  
**A: Call get_supplier_statement for Bidco for the period; quote LPOs and products. Path: /suppliers.**  
**Path:** /suppliers

**Q: Can you help me create a customer?**  
**A: Start create_customer. Ask customer name and contacts. Never use the help phrase as customer_name. Confirm when ready. Path: /customers.**  
**Path:** /customers

**Q: Help me add a walk-in customer**  
**A: create_customer — collect name (and phone if available). Path: /customers.**  
**Path:** /customers

**Q: Can you help me create a sales order?**  
**A: Start create_sales_order. Ask customer + line items. Do not treat the help question as the customer name. Confirm when ready. Path: /sales/orders.**  
**Path:** /sales/orders

**Q: Help me hold / park an order**  
**A: create_held_order or guide hold on POS. Collect customer/lines if creating via chat. Path: /sales/pos.**  
**Path:** /sales/pos

**Q: Record a customer payment**  
**A: record_customer_payment — ask order/customer, amount, method. Confirm before posting. Path: /sales/shop-debtors/unpaid.**  
**Path:** /sales/shop-debtors/unpaid

**Q: Can you help me collect payment from a debtor?**  
**A: Guide Collect payment on /sales/shop-debtors/unpaid (or partial). Or start record_customer_payment in chat with order + amount. Path: /sales/shop-debtors/unpaid.**  
**Path:** /sales/shop-debtors/unpaid

**Q: Who owes us money?**  
**A: Call get_debtors_summary; quote names and amounts only. Path: /sales/shop-debtors/unpaid.**  
**Path:** /sales/shop-debtors/unpaid

**Q: Where is POS / checkout?**  
**A: Retail POS at /sales/pos or /pos. Hotel bar uses /hotel-bar-pos. Path: /sales/pos.**  
**Path:** /sales/pos

**Q: How do I cancel a sales order?**  
**A: Open /sales/orders → Cancel order (or approval if required). How-to only — do not start create order. Path: /sales/orders.**  
**Path:** /sales/orders

**Q: How do I void a sale?**  
**A: Use cancel/void from the order summary per org rules; stock restores on success. Path: /sales/orders.**  
**Path:** /sales/orders

**Q: Where are returns / credit notes?**  
**A: Open /sales/returns. Not the same as LPO returns. Path: /sales/returns.**  
**Path:** /sales/returns

**Q: Can you help me receive stock?**  
**A: Prefer receive against an LPO via receive_lpo_goods or /inventory/receipts GRN. Ask which LPO. Path: /inventory/receipts.**  
**Path:** /inventory/receipts

**Q: What is my stock for Sugar?**  
**A: Call stock/product tools for Sugar by name; quote on-hand. Path: /inventory/stock.**  
**Path:** /inventory/stock

**Q: Show low stock items**  
**A: Use low-stock report tools or /reports/low-stock; never invent quantities. Path: /reports/low-stock.**  
**Path:** /reports/low-stock

**Q: Help me do a stock adjustment**  
**A: Guide Inventory → adjustments screen (find_screen stock adjustment). Confirm org permissions; do not invent qty. Path: /inventory.**  
**Path:** /inventory

**Q: Where are categories and UoM?**  
**A: Categories /categories; UoMs under inventory catalog settings. Products link to both. Path: /categories.**  
**Path:** /categories

**Q: Can you help me with bank reconciliation?**  
**A: Open /accounting/bank-reconciliation — match GL cash/bank to statement CSV. Not M-Pesa channel recon. Path: /accounting/bank-reconciliation.**  
**Path:** /accounting/bank-reconciliation

**Q: Show accounts receivable**  
**A: Accounting AR at /accounting/accounts-receivable; shop debtors queues are separate under Sales. Use get_debtors_summary for chat snapshot. Path: /accounting/accounts-receivable.**  
**Path:** /accounting/accounts-receivable

**Q: Where is the chart of accounts?**  
**A: Open accounting COA screen via find_screen “chart of accounts”. Path: /accounting.**  
**Path:** /accounting

**Q: Help me post a journal entry**  
**A: Guide Journals under Accounting; collect accounts/amounts then confirm on screen — do not invent GL codes. Path: /accounting.**  
**Path:** /accounting

**Q: Supplier balance / AP overview**  
**A: Call get_purchasing_overview or get_supplier_statement; link /suppliers. Path: /suppliers.**  
**Path:** /suppliers

**Q: Can you help me create an employee?**  
**A: Start create_employee. Ask full name and required HR fields. Do not treat the help phrase as the employee name. Path: /hr.**  
**Path:** /hr

**Q: Help me add a new staff member**  
**A: create_employee — collect name, then role/branch as needed; confirm when ready. Path: /hr.**  
**Path:** /hr

**Q: Where is payroll?**  
**A: Open HR → Payroll via find_screen payroll. Path: /hr.**  
**Path:** /hr

**Q: How do I approve leave?**  
**A: Open leave approvals in HR/Approvals inbox; do not invent leave balances. Path: /hr.**  
**Path:** /hr

**Q: Attendance / clock devices**  
**A: Guide attendance clock device settings under HR. Path: /hr.**  
**Path:** /hr

**Q: Can you help me with picking?**  
**A: Open fulfillment picking sheets / mobile picking. Use find_screen picking. Path: /fulfillment.**  
**Path:** /fulfillment

**Q: Where are trip charts?**  
**A: Fulfillment / sales trip charts screens — find_screen trip chart. Path: /fulfillment.**  
**Path:** /fulfillment

**Q: Route orders today**  
**A: Call get_route_orders for the date; quote results. Path: /fulfillment.**  
**Path:** /fulfillment

**Q: Can you help me open a hotel bar check?**  
**A: Guide /hotel-bar-pos — not retail /sales/pos. Path: /hotel-bar-pos.**  
**Path:** /hotel-bar-pos

**Q: Where is hospitality POS?**  
**A: Hotel & Hospitality check POS at /hotel-bar-pos. Path: /hotel-bar-pos.**  
**Path:** /hotel-bar-pos

**Q: Can you help me create a report template?**  
**A: create_report_template — ask report name and what it should show; confirm when ready. Path: /reports.**  
**Path:** /reports

**Q: Show sales today**  
**A: Call sales summary / insight tools for today; never invent totals. Path: /reports.**  
**Path:** /reports

**Q: Where do I manage users and roles?**  
**A: Administration → Users / Roles. Path: /admin or users/roles screens via find_screen. Path: /admin.**  
**Path:** /admin

**Q: What can Centrix Talk do?**  
**A: Voice Q&A and guided creates (LPO, product, supplier, customer, orders, payments). Collect details then confirm — never claim saved until the system returns a real id.**  
**Path:** /lpo

**Q: When should I say confirm?**  
**A: Only after required fields for the pending create/update are collected. Never on the first “help me create…” turn.**  
**Path:** /lpo

**Q: When should I say show form?**  
**A: When the user wants an inline form instead of chatting fields. Do not show the form on the first help-me-create turn unless they ask.**  
**Path:** /lpo

**Q: Do not treat my question as a supplier name**  
**A: Correct — phrases like “can you help me create an LPO” are intents, not supplier/product/customer names. Ask for the real name next.**  
**Path:** /lpo

**Q: Naomba unisaidie kutengeneza LPO**  
**A: User asked in Swahili to help create an LPO. Reply in English (or match their language if org prefers): start create_lpo, ask supplier + lines. Do not treat the Swahili sentence as a supplier name. Path: /lpo.**  
**Path:** /lpo

**Q: Draft purchase order please**  
**A: create_lpo — ask supplier and products. Path: /lpo.**  
**Path:** /lpo

**Q: Start an LPO for me**  
**A: create_lpo draft; ask supplier + line items. Path: /lpo.**  
**Path:** /lpo

**Q: I need a new LPO**  
**A: create_lpo — collect supplier and lines before confirm. Path: /lpo.**  
**Path:** /lpo

**Q: Could you create a purchase order?**  
**A: Yes — create_lpo; ask supplier and items. Never use this sentence as supplier_name. Path: /lpo.**  
**Path:** /lpo

**Q: Would you help me raise a PO?**  
**A: create_lpo flow; ask supplier + quantities. Path: /lpo.**  
**Path:** /lpo

**Q: Open LPO screen**  
**A: Navigate / open_lpo to /lpo. Path: /lpo.**  
**Path:** /lpo

**Q: List my LPOs awaiting approval**  
**A: Call list_lpos with awaiting-approval status; quote numbers/suppliers by name. Path: /lpo.**  
**Path:** /lpo

**Q: LPO details for 8891**  
**A: Call get_lpo_details for that LPO number. Path: /lpo.**  
**Path:** /lpo

**Q: Can you help me create a supplier and then an LPO?**  
**A: First create_supplier (name + contacts, confirm), then create_lpo with that supplier + lines. One write at a time. Path: /suppliers.**  
**Path:** /suppliers

**Q: Help me create a product then add it to an LPO**  
**A: create_product first; after saved, create_lpo including that product line. Path: /products.**  
**Path:** /products

**Q: Can you help me create an invoice?**  
**A: Sales invoices come from completing/checkout of orders — guide /sales/pos or /sales/orders. Do not invent invoice numbers. Path: /sales/orders.**  
**Path:** /sales/orders

**Q: Help me create a quotation / proforma**  
**A: Guide proforma/quotation from sales order flow when enabled. Path: /sales/orders.**  
**Path:** /sales/orders

**Q: Can you help me create a role?**  
**A: Guide Administration → Roles; do not invent permissions. Path: /admin.**  
**Path:** /admin

**Q: Help me create a user**  
**A: Guide Administration → Users; collect name/username/role on screen. Path: /admin.**  
**Path:** /admin

**Q: Can you help me create a branch?**  
**A: Guide org/branch admin settings if permitted; never invent branch ids. Path: /admin.**  
**Path:** /admin

**Q: Help me create a category**  
**A: Guide /categories to add a category, or collect name if a create action exists. Path: /categories.**  
**Path:** /categories

**Q: Can you help me create a VAT rate?**  
**A: Guide tax/VAT master under catalog/admin settings. Path: /admin.**  
**Path:** /admin

**Q: Help me create a payment voucher**  
**A: Guide supplier payments or accounting payment vouchers via find_screen. Path: /suppliers/payments.**  
**Path:** /suppliers/payments

**Q: Can you help me create an expense?**  
**A: Guide expenses/journals under Accounting; collect amounts/accounts on screen. Path: /accounting.**  
**Path:** /accounting

**Q: Help me create a delivery note**  
**A: Guide fulfillment/sales delivery documents via find_screen delivery note. Path: /fulfillment.**  
**Path:** /fulfillment

**Q: Can you help me create a GRN?**  
**A: Stock receipt GRN at /inventory/receipts — usually from an approved LPO. Path: /inventory/receipts.**  
**Path:** /inventory/receipts

**Q: Help me create a goods return to supplier**  
**A: Guide purchasing/inventory return-to-supplier flow via find_screen; not sales returns. Path: /lpo.**  
**Path:** /lpo

**Q: Can you help me create a credit note?**  
**A: Sales credit notes/returns at /sales/returns. Path: /sales/returns.**  
**Path:** /sales/returns

**Q: Help me create a stock transfer**  
**A: Guide inventory transfer between locations/branches via find_screen. Path: /inventory.**  
**Path:** /inventory

**Q: Can you help me create a price list?**  
**A: Guide product pricing / price lists under catalog if enabled. Path: /products.**  
**Path:** /products

**Q: Help me create a discount rule**  
**A: Guide promotions/discount settings; do not invent approval rules. Path: /admin.**  
**Path:** /admin

**Q: Can you help me create a till session?**  
**A: Guide Till management /sales till screens for open/close float. Path: /sales.**  
**Path:** /sales

**Q: Help me create an approval request**  
**A: Approvals are created by business actions (discount, cancel, LPO submit). Open Approvals inbox to act on them. Path: /approvals.**  
**Path:** /approvals

**Q: Can you help me create a shift roster?**  
**A: Guide HR roster/shift screens via find_screen. Path: /hr.**  
**Path:** /hr

**Q: Help me create a leave request**  
**A: Guide HR leave request; do not invent balances. Path: /hr.**  
**Path:** /hr

**Q: Can you help me create a room booking?**  
**A: Guide hospitality reservations if module enabled. Path: hospitality workspace.**  
**Path:** /hotel-bar-pos

**Q: Help me create a kitchen order**  
**A: Guide hotel/bar POS check flow for kitchen tickets. Path: /hotel-bar-pos.**  
**Path:** /hotel-bar-pos

**Q: Can you help me create a mobile sales order?**  
**A: Guide mobile/route order screens or create_sales_order with route context. Path: /fulfillment.**  
**Path:** /fulfillment

**Q: Help me create a picking list**  
**A: Guide fulfillment picking list print/screens. Path: /fulfillment.**  
**Path:** /fulfillment

**Q: Can you help me create a bank payment?**  
**A: Guide supplier payment or accounting payment with bank method; confirm amounts from tools. Path: /suppliers/payments.**  
**Path:** /suppliers/payments

**Q: Help me create an M-Pesa receipt recon**  
**A: Guide M-Pesa/channel recon tools — separate from bank reconciliation CSV. Path: /accounting.**  
**Path:** /accounting

**Q: Can you help me create a budget?**  
**A: Guide accounting budgets if enabled; do not invent figures. Path: /accounting.**  
**Path:** /accounting

**Q: Help me create a fixed asset**  
**A: Guide fixed assets module via find_screen. Path: /accounting.**  
**Path:** /accounting

**Q: Can you help me create a warehouse location?**  
**A: Guide inventory locations/warehouses settings. Path: /inventory.**  
**Path:** /inventory

**Q: Help me create a reorder point for Sugar**  
**A: update_product / product edit for Sugar reorder point; confirm before save. Path: /products.**  
**Path:** /products

**Q: Can you help me create a barcode for a product?**  
**A: Set barcode on create_product or product edit; do not invent conflicting barcodes. Path: /products.**  
**Path:** /products

**Q: Help me create a customer with credit limit**  
**A: create_customer including credit limit if field exists; never invent utilization. Path: /customers.**  
**Path:** /customers

**Q: Can you help me create a sales route?**  
**A: Guide routes master under sales/fulfillment settings. Path: /fulfillment.**  
**Path:** /fulfillment

**Q: Help me create a vehicle for trips**  
**A: Guide fleet/vehicle master if enabled via find_screen. Path: /fulfillment.**  
**Path:** /fulfillment

**Q: Can you help me create a tax invoice?**  
**A: Tax invoices print from completed sales orders / eTIMS flows when enabled — open the order. Path: /sales/orders.**  
**Path:** /sales/orders

**Q: Help me create an LPO PDF**  
**A: After create_lpo succeeds, share document_links PDF/print. Until saved, collect supplier + lines then confirm. Path: /lpo.**  
**Path:** /lpo

**Q: Talk mode — create LPO without typing**  
**A: In voice mode, ask aloud for supplier then products with quantities; say confirm when ready. Never claim the LPO exists before the system returns an LPO number.**  
**Path:** /lpo

**Q: What if supplier name is not matched?**  
**A: Ask for the exact supplier name, @mention, or **show form**. Never keep using the original help-me-create sentence as supplier_name.**  
**Path:** /lpo

**Q: Example good LPO reply after help request**  
**A: “Sure — I can create an LPO. Which supplier should I use, and what products and quantities?” Then wait. Path: /lpo.**  
**Path:** /lpo

