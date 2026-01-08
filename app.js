// app.js — phase 4 (corrected): character limits → derived rows

const paper = document.querySelector(".paper-inner");
const textarea = document.querySelector(".input textarea");

// Line length controls
const btn20 = document.querySelector('button[data-width="20"]');
const btn25 = document.querySelector('button[data-width="25"]');
const otherInput = document.querySelector('.controls input[type="number"]');

// Goal range controls
const rangeToggle = document.querySelector('.controls input[type="checkbox"]');
const minInput = document.querySelectorAll('.controls input[type="number"]')[1];
const maxInput = document.querySelectorAll('.controls input[type="number"]')[2];

let currentColumns = 20;
const MIN_ROWS = 3;

function calculateRows({
  textLength,
  columns,
  rangeOn,
  maxCharacters,
}) {
  const naturalRows =
    textLength === 0 ? MIN_ROWS : Math.ceil(textLength / columns);

  let rows = Math.max(MIN_ROWS, naturalRows);

  if (rangeOn && Number.isInteger(maxCharacters) && maxCharacters > 0) {
    const maxRows = Math.ceil(maxCharacters / columns);
    rows = Math.max(rows, maxRows);
  }

  return rows;
}

function renderPreview({ columns, rows }) {
  paper.innerHTML = "";

  for (let r = 0; r < rows; r++) {
    const row = document.createElement("div");
    row.className = "paper-row";
    row.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;

    for (let c = 0; c < columns; c++) {
      const cell = document.createElement("div");
      cell.className = "paper-cell";
      row.appendChild(cell);
    }

    paper.appendChild(row);
  }
}

function updatePreview() {
  const textLength = textarea.value.length;
  const rangeOn = rangeToggle.checked;

  const maxCharacters = Number(maxInput.value);

  const rows = calculateRows({
    textLength,
    columns: currentColumns,
    rangeOn,
    maxCharacters: Number.isInteger(maxCharacters) ? maxCharacters : null,
  });

  renderPreview({
    columns: currentColumns,
    rows,
  });
}

// --- Event wiring ---

btn20.addEventListener("click", () => {
  currentColumns = 20;
  otherInput.value = "";
  updatePreview();
});

btn25.addEventListener("click", () => {
  currentColumns = 25;
  otherInput.value = "";
  updatePreview();
});

otherInput.addEventListener("input", () => {
  const val = Number(otherInput.value);
  if (!Number.isInteger(val) || val <= 0) return;

  currentColumns = val;
  updatePreview();
});

textarea.addEventListener("input", updatePreview);
rangeToggle.addEventListener("change", updatePreview);
minInput.addEventListener("input", updatePreview);
maxInput.addEventListener("input", updatePreview);

// Initial render
updatePreview();
