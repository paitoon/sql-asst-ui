export function autoCoerceNumbers(headers, rows) {
  const numericCandidates = headers.slice(1);

  return rows.map((r) => {
    const out = { ...r };
    for (const col of numericCandidates) {
      const v = out[col];
      const num = Number(String(v).replace(/,/g, "").trim());
      if (Number.isFinite(num)) out[col] = num;
    }
    return out;
  });
}

export function extractFirstGfmTable(markdown) {
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i];
    const sep = lines[i + 1];

    if (!isPipeRow(header) || !isSeparatorRow(sep)) continue;

    const tableLines = [header, sep];
    let j = i + 2;

    while (j < lines.length && isPipeRow(lines[j]) && lines[j].trim() !== "") {
      tableLines.push(lines[j]);
      j++;
    }

    const parsed = parseGfmTableLines(tableLines);
    if (parsed.headers.length && parsed.rows.length) return parsed;
  }
  return null;
}

function isPipeRow(line) {
  const t = line.trim();
  return t.includes("|") && (t.startsWith("|") || t.endsWith("|"));
}

function isSeparatorRow(line) {
  const t = line.trim();
  if (!isPipeRow(t)) return false;
  const cells = splitPipeRow(t);
  return cells.every((c) => /^:?-{3,}:?$/.test(c.trim()));
}

function splitPipeRow(line) {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((s) => s.trim());
}

function parseGfmTableLines(tableLines) {
  const headers = splitPipeRow(tableLines[0]);
  const rows = [];

  for (let k = 2; k < tableLines.length; k++) {
    const cells = splitPipeRow(tableLines[k]);
    const row = {};
    headers.forEach((h, idx) => (row[h] = cells[idx] ?? ""));
    rows.push(row);
  }
  return { headers, rows };
}
