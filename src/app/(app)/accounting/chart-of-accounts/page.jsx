"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { HrCrudPage, HrSelectField } from "@/components/hr/hr-crud-page";
import { apiRequest } from "@/lib/api";
import {
  ACCOUNT_TYPES,
  accountTypeLabel,
  formatAccountingAmount,
} from "@/lib/accounting-shared";

export default function ChartOfAccountsPage() {
  return (
    <HrCrudPage
      title="Chart of Accounts"
      subtitle="Accounting > Chart of Accounts"
      addButtonLabel="New Account"
      drawerCreateTitle="New Chart of Account"
      apiPath="/chart-of-accounts"
      columns={[
        { key: "account_code", label: "Code" },
        { key: "account_name", label: "Account Name" },
        {
          key: "account_type",
          label: "Type",
          render: (row) => accountTypeLabel(row.account_type),
        },
        {
          key: "balance",
          label: "Balance",
          render: (row) => formatAccountingAmount(row.balance ?? 0),
        },
        {
          key: "is_active",
          label: "Status",
          render: (row) => (row.is_active !== false ? "Active" : "Inactive"),
        },
      ]}
      searchFilter={(row, q) =>
        `${row.account_code} ${row.account_name} ${row.account_type}`.toLowerCase().includes(q)
      }
      loadExtra={async () => {
        const res = await apiRequest("/chart-of-accounts", { searchParams: { per_page: 200 } });
        return { accounts: res.data ?? [] };
      }}
      buildEmptyForm={(extra, row) => ({
        account_code: row?.account_code ?? "",
        account_name: row?.account_name ?? "",
        account_type: row?.account_type ?? "asset",
        parent_id: row?.parent_id ? String(row.parent_id) : "",
        is_active: row?.is_active !== false,
      })}
      buildBody={(form, orgId) => ({
        organization_id: orgId,
        account_code: form.account_code.trim(),
        account_name: form.account_name.trim(),
        account_type: form.account_type,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
        is_active: form.is_active,
      })}
      validateForm={(form) => {
        if (!form.account_code?.trim()) return "Account code is required.";
        if (!form.account_name?.trim()) return "Account name is required.";
        if (!form.account_type) return "Account type is required.";
        return null;
      }}
      renderFormFields={(form, setForm, extra) => {
        const parentOptions = (extra?.accounts ?? [])
          .filter((a) => !extra?.editingRow || a.id !== extra.editingRow.id)
          .map((a) => ({
            value: String(a.id),
            label: `${a.account_code} — ${a.account_name}`,
          }));

        return (
          <>
            <Field label="Account Code *">
              <input
                type="text"
                value={form.account_code}
                onChange={(e) => setForm((p) => ({ ...p, account_code: e.target.value }))}
                required
                className={`${inputClassName()} font-mono`}
                placeholder="1000"
              />
            </Field>
            <Field label="Account Name *">
              <input
                type="text"
                value={form.account_name}
                onChange={(e) => setForm((p) => ({ ...p, account_name: e.target.value }))}
                required
                className={inputClassName()}
                placeholder="Cash"
              />
            </Field>
            <HrSelectField
              label="Account Type *"
              value={form.account_type}
              onChange={(value) => setForm((p) => ({ ...p, account_type: value }))}
              options={ACCOUNT_TYPES}
              searchable={false}
              required
            />
            <HrSelectField
              label="Parent Account"
              value={form.parent_id}
              onChange={(value) => setForm((p) => ({ ...p, parent_id: value }))}
              options={[{ value: "", label: "None" }, ...parentOptions]}
              searchable
              placeholder="None"
            />
            <Field label="Status">
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={form.is_active === true}
                    onChange={() => setForm((p) => ({ ...p, is_active: true }))}
                  />
                  Active
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={form.is_active === false}
                    onChange={() => setForm((p) => ({ ...p, is_active: false }))}
                  />
                  Inactive
                </label>
              </div>
            </Field>
          </>
        );
      }}
    />
  );
}
