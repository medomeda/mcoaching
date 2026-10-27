/** Export CSV (séparateur « ; », BOM UTF-8 pour Excel). */

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise l'injection de formules dans les tableurs.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  return "\uFEFF" + [headers.join(";"), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(";"))].join("\n");
}
