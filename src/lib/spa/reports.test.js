import { describe, expect, it } from "vitest";
import { todayISO } from "@/lib/spa/format";
import { buildSpaReport, daysAgo } from "@/lib/spa/reports";
import { createSeed } from "@/lib/spa/seed";

describe("spa reports", () => {
  const spa = createSeed();
  const from = todayISO(daysAgo(6));
  const to = todayISO();

  it("splits service and retail sales and keeps pending expenses out of profit", () => {
    const overview = buildSpaReport(spa, from, to, "overview");
    expect(overview.metrics.map((item) => item.value)).toEqual([
      "KSh 12,450",
      "KSh 11,800",
      "KSh 650",
      "KSh -32,850",
    ]);
    expect(overview.metrics[0].hint).toBe("8 tickets");
  });

  it("pays staff commission from the rate on their record", () => {
    const staff = buildSpaReport(spa, from, to, "staff");
    const mary = staff.rows.find((row) => row[0] === "Mary Wanjiku");
    expect(mary[4]).toBe("KSh 4,500");
    expect(mary[5]).toBe("15%");
    expect(mary[6]).toBe("KSh 675");
  });

  it("counts show rate from completed visits and no-shows", () => {
    const book = buildSpaReport(spa, from, to, "appointments");
    expect(book.metrics.find((item) => item.label === "On the book").value).toBe(5);
    expect(book.metrics.find((item) => item.label === "Completed").value).toBe(2);
    expect(book.metrics.find((item) => item.label === "Show rate").value).toBe("100%");
    expect(book.note).toMatch(/1 walk-in/);
  });
});
