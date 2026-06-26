export const EMPLOYEE_EXPORT_COLUMNS = [
  { key: "employee_code", label: "Employee code" },
  { key: "payroll_number", label: "Payroll #" },
  { key: "full_name", label: "Full name" },
  { key: "job_title", label: "Job title" },
  { key: "department_name", label: "Department" },
  { key: "position_name", label: "Position" },
  { key: "shift_name", label: "Shift" },
  { key: "branch_name", label: "Branch" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "employment_status", label: "Status" },
  { key: "employment_type", label: "Type" },
  { key: "hire_date", label: "Hire date" },
  { key: "base_salary", label: "Base salary", align: "right" },
  { key: "kra_pin", label: "KRA PIN" },
  { key: "nssf_number", label: "NSSF" },
  { key: "sha_number", label: "SHA" },
  { key: "is_active", label: "Active" },
];

export const ATTENDANCE_EXPORT_COLUMNS = [
  { key: "attendance_date", label: "Date" },
  { key: "employee_name", label: "Employee" },
  { key: "employee_code", label: "Code" },
  { key: "branch_name", label: "Branch" },
  { key: "check_in", label: "Check in" },
  { key: "check_out", label: "Check out" },
  { key: "hours_worked", label: "Hours", align: "right" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "notes", label: "Notes" },
];

export const LEAVE_DAY_EXPORT_COLUMNS = [
  { key: "leave_date", label: "Date" },
  { key: "employee_name", label: "Employee" },
  { key: "employee_code", label: "Code" },
  { key: "leave_type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "days", label: "Days", align: "right" },
  { key: "reason", label: "Reason" },
];

export const DEPARTMENT_EXPORT_COLUMNS = [
  { key: "department_code", label: "Code" },
  { key: "department_name", label: "Name" },
  { key: "is_active", label: "Active" },
];

export const POSITION_EXPORT_COLUMNS = [
  { key: "position_code", label: "Code" },
  { key: "position_title", label: "Title" },
  { key: "is_active", label: "Active" },
];

export const EXPENSE_EXPORT_COLUMNS = [
  { key: "expense_date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "expense_amount", label: "Amount", align: "right" },
  { key: "invoice_no", label: "Invoice #" },
  { key: "notes", label: "Notes" },
];

export const USER_EXPORT_COLUMNS = [
  { key: "username", label: "Username" },
  { key: "full_name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "is_active", label: "Active" },
];

export const BRANCH_EXPORT_COLUMNS = [
  { key: "branch_code", label: "Code" },
  { key: "branch_name", label: "Name" },
  { key: "town", label: "Town" },
  { key: "is_active", label: "Active" },
];

export const CATEGORY_EXPORT_COLUMNS = [
  { key: "category_name", label: "Category" },
];

export const UOM_EXPORT_COLUMNS = [
  { key: "full_name", label: "Unit" },
  { key: "measure_name", label: "Measure" },
  { key: "conversion_factor", label: "Factor", align: "right" },
  { key: "is_active", label: "Active" },
];

export const VAT_EXPORT_COLUMNS = [
  { key: "vat_code", label: "Code" },
  { key: "vat_name", label: "Name" },
  { key: "vat_percentage", label: "Rate %", align: "right" },
  { key: "is_active", label: "Active" },
];

export const PAYROLL_RUN_EXPORT_COLUMNS = [
  { key: "id", label: "Run #" },
  { key: "status", label: "Status" },
  { key: "period_label", label: "Period" },
  { key: "total_gross", label: "Gross", align: "right" },
  { key: "total_net", label: "Net", align: "right" },
  { key: "created_at", label: "Created" },
];

export const LPO_EXPORT_COLUMNS = [
  { key: "lpo_no", label: "PO #" },
  { key: "supplier_name", label: "Supplier" },
  { key: "order_date", label: "Order date" },
  { key: "expected_date", label: "Expected" },
  { key: "total_amount", label: "Total", align: "right" },
  { key: "balance_due", label: "Balance", align: "right" },
  { key: "status_name", label: "Status" },
];

export const SUBCATEGORY_EXPORT_COLUMNS = [
  { key: "subcategory_name", label: "Subcategory" },
  { key: "category_id", label: "Category ID" },
];

export const KPI_EXPORT_COLUMNS = [
  { key: "label", label: "KPI" },
  { key: "kpi_code", label: "Code" },
  { key: "period_start", label: "Period start" },
  { key: "period_end", label: "Period end" },
  { key: "target_value", label: "Target", align: "right" },
  { key: "unit", label: "Unit" },
  { key: "assigned_count", label: "Assigned", align: "right" },
  { key: "met_count", label: "Met", align: "right" },
  { key: "is_active", label: "Active" },
];

export const DAMAGE_EXPORT_COLUMNS = [
  { key: "created_at", label: "Date" },
  { key: "product_code", label: "Product code" },
  { key: "quantity", label: "Qty", align: "right" },
  { key: "stock_location", label: "Location" },
  { key: "reason", label: "Reason" },
  { key: "reported_by", label: "Reported by" },
];

export const STOCK_RECEIPT_EXPORT_COLUMNS = [
  { key: "created_at", label: "Received at" },
  { key: "product_code", label: "Product code" },
  { key: "units_received", label: "Qty", align: "right" },
  { key: "stock_location", label: "Location" },
  { key: "invoice_number", label: "Invoice #" },
  { key: "cost_price", label: "Cost", align: "right" },
];

export const STOCK_ON_HAND_EXPORT_COLUMNS = [
  { key: "product_code", label: "SKU" },
  { key: "product_name", label: "Product" },
  { key: "shop_quantity", label: "Shop qty", align: "right" },
  { key: "store_quantity", label: "Store qty", align: "right" },
  { key: "total_base_units", label: "Total units", align: "right" },
  { key: "uom_name", label: "Unit" },
  { key: "wholesale_price", label: "Wholesale", align: "right" },
  { key: "reorder_point", label: "Reorder", align: "right" },
  { key: "product_alert", label: "Status" },
];

export const STOCK_MOVEMENT_EXPORT_COLUMNS = [
  { key: "created_at", label: "Date" },
  { key: "product_code", label: "Product code" },
  { key: "transaction_type", label: "Type" },
  { key: "quantity_change", label: "Qty change", align: "right" },
  { key: "stock_location", label: "Location" },
  { key: "reference_type", label: "Reference type" },
  { key: "reference_id", label: "Reference #" },
  { key: "notes", label: "Notes" },
];

export const STOCK_TRANSFER_EXPORT_COLUMNS = [
  { key: "created_at", label: "Date" },
  { key: "product_code", label: "Product code" },
  { key: "product_name", label: "Product" },
  { key: "from_location", label: "From" },
  { key: "to_location", label: "To" },
  { key: "quantity_moved", label: "Qty moved", align: "right" },
];

export const STOCK_TAKE_SESSION_EXPORT_COLUMNS = [
  { key: "id", label: "Session #" },
  { key: "session_name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "started_at", label: "Started" },
  { key: "completed_at", label: "Completed" },
];

export const DISPATCH_TRIP_EXPORT_COLUMNS = [
  { key: "trip_code", label: "Trip" },
  { key: "scheduled_date", label: "Date" },
  { key: "status", label: "Status" },
  { key: "sales_count", label: "Orders", align: "right" },
  { key: "expected_cash", label: "Expected cash", align: "right" },
  { key: "collected_cash", label: "Collected", align: "right" },
];

export const ROUTE_EXPORT_COLUMNS = [
  { key: "route_name", label: "Route" },
  { key: "direction", label: "Direction" },
  { key: "route_markup_price", label: "Markup", align: "right" },
  { key: "is_active", label: "Active" },
];

export const VEHICLE_EXPORT_COLUMNS = [
  { key: "vehicle_code", label: "Code" },
  { key: "vehicle_name", label: "Name" },
  { key: "plate_number", label: "Plate" },
  { key: "max_weight_kg", label: "Max weight kg", align: "right" },
  { key: "is_active", label: "Active" },
];

export const DRIVER_EXPORT_COLUMNS = [
  { key: "driver_code", label: "Code" },
  { key: "full_name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "is_active", label: "Active" },
];

export const ROUTE_SCHEDULE_EXPORT_COLUMNS = [
  { key: "route_id", label: "Route ID" },
  { key: "day_of_week", label: "Day" },
  { key: "default_driver_id", label: "Driver ID" },
  { key: "default_vehicle_id", label: "Vehicle ID" },
  { key: "is_active", label: "Active" },
];

export const POD_RECORD_EXPORT_COLUMNS = [
  { key: "captured_at", label: "Captured" },
  { key: "sale_id", label: "Order #" },
  { key: "recipient_name", label: "Received by" },
  { key: "status", label: "Status" },
];

export const ROLE_EXPORT_COLUMNS = [
  { key: "role_name", label: "Role" },
  { key: "scope", label: "Scope" },
  { key: "is_active", label: "Active" },
];

export const AUDIT_LOG_EXPORT_COLUMNS = [
  { key: "created_at", label: "When" },
  { key: "table_name", label: "Module" },
  { key: "action", label: "Action" },
  { key: "record_id", label: "Record #" },
  { key: "user_id", label: "User ID" },
  { key: "ip_address", label: "IP" },
];

export const PAYMENT_METHOD_EXPORT_COLUMNS = [
  { key: "method_code", label: "Code" },
  { key: "method_name", label: "Name" },
  { key: "requires_reference", label: "Requires ref" },
  { key: "is_active", label: "Active" },
];

export const SUPPLIER_PAYMENT_EXPORT_COLUMNS = [
  { key: "payment_date", label: "Date" },
  { key: "supplier_id", label: "Supplier ID" },
  { key: "lpo_no", label: "PO #" },
  { key: "amount_paid", label: "Amount", align: "right" },
  { key: "payment_reference", label: "Reference" },
];

export const SUPPLIER_RETURN_EXPORT_COLUMNS = [
  { key: "document_no", label: "Document #" },
  { key: "supplier_id", label: "Supplier ID" },
  { key: "status", label: "Status" },
  { key: "total_amount", label: "Total", align: "right" },
  { key: "created_at", label: "Created" },
];

export const JOURNAL_ENTRY_EXPORT_COLUMNS = [
  { key: "entry_number", label: "Reference" },
  { key: "entry_date", label: "Date" },
  { key: "description", label: "Description" },
  { key: "status", label: "Status" },
];

export const CUSTOMER_INVOICE_EXPORT_COLUMNS = [
  { key: "invoice_no", label: "Invoice #" },
  { key: "customer_num", label: "Customer #" },
  { key: "invoice_date", label: "Date" },
  { key: "total_amount", label: "Total", align: "right" },
  { key: "balance_due", label: "Balance", align: "right" },
  { key: "payment_status", label: "Payment status" },
];

export const FISCAL_PERIOD_EXPORT_COLUMNS = [
  { key: "period_name", label: "Period" },
  { key: "start_date", label: "Start" },
  { key: "end_date", label: "End" },
  { key: "status", label: "Status" },
];

export const PRICE_HISTORY_EXPORT_COLUMNS = [
  { key: "product_code", label: "Product code" },
  { key: "unit_price", label: "New price", align: "right" },
  { key: "previous_unit_price", label: "Old price", align: "right" },
  { key: "cost_price", label: "Cost", align: "right" },
  { key: "discount_pct", label: "Discount %", align: "right" },
  { key: "changed_at", label: "Changed at" },
];

export const RETAIL_PACKAGE_EXPORT_COLUMNS = [
  { key: "product_code", label: "Product code" },
  { key: "max_qty_measure", label: "Max measure", align: "right" },
  { key: "markup_price", label: "Retail markup", align: "right" },
  { key: "wholesale_markup_price", label: "Wholesale markup", align: "right" },
];

export const VOUCHER_EXPORT_COLUMNS = [
  { key: "voucher_code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "voucher_kind", label: "Kind" },
  { key: "balance", label: "Balance", align: "right" },
  { key: "is_active", label: "Active" },
];

export const LOYALTY_CARD_EXPORT_COLUMNS = [
  { key: "card_number", label: "Card #" },
  { key: "customer_num", label: "Customer #" },
  { key: "points_balance", label: "Points", align: "right" },
  { key: "is_active", label: "Active" },
];

export const STOCK_RESERVATION_EXPORT_COLUMNS = [
  { key: "product_code", label: "Product code" },
  { key: "sale_id", label: "Order #" },
  { key: "quantity", label: "Qty", align: "right" },
  { key: "stock_location", label: "Location" },
  { key: "expires_at", label: "Expires" },
];

export const KRA_RESPONSE_EXPORT_COLUMNS = [
  { key: "created_at", label: "Submitted" },
  { key: "order_no", label: "Order #" },
  { key: "invoice_number", label: "Invoice #" },
  { key: "status", label: "Status" },
  { key: "error_message", label: "Error" },
];

/** Derive export columns from HrCrudPage column defs (skips computed render-only columns). */
export function exportColumnsFromHrCrud(columns) {
  return (columns ?? [])
    .filter((col) => col.key && !col.render)
    .map((col) => ({ key: col.key, label: col.label, align: col.align }));
}
