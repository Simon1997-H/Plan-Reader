import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.worker.min.mjs";

const state = {
  pdf: null,
  page: 1,
  pageCount: 0,
  viewportScale: 1.4,
  activeTool: "rect",
  settingScale: false,
  scaleMPerPx: 0,
  scalePoints: [],
  drawing: false,
  start: null,
  preview: null,
  polyPoints: [],
  selectedShape: null,
  textLines: [],
  scheduleRules: {},
  shapes: []
};

const pdfCanvas = document.getElementById("pdfCanvas");
const markupCanvas = document.getElementById("markupCanvas");
const pdfCtx = pdfCanvas.getContext("2d");
const markCtx = markupCanvas.getContext("2d");
const form = document.getElementById("elementForm");

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  renderBoq();
});

function bindEvents() {
  document.getElementById("pdfInput").addEventListener("change", loadPdfFile);
  document.querySelectorAll(".tool").forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });
  document.getElementById("scaleTool").addEventListener("click", startScaleTool);
  document.getElementById("finishPolyBtn").addEventListener("click", finishPolygon);
  document.getElementById("undoBtn").addEventListener("click", undoPoint);
  document.getElementById("prevPage").addEventListener("click", () => goPage(-1));
  document.getElementById("nextPage").addEventListener("click", () => goPage(1));
  document.getElementById("clearBtn").addEventListener("click", clearAll);
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
  document.getElementById("printQuoteBtn").addEventListener("click", () => window.print());
  ["marketSteelRate", "marketConcreteRate", "marketFormworkRate", "profitMargin"].forEach((id) => {
    document.getElementById(id).addEventListener("input", () => {
      form.steelRate.value = document.getElementById("marketSteelRate").value;
      renderBoq();
    });
  });
  markupCanvas.addEventListener("mousedown", pointerDown);
  markupCanvas.addEventListener("mousemove", pointerMove);
  markupCanvas.addEventListener("mouseup", pointerUp);
  markupCanvas.addEventListener("touchstart", touchAsMouse, { passive: false });
  markupCanvas.addEventListener("touchmove", touchAsMouse, { passive: false });
  markupCanvas.addEventListener("touchend", touchAsMouse, { passive: false });
  form.addEventListener("input", showMissingParameters);
  form.addEventListener("submit", saveSelectedElement);
  document.getElementById("quoteDate").value = new Date().toISOString().slice(0, 10);
  form.steelRate.value = document.getElementById("marketSteelRate").value;
}

async function loadPdfFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const buffer = await file.arrayBuffer();
  state.pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  state.page = 1;
  state.pageCount = state.pdf.numPages;
  document.getElementById("dropZone").classList.add("hidden");
  document.getElementById("canvasWrap").classList.remove("hidden");
  await renderPage();
  await extractTextHints();
}

async function renderPage() {
  if (!state.pdf) return;
  const page = await state.pdf.getPage(state.page);
  const viewport = page.getViewport({ scale: state.viewportScale });
  pdfCanvas.width = viewport.width;
  pdfCanvas.height = viewport.height;
  markupCanvas.width = viewport.width;
  markupCanvas.height = viewport.height;
  await page.render({ canvasContext: pdfCtx, viewport }).promise;
  document.getElementById("pageInfo").textContent = `${state.page} / ${state.pageCount}`;
  drawMarkup();
}

async function extractTextHints() {
  const hints = [];
  const allLines = [];
  const words = /(concrete|slab|footing|pad|wall|beam|column|thick|reinforced|rc|blinding)/i;
  for (let pageNumber = 1; pageNumber <= state.pageCount; pageNumber++) {
    const page = await state.pdf.getPage(pageNumber);
    const text = await page.getTextContent();
    const strings = text.items.map((item) => item.str).join(" ");
    strings.split(/(?<=[.;])\s+/).forEach((line) => {
      allLines.push({ page: pageNumber, text: line });
      if (words.test(line)) hints.push({ page: pageNumber, text: line.slice(0, 220) });
    });
  }
  state.textLines = allLines;
  state.scheduleRules = parseReinforcementSchedules(allLines);
  const wrapper = document.getElementById("textHints");
  wrapper.innerHTML = hints.length
    ? hints.slice(0, 30).map((hint) => `<div class="hint"><b>Page ${hint.page}:</b> ${escapeHtml(hint.text)}</div>`).join("")
    : `<div class="hint">No selectable concrete text found. Mark up the plan manually.</div>`;
}

function setTool(tool) {
  state.activeTool = tool;
  state.settingScale = false;
  state.preview = null;
  document.querySelectorAll(".tool").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
  drawMarkup();
}

function startScaleTool() {
  state.settingScale = true;
  state.scalePoints = [];
  document.getElementById("scaleStatus").textContent = "Click two points on a known distance.";
}

function pointerDown(event) {
  const point = canvasPoint(event);
  if (state.settingScale) {
    state.scalePoints.push(point);
    if (state.scalePoints.length === 2) finishScale();
    drawMarkup();
    return;
  }

  if (state.activeTool === "poly") {
    state.polyPoints.push(point);
    drawMarkup();
    return;
  }

  state.drawing = true;
  state.start = point;
  state.preview = null;
}

function pointerMove(event) {
  if (!state.drawing || !state.start) return;
  state.preview = canvasPoint(event);
  drawMarkup();
}

function pointerUp(event) {
  if (!state.drawing || !state.start) return;
  const end = canvasPoint(event);
  const shape = state.activeTool === "line"
    ? { kind: "line", page: state.page, points: [state.start, end] }
    : { kind: "rect", page: state.page, points: [state.start, end] };
  state.shapes.push(shape);
  selectShape(shape);
  state.drawing = false;
  state.start = null;
  state.preview = null;
  drawMarkup();
}

function touchAsMouse(event) {
  event.preventDefault();
  const touch = event.changedTouches[0];
  if (!touch) return;
  const type = event.type === "touchstart" ? "mousedown" : event.type === "touchmove" ? "mousemove" : "mouseup";
  markupCanvas.dispatchEvent(new MouseEvent(type, {
    clientX: touch.clientX,
    clientY: touch.clientY,
    bubbles: true
  }));
}

function finishScale() {
  const known = numberValue(document.getElementById("knownDistance").value);
  if (!known) {
    alert("Enter the known distance first.");
    state.scalePoints = [];
    return;
  }
  const unit = document.getElementById("scaleUnit").value;
  const knownM = unit === "mm" ? known / 1000 : known;
  const px = distance(state.scalePoints[0], state.scalePoints[1]);
  state.scaleMPerPx = knownM / px;
  state.settingScale = false;
  document.getElementById("scaleStatus").textContent = `Scale set: 1 px = ${state.scaleMPerPx.toFixed(5)} m`;
}

function finishPolygon() {
  if (state.polyPoints.length < 3) {
    alert("Polygon needs at least 3 points.");
    return;
  }
  const shape = { kind: "poly", page: state.page, points: [...state.polyPoints] };
  state.shapes.push(shape);
  state.polyPoints = [];
  selectShape(shape);
  drawMarkup();
}

function undoPoint() {
  state.polyPoints.pop();
  drawMarkup();
}

function selectShape(shape) {
  state.selectedShape = shape;
  form.name.value = `Page ${shape.page} concrete ${state.shapes.length}`;
  form.type.value = shape.kind === "line" ? "wall" : "slab";
  showMissingParameters();
}

function saveSelectedElement(event) {
  event.preventDefault();
  if (!state.selectedShape) {
    alert("Draw or select an element first.");
    return;
  }
  if (!state.scaleMPerPx) {
    alert("Set the plan scale first.");
    return;
  }
  const result = calculateShape(state.selectedShape, formValues());
  if (result.missing.length) {
    showMissingParameters();
    return;
  }
  Object.assign(state.selectedShape, { saved: true, boq: result });
  state.selectedShape = null;
  form.reset();
  form.waste.value = 5;
  renderBoq();
  drawMarkup();
}

function calculateShape(shape, values) {
  const measured = measureShape(shape);
  const type = values.type;
  const missing = [];
  const thicknessM = values.thicknessMm / 1000;
  let area = measured.area;
  let volume = 0;
  let formwork = 0;

  if (type === "slab") {
    if (!values.thicknessMm) missing.push("thickness mm");
    volume = area * thicknessM;
    formwork = measured.perimeter * thicknessM;
  } else if (type === "isolatedFooting" || type === "padFooting") {
    if (!values.height) missing.push("height / depth");
    volume = area * values.height;
    formwork = measured.perimeter * values.height;
  } else if (type === "wall" || type === "beam") {
    if (!values.width) missing.push("width");
    if (!values.height) missing.push("height");
    area = measured.length * values.height;
    volume = measured.length * values.width * values.height;
    formwork = measured.length * values.height * 2;
  } else if (type === "column") {
    if (!values.height) missing.push("height");
    volume = area * values.height;
    formwork = measured.perimeter * values.height;
  }

  const wasteFactor = 1 + values.waste / 100;
  const reinforcement = calculateReinforcement(type, values, measured, area, volume, wasteFactor);
  const manpower = calculateManpower(volume * wasteFactor, reinforcement.weightKg, values);
  return {
    ...values,
    page: shape.page,
    measured,
    area,
    volume,
    formwork,
    volumeWithWaste: volume * wasteFactor,
    formworkWithWaste: formwork * wasteFactor,
    reinforcement,
    manpower,
    missing
  };
}

function measureShape(shape) {
  if (!state.scaleMPerPx) return { area: 0, perimeter: 0, length: 0 };
  if (shape.kind === "line") {
    return { area: 0, perimeter: 0, length: distance(shape.points[0], shape.points[1]) * state.scaleMPerPx };
  }
  if (shape.kind === "rect") {
    const [a, b] = shape.points;
    const width = Math.abs(b.x - a.x) * state.scaleMPerPx;
    const height = Math.abs(b.y - a.y) * state.scaleMPerPx;
    return { area: width * height, perimeter: 2 * (width + height), length: Math.max(width, height) };
  }
  const scaled = shape.points.map((point) => ({ x: point.x * state.scaleMPerPx, y: point.y * state.scaleMPerPx }));
  return { area: polygonArea(scaled), perimeter: polygonPerimeter(scaled), length: polygonPerimeter(scaled) };
}

function calculateReinforcement(type, values, measured, area, volume, wasteFactor) {
  const rule = values.reoSource !== "minimum" ? state.scheduleRules[values.tag] : null;
  const steelRate = values.steelRate || 0;
  let weightKg = 0;
  let description = "Minimum assumption";

  if (rule && values.reoSource !== "manual") {
    if (rule.meshKgPerM2) {
      weightKg = area * rule.meshKgPerM2;
      description = `${values.tag}: ${rule.description}`;
    } else if (rule.barDiameter && rule.spacing) {
      weightKg = areaRebarWeight(area, rule.barDiameter, rule.spacing, rule.layers || values.reoLayers || 1);
      description = `${values.tag}: ${rule.description}`;
    }
  }

  if (!weightKg && values.reoSource === "manual") {
    if (values.meshKgPerM2) {
      weightKg = area * values.meshKgPerM2;
      description = `Manual mesh ${values.meshKgPerM2} kg/m2`;
    } else if (values.barDiameter && values.barSpacing) {
      weightKg = areaRebarWeight(area, values.barDiameter, values.barSpacing, values.reoLayers || 1);
      description = `Manual N${values.barDiameter} @ ${values.barSpacing} mm, ${values.reoLayers || 1} layer(s)`;
    }
  }

  if (!weightKg) {
    if (type === "slab" && values.barDiameter && values.barSpacing) {
      weightKg = areaRebarWeight(area, values.barDiameter, values.barSpacing, values.reoLayers || 1);
      description = `Minimum slab assumption: N${values.barDiameter} @ ${values.barSpacing} mm, ${values.reoLayers || 1} layer(s)`;
    } else {
      weightKg = volume * (values.reoKgPerM3 || 80);
      description = `Minimum allowance: ${values.reoKgPerM3 || 80} kg/m3`;
    }
  }

  weightKg *= wasteFactor;
  return {
    weightKg,
    cost: weightKg * steelRate,
    description,
    matchedSchedule: Boolean(rule)
  };
}

function calculateManpower(volumeWithWaste, reoKg, values) {
  const concreteWorkerDays = values.prodM3PerWorkerDay ? volumeWithWaste / values.prodM3PerWorkerDay : 0;
  const reoWorkerDays = values.prodKgPerWorkerDay ? reoKg / values.prodKgPerWorkerDay : 0;
  const workerDays = Math.max(concreteWorkerDays + reoWorkerDays, 0.25);
  const crew = Math.max(1, Math.ceil(values.minCrew || 1));
  return {
    crew,
    workerDays,
    durationDays: Math.max(0.5, workerDays / crew),
    hours: workerDays * (values.hoursPerDay || 8)
  };
}

function parseReinforcementSchedules(lines) {
  const rules = {};
  lines.forEach(({ text }) => {
    const clean = text.replace(/\s+/g, " ").trim().toUpperCase();
    const tag = clean.match(/\b([A-Z]{1,3}\d{1,3})\b/)?.[1];
    if (!tag) return;

    const mesh = clean.match(/\bSL\s?(\d{2,3})\b/);
    const bars = clean.match(/\b(?:N|Y|R)?(\d{2,3})\s*[-@]\s*(\d{2,4})\b/);
    const layers = /DOUBLE|2\s*LAY|T\/B|TOP\s*(?:AND|&)\s*BOTTOM/i.test(clean) ? 2 : 1;

    if (mesh) {
      rules[tag] = {
        meshKgPerM2: meshWeight(`SL${mesh[1]}`),
        layers,
        description: `SL${mesh[1]} mesh${layers > 1 ? ", double layer" : ""}`
      };
    } else if (bars) {
      rules[tag] = {
        barDiameter: Number(bars[1]),
        spacing: Number(bars[2]),
        layers,
        description: `N${bars[1]} @ ${bars[2]} mm${layers > 1 ? ", double layer" : ""}`
      };
    }
  });
  return rules;
}

function meshWeight(mesh) {
  return {
    SL62: 2.3,
    SL72: 3.1,
    SL82: 4.1,
    SL92: 5.2,
    SL102: 6.4
  }[mesh] || 4.1;
}

function areaRebarWeight(area, diameterMm, spacingMm, layers) {
  const spacingM = spacingMm / 1000;
  if (!area || !spacingM || !diameterMm) return 0;
  return area * (2 / spacingM) * barKgPerM(diameterMm) * (layers || 1);
}

function barKgPerM(diameterMm) {
  return (diameterMm * diameterMm) / 162;
}

function showMissingParameters() {
  if (!state.selectedShape) return;
  const result = calculateShape(state.selectedShape, formValues());
  const box = document.getElementById("missingBox");
  if (!state.scaleMPerPx) {
    box.classList.remove("hidden");
    box.textContent = "Set scale before calculating this element.";
    return;
  }
  if (result.missing.length) {
    box.classList.remove("hidden");
    box.textContent = `Missing required parameter: ${result.missing.join(", ")}. Insert it to proceed.`;
  } else {
    box.classList.add("hidden");
    box.textContent = "";
  }
}

function renderBoq() {
  const rows = state.shapes.filter((shape) => shape.saved && shape.boq);
  const tbody = document.getElementById("boqRows");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="11">No concrete elements saved yet.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map((shape, index) => {
      const boq = shape.boq;
      const currentSteelCost = boq.reinforcement.weightKg * quoteSettings().steelRate;
      return `
        <tr>
          <td>${boq.page}</td>
          <td><b>${escapeHtml(boq.name)}</b><div>${escapeHtml(boq.notes)}</div></td>
          <td>${labelType(boq.type)}</td>
          <td>${measuredText(boq.measured)}</td>
          <td>${fmt(boq.area)} m²</td>
          <td><b>${fmt(boq.volumeWithWaste)} m³</b><div>raw ${fmt(boq.volume)} m³</div></td>
          <td>${fmt(boq.formworkWithWaste)} m²</td>
          <td><b>${fmt(boq.reinforcement.weightKg)} kg</b><div>${escapeHtml(boq.reinforcement.description)}</div><div>${money(currentSteelCost)} steel</div></td>
          <td><b>${boq.manpower.crew} workers</b><div>${fmt(boq.manpower.workerDays)} worker-days</div><div>${fmt(boq.manpower.durationDays)} days min</div></td>
          <td><span class="status">complete</span></td>
          <td><button class="delete-line" data-index="${index}" type="button">X</button></td>
        </tr>
      `;
    }).join("");
  }
  renderTotals(rows);
  tbody.querySelectorAll(".delete-line").forEach((button) => button.addEventListener("click", () => {
    const saved = state.shapes.filter((shape) => shape.saved && shape.boq);
    const target = saved[Number(button.dataset.index)];
    state.shapes = state.shapes.filter((shape) => shape !== target);
    renderBoq();
    drawMarkup();
  }));
}

function renderTotals(rows) {
  const area = rows.reduce((total, shape) => total + shape.boq.area, 0);
  const volume = rows.reduce((total, shape) => total + shape.boq.volumeWithWaste, 0);
  const formwork = rows.reduce((total, shape) => total + shape.boq.formworkWithWaste, 0);
  const reo = rows.reduce((total, shape) => total + shape.boq.reinforcement.weightKg, 0);
  const settings = quoteSettings();
  const steelCost = reo * settings.steelRate;
  document.getElementById("totalArea").textContent = `${fmt(area)} m²`;
  document.getElementById("totalVolume").textContent = `${fmt(volume)} m³`;
  document.getElementById("totalFormwork").textContent = `${fmt(formwork)} m² FW`;
  document.getElementById("totalReo").textContent = `${fmt(reo)} kg reo`;
  document.getElementById("totalSteelCost").textContent = `${money(steelCost)} steel`;
  renderQuotationTotals({ volume, formwork, reo, steelCost, settings });
}

function quoteSettings() {
  return {
    steelRate: numberValue(document.getElementById("marketSteelRate").value),
    concreteRate: numberValue(document.getElementById("marketConcreteRate").value),
    formworkRate: numberValue(document.getElementById("marketFormworkRate").value),
    marginPercent: numberValue(document.getElementById("profitMargin").value)
  };
}

function renderQuotationTotals({ volume, formwork, reo, settings }) {
  const concreteCost = volume * settings.concreteRate;
  const formworkCost = formwork * settings.formworkRate;
  const steelCost = reo * settings.steelRate;
  const subtotal = concreteCost + formworkCost + steelCost;
  const margin = subtotal * (settings.marginPercent / 100);
  const total = subtotal + margin;
  document.getElementById("quoteConcrete").textContent = money(concreteCost);
  document.getElementById("quoteFormwork").textContent = money(formworkCost);
  document.getElementById("quoteSteel").textContent = money(steelCost);
  document.getElementById("quoteSubtotal").textContent = money(subtotal);
  document.getElementById("quoteMargin").textContent = money(margin);
  document.getElementById("quoteTotal").textContent = money(total);
}

function drawMarkup() {
  markCtx.clearRect(0, 0, markupCanvas.width, markupCanvas.height);
  state.shapes.filter((shape) => shape.page === state.page).forEach((shape) => drawShape(shape, shape.saved ? "#146c64" : "#c57a1d"));
  if (state.polyPoints.length) drawPolyline(state.polyPoints, "#245b9d", false);
  if (state.scalePoints.length) drawPolyline(state.scalePoints, "#b8443f", false);
  if (state.drawing && state.start && state.preview) {
    drawShape({ kind: state.activeTool === "line" ? "line" : "rect", points: [state.start, state.preview] }, "#245b9d");
  }
}

function drawShape(shape, color) {
  markCtx.strokeStyle = color;
  markCtx.fillStyle = color + "22";
  markCtx.lineWidth = 3;
  if (shape.kind === "line") {
    drawPolyline(shape.points, color, false);
    return;
  }
  if (shape.kind === "rect") {
    const [a, b] = shape.points;
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    markCtx.fillRect(x, y, w, h);
    markCtx.strokeRect(x, y, w, h);
    return;
  }
  drawPolyline(shape.points, color, true);
}

function drawPolyline(points, color, closed) {
  if (!points.length) return;
  markCtx.strokeStyle = color;
  markCtx.fillStyle = color + "22";
  markCtx.lineWidth = 3;
  markCtx.beginPath();
  markCtx.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => markCtx.lineTo(point.x, point.y));
  if (closed) {
    markCtx.closePath();
    markCtx.fill();
  }
  markCtx.stroke();
  points.forEach((point) => {
    markCtx.beginPath();
    markCtx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    markCtx.fillStyle = color;
    markCtx.fill();
  });
}

function formValues() {
  return {
    name: form.name.value.trim(),
    type: form.type.value,
    thicknessMm: numberValue(form.thicknessMm.value),
    height: numberValue(form.height.value),
    width: numberValue(form.width.value),
    waste: numberValue(form.waste.value),
    tag: form.tag.value.trim().toUpperCase(),
    notes: form.notes.value.trim(),
    reoSource: form.reoSource.value,
    barDiameter: numberValue(form.barDiameter.value),
    barSpacing: numberValue(form.barSpacing.value),
    reoLayers: numberValue(form.reoLayers.value),
    reoKgPerM3: numberValue(form.reoKgPerM3.value),
    meshKgPerM2: numberValue(form.meshKgPerM2.value),
    steelRate: numberValue(form.steelRate.value),
    minCrew: numberValue(form.minCrew.value),
    hoursPerDay: numberValue(form.hoursPerDay.value),
    prodM3PerWorkerDay: numberValue(form.prodM3PerWorkerDay.value),
    prodKgPerWorkerDay: numberValue(form.prodKgPerWorkerDay.value)
  };
}

function canvasPoint(event) {
  const rect = markupCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (markupCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (markupCanvas.height / rect.height)
  };
}

function goPage(delta) {
  if (!state.pdf) return;
  state.page = Math.max(1, Math.min(state.pageCount, state.page + delta));
  renderPage();
}

function clearAll() {
  if (!confirm("Clear all markups and BOQ lines?")) return;
  state.shapes = [];
  state.selectedShape = null;
  state.polyPoints = [];
  renderBoq();
  drawMarkup();
}

function exportCsv() {
  const settings = quoteSettings();
  const rows = state.shapes.filter((shape) => shape.saved && shape.boq).map((shape) => {
    const b = shape.boq;
    return [
      b.page,
      b.name,
      b.tag,
      labelType(b.type),
      measuredText(b.measured),
      fmt(b.area),
      fmt(b.volumeWithWaste),
      fmt(b.formworkWithWaste),
      fmt(b.reinforcement.weightKg),
      money(b.reinforcement.weightKg * settings.steelRate),
      b.reinforcement.description,
      b.manpower.crew,
      fmt(b.manpower.workerDays),
      fmt(b.manpower.durationDays),
      b.notes
    ];
  });
  const csv = [["page", "name", "tag", "type", "measured", "area_m2", "volume_m3", "formwork_m2", "reo_kg", "steel_cost", "reo_basis", "min_crew", "worker_days", "duration_days", "notes"], ...rows]
    .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "concrete-plan-boq.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function polygonArea(points) {
  let total = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    total += point.x * next.y - next.x * point.y;
  });
  return Math.abs(total / 2);
}

function polygonPerimeter(points) {
  return points.reduce((total, point, index) => total + distance(point, points[(index + 1) % points.length]), 0);
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function labelType(type) {
  return {
    slab: "Slab",
    isolatedFooting: "Isolated footing",
    padFooting: "Pad footing",
    wall: "Wall",
    column: "Column / round",
    beam: "Beam"
  }[type] || type;
}

function measuredText(measured) {
  if (measured.area) return `${fmt(measured.area)} m², ${fmt(measured.perimeter)} lm`;
  return `${fmt(measured.length)} lm`;
}

function numberValue(value) {
  return Number.parseFloat(value) || 0;
}

function fmt(value) {
  return Number(value || 0).toFixed(3);
}

function money(value) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value || 0));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
