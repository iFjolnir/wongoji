// app.js — stable port: old wongoji logic + new UI renderer






/* =========================
   DEFAULTS + HELPERS (from old version)
   ========================= */

const DEFAULTS = {
  width: 20,
  indentBoxes: 1,
  countSpaces: true,
  digitsPerBox: 2,

  // punctuation that triggers a required blank after it
  requireBlankAfter: new Set(["?", "!"]),

  // if user typed a space after these, we ignore that typed space
  forbidTypedSpaceAfter: new Set([".", ",", ":", ";"]),

  // punctuation that can share the last box if it would otherwise wrap
  shareablePunct: new Set([".", ",", "?", "!", ":", ";", "…", ")", "]", "”", "’", "」", "』", "》"]),

  // special 2-box tokens (non-ellipsis only)
  twoBoxTokens: new Set(["―"]),

};

const LEFT_ALIGN_PUNCT = new Set([
  ".", ",", ":", ";", "·", "、", "。", "，"
]);

const CENTER_PUNCT_EXCEPTIONS = new Set([
  "―", "–", "…", "……", "?", "!"
]);


function normalizeText(s) {
  return (s || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function tokenizeParagraph(para) {
  const tokens = [];
  let i = 0;

  while (i < para.length) {
    // Normalize three dots into TWO ellipsis boxes
    if (para.slice(i, i + 3) === "...") {
      tokens.push("...");
      tokens.push("...");
      i += 3;
      continue;
    }

    // If user pasted a Unicode ellipsis variant, normalize it too
    if (para.slice(i, i + 1) === "…") {
      tokens.push("...");
      tokens.push("...");
      i += 1;
      continue;
    }

    // If someone pasted the six-dot form, normalize as well
    if (para.slice(i, i + 2) === "……") {
      tokens.push("...");
      tokens.push("...");
      i += 2;
      continue;
    }

    tokens.push(para[i]);
    i += 1;
  }

  return tokens;
}


function packDigits(tokens, digitsPerBox = 2) {
  const out = [];
  let digitBuf = "";

  for (const t of tokens) {
    if (/^[0-9]$/.test(t)) {
      digitBuf += t;
      if (digitBuf.length === digitsPerBox) {
        out.push(digitBuf);
        digitBuf = "";
      }
    } else {
      if (digitBuf.length > 0) {
        out.push(digitBuf);
        digitBuf = "";
      }
      out.push(t);
    }
  }

  if (digitBuf.length > 0) out.push(digitBuf);
  return out;
}

function makeCell(char = "", used = false) {
  return { char, used };
}






/* ===========================================================================
   LAYOUT ENGINE (ported)
   =========================================================================== */

function layout(text, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const width = Number(o.width) || 20;
  const indentBoxes = Math.max(0, Number(o.indentBoxes ?? 1));
  const countSpaces = !!o.countSpaces;

  const norm = normalizeText(text);
  const paras = norm.split("\n");

  const cells = [];
  let col = 0;

  const pushCell = (cell) => {
    cells.push(cell);
    col = (col + 1) % width;
  };

  const padToLineEnd = () => {
    if (col === 0) return;
    const pad = width - col;
    for (let i = 0; i < pad; i++) pushCell(makeCell("", false)); // UNUSED padding
  };

  const pushUsedBlank = () => pushCell(makeCell("", true));
  const atLineStart = () => col === 0;

  // Try attach punctuation into previous used box if we'd otherwise wrap
  function trySharePunctuationWithPreviousBox(punct) {
    // find previous used box
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].used) {
        // append in-place (visual-only). Keep it simple and safe.
        cells[i].char = (cells[i].char || "") + punct;
        return true;
      }
      // stop if we hit a hard row boundary padding area? we allow scanning through padding
    }
    return false;
  }

  function placeToken(token, nextToken) {
    // ignore typed spaces if we don't count them
    if (token === " " || token === "\t") {
      if (!countSpaces) return;

      // no spaces at start of line
      if (atLineStart()) return;

      pushUsedBlank();
      return;
    }

    // 2-box tokens
    if (o.twoBoxTokens.has(token)) {
      if (col === width - 1) {
        padToLineEnd();
      }
      pushCell(makeCell(token, true));
      pushCell(makeCell("·", true)); // continuation marker (visual)
      return;
    }

    // shareable punctuation at line start: try share with previous
    if (o.shareablePunct.has(token) && atLineStart()) {
      if (trySharePunctuationWithPreviousBox(token)) {
        // after ?/!: add required blank ONLY if paragraph continues
        if (o.requireBlankAfter.has(token) && nextToken !== undefined) {
          pushUsedBlank();
        }
        return;
      }
    }

    // normal token
    pushCell(makeCell(token, true));

// After ? or !: ensure exactly ONE blank box
// only if the user did NOT already type one
if (o.requireBlankAfter.has(token)) {
  if (nextToken !== " " && nextToken !== "\t") {
    pushUsedBlank();
  }
  return;
}

  }

  for (let p = 0; p < paras.length; p++) {
    const para = paras[p];

    // Start paragraph on a new line
    if (cells.length > 0) padToLineEnd();

    // indent only if paragraph has content
    if (para.length > 0 && indentBoxes > 0) {
      for (let i = 0; i < indentBoxes; i++) pushUsedBlank();
    }

    // tokenize + digit packing
    let tokens = tokenizeParagraph(para);
    tokens = packDigits(tokens, o.digitsPerBox);

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const next = tokens[i + 1];

      // If user typed a space after punctuation that shouldn't create extra blanks, skip it
      if (o.forbidTypedSpaceAfter.has(t) && (next === " " || next === "\t")) {
        placeToken(t, next);
        i += 1;
        continue;
      }

      placeToken(t, next);
    }

    // After paragraph (except last), force new line
    if (p !== paras.length - 1) padToLineEnd();
  }

  // Always render the final line fully
  padToLineEnd();

  // Count used boxes (exclude unused padding)
  const usedCount = cells.reduce((a, c) => a + (c.used ? 1 : 0), 0);

  // last used index for sheetCount
  let lastUsedIndex = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].used) lastUsedIndex = i + 1;
  }

  const sheetCount =
    lastUsedIndex === 0 ? 0 : Math.ceil(lastUsedIndex / width) * width;

   const consumedCount = lastUsedIndex; // ✅ boxes consumed on paper (includes wasted padding)
   return { cells, usedCount, consumedCount, sheetCount, width };
}






/* ===========================================================================
   UI + RENDERING
   =========================================================================== */

const paper = document.querySelector(".paper-inner");
const textarea = document.querySelector(".input textarea");
const stats = document.querySelector("#stats");

// line length controls
const btn20 = document.querySelector('button[data-width="20"]');
const btn25 = document.querySelector('button[data-width="25"]');
const numberInputs = document.querySelectorAll('.controls input[type="number"]');
const otherWidthInput = numberInputs[0];
const minInput = numberInputs[1]; // not used yet, but kept for UI
const maxInput = numberInputs[2];

// goal range
const rangeToggle = document.querySelector('.controls input[type="checkbox"]');

let currentColumns = 20;
const MIN_ROWS = 3;

function renderPaper({ cells, columns, rows, maxChars }) {
  paper.innerHTML = "";

  let index = 0;        // index into cells[]
  let paperIndex = 0;  // paper boxes consumed (this is the key)

  for (let r = 0; r < rows; r++) {
    const row = document.createElement("div");
    row.className = "paper-row";
    row.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

    for (let c = 0; c < columns; c++) {
      const cellData = cells[index] ?? { char: "", used: false };
      const cell = document.createElement("div");
      cell.className = "paper-cell";

      paperIndex++;

      if (cellData.used && cellData.char) {
        cell.textContent = cellData.char;
      
        // left-align basic punctuation (except allowed centered ones)
        if (
          cellData.char.length === 1 &&
          LEFT_ALIGN_PUNCT.has(cellData.char) &&
          !CENTER_PUNCT_EXCEPTIONS.has(cellData.char)
        ) {
          cell.classList.add("punct-left");
        }
      }


      if (maxChars && paperIndex > maxChars) {
        cell.classList.add("overflow");
      }

      index++;
      row.appendChild(cell);
    }

    paper.appendChild(row);

    // ----- gutter row -----
    const gutter = document.createElement("div");
    gutter.className = "paper-row gutter";

    const boxesPerRow = columns;
    const rowsPer100 = 100 / boxesPerRow;

    if (Number.isInteger(rowsPer100)) {
      const rowIndex = r + 1;
      if (rowIndex % rowsPer100 === 0) {
        const counter = document.createElement("div");
        counter.className = "gutter-counter";
        counter.textContent = String(rowIndex * boxesPerRow);
        gutter.appendChild(counter);
      }
    }

    paper.appendChild(gutter);
  }
}


function updateStats({ usedCount, consumedCount, maxChars, overflow }) {
  if (!stats) return;

  const maxPart = maxChars ? ` / ${maxChars}` : "";

  const overflowPart =
    overflow > 0 ? ` — overflow: <span class="bad">${overflow}</span>` : "";

  stats.innerHTML =
    `Boxes filled: <strong>${usedCount}</strong>` +
    ` — Boxes consumed: <strong>${consumedCount}</strong>${maxPart}${overflowPart}`;
}


function updatePreview() {
  const text = textarea.value;

  const rangeOn = rangeToggle.checked;
  const maxCharsRaw = Number(maxInput.value);
  const maxChars = rangeOn && Number.isInteger(maxCharsRaw) && maxCharsRaw > 0 ? maxCharsRaw : null;

  const result = layout(text, {
    width: currentColumns,
    indentBoxes: 1,
    countSpaces: true,
    digitsPerBox: 2,
  });

  const contentSheetCount = Math.max(result.sheetCount, 0);

  const limitSheetCount = maxChars ? Math.ceil(maxChars / currentColumns) * currentColumns : 0;

  const minSheetCount = MIN_ROWS * currentColumns;

  const sheetCountToRender = Math.max(minSheetCount, contentSheetCount, limitSheetCount);

  const rows = sheetCountToRender / currentColumns;

  const overflow = maxChars ? Math.max(0, result.consumedCount - maxChars) : 0;

  renderPaper({
    cells: result.cells,
    columns: currentColumns,
    rows,
    maxChars,
  });

  updateStats({
    usedCount: result.usedCount,
    consumedCount: result.consumedCount,
    maxChars,
    overflow,
  });
}






/* ===========================================================================
   EVENTS
   =========================================================================== */

btn20.addEventListener("click", () => {
  currentColumns = 20;
  otherWidthInput.value = "";
  updatePreview();
});

btn25.addEventListener("click", () => {
  currentColumns = 25;
  otherWidthInput.value = "";
  updatePreview();
});

otherWidthInput.addEventListener("input", () => {
  const val = Number(otherWidthInput.value);
  if (!Number.isInteger(val) || val <= 0) return;
  currentColumns = val;
  updatePreview();
});

textarea.addEventListener("input", updatePreview);
rangeToggle.addEventListener("change", updatePreview);
minInput.addEventListener("input", updatePreview);
maxInput.addEventListener("input", updatePreview);

// initial
updatePreview();





/* ===========================================================================
   EXPORT — RENDER WRAPPER
   ======================================================================== */

function buildExportWrapper() {
  const originalPaper = document.querySelector(".paper-inner");
  if (!originalPaper) return null;

  const paperClone = originalPaper.cloneNode(true);

  const wrapper = document.createElement("div");
  wrapper.style.width = "1240px";
  wrapper.style.padding = "32px";
  wrapper.style.background = "#fff";
  wrapper.style.boxSizing = "border-box";

  const styleOverride = document.createElement("style");
  styleOverride.textContent = `
    .paper-cell {
      font-size: ${EXPORT_FONT_SIZE_PX}px !important;
      line-height: 1 !important;
    }
  `;
  wrapper.appendChild(styleOverride);

  const { title, name, date } = getExportHeaderData();
  if (title || name || date) {
    const header = document.createElement("div");
    header.style.display = "grid";
    header.style.gridTemplateColumns = "12fr 5fr 3fr";
    header.style.alignItems = "end";
    header.style.marginBottom = "40px";
    header.style.fontSize = "20px";
    header.style.fontWeight = "700";

    const titleEl = document.createElement("div");
    titleEl.textContent = title || "";
    titleEl.style.textAlign = "left";

    const nameEl = document.createElement("div");
    nameEl.textContent = name || "";
    nameEl.style.textAlign = "right";
    nameEl.style.fontWeight = "300";

    const dateEl = document.createElement("div");
    dateEl.textContent = date || "";
    dateEl.style.textAlign = "right";
    dateEl.style.fontWeight = "300";

    header.appendChild(titleEl);
    header.appendChild(nameEl);
    header.appendChild(dateEl);

    wrapper.appendChild(header);
  }

  wrapper.appendChild(paperClone);

  wrapper.style.position = "fixed";
  wrapper.style.left = "-9999px";
  wrapper.style.top = "0";
  document.body.appendChild(wrapper);

  return wrapper;
}






/* ===========================================================================
   EXPORT — IMAGE (PNG)
   ======================================================================== */

const exportImageBtn = document.querySelector("#export-image");
const exportDetails = document.querySelector("#export-details");
const exportPdfBtn = document.querySelector("#export-pdf");


// header content
function getExportHeaderData() {
  return {
    title: document.querySelector("#export-title")?.value.trim(),
    name: document.querySelector("#export-name")?.value.trim(),
    date: document.querySelector("#export-date")?.value.trim(),
  };
}


// 🔧 TEMP: export font size
const EXPORT_FONT_SIZE_PX = 20;

exportImageBtn.addEventListener("click", async () => {
  if (exportDetails && exportDetails.classList.contains("hidden")) {
    exportDetails.classList.remove("hidden");
    return;
  }

  const wrapper = buildExportWrapper();
  if (!wrapper) return;

  const canvas = await html2canvas(wrapper, {
    backgroundColor: "#fff",
    useCORS: true,
  });

  document.body.removeChild(wrapper);

  const dataURL = canvas.toDataURL("image/png");

  const link = document.createElement("a");
  link.href = dataURL;
  link.download = "wongoji-paper.png";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});





/* ===========================================================================
   EXPORT — DOC (PDF)
   ======================================================================== */

exportPdfBtn.addEventListener("click", async () => {
  // STEP 1: first click → reveal options ONLY
  if (exportDetails && exportDetails.classList.contains("hidden")) {
    exportDetails.classList.remove("hidden");
    return; // 🔴 CRITICAL: stop here
  }

  // STEP 2: actual export
  const wrapper = buildExportWrapper();
  if (!wrapper) return;

  const canvas = await html2canvas(wrapper, {
    backgroundColor: "#fff",
    useCORS: true,
    scale: 2, // improves PDF clarity
  });

  document.body.removeChild(wrapper);

  exportCanvasToPdf(canvas);
});







function exportCanvasToPdf(canvas) {
  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;   // A4 width in mm
  const pageHeight = 297;  // A4 height in mm

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let y = 0;
  let remainingHeight = imgHeight;

  const imgData = canvas.toDataURL("image/png");

  pdf.addImage(imgData, "PNG", 0, y, imgWidth, imgHeight);
  remainingHeight -= pageHeight;

  while (remainingHeight > 0) {
    pdf.addPage();
    y -= pageHeight;
    pdf.addImage(imgData, "PNG", 0, y, imgWidth, imgHeight);
    remainingHeight -= pageHeight;
  }

  pdf.save("wongoji-paper.pdf");
}




