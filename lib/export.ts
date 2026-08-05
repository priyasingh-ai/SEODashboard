/**
 * CSV / PDF export.
 *
 * jsPDF is heavy, so it is imported dynamically — it only lands in the bundle if
 * someone actually clicks "Export PDF".
 */

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

/** RFC 4180: quote when the cell contains a delimiter, quote or newline. */
function escapeCell(value: string | number): string {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(","));
  return [head, ...body].join("\r\n");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick — revoking synchronously can cancel the download
  // in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCSV<T>(rows: T[], columns: ExportColumn<T>[], filename: string) {
  // The BOM makes Excel read UTF-8 instead of mangling it to Latin-1.
  const blob = new Blob(["﻿", toCSV(rows, columns)], {
    type: "text/csv;charset=utf-8;",
  });
  triggerDownload(blob, filename.endsWith(".csv") ? filename : `${filename}.csv`);
}

export interface PdfSection<T> {
  title: string;
  rows: T[];
  columns: ExportColumn<T>[];
}

export async function downloadPDF(
  filename: string,
  meta: { title: string; subtitle: string },
  // Each section is independently typed, so the array is intentionally loose here.
  sections: PdfSection<any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
) {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const doc = new JsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(meta.title, 40, 44);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(meta.subtitle, 40, 62);

  let cursorY = 84;

  for (const section of sections) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(section.title, 40, cursorY);

    autoTable(doc, {
      startY: cursorY + 10,
      head: [section.columns.map((c) => c.header)],
      body: section.rows.map((row) => section.columns.map((c) => String(c.value(row)))),
      styles: { font: "helvetica", fontSize: 8, cellPadding: 5, lineColor: 235, lineWidth: 0.5 },
      headStyles: { fillColor: [244, 244, 245], textColor: 40, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [252, 252, 253] },
      margin: { left: 40, right: 40 },
    });

    // `lastAutoTable` is attached by the plugin and isn't in jsPDF's own types.
    const last = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    cursorY = (last?.finalY ?? cursorY) + 32;

    if (cursorY > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage();
      cursorY = 48;
    }
  }

  doc.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
}

/** `the-doc-mirror-28d-2026-07-17` — safe, sortable, no spaces. */
export function exportFilename(parts: (string | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
