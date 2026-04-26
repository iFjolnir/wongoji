// app.js — Wongoji Simulator (with page counter on multi-page exports)

/* =========================
   DEFAULTS + HELPERS
   ========================= */

const DEFAULTS = {
  width: 20,
  indentBoxes: 1,
  countSpaces: true,
  digitsPerBox: 2,

  requireBlankAfter: new Set(["?", "!"]),
  forbidTypedSpaceAfter: new Set([".", ",", ":", ";"]),
  shareablePunct: new Set([".", ",", "?", "!", ":", ";", "…", ")", "]", "”", "’", "\"", "'", "」", "』", "》"]),
  twoBoxTokens: new Set(["―"]),
};

const LEFT_ALIGN_PUNCT = new Set([".", ",", ":", ";", "·", "、", "。", "，"]);
const CENTER_PUNCT_EXCEPTIONS = new Set(["―", "–", "…", "……", "?", "!"]);

function normalizeText(s) {
  return (s || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function tokenizeParagraph(para) {
  const tokens = [];
  let i = 0;

  while (i < para.length) {
    if (para.slice(i, i + 3) === "...") {
      tokens.push("...");
      tokens.push("...");
      i += 3;
      continue;
    }
    if (para.slice(i, i + 1) === "…") {
      tokens.push("...");
      tokens.push("...");
      i += 1;
      continue;
    }
    if (para.slice(i, i + 2) === "……") {
      tokens.push("...");
      tokens.push("...");
      i += 2;
      continue;
    }

    const ch = para[i];
    if (ch === "\u2018" || ch === "\u2019") {
      tokens.push("'");
      i += 1;
      continue;
    }
    if (ch === "\u201C" || ch === "\u201D") {
      tokens.push('"');
      i += 1;
      continue;
    }

    tokens.push(para[i]);
    i += 1;
  }
  return tokens;
}

function clusterClass(t) {
  if (t.length !== 1) return null;
  if (/^[0-9]$/.test(t)) return "digit";
  if (/^[a-z]$/.test(t)) return "lower";
  return null;
}

function packClusters(tokens, perBox = 2) {
  const out = [];
  let buf = "";
  let bufClass = null;

  const flush = () => {
    if (buf.length > 0) {
      out.push(buf);
      buf = "";
      bufClass = null;
    }
  };

  for (const t of tokens) {
    const cls = clusterClass(t);
    if (cls !== null) {
      if (cls !== bufClass) flush();
      buf += t;
      bufClass = cls;
      if (buf.length === perBox) flush();
    } else {
      flush();
      out.push(t);
    }
  }
  flush();
  return out;
}

function tagQuoteRoles(tokens) {
  const roles = new Array(tokens.length).fill(null);
  let singleParity = 0;
  let doubleParity = 0;

  const isAlphaNumericish = (t) => {
    if (!t) return false;
    return /^[A-Za-z0-9]$/.test(t[0]);
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "'") {
      const prev = i > 0 ? tokens[i - 1] : null;
      const next = i + 1 < tokens.length ? tokens[i + 1] : null;
      if (isAlphaNumericish(prev) && isAlphaNumericish(next)) {
        continue;
      }
      roles[i] = singleParity === 0 ? "open" : "close";
      singleParity = 1 - singleParity;
    } else if (t === '"') {
      roles[i] = doubleParity === 0 ? "open" : "close";
      doubleParity = 1 - doubleParity;
    }
  }
  return roles;
}

function makeCell(char = "", used = false) {
  return { char, used };
}

/* =========================
   LAYOUT ENGINE
   ========================= */

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
    for (let i = 0; i < pad; i++) pushCell(makeCell("", false));
  };

  const pushUsedBlank = () => pushCell(makeCell("", true));
  const atLineStart = () => col === 0;

  function trySharePunctuationWithPreviousBox(punct) {
    for (let i = cells.length - 1; i >= 0; i--) {
      if (cells[i].used) {
        cells[i].char = (cells[i].char || "") + punct;
        return true;
      }
    }
    return false;
  }

  function placeToken(token, nextToken, role) {
    if (token === " " || token === "\t") {
      if (!countSpaces) return;
      if (atLineStart()) return;
      pushUsedBlank();
      return;
    }

    if (role === "close") {
      for (let i = cells.length - 1; i >= 0; i--) {
        if (cells[i].used) {
          const prev = cells[i].char || "";
          if (prev === "." || prev === ",") {
            cells[i].char = prev + token;
            cells[i].isClosingQuoteMerged = true;
            return;
          }
          break;
        }
      }
      pushCell({ char: token, used: true, isClosingQuote: true });
      return;
    }

    if (token === "." || token === ",") {
      for (let i = cells.length - 1; i >= 0; i--) {
        if (cells[i].used) {
          if (cells[i].isClosingQuote && !cells[i].isClosingQuoteMerged) {
            cells[i].char = token + (cells[i].char || "");
            cells[i].isClosingQuoteMerged = true;
            return;
          }
          break;
        }
      }
    }

    if (o.twoBoxTokens.has(token)) {
      if (col === width - 1) padToLineEnd();
      pushCell(makeCell(token, true));
      pushCell(makeCell("·", true));
      return;
    }

    if (o.shareablePunct.has(token) && atLineStart()) {
      if (trySharePunctuationWithPreviousBox(token)) {
        if (o.requireBlankAfter.has(token) && nextToken !== undefined) {
          pushUsedBlank();
        }
        return;
      }
    }

    pushCell(makeCell(token, true));

    if (o.requireBlankAfter.has(token)) {
      if (nextToken !== " " && nextToken !== "\t") {
        pushUsedBlank();
      }
      return;
    }
  }

  for (let p = 0; p < paras.length; p++) {
    const para = paras[p];
    if (cells.length > 0) padToLineEnd();
    if (para.length > 0 && indentBoxes > 0) {
      for (let i = 0; i < indentBoxes; i++) pushUsedBlank();
    }

    let tokens = tokenizeParagraph(para);
    tokens = packClusters(tokens, o.digitsPerBox);
    const roles = tagQuoteRoles(tokens);

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const next = tokens[i + 1];
      const role = roles[i];

      if (o.forbidTypedSpaceAfter.has(t) && (next === " " || next === "\t")) {
        placeToken(t, next, role);
        i += 1;
        continue;
      }
      placeToken(t, next, role);
    }

    if (p !== paras.length - 1) padToLineEnd();
  }

  padToLineEnd();

  const usedCount = cells.reduce((a, c) => a + (c.used ? 1 : 0), 0);
  let lastUsedIndex = 0;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].used) lastUsedIndex = i + 1;
  }
  const sheetCount = lastUsedIndex === 0 ? 0 : Math.ceil(lastUsedIndex / width) * width;
  const consumedCount = lastUsedIndex;

  return { cells, usedCount, consumedCount, sheetCount, width };
}

/* =========================
   UI + RENDERING
   ========================= */

const paper = document.querySelector(".paper-inner");
const textarea = document.querySelector(".input textarea");
const stats = document.querySelector("#stats");

const btn20 = document.querySelector('button[data-width="20"]');
const btn25 = document.querySelector('button[data-width="25"]');
const numberInputs = document.querySelectorAll('.controls input[type="number"]');
const otherWidthInput = numberInputs[0];
const minInput = numberInputs[1];
const maxInput = numberInputs[2];

const rangeToggle = document.querySelector('.controls input[type="checkbox"]');

let currentColumns = 20;
const MIN_ROWS = 3;

function renderPaper({ cells, columns, rows, maxChars }) {
  paper.innerHTML = "";
  let index = 0;
  let paperIndex = 0;

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
  const overflowPart = overflow > 0 ? ` — overflow: <span class="bad">${overflow}</span>` : "";
  stats.innerHTML = `Boxes filled: <strong>${usedCount}</strong> — Boxes consumed: <strong>${consumedCount}</strong>${maxPart}${overflowPart}`;
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

/* =========================
   EVENTS
   ========================= */

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

updatePreview();

/* =========================
   EXPORT — WITH PAGE COUNTER
   ========================= */

const exportImageBtn = document.querySelector("#export-image");
const exportDetails = document.querySelector("#export-details");
const exportPdfBtn = document.querySelector("#export-pdf");

// EXPORT SETTINGS
const EXPORT_FONT_SIZE_PX = 28;
const EXPORT_FONT_WEIGHT = "400";
const EXPORT_BORDER_WIDTH_PX = 1.5;
const EXPORT_BORDER_COLOR = "#ebcbad";

function getExportHeaderData() {
  return {
    title: document.querySelector("#export-title")?.value.trim(),
    name: document.querySelector("#export-name")?.value.trim(),
    date: document.querySelector("#export-date")?.value.trim(),
  };
}

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
      font-weight: ${EXPORT_FONT_WEIGHT} !important;
      line-height: 1.2 !important;
      border-right: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
    }
    .paper-cell:first-child {
      border-left: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
    }
    .paper-row {
      border-top: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
    }
    .paper-row:last-child {
      border-bottom: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
    }
    .paper-row.gutter {
      border-top: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
      border-left: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
      border-right: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
    }
    .gutter-counter {
      font-size: 9px !important;
      color: #666 !important;
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
    header.style.fontWeight = "600";

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

// PDF EXPORT — fixed footer using absolute positioning
async function exportToPdf() {
  const wrapper = buildExportWrapper();
  if (!wrapper) return;

  try {
    const { jsPDF } = window.jspdf;
    
    // A4 dimensions in mm
    const pageWidthMM = 210;
    const pageHeightMM = 297;
    const marginMM = 10;
    const contentWidthMM = pageWidthMM - (marginMM * 2);
    
    // Get header data
    const { title, name, date } = getExportHeaderData();
    const hasHeader = !!(title || name || date);
    
    // Get the actual rendered rows from the wrapper
    const paperInner = wrapper.querySelector(".paper-inner");
    const rows = paperInner.querySelectorAll(".paper-row:not(.gutter)");
    const rowCount = rows.length;
    const rowElements = Array.from(rows);
    
    // Calculate how many rows fit per page (400 chars = 20 rows for 20-col, 16 rows for 25-col)
    const charsPerPage = 400;
    const rowsPerPage = Math.floor(charsPerPage / currentColumns);
    
    // Calculate total number of pages
    const totalPages = Math.ceil(rowCount / rowsPerPage);
    
    console.log(`Rows per page: ${rowsPerPage}, Total rows: ${rowCount}, Total pages: ${totalPages}`);
    
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    
    let isFirstPage = true;
    
    // Helper: Create a complete page container with fixed footer
    async function renderPage(rowsForPage, pageNumber, totalPages) {
      // Create a wrapper with fixed dimensions (A4 size at 2x scale)
      const wrapperWidth = 1240;  // pixels
      const wrapperHeight = 1754;  // ~A4 height at 2x scale (297mm ≈ 1754px at 150dpi)
      
      // Create main container with explicit height
      const pageContainer = document.createElement("div");
      pageContainer.style.width = `${wrapperWidth}px`;
      pageContainer.style.height = `${wrapperHeight}px`;
      pageContainer.style.backgroundColor = "#fff";
      pageContainer.style.position = "relative";
      pageContainer.style.boxSizing = "border-box";
      pageContainer.style.overflow = "hidden";
      
      // === HEADER SECTION (pinned to top) ===
      if (hasHeader) {
        const headerDiv = document.createElement("div");
        headerDiv.style.position = "absolute";
        headerDiv.style.top = "0";
        headerDiv.style.left = "0";
        headerDiv.style.right = "0";
        headerDiv.style.padding = "32px 32px 40px 32px";
        headerDiv.style.backgroundColor = "#fff";
        
        // Title on left
        const topRow = document.createElement("div");
        topRow.style.display = "flex";
        topRow.style.justifyContent = "space-between";
        topRow.style.alignItems = "flex-start";
        
        if (title) {
          const titleEl = document.createElement("div");
          titleEl.style.fontSize = "24px";
          titleEl.style.fontWeight = "700";
          titleEl.textContent = title;
          topRow.appendChild(titleEl);
        } else {
          topRow.appendChild(document.createElement("div"));
        }
        
        // Name and Date stacked on right
        if (name || date) {
          const rightStack = document.createElement("div");
          rightStack.style.textAlign = "right";
          
          if (name) {
            const nameEl = document.createElement("div");
            nameEl.style.fontSize = "14px";
            nameEl.style.fontWeight = "400";
            nameEl.style.color = "#555";
            nameEl.style.marginBottom = "4px";
            nameEl.textContent = name;
            rightStack.appendChild(nameEl);
          }
          
          if (date) {
            const dateEl = document.createElement("div");
            dateEl.style.fontSize = "14px";
            dateEl.style.fontWeight = "400";
            dateEl.style.color = "#555";
            dateEl.textContent = date;
            rightStack.appendChild(dateEl);
          }
          
          topRow.appendChild(rightStack);
        }
        
        headerDiv.appendChild(topRow);
        pageContainer.appendChild(headerDiv);
      }
      
      // === GRID SECTION (scrollable content area) ===
      // Calculate start position (after header)
      const headerHeightPx = hasHeader ? 140 : 32;
      const footerHeightPx = 80;
      
      const gridContainer = document.createElement("div");
      gridContainer.style.position = "absolute";
      gridContainer.style.top = `${headerHeightPx}px`;
      gridContainer.style.left = "0";
      gridContainer.style.right = "0";
      gridContainer.style.bottom = `${footerHeightPx}px`;
      gridContainer.style.overflow = "auto";
      gridContainer.style.padding = "0 32px";
      
      const newPaperInner = document.createElement("div");
      newPaperInner.className = "paper-inner";
      
      for (let i = 0; i < rowsForPage.length; i++) {
        const rowClone = rowsForPage[i].cloneNode(true);
        newPaperInner.appendChild(rowClone);
        
        const nextSibling = rowsForPage[i].nextElementSibling;
        if (nextSibling && nextSibling.classList.contains("gutter")) {
          const gutterClone = nextSibling.cloneNode(true);
          newPaperInner.appendChild(gutterClone);
        }
      }
      
      gridContainer.appendChild(newPaperInner);
      pageContainer.appendChild(gridContainer);
      
      // === FOOTER SECTION (pinned to bottom) ===
      const footerDiv = document.createElement("div");
      footerDiv.style.position = "absolute";
      footerDiv.style.bottom = "0";
      footerDiv.style.left = "0";
      footerDiv.style.right = "0";
      footerDiv.style.backgroundColor = "#fff";
      footerDiv.style.textAlign = "center";
      footerDiv.style.padding = "24px 32px";
      footerDiv.style.height = `${footerHeightPx}px`;
      footerDiv.style.display = "flex";
      footerDiv.style.alignItems = "center";
      footerDiv.style.justifyContent = "center";
      
      if (totalPages > 1) {
        const pageCounter = document.createElement("div");
        pageCounter.style.fontSize = "12px";
        pageCounter.style.fontWeight = "400";
        pageCounter.style.color = "#999";
        pageCounter.style.letterSpacing = "1px";
        pageCounter.innerHTML = `—— ${pageNumber}/${totalPages} ——`;
        footerDiv.appendChild(pageCounter);
      }
      
      pageContainer.appendChild(footerDiv);
      
      // Apply grid styling
      const styleTag = document.createElement("style");
      styleTag.textContent = `
        .paper-cell {
          font-size: ${EXPORT_FONT_SIZE_PX}px !important;
          font-weight: ${EXPORT_FONT_WEIGHT} !important;
          line-height: 1.2 !important;
          border-right: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
        }
        .paper-cell:first-child {
          border-left: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
        }
        .paper-row {
          border-top: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
        }
        .paper-row:last-child {
          border-bottom: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
        }
        .paper-row.gutter {
          border-top: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
          border-left: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
          border-right: ${EXPORT_BORDER_WIDTH_PX}px solid ${EXPORT_BORDER_COLOR} !important;
        }
        .gutter-counter {
          font-size: 9px !important;
          color: #666 !important;
        }
      `;
      pageContainer.appendChild(styleTag);
      
      // Render to canvas
      pageContainer.style.position = "fixed";
      pageContainer.style.left = "-9999px";
      pageContainer.style.top = "0";
      document.body.appendChild(pageContainer);
      
      const canvas = await html2canvas(pageContainer, {
        backgroundColor: "#fff",
        useCORS: true,
        scale: 2,
      });
      
      document.body.removeChild(pageContainer);
      return canvas;
    }
    
    // Generate each page
    for (let pageStart = 0; pageStart < rowCount; pageStart += rowsPerPage) {
      const pageEnd = Math.min(pageStart + rowsPerPage, rowCount);
      const rowsForPage = rowElements.slice(pageStart, pageEnd);
      const pageNumber = Math.floor(pageStart / rowsPerPage) + 1;
      
      if (rowsForPage.length === 0) continue;
      
      const pageCanvas = await renderPage(rowsForPage, pageNumber, totalPages);
      const imgData = pageCanvas.toDataURL("image/png");
      const imgHeightMM = (pageCanvas.height / pageCanvas.width) * contentWidthMM;
      
      if (!isFirstPage) {
        pdf.addPage();
      }
      
      pdf.addImage(imgData, "PNG", marginMM, marginMM, contentWidthMM, imgHeightMM);
      isFirstPage = false;
    }
    
    pdf.save("wongoji-paper.pdf");
    
  } finally {
    document.body.removeChild(wrapper);
  }
}
exportImageBtn.addEventListener("click", async () => {
  if (exportDetails && exportDetails.classList.contains("hidden")) {
    exportDetails.classList.remove("hidden");
    return;
  }

  const wrapper = buildExportWrapper();
  if (!wrapper) return;

  try {
    const canvas = await html2canvas(wrapper, {
      backgroundColor: "#fff",
      useCORS: true,
      scale: 2,
    });
    const dataURL = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataURL;
    link.download = "wongoji-paper.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    document.body.removeChild(wrapper);
  }
});

exportPdfBtn.addEventListener("click", async () => {
  if (exportDetails && exportDetails.classList.contains("hidden")) {
    exportDetails.classList.remove("hidden");
    return;
  }
  
  await exportToPdf();
});
