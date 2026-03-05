/* script.js
   Inventory Command Center (with Chart.js)

   Requires in index.html:
   <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
   <script src="script.js"></script>

   Expects these elements to exist in index.html:
   #itemName, #quantity, #saveBtn, #clearAllBtn, #inventoryList, #feedback, #count, #emptyState, #inventoryChart
*/

(() => {
  "use strict";

  const STORAGE_KEY = "inventory_command_center_v2";
  const LEGACY_KEY = "inventory_command_center_v1";
  const LOW_STOCK_THRESHOLD = 10;

  const itemNameEl = document.getElementById("itemName");
  const quantityEl = document.getElementById("quantity");
  const saveBtn = document.getElementById("saveBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const listEl = document.getElementById("inventoryList");
  const feedbackEl = document.getElementById("feedback");
  const countEl = document.getElementById("count");
  const emptyStateEl = document.getElementById("emptyState");
  const chartCanvas = document.getElementById("inventoryChart");

  if (!itemNameEl || !quantityEl || !saveBtn || !clearAllBtn || !listEl || !feedbackEl || !countEl || !emptyStateEl || !chartCanvas) {
    // If this script is loaded on about.html, it should do nothing.
    return;
  }

  let chart = null;

  // Inventory stored as array to preserve original spelling:
  // { id, name, matchKey, qty }
  let inventory = loadInventory();

  function setFeedback(message, type = "") {
    feedbackEl.textContent = message || "";
    feedbackEl.className = "feedback" + (type ? " " + type : "");
  }

  function normalizeNameDisplay(name) {
    return String(name).trim().replace(/\s+/g, " ");
  }

  // Stronger normalization to catch capitalization + repeated-letter typos like usbbb / Uussb
  function normalizeForMatch(name) {
    const cleaned = String(name).toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!cleaned) return "";
    let out = cleaned[0];
    for (let i = 1; i < cleaned.length; i++) {
      if (cleaned[i] !== cleaned[i - 1]) out += cleaned[i];
    }
    return out;
  }

  // Conservative edit-distance to catch tiny typos beyond repeated letters
  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;

    const dp = new Array(n + 1);
    for (let j = 0; j <= n; j++) dp[j] = j;

    for (let i = 1; i <= m; i++) {
      let prev = dp[0];
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const temp = dp[j];
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[j] = Math.min(
          dp[j] + 1,     // deletion
          dp[j - 1] + 1, // insertion
          prev + cost    // substitution
        );
        prev = temp;
      }
    }
    return dp[n];
  }

  function findDuplicateByFuzzy(matchKey) {
    const exact = inventory.find(it => it.matchKey === matchKey);
    if (exact) return exact;

    for (const it of inventory) {
      const a = matchKey, b = it.matchKey;
      const lenDiff = Math.abs(a.length - b.length);
      if (lenDiff > 2) continue;
      const d = levenshtein(a, b);
      if (d <= 1) return it;
    }
    return null;
  }

  function parseQuantity(raw) {
    // Digits only; 0 allowed; no negatives; no letters; no decimals
    const s = String(raw).trim();
    if (!/^\d+$/.test(s)) return { ok: false, value: null };
    const num = Number(s);
    if (!Number.isFinite(num)) return { ok: false, value: null };
    return { ok: true, value: num };
  }

  function sanitizeInventory(items) {
    const out = [];
    const seen = new Set();

    for (const it of items) {
      if (!it || typeof it !== "object") continue;

      const name = normalizeNameDisplay(it.name ?? "");
      const matchKey = normalizeForMatch(name);
      if (!matchKey) continue;

      if (seen.has(matchKey)) continue;

      const qtyNum = Number(it.qty);
      const qty = Number.isFinite(qtyNum) ? Math.max(0, Math.floor(qtyNum)) : 0;

      seen.add(matchKey);
      out.push({ id: matchKey, name, matchKey, qty });
    }

    return out;
  }

  function loadInventory() {
    // Load v2
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return sanitizeInventory(parsed);
      }
    } catch {}

    // Migrate legacy v1 object
    try {
      const rawLegacy = localStorage.getItem(LEGACY_KEY);
      if (rawLegacy) {
        const parsed = JSON.parse(rawLegacy);
        if (parsed && typeof parsed === "object") {
          const migrated = Object.entries(parsed).map(([k, qty]) => {
            const name = normalizeNameDisplay(k);
            const matchKey = normalizeForMatch(name);
            return {
              id: matchKey || k,
              name,
              matchKey,
              qty: Number.isFinite(Number(qty)) ? Math.max(0, Math.floor(Number(qty))) : 0
            };
          });
          localStorage.removeItem(LEGACY_KEY);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
          return sanitizeInventory(migrated);
        }
      }
    } catch {}

    return [];
  }

  function saveInventory() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inventory));
  }

  function clearInventoryStorage() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  }

  function getSortedEntries() {
    return [...inventory].sort((a, b) => a.name.localeCompare(b.name));
  }

  function colorsForData(values) {
    return values.map(v => (v < LOW_STOCK_THRESHOLD ? "rgba(255, 92, 108, 0.75)" : "rgba(79, 140, 255, 0.75)"));
  }

  function borderColorsForData(values) {
    return values.map(v => (v < LOW_STOCK_THRESHOLD ? "rgba(255, 92, 108, 1)" : "rgba(79, 140, 255, 1)"));
  }

  function initChart() {
    const entries = getSortedEntries();
    const labels = entries.map(e => e.name);
    const data = entries.map(e => e.qty);

    chart = new Chart(chartCanvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: "Quantity",
          data,
          backgroundColor: colorsForData(data),
          borderColor: borderColorsForData(data),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "rgba(255,255,255,0.85)" } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y;
                const flag = v < LOW_STOCK_THRESHOLD ? " (LOW STOCK)" : "";
                return ` ${ctx.dataset.label}: ${v}${flag}`;
              }
            },
            titleColor: "rgba(255,255,255,0.92)",
            bodyColor: "rgba(255,255,255,0.92)"
          }
        },
        scales: {
          x: { ticks: { color: "rgba(255,255,255,0.75)" }, grid: { color: "rgba(255,255,255,0.10)" } },
          y: { beginAtZero: true, ticks: { color: "rgba(255,255,255,0.75)", precision: 0 }, grid: { color: "rgba(255,255,255,0.10)" } }
        }
      }
    });
  }

  function updateChart() {
    const entries = getSortedEntries();
    const labels = entries.map(e => e.name);
    const data = entries.map(e => e.qty);

    if (!chart) {
      initChart();
      return;
    }

    chart.data.labels = labels;
    chart.data.datasets[0].data = data;
    chart.data.datasets[0].backgroundColor = colorsForData(data);
    chart.data.datasets[0].borderColor = borderColorsForData(data);
    chart.update();
  }

  function renderList() {
    listEl.innerHTML = "";

    const entries = getSortedEntries();
    countEl.textContent = String(entries.length);
    emptyStateEl.hidden = entries.length !== 0;

    for (const entry of entries) {
      const li = document.createElement("li");
      li.className = "item";

      const name = document.createElement("div");
      name.className = "item-name";
      name.textContent = entry.name;
      name.title = "Click to load into input for editing";
      name.addEventListener("click", () => {
        itemNameEl.value = entry.name;
        quantityEl.value = String(entry.qty);
        itemNameEl.focus();
        itemNameEl.select();
        setFeedback(`Loaded "${entry.name}" for editing.`, "");
      });

      const controls = document.createElement("div");
      controls.className = "qty-controls";

      const qty = document.createElement("div");
      qty.className = "qty";
      qty.textContent = "Qty: " + entry.qty;

      const minus = document.createElement("button");
      minus.className = "pm";
      minus.type = "button";
      minus.textContent = "−";
      minus.setAttribute("aria-label", "Decrease quantity");

      const stepSelect = document.createElement("select");
      stepSelect.className = "step";
      stepSelect.setAttribute("aria-label", "Step size");
      for (let v = 10; v <= 1000; v += 10) {
        const opt = document.createElement("option");
        opt.value = String(v);
        opt.textContent = `±${v}`;
        stepSelect.appendChild(opt);
      }
      stepSelect.value = "10";

      const plus = document.createElement("button");
      plus.className = "pm";
      plus.type = "button";
      plus.textContent = "+";
      plus.setAttribute("aria-label", "Increase quantity");

      function applyDelta(delta) {
        const idx = inventory.findIndex(it => it.matchKey === entry.matchKey);
        if (idx === -1) return;
        const current = inventory[idx].qty;
        const next = current + delta;
        inventory[idx].qty = Math.max(0, next); // 0 allowed, no negatives
        saveInventory();
        renderAll();
      }

      minus.addEventListener("click", () => {
        const step = Number(stepSelect.value);
        applyDelta(-step);
        setFeedback(`Updated "${entry.name}".`, "success");
      });

      plus.addEventListener("click", () => {
        const step = Number(stepSelect.value);
        applyDelta(step);
        setFeedback(`Updated "${entry.name}".`, "success");
      });

      controls.appendChild(qty);
      controls.appendChild(minus);
      controls.appendChild(stepSelect);
      controls.appendChild(plus);

      const remove = document.createElement("button");
      remove.className = "remove";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", () => {
        inventory = inventory.filter(it => it.matchKey !== entry.matchKey);
        saveInventory();
        renderAll();
        setFeedback("Item removed.", "success");
      });

      li.appendChild(name);
      li.appendChild(controls);
      li.appendChild(remove);

      listEl.appendChild(li);
    }
  }

  function renderAll() {
    renderList();
    updateChart();
  }

  function addOrUpdateItem() {
    const rawName = normalizeNameDisplay(itemNameEl.value);
    if (!rawName) {
      setFeedback("Item Name is required.", "error");
      itemNameEl.focus();
      return;
    }

    const parsed = parseQuantity(quantityEl.value);
    if (!parsed.ok) {
      setFeedback("Quantity must be a number (digits only). 0 is allowed. No negatives/letters/decimals.", "error");
      quantityEl.focus();
      return;
    }

    const matchKey = normalizeForMatch(rawName);
    if (!matchKey) {
      setFeedback("Item Name must contain letters/numbers.", "error");
      itemNameEl.focus();
      return;
    }

    const dup = findDuplicateByFuzzy(matchKey);

    // If it matches an existing item (even via typos), update that item and keep its stored spelling.
    if (dup) {
      const idx = inventory.findIndex(it => it.matchKey === dup.matchKey);
      inventory[idx].qty = Math.floor(parsed.value);
      saveInventory();
      renderAll();
      setFeedback(`Updated existing item "${inventory[idx].name}". (Spelling kept.)`, "success");
      itemNameEl.value = "";
      quantityEl.value = "";
      itemNameEl.focus();
      return;
    }

    // New item; store this spelling as the canonical spelling.
    inventory.push({
      id: matchKey,
      name: rawName,
      matchKey,
      qty: Math.floor(parsed.value)
    });

    saveInventory();
    renderAll();
    setFeedback("Item added.", "success");
    itemNameEl.value = "";
    quantityEl.value = "";
    itemNameEl.focus();
  }

  function clearAllItems() {
    const hadAny = inventory.length > 0;
    inventory = [];
    clearInventoryStorage();

    if (chart) {
      chart.destroy();
      chart = null;
    }

    renderList();
    initChart();

    setFeedback(hadAny ? "All items cleared (list, localStorage, and chart reset)." : "Nothing to clear.", hadAny ? "success" : "");
    itemNameEl.value = "";
    quantityEl.value = "";
    itemNameEl.focus();
  }

  saveBtn.addEventListener("click", addOrUpdateItem);
  clearAllBtn.addEventListener("click", clearAllItems);

  [itemNameEl, quantityEl].forEach((el) => {
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") addOrUpdateItem();
    });
  });

  // Initial render
  renderAll();
})();