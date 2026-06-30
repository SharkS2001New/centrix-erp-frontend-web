/** Client-side Excel read/write via ExcelJS (replaces unmaintained sheetjs/xlsx). */

/**
 * Read the first worksheet from an .xlsx file into an array of row objects.
 * @param {File} file
 * @returns {Promise<Record<string, string>[]>}
 */
export async function readExcelFile(file) {
  const ExcelJS = (await import("exceljs")).default;
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  /** @type {string[]} */
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = String(cell.value ?? "").trim().replace(/^\ufeff/, "");
  });

  /** @type {Record<string, string>[]} */
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    /** @type {Record<string, string>} */
    const obj = {};
    for (let i = 0; i < headers.length; i += 1) {
      const header = headers[i];
      if (!header) continue;
      const cell = row.getCell(i + 1);
      obj[header] = cell.value == null ? "" : String(cell.value);
    }
    rows.push(obj);
  });

  return rows;
}

/**
 * @param {string} filename
 * @param {string} sheetName
 * @param {Record<string, unknown>[]} rows
 */
export async function downloadExcelFromObjects(filename, sheetName, rows) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(headers.map((key) => row[key] ?? ""));
    }
  }

  await triggerExcelDownload(workbook, filename);
}

/**
 * @param {string} filename
 * @param {string} sheetName
 * @param {unknown[][]} rows
 */
export async function downloadExcelFromRows(filename, sheetName, rows) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  for (const row of rows) {
    sheet.addRow(row);
  }
  await triggerExcelDownload(workbook, filename);
}

/** @param {import("exceljs").Workbook} workbook */
async function triggerExcelDownload(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
