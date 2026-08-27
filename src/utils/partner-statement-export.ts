import type { PartnerStatementRow } from "../domain/partner-settlement";

const columns = [
  "Date",
  "Entry type",
  "Reference",
  "Description",
  "Status",
  "Credit ETB",
  "Debit ETB",
  "Balance ETB",
] as const;

function rowsForExport(rows: PartnerStatementRow[]) {
  return rows.map((row) => [
    new Date(row.occurredAt).toISOString(),
    row.entryType.replaceAll("_", " "),
    row.reference,
    row.description,
    row.status.replaceAll("_", " "),
    row.creditEtb.toFixed(2),
    row.debitEtb.toFixed(2),
    row.balanceEtb.toFixed(2),
  ]);
}

function download(content: BlobPart, mimeType: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeSpreadsheetText(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string) {
  const safe = safeSpreadsheetText(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

function xmlText(value: string) {
  return safeSpreadsheetText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function exportPartnerStatementCsv(rows: PartnerStatementRow[], fileBase: string) {
  const lines = [columns, ...rowsForExport(rows)]
    .map((row) => row.map((cell) => csvCell(String(cell))).join(","));
  download(`\uFEFF${lines.join("\r\n")}`, "text/csv;charset=utf-8", `${fileBase}.csv`);
}

export function exportPartnerStatementExcel(rows: PartnerStatementRow[], fileBase: string) {
  const tableRows = [columns, ...rowsForExport(rows)]
    .map((row) => `<Row>${row.map((cell) => `<Cell><Data ss:Type="String">${xmlText(String(cell))}</Data></Cell>`).join("")}</Row>`)
    .join("");
  const workbook = `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Partner Statement"><Table>${tableRows}</Table></Worksheet>
</Workbook>`;
  download(workbook, "application/vnd.ms-excel;charset=utf-8", `${fileBase}.xls`);
}

export function printPartnerStatement() {
  window.print();
}

