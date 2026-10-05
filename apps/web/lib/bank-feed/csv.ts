import type { Direction, Institution } from "./types";

export interface ParsedBankRow {
  postedOn: string;
  amountCents: number;
  direction: Direction;
  description: string;
}
export type ParseResult =
  | { success: true; institution: Institution; rows: ParsedBankRow[]; ignoredLineCount: number }
  | { success: false; error: "too_large" | "too_many_rows" | "no_header" | "no_rows" };

function splitLine(line: string): string[] {
  const fields: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      fields.push(value.trim()); value = "";
    } else value += char;
  }
  fields.push(value.trim());
  return fields;
}

function records(text: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { current += '"'; current += '"'; i++; } else {
        quoted = !quoted; current += char;
      }
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      result.push(current); current = "";
    } else current += char;
  }
  if (current) result.push(current);
  return result;
}

function dateValue(value: string): string | null {
  const text = value.trim();
  let year: number; let month: number; let day: number;
  let parts = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (parts) { year = Number(parts[1]); month = Number(parts[2]); day = Number(parts[3]); }
  else {
    parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (parts) { month = Number(parts[1]); day = Number(parts[2]); year = Number(parts[3]); }
    else {
      parts = /^([A-Za-z]{3})-(\d{1,2})-(\d{4})$/.exec(text);
      const monthIndex = parts ? ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
        .indexOf(parts[1].toUpperCase()) : -1;
      if (!parts || monthIndex < 0) return null;
      month = monthIndex + 1; day = Number(parts[2]); year = Number(parts[3]);
    }
  }
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() + 1 !== month || candidate.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function cents(value: string): number | null {
  const cleaned = value.trim().replace(/,/g, "").replace(/^\((.*)\)$/, "-$1")
    .replace(/^\$([+-])/, "$1$").replace(/^([+-]?)\$/, "$1");
  const parts = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!parts) return null;
  const result = Number(parts[2]) * 100 + Number((parts[3] || "").padEnd(2, "0"));
  return Number.isSafeInteger(result) ? (parts[1] === "-" ? -result : result) : null;
}

export function parseBankCsv(text: string): ParseResult {
  if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) return { success: false, error: "too_large" };
  const lines = records(text.replace(/^\uFEFF/, ""));
  const aliases = { date: ["run date", "posting date", "transaction date", "date", "posted date"],
    description: ["action", "description", "payee", "memo", "name"], amount: ["amount", "amount ($)"] };
  let header = -1;
  let columns: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cells = splitLine(lines[i]).map((cell) => cell.toLowerCase().trim());
    if (cells.some((cell) => aliases.date.includes(cell)) && cells.some((cell) => aliases.description.includes(cell))
      && (cells.some((cell) => aliases.amount.includes(cell)) || (cells.includes("debit") && cells.includes("credit")))) {
      header = i; columns = cells; break;
    }
  }
  if (header < 0) return { success: false, error: "no_header" };
  const find = (list: string[]) => list.map((name) => columns.indexOf(name)).find((index) => index >= 0) ?? -1;
  const dateIndex = find(aliases.date);
  const actionIndex = columns.indexOf("action");
  const descriptionIndex = find(["description", "payee", "memo", "name"]);
  const amountIndex = find(aliases.amount);
  const debitIndex = columns.indexOf("debit");
  const creditIndex = columns.indexOf("credit");
  const indicatorIndex = columns.indexOf("credit debit indicator");
  const institution: Institution = columns.includes("run date") && actionIndex >= 0 ? "fidelity"
    : indicatorIndex >= 0 ? "navy_federal" : "other";
  const rows: ParsedBankRow[] = [];
  let ignoredLineCount = header;
  for (const line of lines.slice(header + 1)) {
    const cells = splitLine(line);
    const postedOn = dateValue(cells[dateIndex] || "");
    let amount: number | null = null;
    if (amountIndex >= 0) {
      amount = cents(cells[amountIndex] || "");
      if (amount !== null && indicatorIndex >= 0) {
        const indicator = (cells[indicatorIndex] || "").toLowerCase();
        if (indicator === "debit") amount = -Math.abs(amount);
        else if (indicator === "credit") amount = Math.abs(amount);
        else amount = null;
      }
    } else {
      const debit = Math.abs(cents(cells[debitIndex] || "") || 0);
      const credit = Math.abs(cents(cells[creditIndex] || "") || 0);
      amount = debit && credit ? null : credit || -debit;
    }
    if (!postedOn || !amount) { ignoredLineCount++; continue; }
    const action = actionIndex >= 0 ? (cells[actionIndex] || "").trim() : "";
    const extra = descriptionIndex >= 0 ? (cells[descriptionIndex] || "").trim() : "";
    const description = (action && extra && !action.includes(extra) ? `${action} ${extra}` : action || extra).slice(0, 300).trim();
    if (!description) { ignoredLineCount++; continue; }
    rows.push({ postedOn, amountCents: Math.abs(amount), direction: amount > 0 ? "in" : "out", description });
    if (rows.length > 5000) return { success: false, error: "too_many_rows" };
  }
  if (!rows.length) return { success: false, error: "no_rows" };
  return { success: true, institution, rows, ignoredLineCount };
}
