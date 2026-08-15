import { describe, it, expect } from "vitest";
import { buildEmployeeBody, employeeToForm, EMPTY_EMPLOYEE_FORM } from "@/components/hr/hr-shared";

describe("hr-shared pays_sha", () => {
  it("includes pays_sha in API body when true", () => {
    const form = { ...EMPTY_EMPLOYEE_FORM, pays_sha: true, base_salary: "1000", sha_number: "S123", housing_levy_number: "H1", nssf_number: "N1", first_name: "A", last_name: "B", phone: "0712345678" };
    const body = buildEmployeeBody(form, 10, 2, { isEdit: false });
    expect(body.pays_sha).toBe(true);
  });

  it("includes pays_sha false in API body when unchecked", () => {
    const form = { ...EMPTY_EMPLOYEE_FORM, pays_sha: false, base_salary: "1000", sha_number: "", housing_levy_number: "H1", nssf_number: "N1", first_name: "A", last_name: "B", phone: "0712345678" };
    const body = buildEmployeeBody(form, 10, 2, { isEdit: false });
    expect(body.pays_sha).toBe(false);
  });

  it("employeeToForm sets pays_sha default true when missing", () => {
    const employee = { first_name: "A", last_name: "B" };
    const form = employeeToForm(employee);
    expect(form.pays_sha).toBe(true);
  });

  it("employeeToForm preserves pays_sha when provided", () => {
    const employee = { first_name: "A", last_name: "B", pays_sha: false };
    const form = employeeToForm(employee);
    expect(form.pays_sha).toBe(false);
  });
});
