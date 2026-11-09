export const palette = ["#2284bd", "#2a945f", "#bc6526", "#7b67bf", "#c35187", "#438d90"];
export const format = (value, digits = 0) => value == null ? "—" : Number(value).toLocaleString("ko-KR", { maximumFractionDigits: digits });

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (name.startsWith("on")) node.addEventListener(name.slice(2), value);
    else node.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const button = (label, action, props = {}) => el("button", { type: "button", onclick: action, ...props }, label);
export const hint = text => el("p", { class: "hint" }, text);
export const panel = (title, ...children) => el("section", { class: "panel" }, el("h2", {}, title), ...children);
export const actionText = (label, action) => button(label, action, { class: "text-button" });
export const externalLink = (label, href) => {
  try {
    const url = new URL(href);
    if (["http:", "https:"].includes(url.protocol)) return el("a", { href: url.href, target: "_blank", rel: "noopener noreferrer" }, label);
  } catch {
    return "—";
  }
  return "—";
};

let controlId = 0;
export function labeled(label, control) {
  control.id = `control-${++controlId}`;
  return el("div", {}, el("label", { for: control.id }, label), control);
}

export function select(options, current, callback) {
  const node = el("select", { onchange: callback }, options.map(item => {
    const [value, label] = Array.isArray(item) ? item : [item, item];
    return el("option", { value }, label);
  }));
  if (current != null) node.value = current;
  return node;
}

export function checkbox(label, checked, callback) {
  const input = el("input", { type: "checkbox", onchange: callback });
  input.checked = checked;
  return el("label", { class: "toggle" }, input, label);
}

export function choices(title, options, chosen = []) {
  const rows = options.map(item => {
    const [value, label] = Array.isArray(item) ? item : [item, item];
    const entry = checkbox(label, chosen.includes(value));
    entry.firstChild.value = value;
    return entry;
  });
  const summary = el("summary", {}, title);
  const node = el("details", { class: "choices" }, summary, el("div", {}, rows));
  const values = () => Array.from(node.querySelectorAll("input:checked"), input => input.value);
  const count = () => {
    const n = values().length;
    summary.textContent = n ? `${title} (${n})` : title;
  };
  node.addEventListener("change", count);
  count();
  return { node, values };
}

export function kpis(items) {
  return el("div", { class: "kpis" }, items.map(([label, value]) =>
    el("div", { class: "kpi" }, label, el("strong", {}, value))));
}

export function grid(headers, rows, cells, options = {}) {
  if (!rows.length) return hint("조건에 맞는 데이터가 없습니다.");
  const { pageSize = 40, caption } = options;
  const table = el("table", {}, caption && el("caption", {}, caption),
    el("thead", {}, el("tr", {}, headers.map(label => el("th", { scope: "col" }, label)))));
  const body = el("tbody");
  table.append(body);
  const scroller = el("div", { class: "scroller", tabindex: 0, role: "region", "aria-label": caption ?? "데이터 표" }, table);
  const status = el("span", { "aria-live": "polite" });
  const pager = el("div", { class: "pager" });
  let page = 0;
  const previous = button("이전", () => draw(page - 1));
  const next = button("다음", () => draw(page + 1));
  const draw = index => {
    page = index;
    const from = page * pageSize;
    const to = Math.min(from + pageSize, rows.length);
    body.replaceChildren(...rows.slice(from, to).map((row, offset) => el("tr", {}, cells(row, from + offset).map(cell => {
      const entry = cell && typeof cell === "object" && !(cell instanceof Node) ? cell : { value: cell };
      const value = entry.value;
      return el("td", { class: entry.class ?? (typeof value === "number" ? "number" : null) },
        typeof value === "number" ? format(value, 2) : value ?? "—");
    }))));
    status.textContent = `${format(from + 1)}–${format(to)} / ${format(rows.length)}`;
    previous.disabled = page === 0;
    next.disabled = to >= rows.length;
    scroller.scrollTop = 0;
  };
  draw(0);
  pager.append(previous, status, next);
  return el("div", {}, scroller, rows.length > pageSize && pager);
}

export function heatmap(rowLabels, columnLabels, valueAt, caption, digits = 0) {
  if (!rowLabels.length || !columnLabels.length) return hint("조건에 맞는 데이터가 없습니다.");
  const max = Math.max(1, ...rowLabels.flatMap(row => columnLabels.map(col => valueAt(row, col) ?? 0)));
  return grid(["", ...columnLabels], rowLabels, row => [row, ...columnLabels.map(col => {
    const value = valueAt(row, col);
    const level = value > 0 ? Math.max(1, Math.ceil(value / max * 4)) : 0;
    return { value: value == null ? "—" : format(value, digits), class: level ? `number level-${level}` : "number" };
  })], { caption });
}

export function bars(entries, caption) {
  if (!entries.length) return hint("조건에 맞는 데이터가 없습니다.");
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return el("div", { class: "bars", "aria-label": caption }, entries.flatMap(([label, value]) => [
    el("span", {}, label), el("progress", { value, max, "aria-label": label }), el("span", {}, format(value, 1)),
  ]));
}

const svgNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs, contents) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (contents != null) node.textContent = contents;
  return node;
}

export function chart(series, title, mode = "line") {
  const points = series.flatMap(line => line.points);
  if (!points.length) return hint("조건에 맞는 데이터가 없습니다.");
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(minX + 1, ...points.map(([x]) => x));
  const maxY = Math.max(1, ...points.map(([, y]) => y));
  const xPos = x => 53 + (x - minX) / (maxX - minX) * 620;
  const yPos = y => 217 - y / maxY * 181;
  const graph = svg("svg", { viewBox: "0 0 710 255", role: "img", "aria-label": title });
  graph.append(svg("title", {}, title));
  for (let i = 0; i <= 4; i++) {
    const y = maxY * i / 4;
    const x = Math.round(minX + (maxX - minX) * i / 4);
    graph.append(svg("line", { x1: 53, y1: yPos(y), x2: 673, y2: yPos(y), class: "axis" }));
    graph.append(svg("text", { x: 46, y: yPos(y) + 4, "text-anchor": "end" }, format(y, 1)));
    if (i === 0 || x !== Math.round(minX + (maxX - minX) * (i - 1) / 4)) {
      graph.append(svg("text", { x: xPos(x), y: 239, "text-anchor": "middle" }, x));
    }
  }
  const legend = el("ul", { class: "chart-legend" });
  series.forEach((line, index) => {
    const color = line.color ?? palette[index % palette.length];
    const trace = [...line.points].sort((a, b) => a[0] - b[0]);
    if (mode === "line" && trace.length > 1) graph.append(svg("polyline", {
      points: trace.map(([x, y]) => `${xPos(x)},${yPos(y)}`).join(" "),
      fill: "none", stroke: color, "stroke-width": 2,
    }));
    for (const [x, y, label] of trace) {
      const dot = svg("circle", { cx: xPos(x), cy: yPos(y), r: mode === "scatter" ? 3 : 4, fill: color });
      dot.append(svg("title", {}, `${label ?? line.label} · ${x} / ${format(y)}`));
      graph.append(dot);
    }
    const swatch = svg("svg", { viewBox: "0 0 12 12", "aria-hidden": "true" });
    swatch.append(svg("rect", { width: 12, height: 12, fill: color }));
    legend.append(el("li", {}, swatch, line.label));
  });
  return el("div", {}, el("div", { class: "chart-scroll", tabindex: 0, role: "region", "aria-label": title }, graph), legend);
}

export function csvButton(filename, headers, rows) {
  const escape = value => {
    let text = value == null ? "" : String(value);
    if (typeof value !== "number" && /^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return button("CSV 다운로드", () => {
    const csv = [headers, ...rows()].map(row => row.map(escape).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    el("a", { href: url, download: filename }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}
