export function rowsToCsv(rows = []) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const cell = (value) => {
    const text = value !== null && typeof value === "object"
      ? JSON.stringify(value)
      : String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((key) => cell(row[key])).join(","))].join("\n");
}
