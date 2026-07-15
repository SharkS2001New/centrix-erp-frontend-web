"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { HrCrudPage } from "@/components/hr/hr-crud-page";

export function HrPositionsScreen() {
  return (
    <HrCrudPage
      title="Positions"
      subtitle="Job titles and roles used when assigning employees"
      addButtonLabel="Add position"
      apiPath="/positions"
      columns={[
        { key: "position_code", label: "Code" },
        { key: "position_title", label: "Title" },
        {
          key: "is_active",
          label: "Status",
          render: (r) => (r.is_active !== false ? "Active" : "Inactive"),
        },
      ]}
      searchFilter={(r, q) =>
        `${r.position_code} ${r.position_title}`.toLowerCase().includes(q)
      }
      buildEmptyForm={(_, row) => ({
        position_code: row?.position_code ?? "",
        position_title: row?.position_title ?? "",
        description: row?.description ?? "",
        is_active: row?.is_active !== false,
      })}
      buildBody={(form, orgId) => ({
        organization_id: orgId,
        position_code: form.position_code.trim().toUpperCase(),
        position_title: form.position_title.trim(),
        description: form.description.trim() || null,
        is_active: form.is_active,
      })}
      validateForm={(form) =>
        !form.position_title?.trim() ? "Position title is required." : null
      }
      renderFormFields={(form, setForm) => (
        <>
          <Field label="Position title">
            <input
              type="text"
              value={form.position_title}
              onChange={(e) => setForm((p) => ({ ...p, position_title: e.target.value }))}
              required
              className={inputClassName()}
            />
          </Field>
          <Field label="Code">
            <input
              type="text"
              value={form.position_code}
              onChange={(e) => setForm((p) => ({ ...p, position_code: e.target.value }))}
              className={`${inputClassName()} font-mono`}
              placeholder="Auto from title if empty"
            />
          </Field>
          <Field label="Description">
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className={inputClassName()}
            />
          </Field>
        </>
      )}
    />
  );
}
