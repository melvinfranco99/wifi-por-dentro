/* ============================================================
   Wifi por dentro · lógica común
   - Tema claro/oscuro, índice de la página
   - El MISMO modelo que mapa_aps.py y calculadora_velocidad.py
   - Gráficas de líneas y de barras (SVG) con tooltip, leyenda y tabla
   ============================================================ */

/* ---------- tema ---------- */
(function () {
  let guardado = null;
  try { guardado = localStorage.getItem("tema"); } catch (e) { /* sin almacenamiento */ }
  if (guardado) document.documentElement.setAttribute("data-theme", guardado);
})();

document.addEventListener("DOMContentLoaded", () => {
  const boton = document.getElementById("theme-toggle");
  if (boton) {
    boton.addEventListener("click", () => {
      const oscuroAhora = getComputedStyle(document.documentElement).colorScheme.includes("dark");
      const nuevo = oscuroAhora ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", nuevo);
      try { localStorage.setItem("tema", nuevo); } catch (e) { /* nada */ }
      redibujarTodo();
    });
  }
  // índice lateral a partir de los <h2 id>
  const toc = document.querySelector(".toc ol");
  if (toc) {
    document.querySelectorAll("main h2[id]").forEach((h) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#" + h.id;
      a.textContent = h.textContent;
      li.appendChild(a);
      toc.appendChild(li);
    });
  }
});

/* ---------- modelo (igual que los .py del laboratorio) ---------- */
const MODELO = {
  PERDIDA_1M: 40,
  EXPONENTE: 3,
  PARED: 5,
  RUIDO: -95,
  CCA_PREAMBULO: -82,
  CCA_ENERGIA: -62,
  EFICIENCIA: 0.6,
  UMBRAL_ROAMING: -70,
  HISTERESIS: 5,
  ATENUACION_CANAL: { 0: 0, 1: 1, 2: 6, 3: 14, 4: 23 },
  // 802.11n, 20 MHz, 2 antenas: [SNR mínimo, nombre, Mbit/s]
  MCS: [
    [10, "MCS 8", 13], [13, "MCS 9", 26], [16, "MCS 10", 39], [19, "MCS 11", 52],
    [22, "MCS 12", 78], [26, "MCS 13", 104], [28, "MCS 14", 117], [30, "MCS 15", 130],
  ],
};

function senal(potencia, metros, exponente = MODELO.EXPONENTE, paredes = 0) {
  const d = Math.max(metros, 1);
  return potencia - (MODELO.PERDIDA_1M + 10 * exponente * Math.log10(d)) - paredes * MODELO.PARED;
}
const aMw = (dbm) => Math.pow(10, dbm / 10);
const aDbm = (mw) => 10 * Math.log10(mw);

function elegirMcs(snr) {
  let elegida = null;
  for (const [min, nombre, mbps] of MODELO.MCS) if (snr >= min) elegida = { nombre, mbps };
  return elegida;
}

function calidad(dbm) {
  if (dbm >= -60) return { t: "Excelente", c: "st-good" };
  if (dbm >= -67) return { t: "Muy buena", c: "st-good" };
  if (dbm >= -70) return { t: "Buena", c: "st-ok" };
  if (dbm >= -80) return { t: "Débil", c: "st-bad" };
  if (dbm >= -85) return { t: "Al límite", c: "st-bad" };
  return { t: "Sin cobertura", c: "st-none" };
}

// Calidad del enlace del PC en "x" conectado a "servidor" (ver mapa_aps.py)
function analizar(aps, x, servidor) {
  const s = senal(servidor.pot, Math.abs(x - servidor.pos));
  let interf = aMw(MODELO.RUIDO);
  const comparten = [];
  for (const ap of aps) {
    if (ap.nombre === servidor.nombre) continue;
    const sep = Math.abs(ap.canal - servidor.canal);
    if (sep >= 5) continue;
    const at = MODELO.ATENUACION_CANAL[sep];
    const enAp = senal(ap.pot, Math.abs(ap.pos - servidor.pos)) - at;
    const enPc = senal(ap.pot, Math.abs(ap.pos - x)) - at;
    const umbral = sep === 0 ? MODELO.CCA_PREAMBULO : MODELO.CCA_ENERGIA;
    if (Math.max(enAp, enPc) >= umbral) comparten.push(ap.nombre);
    else interf += aMw(enPc);
  }
  const sinr = s - aDbm(interf);
  const mcs = elegirMcs(sinr);
  if (!mcs) return { s, sinr, mcs: "sin enlace", phy: 0, real: 0, comparten };
  return { s, sinr, mcs: mcs.nombre, phy: mcs.mbps, real: (mcs.mbps * MODELO.EFICIENCIA) / (1 + comparten.length), comparten };
}

const ap = (nombre, pos, canal, pot, mio = true) => ({ nombre, pos, canal, pot, mio });
const ESCENARIOS = {
  A: { d: "3 APs a 20 dBm, canales 1-6-11 (bien hecho)", aps: [ap("AP1", 0, 1, 20), ap("AP2", 30, 6, 20), ap("AP3", 60, 11, 20)] },
  B: { d: "3 APs a 20 dBm, todos en el canal 1", aps: [ap("AP1", 0, 1, 20), ap("AP2", 30, 1, 20), ap("AP3", 60, 1, 20)] },
  C: { d: "3 APs a 20 dBm, canales 1-3-6 (solapados)", aps: [ap("AP1", 0, 1, 20), ap("AP2", 30, 3, 20), ap("AP3", 60, 6, 20)] },
  D: { d: "3 APs a 10 dBm, canales 1-6-11", aps: [ap("AP1", 0, 1, 10), ap("AP2", 30, 6, 10), ap("AP3", 60, 11, 10)] },
  E: { d: "5 APs a 5 dBm cada 15 m (celdas pequeñas)", aps: [ap("AP1", 0, 1, 5), ap("AP2", 15, 6, 5), ap("AP3", 30, 11, 5), ap("AP4", 45, 1, 5), ap("AP5", 60, 6, 5)] },
  F: { d: "5 APs a 20 dBm cada 15 m", aps: [ap("AP1", 0, 1, 20), ap("AP2", 15, 6, 20), ap("AP3", 30, 11, 20), ap("AP4", 45, 1, 20), ap("AP5", 60, 6, 20)] },
  G: { d: "1 solo AP a 20 dBm en el centro", aps: [ap("AP2", 30, 6, 20)] },
  H: { d: "Escenario A + router del vecino en canal 3", aps: [ap("AP1", 0, 1, 20), ap("AP2", 30, 6, 20), ap("AP3", 60, 11, 20), ap("Vecino", 15, 3, 20, false)] },
  I: { d: "2 APs muy separados (0 y 60 m)", aps: [ap("AP1", 0, 1, 20), ap("AP3", 60, 11, 20)] },
};

// Recorre el pasillo y devuelve, metro a metro, el roaming ideal y el pegajoso
function paseo(aps, paso = 1) {
  const mios = aps.filter((a) => a.mio);
  const filas = [];
  let pegado = null;
  const porAp = {};
  for (let x = 0; x <= 60; x += paso) {
    const sen = {};
    mios.forEach((a) => (sen[a.nombre] = senal(a.pot, Math.abs(x - a.pos))));
    const mejor = mios.reduce((m, a) => (sen[a.nombre] > sen[m.nombre] ? a : m));
    const ideal = analizar(aps, x, mejor);
    (porAp[mejor.nombre] = porAp[mejor.nombre] || []).push(ideal.real);
    if (!pegado) pegado = mejor;
    else if (sen[pegado.nombre] < MODELO.UMBRAL_ROAMING && sen[mejor.nombre] >= sen[pegado.nombre] + MODELO.HISTERESIS) pegado = mejor;
    const peg = analizar(aps, x, pegado);
    filas.push({ x, sen, mejor: mejor.nombre, ideal, pegado: pegado.nombre, peg });
  }
  const medias = Object.values(porAp).map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  const capacidad = medias.reduce((a, b) => a + b, 0);
  const todas = [].concat(...Object.values(porAp));
  const media = todas.reduce((a, b) => a + b, 0) / todas.length;
  return { filas, capacidad, media };
}

/* ---------- utilidades de dibujo ---------- */
const NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, padre) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (padre) padre.appendChild(e);
  return e;
}
function htmlEl(tag, attrs = {}, padre, texto) {
  const e = document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (texto !== undefined) e.textContent = texto;
  if (padre) padre.appendChild(e);
  return e;
}
function svgText(padre, x, y, texto, attrs = {}) {
  const t = svgEl("text", Object.assign({ x, y }, attrs), padre);
  t.textContent = texto;
  return t;
}
const fmt1 = (v) => (Math.round(v * 10) / 10).toLocaleString("es-ES");
const fmt0 = (v) => Math.round(v).toLocaleString("es-ES");

function ticksLimpios(min, max, n = 5) {
  const rango = max - min;
  const bruto = rango / n;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => rango / p <= n) || mag * 10;
  const t = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) t.push(Math.round(v * 1000) / 1000);
  return t;
}

// Barra con la punta redondeada (4 px) y la base recta
function barraPath(x, y, w, h, r = 4) {
  if (h <= 0) return "";
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/* ---------- tooltip compartido ---------- */
let TT = null;
function tooltip() {
  if (!TT) { TT = htmlEl("div", { class: "tooltip", role: "status" }, document.body); }
  return TT;
}
function mostrarTooltip(ev, cabecera, filas) {
  const t = tooltip();
  t.replaceChildren();
  htmlEl("div", { class: "tt-h" }, t, cabecera);
  filas.forEach((f) => {
    const r = htmlEl("div", { class: "tt-r" }, t);
    const i = htmlEl("i", {}, r);
    i.style.background = f.color || "transparent";
    htmlEl("b", {}, r, f.valor);
    htmlEl("span", {}, r, f.nombre);
  });
  t.style.display = "block";
  const ancho = t.offsetWidth, alto = t.offsetHeight;
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + ancho > window.innerWidth - 8) x = ev.clientX - ancho - 14;
  if (y + alto > window.innerHeight - 8) y = ev.clientY - alto - 14;
  t.style.left = Math.max(8, x) + "px";
  t.style.top = Math.max(8, y) + "px";
}
function ocultarTooltip() { if (TT) TT.style.display = "none"; }

/* ---------- registro para redibujar (tema / tamaño) ---------- */
const GRAFICAS = [];
function registrar(fn) { GRAFICAS.push(fn); fn(); }
function redibujarTodo() { GRAFICAS.forEach((fn) => fn()); }
let _rt;
window.addEventListener("resize", () => { clearTimeout(_rt); _rt = setTimeout(redibujarTodo, 120); });

function leyenda(contenedor, series, forma) {
  if (series.length < 2) return;
  const l = htmlEl("div", { class: "legend" }, contenedor);
  series.forEach((s) => {
    const sp = htmlEl("span", {}, l);
    const i = htmlEl("i", { class: forma === "rect" ? "k-rect" : "k-line" }, sp);
    i.style.background = s.color;
    sp.appendChild(document.createTextNode(s.name));
  });
}

function tablaDatos(contenedor, cabeceras, filas) {
  const d = htmlEl("details", { class: "data" }, contenedor);
  htmlEl("summary", {}, d, "Ver los datos en tabla");
  const w = htmlEl("div", { class: "table-wrap" }, d);
  const t = htmlEl("table", {}, w);
  const tr = htmlEl("tr", {}, t);
  cabeceras.forEach((c, i) => htmlEl("th", i ? { class: "n" } : {}, tr, c));
  filas.forEach((f) => {
    const r = htmlEl("tr", {}, t);
    f.forEach((c, i) => htmlEl("td", i ? { class: "n" } : {}, r, c));
  });
}

const W0 = (cont) => Math.max(300, cont.clientWidth);

/* ---------- gráfica de líneas ----------
   opts: series [{name, color, data:[[x,y]...]}], x {min,max,label,fmt}, y {min,max,label,fmt,unit},
         refs [{y,label}], bands [{y0,y1,color}], vline {x,label}, step, height, tabla {cab, fmt} */
function graficaLineas(cont, opts) {
  cont.replaceChildren();
  leyenda(cont, opts.series, "line");
  const W = Math.max(300, cont.clientWidth);
  const H = opts.height || 300;
  const conEtiquetas = opts.series.length > 1 && opts.series.length <= 4 && !opts.sinEtiquetas && W0(cont) >= 520;
  const m = { t: 12, r: conEtiquetas ? 12 + 6.6 * Math.max(...opts.series.map((s) => s.name.length)) : 16, b: 40, l: 46 };
  const svg = svgEl("svg", { class: "chart-svg", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" }, cont);
  const X = (v) => m.l + ((v - opts.x.min) / (opts.x.max - opts.x.min)) * (W - m.l - m.r);
  const Y = (v) => m.t + (1 - (v - opts.y.min) / (opts.y.max - opts.y.min)) * (H - m.t - m.b);
  const fx = opts.x.fmt || fmt0, fy = opts.y.fmt || fmt0;

  (opts.bands || []).forEach((b) => {
    const y0 = Y(Math.min(opts.y.max, b.y1)), y1 = Y(Math.max(opts.y.min, b.y0));
    svgEl("rect", { x: m.l, y: y0, width: W - m.l - m.r, height: Math.max(0, y1 - y0), class: "band", style: `fill:${b.color}` }, svg);
  });
  ticksLimpios(opts.y.min, opts.y.max, H < 260 ? 4 : 5).forEach((v) => {
    svgEl("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: "grid" }, svg);
    svgText(svg, m.l - 6, Y(v) + 4, fy(v), { "text-anchor": "end" });
  });
  ticksLimpios(opts.x.min, opts.x.max, W < 480 ? 4 : 7).forEach((v) => {
    svgText(svg, X(v), H - m.b + 16, fx(v), { "text-anchor": "middle" });
  });
  svgEl("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: "axis" }, svg);
  svgText(svg, (m.l + W - m.r) / 2, H - 6, opts.x.label, { "text-anchor": "middle" });
  svgText(svg, 4, m.t - 2 < 10 ? 10 : m.t - 2, opts.y.label, {});

  (opts.refs || []).forEach((r) => {
    if (r.y < opts.y.min || r.y > opts.y.max) return;
    svgEl("line", { x1: m.l, x2: W - m.r, y1: Y(r.y), y2: Y(r.y), class: "ref" }, svg);
    svgText(svg, m.l + 6, Y(r.y) - 5, r.label, { class: "lbl" });
  });

  opts.series.forEach((s) => {
    let d = "";
    s.data.forEach(([x, y], i) => {
      const yy = Y(Math.max(opts.y.min, Math.min(opts.y.max, y)));
      if (i === 0) d += `M${X(x)},${yy}`;
      else if (opts.step) d += `H${X(x)}V${yy}`;
      else d += `L${X(x)},${yy}`;
    });
    svgEl("path", { d, class: "line", style: `stroke:${s.color}` }, svg);
  });

  // etiquetas directas al final de cada línea (solo si no se pisan)
  if (conEtiquetas) {
    const fin = opts.series.map((s) => ({ s, y: Y(Math.max(opts.y.min, Math.min(opts.y.max, s.data[s.data.length - 1][1]))) }));
    const orden = [...fin].sort((a, b) => a.y - b.y);
    const separadas = orden.every((p, i) => i === 0 || p.y - orden[i - 1].y >= 14);
    if (separadas) fin.forEach((p) => svgText(svg, W - m.r + 6, p.y + 4, p.s.name, { class: "lbl" }));
  }

  if (opts.vline) {
    const vx = X(opts.vline.x);
    svgEl("line", { x1: vx, x2: vx, y1: m.t, y2: H - m.b, class: "cross", "stroke-width": 1.5 }, svg);
    opts.series.forEach((s) => {
      const p = s.data.reduce((a, b) => (Math.abs(b[0] - opts.vline.x) < Math.abs(a[0] - opts.vline.x) ? b : a));
      svgEl("circle", { cx: X(p[0]), cy: Y(Math.max(opts.y.min, Math.min(opts.y.max, p[1]))), r: 5, style: `fill:${s.color}`, class: "dot" }, svg);
    });
    if (opts.vline.label) svgText(svg, Math.min(vx + 6, W - m.r - 60), m.t + 12, opts.vline.label, { class: "lbl-strong" });
  }

  // capa de hover: la cruz busca la X más cercana
  const capa = svgEl("g", {}, svg);
  const cruz = svgEl("line", { y1: m.t, y2: H - m.b, class: "cross", visibility: "hidden" }, capa);
  const puntos = opts.series.map((s) => svgEl("circle", { r: 4.5, style: `fill:${s.color}`, class: "dot", visibility: "hidden" }, capa));
  const xs = opts.series[0].data.map((p) => p[0]);
  const hit = svgEl("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: "transparent", tabindex: 0 }, svg);
  const mover = (ev) => {
    const r = svg.getBoundingClientRect();
    const px = ((ev.clientX - r.left) / r.width) * W;
    const vx = opts.x.min + ((px - m.l) / (W - m.l - m.r)) * (opts.x.max - opts.x.min);
    let i = 0;
    xs.forEach((x, k) => { if (Math.abs(x - vx) < Math.abs(xs[i] - vx)) i = k; });
    cruz.setAttribute("x1", X(xs[i])); cruz.setAttribute("x2", X(xs[i])); cruz.setAttribute("visibility", "visible");
    const filas = opts.series.map((s, k) => {
      const y = s.data[i][1];
      puntos[k].setAttribute("cx", X(xs[i]));
      puntos[k].setAttribute("cy", Y(Math.max(opts.y.min, Math.min(opts.y.max, y))));
      puntos[k].setAttribute("visibility", "visible");
      return { color: s.color, nombre: s.name, valor: (opts.y.tt || fy)(y, i, k) };
    });
    mostrarTooltip(ev, (opts.x.tt || ((v) => fx(v) + " " + (opts.x.unit || "")))(xs[i], i), filas);
  };
  hit.addEventListener("pointermove", mover);
  hit.addEventListener("pointerdown", mover);
  hit.addEventListener("pointerleave", () => { ocultarTooltip(); cruz.setAttribute("visibility", "hidden"); puntos.forEach((p) => p.setAttribute("visibility", "hidden")); });

  if (opts.tabla !== false) {
    const cab = [opts.x.label].concat(opts.series.map((s) => s.name));
    const paso = Math.max(1, Math.ceil(xs.length / 40));
    const filas = xs.filter((_, i) => i % paso === 0).map((x, j) => [fx(x)].concat(opts.series.map((s) => fy(s.data[j * paso][1]))));
    tablaDatos(cont, cab, filas);
  }
}

/* ---------- gráfica de barras (columnas agrupadas) ----------
   opts: categorias [..], series [{name,color,values}], y {max,label,fmt}, etiquetas (bool), height, resaltar (índice) */
function graficaBarras(cont, opts) {
  cont.replaceChildren();
  leyenda(cont, opts.series, "rect");
  const W = Math.max(300, cont.clientWidth);
  const H = opts.height || 280;
  const m = { t: 22, r: 10, b: opts.rotar ? 64 : 40, l: 46 };
  const svg = svgEl("svg", { class: "chart-svg", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.aria || "" }, cont);
  const maxY = opts.y.max || Math.max(...opts.series.flatMap((s) => s.values)) * 1.12;
  const Y = (v) => m.t + (1 - v / maxY) * (H - m.t - m.b);
  const fy = opts.y.fmt || fmt0;
  ticksLimpios(0, maxY, 4).forEach((v) => {
    svgEl("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: "grid" }, svg);
    svgText(svg, m.l - 6, Y(v) + 4, fy(v), { "text-anchor": "end" });
  });
  svgText(svg, 4, 12, opts.y.label, {});
  const n = opts.categorias.length, k = opts.series.length;
  const banda = (W - m.l - m.r) / n;
  const bw = Math.min(24, (banda * 0.7 - (k - 1) * 2) / k);
  const grupo = k * bw + (k - 1) * 2;
  const barras = [];
  opts.categorias.forEach((c, i) => {
    const x0 = m.l + i * banda + (banda - grupo) / 2;
    opts.series.forEach((s, j) => {
      const v = s.values[i];
      const x = x0 + j * (bw + 2);
      const p = svgEl("path", { d: barraPath(x, Y(v), bw, Y(0) - Y(v)), style: `fill:${s.color}`, class: "bar" }, svg);
      if (opts.resaltar !== undefined && opts.resaltar !== i) p.classList.add("dim");
      barras.push(p);
      if (opts.etiquetas && k === 1) svgText(svg, x + bw / 2, Y(v) - 6, fy(v), { "text-anchor": "middle", class: "lbl" });
      // zona de hover más grande que la barra
      const hit = svgEl("rect", { x: x - 1, y: m.t, width: bw + 2, height: H - m.t - m.b, fill: "transparent" }, svg);
      const mover = (ev) => {
        p.style.opacity = 0.8;
        mostrarTooltip(ev, c, opts.series.map((ss) => ({ color: ss.color, nombre: ss.name, valor: fy(ss.values[i]) + (opts.y.unit || "") })));
      };
      hit.addEventListener("pointermove", mover);
      hit.addEventListener("pointerdown", mover);
      hit.addEventListener("pointerleave", () => { p.style.opacity = ""; ocultarTooltip(); });
    });
    const tx = m.l + i * banda + banda / 2;
    if (opts.rotar) svgText(svg, tx, H - m.b + 14, c, { "text-anchor": "end", transform: `rotate(-35 ${tx} ${H - m.b + 14})`, class: "lbl" });
    else svgText(svg, tx, H - m.b + 18, c, { "text-anchor": "middle", class: "lbl" });
  });
  svgEl("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), class: "axis" }, svg);
  if (opts.tabla !== false) {
    tablaDatos(cont, [opts.xLabel || ""].concat(opts.series.map((s) => s.name)),
      opts.categorias.map((c, i) => [c].concat(opts.series.map((s) => fy(s.values[i])))));
  }
}

/* ---------- colores de series (leídos del CSS, cambian con el tema) ---------- */
function color(n) { return `var(--s${n})`; }

/* ---------- espectro de 2,4 GHz: cada red es una "montaña" de 22 MHz ----------
   redes: [{nombre, canal, senal, color}] */
const freqDe = (canal) => 2407 + 5 * canal;
function graficaEspectro(cont, redes, opts = {}) {
  cont.replaceChildren();
  leyenda(cont, redes.map((r) => ({ name: r.nombre, color: r.color })), "rect");
  const W = Math.max(300, cont.clientWidth);
  const H = opts.height || 260;
  const m = { t: 14, r: 12, b: 44, l: 46 };
  const svg = svgEl("svg", { class: "chart-svg", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Espectro de la banda de 2,4 GHz" }, cont);
  const fMin = 2398, fMax = 2486, yMin = -100, yMax = -20;
  const X = (f) => m.l + ((f - fMin) / (fMax - fMin)) * (W - m.l - m.r);
  const Y = (v) => m.t + (1 - (v - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  [-90, -80, -70, -60, -50, -40, -30].forEach((v) => {
    svgEl("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: "grid" }, svg);
    svgText(svg, m.l - 6, Y(v) + 4, v, { "text-anchor": "end" });
  });
  svgText(svg, 4, 11, "dBm", {});
  for (let c = 1; c <= 13; c++) {
    const limpio = c === 1 || c === 6 || c === 11;
    if (W < 480 && !limpio && c % 2 === 0) continue;
    svgText(svg, X(freqDe(c)), H - m.b + 16, c, { "text-anchor": "middle", class: limpio ? "lbl-strong" : "" });
  }
  svgText(svg, (m.l + W - m.r) / 2, H - 6, "canal (en negrita, los que no se pisan: 1, 6 y 11)", { "text-anchor": "middle" });
  svgEl("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: "axis" }, svg);
  const ordenadas = [...redes].sort((a, b) => a.senal - b.senal); // las fuertes encima
  ordenadas.forEach((r) => {
    const f = freqDe(r.canal);
    const d = `M${X(f - 11)},${Y(yMin)}L${X(f - 8)},${Y(r.senal)}L${X(f + 8)},${Y(r.senal)}L${X(f + 11)},${Y(yMin)}Z`;
    svgEl("path", { d, style: `fill:${r.color};fill-opacity:0.12;stroke:${r.color};stroke-width:2;stroke-linejoin:round` }, svg);
    const hit = svgEl("path", { d, fill: "transparent" }, svg);
    const mover = (ev) => mostrarTooltip(ev, `Canal ${r.canal} · ${freqDe(r.canal)} MHz`, [{ color: r.color, nombre: r.nombre, valor: fmt0(r.senal) + " dBm" }]);
    hit.addEventListener("pointermove", mover);
    hit.addEventListener("pointerdown", mover);
    hit.addEventListener("pointerleave", ocultarTooltip);
  });
  if (redes.length <= 4) {
    const pos = redes.map((r) => ({ r, x: X(freqDe(r.canal)), y: Y(r.senal) - 7 }));
    pos.forEach((p, i) => {
      const choca = pos.some((q, j) => j < i && Math.abs(q.x - p.x) < 70 && Math.abs(q.y - p.y) < 14);
      svgText(svg, p.x, choca ? p.y - 14 : p.y, p.r.nombre, { "text-anchor": "middle", class: "lbl" });
    });
  }
  tablaDatos(cont, ["Red", "Canal", "Frecuencia (MHz)", "Señal (dBm)"], redes.map((r) => [r.nombre, r.canal, freqDe(r.canal), fmt0(r.senal)]));
}

// Interferencia ajena en un canal (igual que analizador_wifi.py)
function interferenciaEn(canal, redes) {
  let total = 0;
  const detalle = [];
  redes.forEach((r) => {
    const sep = Math.abs(r.canal - canal);
    if (r.mia || sep >= 5) return;
    const ef = r.senal - MODELO.ATENUACION_CANAL[sep];
    total += aMw(ef);
    detalle.push({ nombre: r.nombre, tipo: sep === 0 ? "mismo canal" : `solapa a ${sep}`, ef });
  });
  return { dbm: total ? aDbm(total) : null, detalle };
}
