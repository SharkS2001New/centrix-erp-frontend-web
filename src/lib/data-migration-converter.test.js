import { describe, expect, it } from "vitest";
import {
  autoMapColumns,
  convertMigrationRows,
  parseMigrationDelimitedText,
  serializeImportCsv,
} from "@/lib/data-migration-converter";
import { DATA_MIGRATION_FORMATS } from "@/lib/data-migration-formats";

describe("data migration converter", () => {
  it("parses tab-delimited clipboard data and quoted values", () => {
    expect(
      parseMigrationDelimitedText(
        'Item Name\tCategory\tUnit\tSelling Price\n"Maize\tflour"\tGrocery\tBag\t120',
      ),
    ).toEqual([
      {
        "Item Name": "Maize\tflour",
        Category: "Grocery",
        Unit: "Bag",
        "Selling Price": "120",
      },
    ]);
  });

  it("parses semicolon-delimited CSV exports", () => {
    expect(parseMigrationDelimitedText("Name;Unit;Price\nTea;Pack;1.250,50")).toEqual([
      { Name: "Tea", Unit: "Pack", Price: "1.250,50" },
    ]);
  });

  it("maps product headers, normalizes prices, and rejects incomplete rows", () => {
    const format = DATA_MIGRATION_FORMATS.retail_products;
    const headers = ["Name", "Category", "Subcategory", "Unit of Measure", "Retail Price"];
    const mapping = autoMapColumns(headers, format.columns);

    expect(mapping).toMatchObject({
      product_name: "Name",
      category_name: "Category",
      subcategory_name: "Subcategory",
      measure_name: "Unit of Measure",
      unit_price: "Retail Price",
    });

    const rows = convertMigrationRows(
      [
        {
          Name: "Rice",
          Category: "Grains",
          Subcategory: "Rice",
          "Unit of Measure": "Bag",
          "Retail Price": "KES 1,250.50",
        },
        { Name: "Uncategorized item" },
      ],
      "retail_products",
      mapping,
    );
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].values.unit_price).toBe("1250.50");
    expect(rows[1].errors).toContain("Subcategory or Subcategory ID required");
    expect(rows[1].errors).toContain("Unit or Unit of measure or Unit ID required");

    const invalidPrice = convertMigrationRows(
      [{
        Name: "Rice",
        Subcategory: "Rice",
        "Unit of Measure": "Bag",
        "Retail Price": "not a price",
      }],
      "retail_products",
      mapping,
    );
    expect(invalidPrice[0].errors).toContain("Unit price must be numeric");
  });

  it("does not automatically map IDs from another system", () => {
    const mapping = autoMapColumns(
      ["Subcategory ID", "Unit ID", "Category", "Unit"],
      DATA_MIGRATION_FORMATS.retail_products.columns,
    );

    expect(mapping).not.toHaveProperty("subcategory_id");
    expect(mapping).not.toHaveProperty("unit_id");
    expect(mapping).toMatchObject({
      category_name: "Category",
      measure_name: "Unit",
    });
  });

  it("preserves customer numbers and maps customer contact details", () => {
    const format = DATA_MIGRATION_FORMATS.customers;
    const headers = ["Client name", "Customer number", "Mobile", "Email address", "Credit limit"];
    const mapping = autoMapColumns(headers, format.columns);
    const [row] = convertMigrationRows(
      [{
        "Client name": "North Shop",
        "Customer number": "42",
        Mobile: "0712345678",
        "Email address": "shop@example.com",
        "Credit limit": "KES 3,500",
      }],
      "customers",
      mapping,
    );

    expect(row.errors).toEqual([]);
    expect(row.values).toMatchObject({
      customer_name: "North Shop",
      customer_num: "42",
      customer_type: "debtor",
      phone_number: "0712345678",
      email: "shop@example.com",
      credit_limit: "3500",
    });
  });

  it("maps supplier payment terms and defaults an empty status to active", () => {
    const mapping = autoMapColumns(
      ["Vendor", "Vendor code", "Payment terms"],
      DATA_MIGRATION_FORMATS.suppliers.columns,
    );
    const [row] = convertMigrationRows(
      [{ Vendor: "Supply Co.", "Vendor code": "SUP-1", "Payment terms": "Net 30" }],
      "suppliers",
      mapping,
    );

    expect(row.errors).toEqual([]);
    expect(row.values).toMatchObject({
      supplier_name: "Supply Co.",
      supplier_code: "SUP-1",
      terms_of_payment: "Net 30",
      is_active: "true",
    });
  });

  it("converts unit display names into the required measure name and defaults", () => {
    const mapping = autoMapColumns(["Unit name"], DATA_MIGRATION_FORMATS.uoms.columns);
    const [row] = convertMigrationRows([{ "Unit name": "Plate" }], "uoms", mapping);

    expect(row.errors).toEqual([]);
    expect(row.values).toMatchObject({
      measure_name: "Plate",
      full_name: "Plate",
      conversion_factor: "1",
      uom_type: "piece",
    });
  });

  it("validates category relationships and serializes escaped CSV fields", () => {
    const categoryMapping = autoMapColumns(
      ["Category"],
      DATA_MIGRATION_FORMATS.categories.columns,
    );
    const [category] = convertMigrationRows(
      [{ Category: "Beverages" }],
      "categories",
      categoryMapping,
    );
    expect(category.errors).toEqual([]);

    const [subcategory] = convertMigrationRows(
      [{ Subcategory: "Soft drinks" }],
      "subcategories",
      autoMapColumns(["Subcategory"], DATA_MIGRATION_FORMATS.subcategories.columns),
    );
    expect(subcategory.errors).toContain("Category name or Category ID required");

    expect(
      serializeImportCsv(
        [{ product_name: 'Rice, "premium"' }],
        [{ key: "product_name" }],
      ),
    ).toBe('"product_name"\r\n"Rice, ""premium"""');
  });
});
