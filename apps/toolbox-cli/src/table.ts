import stringWidth from "string-width";
import kleur from "kleur";

interface Column {
  key: string;
  header: string;
  align?: "left" | "right";
}

function pad(text: string, width: number, align: "left" | "right" = "left"): string {
  const w = stringWidth(text);
  if (w >= width) return text;
  const spaces = " ".repeat(width - w);
  return align === "right" ? spaces + text : text + spaces;
}

export function renderTable(
  columns: Column[],
  rows: Record<string, string>[]
): string {
  const widths = columns.map((c) => {
    const cells = [c.header, ...rows.map((r) => r[c.key] ?? "")];
    return Math.max(...cells.map((s) => stringWidth(s)));
  });

  const line = (left: string, mid: string, right: string, fill: string) =>
    left +
    widths
      .map((w) => fill.repeat(w + 2))
      .join(mid) +
    right;

  const dim = (s: string) => kleur.gray(s);

  const top = dim(line("┌", "┬", "┐", "─"));
  const sep = dim(line("├", "┼", "┤", "─"));
  const bot = dim(line("└", "┴", "┘", "─"));

  const rowLine = (cells: string[]) =>
    dim("│ ") +
    cells
      .map((c, i) => pad(c, widths[i], columns[i].align))
      .join(dim(" │ ")) +
    dim(" │");

  const out: string[] = [top];
  out.push(rowLine(columns.map((c) => kleur.bold(c.header))));
  out.push(sep);
  for (const r of rows) {
    out.push(rowLine(columns.map((c) => r[c.key] ?? "")));
  }
  out.push(bot);
  return out.join("\n");
}
