export function rowsToCsv(rows = []) {
  if (!rows.length) return "";
  const matrix = Array.isArray(rows[0]);
  const headers = Object.keys(rows[0]);
  const cell = (value) => {
    const text = value !== null && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
    const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return matrix ? rows.map(row => row.map(cell).join(",")).join("\n")
    : [headers.join(","), ...rows.map((row) => headers.map((key) => cell(row[key])).join(","))].join("\n");
}
