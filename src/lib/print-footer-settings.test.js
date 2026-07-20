import { describe, expect, it } from "vitest";
import { serializeFooterLines } from "@/lib/footer-line-format";
import {
  footerEditorValueFromApi,
  footerStorageValueFromForm,
  printFooterFormFromGeneral,
  printFooterPayloadFromForm,
} from "@/lib/print-footer-settings";

describe("print footer settings round-trip", () => {
  it("persists A4 invoice footer lines through save payload and reload", () => {
    const editorValue = serializeFooterLines(
      [
        { text: "You were served by: {username}", align: "left", bold: false, italic: false, size: "md" },
        { text: "Please Confirm Your Goods", align: "center", bold: true, italic: false, size: "md" },
        { text: "", align: "left", bold: false, italic: false, size: "md" },
        { text: "", align: "left", bold: false, italic: false, size: "md" },
      ],
      { forEditor: true },
    );

    const payload = printFooterPayloadFromForm({ print_footer_a4_invoice: editorValue });
    expect(payload.print_footer_a4_invoice).toContain("You were served by: {username}");
    expect(payload.print_footer_a4_invoice).toContain("Please Confirm Your Goods");

    const reloadedForm = printFooterFormFromGeneral({
      print_footer_a4_invoice: payload.print_footer_a4_invoice,
    });
    expect(reloadedForm.print_footer_a4_invoice).toContain("You were served by: {username}");
    expect(reloadedForm.print_footer_a4_invoice).toContain("Please Confirm Your Goods");
  });

  it("stores plain multiline invoice footer text", () => {
    const plain = "You were served by: {username}\nThank you!";
    const stored = footerStorageValueFromForm(plain);
    expect(stored).toBe(plain);
    expect(footerEditorValueFromApi(stored)).toContain("You were served by: {username}");
  });
});
