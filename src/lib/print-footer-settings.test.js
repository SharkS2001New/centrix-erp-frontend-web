import { describe, expect, it } from "vitest";
import { serializeFooterLines } from "@/lib/footer-line-format";
import {
  footerEditorValueFromApi,
  footerStorageValueFromForm,
  printFooterFormFromGeneral,
  printFooterPayloadFromForm,
  receiptFooterEditorValueFromApi,
} from "@/lib/print-footer-settings";
import {
  DEFAULT_RECEIPT_BODY_FOOTER_LINES,
} from "@/lib/sales-document-footer";

describe("print footer settings round-trip", () => {
  it("prefills receipt footer editor with all default lines", () => {
    const editorValue = receiptFooterEditorValueFromApi("");
    const parsed = JSON.parse(editorValue);
    expect(parsed).toHaveLength(DEFAULT_RECEIPT_BODY_FOOTER_LINES.length);
    expect(parsed[0].text).toBe("You were served by: {username}");
    expect(parsed[1].text).toBe("Thankyou For Shopping With Us");
  });

  it("upgrades legacy single-line receipt footer to the full template", () => {
    const editorValue = receiptFooterEditorValueFromApi("You were served by: {username}");
    const parsed = JSON.parse(editorValue);
    expect(parsed.length).toBeGreaterThan(1);
    expect(parsed.map((line) => line.text)).toEqual(DEFAULT_RECEIPT_BODY_FOOTER_LINES);
  });

  it("loads receipt footer defaults from general settings when unset", () => {
    const form = printFooterFormFromGeneral({});
    expect(form.print_footer_receipt).toContain("Thankyou For Shopping With Us");
    expect(form.print_footer_receipt.trim().startsWith("[")).toBe(true);
  });

  it("persists receipt footer alignment through save payload and reload", () => {
    const editorValue = serializeFooterLines(
      [
        {
          text: "You were served by: {username}",
          align: "left",
          bold: false,
          italic: false,
          size: "md",
          dividerAfter: false,
        },
        {
          text: "Please Confirm Your Goods",
          align: "center",
          bold: true,
          italic: false,
          size: "md",
          dividerAfter: true,
        },
      ],
      { forEditor: true },
    );

    const payload = printFooterPayloadFromForm({ print_footer_receipt: editorValue });
    expect(payload.print_footer_receipt).toContain('"align":"left"');
    expect(payload.print_footer_receipt).toContain('"dividerAfter":true');

    const reloadedForm = printFooterFormFromGeneral({
      print_footer_receipt: payload.print_footer_receipt,
    });
    expect(reloadedForm.print_footer_receipt).toContain('"align":"left"');
    expect(reloadedForm.print_footer_receipt).toContain('"dividerAfter":true');
  });

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
