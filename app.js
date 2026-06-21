const STORAGE_KEY = "asset-dashboard-state-v1";
const API_CONFIG_KEY = "asset-dashboard-api-config";
const ASSET_HISTORY_KEY = "asset-dashboard-asset-history-v1";
const FX_API_URL = "https://open.er-api.com/v6/latest/TWD";

// Load API configuration from localStorage
function loadApiConfig() {
  const config = localStorage.getItem(API_CONFIG_KEY);
  if (!config) return { finnhubKey: "" };
  try {
    const parsed = JSON.parse(config);
    return { finnhubKey: parsed.finnhubKey || "" };
  } catch {
    return { finnhubKey: "" };
  }
}

const assetForm = document.querySelector("#assetForm");
const assetType = document.querySelector("#assetType");
const assetSymbol = document.querySelector("#assetSymbol");
const assetQuantity = document.querySelector("#assetQuantity");
const quantityFieldLabel = document.querySelector("#quantityFieldLabel");
const symbolField = document.querySelector("#symbolField");
const holdingsList = document.querySelector("#holdingsList");
const refreshBtn = document.querySelector("#refreshBtn");
const fileStatusBar = document.querySelector("#fileStatusBar");
const fileStatusText = document.querySelector("#fileStatusText");
const clearBtn = document.querySelector("#clearBtn");
const statusPill = document.querySelector("#statusPill");
const allocationPieChart = document.querySelector("#allocationPieChart");
const allocationPieLegend = document.querySelector("#allocationPieLegend");
const splitBar = document.querySelector("#splitBar");
const splitLegend = document.querySelector("#splitLegend");
const growthChart = document.querySelector("#growthChart");
const growthChartLegend = document.querySelector("#growthChartLegend");
const totalTwdEl = document.querySelector("#totalTwd");
const totalUsdEl = document.querySelector("#totalUsd");
const fxRateEl = document.querySelector("#fxRate");
const totalTwdHint = document.querySelector("#totalTwdHint");
const totalUsdHint = document.querySelector("#totalUsdHint");
const fxUpdatedAt = document.querySelector("#fxUpdatedAt");
const holdingTemplate = document.querySelector("#holdingTemplate");
const pieTooltip = document.querySelector("#pieTooltip");

const typeLabels = {
  "cash-twd": "Cash / TWD",
  "cash-usd": "Cash / USD",
  "tw-stock": "Taiwan Stock / TWD",
  "tw-etf": "Taiwan ETF / TWD",
  "us-stock": "U.S. Stock / USD",
  "us-etf": "U.S. ETF / USD",
};

const TW_ETF_SYMBOLS = new Set(["0050", "0056", "006208", "00692", "00713", "00878", "00919", "00929", "00940"]);
const US_ETF_SYMBOLS = new Set(["QQQ", "SPY", "VOO", "IVV", "VTI", "DIA", "IWM", "XLK", "SMH", "SOXX", "ARKK", "SCHD", "VT", "BND", "TLT"]);

const LOCAL_APP_URL = "http://localhost:8765/index.html";
const DATA_API_URL = "/api/data";
let backendAvailable = false;

const moneyFormatters = new Map();
const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

const state = loadState();
let assetHistory = loadAssetHistory();
const dragState = {
  holdingId: null,
  draggingRow: null,
  dropRow: null,
  dropAfter: null,
};

function loadState() {
  const fallback = {
    fxRate: null,
    fxUpdatedAt: null,
    holdings: [],
  };

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const holdings = Array.isArray(parsed.holdings) ? parsed.holdings.map(migrateHolding) : [];
    const nextState = {
      fxRate: Number.isFinite(parsed.fxRate) ? parsed.fxRate : null,
      fxUpdatedAt: parsed.fxUpdatedAt ?? null,
      holdings,
    };
    if (JSON.stringify(parsed.holdings || []) !== JSON.stringify(holdings)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    }
    return nextState;
  } catch {
    return fallback;
  }
}

function migrateHolding(holding) {
  const nameMap = {
    "\u53f0\u5e63\u73fe\u91d1": "TWD Cash",
    "\u7f8e\u5143\u73fe\u91d1": "USD Cash",
    "\u53f0\u7a4d\u96fb": "TSMC",
    "\u9d3b\u6d77": "Hon Hai",
  };

  const sourceMap = {
    "\u73fe\u91d1": "Cash",
    "\u7b49\u5f85\u66f4\u65b0": "Waiting for update",
    "\u7121\u6cd5\u53d6\u5f97": "Unavailable",
    "\u8cc7\u6599\u672a\u66f4\u65b0": "No update yet",
    "\u5831\u50f9\u5931\u6557": "Quote failed",
    "\u5831\u50f9\u66f4\u65b0\u5931\u6557": "Failed to update quote",
  };

  return {
    ...holding,
    type: inferHoldingType(holding.type, holding.symbol),
    symbol: String(holding.symbol || "").trim().toUpperCase(),
    name: nameMap[holding.name] || holding.name,
    priceSource: sourceMap[holding.priceSource] || holding.priceSource,
    priceError: holding.priceError ? String(holding.priceError) : null,
  };
}

function updateFileStatusUI() {
  if (backendAvailable) {
    fileStatusText.textContent = "Data source: app/data.json via local server";
    fileStatusBar.style.display = "flex";
  } else {
    fileStatusBar.style.display = "none";
  }
}

async function saveBackendData() {
  if (!backendAvailable) return;
  try {
    const apiConfig = loadApiConfig();
    const data = {
      holdings: state.holdings,
      fxRate: state.fxRate,
      fxUpdatedAt: state.fxUpdatedAt,
      apiConfig,
      savedAt: new Date().toISOString(),
    };
    await fetch(DATA_API_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data, null, 2),
    });
  } catch {
    backendAvailable = false;
    updateFileStatusUI();
  }
}

async function loadBackendData() {
  try {
    const response = await fetch(DATA_API_URL, { cache: "no-store" });
    if (!response.ok) {
      return false;
    }
    const parsed = await response.json();
    if (Array.isArray(parsed.holdings)) {
      state.holdings = parsed.holdings.map(migrateHolding);
      state.fxRate = Number.isFinite(parsed.fxRate) ? parsed.fxRate : null;
      state.fxUpdatedAt = parsed.fxUpdatedAt ?? null;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    if (parsed.apiConfig?.finnhubKey) {
      localStorage.setItem(API_CONFIG_KEY, JSON.stringify({ finnhubKey: parsed.apiConfig.finnhubKey }));
    }
    return true;
  } catch {
    return false;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  void saveBackendData();
}

function setStatus(message, kind = "warm") {
  statusPill.textContent = message;
  statusPill.classList.remove("status-ok", "status-bad", "pill-warm");
  if (kind === "ok") {
    statusPill.classList.add("status-ok");
  } else if (kind === "bad") {
    statusPill.classList.add("status-bad");
  } else {
    statusPill.classList.add("pill-warm");
  }
}

function formatMoney(value, currency = "TWD") {
  if (!moneyFormatters.has(currency)) {
    moneyFormatters.set(
      currency,
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      })
    );
  }
  return moneyFormatters.get(currency).format(value || 0);
}

function formatNumber(value) {
  return numberFormatter.format(value || 0);
}

function formatPercent(value) {
  return `${(value || 0).toFixed(2)}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function toNumber(input) {
  const value = Number.parseFloat(String(input).replaceAll(",", ""));
  return Number.isFinite(value) ? value : 0;
}

function todayTwseDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function normalizeType(type) {
  return typeLabels[type] ? type : "cash-twd";
}

function isCashType(type) {
  return type === "cash-twd" || type === "cash-usd";
}

function isStockType(type) {
  return type === "tw-stock" || type === "us-stock";
}

function isEtfType(type) {
  return type === "tw-etf" || type === "us-etf";
}

function isTwMarketType(type) {
  return type === "tw-stock" || type === "tw-etf";
}

function isUsMarketType(type) {
  return type === "us-stock" || type === "us-etf";
}

function inferHoldingType(type, symbol) {
  const normalizedType = normalizeType(type);
  const normalizedSymbol = String(symbol || "").trim().toUpperCase();

  if (normalizedType === "tw-stock" && TW_ETF_SYMBOLS.has(normalizedSymbol)) {
    return "tw-etf";
  }

  if (normalizedType === "us-stock" && US_ETF_SYMBOLS.has(normalizedSymbol)) {
    return "us-etf";
  }

  return normalizedType;
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadAssetHistory() {
  try {
    const raw = localStorage.getItem(ASSET_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => ({
        date: String(item.date || ""),
        totalAsset: Number(item.totalAsset),
      }))
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.totalAsset))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

function saveAssetHistory() {
  localStorage.setItem(ASSET_HISTORY_KEY, JSON.stringify(assetHistory));
}

function upsertDailyAssetSnapshot(totalAsset) {
  if (!Number.isFinite(totalAsset)) {
    return;
  }

  const today = getTodayLocalDate();
  const existingIndex = assetHistory.findIndex((item) => item.date === today);
  const payload = {
    date: today,
    totalAsset,
  };

  if (existingIndex >= 0) {
    const prev = assetHistory[existingIndex];
    if (Math.abs(prev.totalAsset - totalAsset) < 0.01) {
      return;
    }
    assetHistory[existingIndex] = payload;
  } else {
    assetHistory.push(payload);
    assetHistory.sort((a, b) => a.date.localeCompare(b.date));
  }

  saveAssetHistory();
}

async function refreshFxRate() {
  const response = await fetch(FX_API_URL);
  if (!response.ok) {
    throw new Error("Failed to fetch exchange rate");
  }

  const data = await response.json();
  const usdPerTwd = data?.rates?.USD;
  if (!usdPerTwd) {
    throw new Error("Unexpected exchange rate response format");
  }

  state.fxRate = 1 / usdPerTwd;
  state.fxUpdatedAt = data.time_last_update_utc || new Date().toISOString();
}

async function refreshTaiwanStock(symbol) {
  try {
    const exChannels = [`tse_${symbol}.tw`, `otc_${symbol}.tw`].join("|");
    const realtimeUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(exChannels)}&json=1&delay=0&_=${Date.now()}`;
    const realtimeResponse = await fetch(realtimeUrl, { cache: "no-store" });

    if (realtimeResponse.ok) {
      const realtimeData = await realtimeResponse.json();
      const records = Array.isArray(realtimeData?.msgArray) ? realtimeData.msgArray : [];
      const match = records.find((item) => String(item?.c) === symbol);
      const realtimePrice = toNumber(match?.z || match?.a?.split("_")?.[0] || match?.b?.split("_")?.[0]);

      if (realtimePrice > 0) {
        return {
          price: realtimePrice,
          source: `TWSE Realtime ${match?.t || "Live"}`,
        };
      }
    }
  } catch {
    // Fall back to daily endpoint when realtime is unavailable.
  }

  const dailyUrl = `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${todayTwseDate()}&stockNo=${encodeURIComponent(symbol)}`;
  const dailyResponse = await fetch(dailyUrl);
  if (!dailyResponse.ok) {
    throw new Error(`Failed to fetch Taiwan stock quote for ${symbol}`);
  }

  const dailyData = await dailyResponse.json();
  if (dailyData.stat !== "OK" || !Array.isArray(dailyData.data) || dailyData.data.length === 0) {
    throw new Error(`No available trading data for Taiwan stock ${symbol}`);
  }

  const latestRow = dailyData.data[dailyData.data.length - 1];
  return {
    price: toNumber(latestRow[6]),
    source: `TWSE Daily ${latestRow[0]}`,
  };
}

async function refreshUsStock(symbol) {
  const apiConfig = loadApiConfig();

  try {
    const finnhubKey = apiConfig.finnhubKey || "demo";
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubKey}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.c && data.c > 0) {
        return {
          price: data.c,
          source: `Finnhub ${data.t ? new Date(data.t * 1000).toLocaleString("en-US") : "Live"}`,
        };
      }
    }
  } catch (e) {
    console.log(`Finnhub API failed for ${symbol}:`, e.message);
  }

  const msg = `Could not fetch live price for ${symbol}. 
  
SOLUTION: Configure your Finnhub key in localStorage:
  
1. Finnhub (best for ETFs): finnhub.io/register (free tier)
   In console: localStorage.setItem('asset-dashboard-api-config', JSON.stringify({finnhubKey: 'YOUR_KEY'}))`;
  
  throw new Error(msg);
}

function renderGrowthChart() {
  const chartWidth = 760;
  const chartHeight = 300;
  const padding = { top: 24, right: 22, bottom: 38, left: 64 };
  const points = assetHistory.slice(-90);

  if (points.length < 2) {
    growthChart.innerHTML = `
      <rect x="0" y="0" width="${chartWidth}" height="${chartHeight}" rx="24" fill="rgba(0,217,196,0.02)" />
      <text x="50%" y="50%" text-anchor="middle" fill="rgba(160,181,212,0.55)" font-size="16">Need at least 2 days of snapshots to draw growth curve</text>
    `;
    growthChartLegend.textContent = points.length === 1 ? `Current snapshot: ${points[0].date}` : "No snapshots yet";
    return;
  }

  const minValue = Math.min(...points.map((p) => p.totalAsset));
  const maxValue = Math.max(...points.map((p) => p.totalAsset));
  const range = Math.max(maxValue - minValue, 1);
  const xSpan = chartWidth - padding.left - padding.right;
  const ySpan = chartHeight - padding.top - padding.bottom;

  // Add 30% padding to prevent curve from hitting edges
  const paddedRange = range * 1.3;
  const rangeOffset = (paddedRange - range) / 2;
  const topBound = padding.top + 20;
  const bottomBound = chartHeight - padding.bottom - 20;
  const availableYSpan = bottomBound - topBound;

  const mapped = points.map((p, index) => {
    const x = padding.left + (xSpan * index) / (points.length - 1);
    let y = topBound + ((maxValue + rangeOffset - p.totalAsset) / paddedRange) * availableYSpan;
    // Clamp y to valid range
    y = Math.max(topBound, Math.min(bottomBound, y));
    return { ...p, x, y };
  });

  const path = mapped.map((p, index) => `${index === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const area = `${path} L ${mapped[mapped.length - 1].x.toFixed(2)} ${bottomBound.toFixed(2)} L ${mapped[0].x.toFixed(2)} ${bottomBound.toFixed(2)} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = maxValue + rangeOffset - paddedRange * ratio;
    const y = topBound + availableYSpan * ratio;
    return {
      y,
      label: formatMoney(value, "TWD"),
    };
  });

  growthChart.innerHTML = `
    <defs>
      <clipPath id="chartClip">
        <rect x="${padding.left}" y="${padding.top}" width="${chartWidth - padding.left - padding.right}" height="${chartHeight - padding.top - padding.bottom}" rx="20" />
      </clipPath>
    </defs>
    <rect x="0" y="0" width="${chartWidth}" height="${chartHeight}" rx="24" fill="rgba(0,217,196,0.02)" />
    <g clip-path="url(#chartClip)">
      ${yTicks
        .map(
          (tick) => `
        <line x1="${padding.left}" y1="${tick.y.toFixed(2)}" x2="${chartWidth - padding.right}" y2="${tick.y.toFixed(2)}" stroke="rgba(0,217,196,0.06)" stroke-width="1" />
      `
        )
        .join("")}
      <path d="${area}" fill="rgba(0, 217, 196, 0.12)" />
      <path d="${path}" stroke="#00d9c4" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round" />
      <circle cx="${mapped[mapped.length - 1].x.toFixed(2)}" cy="${mapped[mapped.length - 1].y.toFixed(2)}" r="5" fill="#0099ff" />
    </g>
    <text x="${padding.left}" y="${chartHeight - 12}" fill="rgba(160,181,212,0.6)" font-size="11">${points[0].date}</text>
    <text x="${chartWidth - padding.right}" y="${chartHeight - 12}" text-anchor="end" fill="rgba(160,181,212,0.6)" font-size="11">${points[points.length - 1].date}</text>
  `;

  const first = points[0].totalAsset;
  const last = points[points.length - 1].totalAsset;
  const growth = first ? ((last - first) / first) * 100 : 0;
  growthChartLegend.textContent = `Last ${points.length} days: ${formatMoney(first, "TWD")} -> ${formatMoney(last, "TWD")} (${growth >= 0 ? "+" : ""}${growth.toFixed(2)}%)`;
}

async function refreshHoldingQuote(holding) {
  if (isCashType(holding.type)) {
    return holding;
  }

  try {
    const result = isTwMarketType(holding.type) ? await refreshTaiwanStock(holding.symbol) : await refreshUsStock(holding.symbol);

    return {
      ...holding,
      lastPrice: result.price || holding.lastPrice || null,
      priceSource: result.source,
      priceError: null,
    };
  } catch (error) {
    return {
      ...holding,
      lastPrice: holding.lastPrice || null,
      priceError: error instanceof Error ? error.message : "Failed to update quote",
      priceSource: holding.priceSource || "Unavailable",
    };
  }
}

function computeRows() {
  const fxRate = state.fxRate || 0;
  let totalTwd = 0;
  let stockTwd = 0;
  let etfTwd = 0;
  let cashTwd = 0;

  const computed = state.holdings.map((holding) => {
    let nativeValue = 0;
    let valueTwd = 0;
    let price = null;
    let priceCurrency = "TWD";
    let source = holding.priceSource || "No update yet";

    if (holding.type === "cash-twd") {
      nativeValue = holding.quantity;
      valueTwd = holding.quantity;
      price = 1;
      priceCurrency = "TWD";
      source = "Cash";
    } else if (holding.type === "cash-usd") {
      nativeValue = holding.quantity;
      valueTwd = holding.quantity * fxRate;
      price = 1;
      priceCurrency = "USD";
      source = "Cash";
    } else if (isTwMarketType(holding.type)) {
      price = holding.lastPrice || 0;
      priceCurrency = "TWD";
      nativeValue = holding.quantity * price;
      valueTwd = nativeValue;
    } else if (isUsMarketType(holding.type)) {
      price = holding.lastPrice || 0;
      priceCurrency = "USD";
      nativeValue = holding.quantity * price;
      valueTwd = nativeValue * fxRate;
    }

    totalTwd += valueTwd;
    if (isCashType(holding.type)) {
      cashTwd += valueTwd;
    } else if (isEtfType(holding.type)) {
      etfTwd += valueTwd;
    } else if (isStockType(holding.type)) {
      stockTwd += valueTwd;
    }

    return {
      ...holding,
      price,
      priceCurrency,
      source,
      nativeValue,
      valueTwd,
    };
  });

  const totalUsd = fxRate ? totalTwd / fxRate : 0;

  return { computed, totalTwd, totalUsd, stockTwd, etfTwd, cashTwd };
}

function buildRenderSnapshot() {
  return computeRows();
}

function renderSummary(snapshot) {
  const { totalTwd, totalUsd } = snapshot;

  totalTwdEl.textContent = formatMoney(totalTwd, "TWD");
  totalUsdEl.textContent = state.fxRate ? formatMoney(totalUsd, "USD") : "—";
  fxRateEl.textContent = state.fxRate ? formatNumber(state.fxRate) : "—";
  totalTwdHint.textContent = `${state.holdings.length} positions, all converted to TWD`;
  totalUsdHint.textContent = state.fxRate ? `Rate: 1 USD = ${formatNumber(state.fxRate)} TWD` : "No exchange rate yet";
  fxUpdatedAt.textContent = state.fxUpdatedAt ? `Updated: ${new Date(state.fxUpdatedAt).toLocaleString("en-US")}` : "Not updated yet";
}

function renderAllocationPie(snapshot) {
  const { computed, totalTwd } = snapshot;
  const palette = ["#4dd6c4", "#35a7ff", "#f2b95b", "#f08a4b", "#7ac7ff", "#8ddf8f", "#ff9f9f", "#9f9dff", "#7ed4c5", "#ffd27f"];
  const positions = computed
    .filter((item) => item.valueTwd > 0)
    .sort((a, b) => b.valueTwd - a.valueTwd)
    .map((item, index) => ({
      ...item,
      label: item.symbol || item.name,
      color: palette[index % palette.length],
    }));

  if (totalTwd <= 0) {
    allocationPieChart.innerHTML = `
      <rect x="0" y="0" width="760" height="360" rx="24" fill="rgba(0,217,196,0.02)" />
      <text x="50%" y="50%" text-anchor="middle" fill="rgba(160,181,212,0.55)" font-size="16">Add assets to display the pie chart</text>
    `;
    allocationPieLegend.innerHTML = `<div class="mini-empty">There is not enough asset data yet.</div>`;
    return;
  }

  const cx = 200;
  const cy = 175;
  const radius = 140;
  const circumference = 2 * Math.PI * radius;
  let accumulated = 0;
  const segments = [];

  for (const position of positions) {
    const ratio = position.valueTwd / totalTwd;
    const dash = circumference * ratio;
    const gap = circumference - dash;
    const offset = circumference * (1 - accumulated);
    accumulated += ratio;

    const percent = (position.valueTwd / totalTwd) * 100;
    const tipLabel = position.type.startsWith("cash") ? position.name : position.label;
    const tipText = `${escapeHtml(tipLabel)}: ${formatMoney(position.valueTwd, "TWD")} (${formatPercent(percent)})`;

    segments.push(`
      <circle
        cx="${cx}"
        cy="${cy}"
        r="${radius}"
        fill="none"
        stroke="${position.color}"
        stroke-width="55"
        stroke-dasharray="${dash} ${gap}"
        stroke-dashoffset="${offset}"
        transform="rotate(-90 ${cx} ${cy})"
        style="pointer-events:stroke;cursor:pointer"
        data-tip="${tipText}"
      />
    `);
  }

  const centerLabel = formatMoney(totalTwd, "TWD");
  allocationPieChart.innerHTML = `
    <rect x="0" y="0" width="760" height="360" rx="24" fill="rgba(0,217,196,0.02)" />
    <g>${segments.join("")}</g>
    <circle cx="${cx}" cy="${cy}" r="80" fill="rgba(8, 16, 28, 0.95)" />
    <text x="${cx}" y="${cy - 12}" text-anchor="middle" fill="#f0f5ff" font-size="18" font-weight="700">Total</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="#f0f5ff" font-size="16">${centerLabel}</text>
  `;

  allocationPieLegend.innerHTML = positions
    .map((position) => {
      const percent = (position.valueTwd / totalTwd) * 100;
      const label = position.type.startsWith("cash") ? `${position.name} (${typeLabels[position.type]})` : `${position.label} (${typeLabels[position.type]})`;
      return `
        <div class="allocation-row">
          <div class="allocation-head">
            <strong><span class="legend-dot" style="background:${position.color}"></span>${escapeHtml(label)}</strong>
            <span>${formatMoney(position.valueTwd, "TWD")}</span>
          </div>
          <div class="allocation-bar"><i style="width:${Math.min(percent, 100)}%; background:${position.color}"></i></div>
          <div class="allocation-meta">
            <span>Share</span>
            <strong>${formatPercent(percent)}</strong>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderHoldings(snapshot) {
  const { computed, totalTwd } = snapshot;
  holdingsList.innerHTML = "";

  if (computed.length === 0) {
    holdingsList.innerHTML = `
      <div class="empty-state">
        No assets yet.<br />
        Add cash, stocks, or ETFs to start tracking your portfolio.
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const holding of computed) {
    const row = holdingTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = holding.id;
    row.draggable = true;

    row.querySelector('[data-role="name"]').textContent = holding.name;
    row.querySelector('[data-role="type"]').textContent = typeLabels[holding.type];
    const usesQuantity = !isCashType(holding.type);
    row.querySelector('[data-role="quantity-label"]').textContent = usesQuantity ? "Quantity" : "Amount";
    row.querySelector('[data-role="quantity"]').textContent = isCashType(holding.type)
      ? formatMoney(holding.quantity, holding.type === "cash-usd" ? "USD" : "TWD")
      : usesQuantity
        ? `${formatNumber(holding.quantity)} shares`
        : formatNumber(holding.quantity);
    row.querySelector('[data-role="price"]').textContent =
      isCashType(holding.type) ? (holding.type === "cash-usd" ? "USD Cash" : "TWD Cash") : `${formatMoney(holding.price || 0, holding.priceCurrency)}`;
    row.querySelector('[data-role="value-twd"]').textContent = formatMoney(holding.valueTwd, "TWD");
    row.querySelector('[data-role="allocation"]').textContent = totalTwd > 0 ? formatPercent((holding.valueTwd / totalTwd) * 100) : "—";

    const qtyLabelEl = row.querySelector('[data-role="qty-label"]');
    const qtyInput = row.querySelector('[data-action="edit-quantity"]');

    qtyLabelEl.textContent = usesQuantity ? "Quantity" : "Amount";
    qtyInput.value = String(holding.quantity ?? "");
    qtyInput.placeholder = usesQuantity ? "Shares" : "Amount";

    fragment.appendChild(row);
  }

  holdingsList.appendChild(fragment);
}

function updateHoldingQuantity(holdingId, nextQty) {
  const targetHolding = state.holdings.find((item) => item.id === holdingId);
  if (!targetHolding) {
    return;
  }

  const fieldName = isCashType(targetHolding.type) ? "Amount" : "Quantity";

  if (nextQty <= 0) {
    setStatus(`${fieldName} must be greater than 0`, "bad");
    return;
  }

  state.holdings = state.holdings.map((item) =>
    item.id === holdingId
      ? {
          ...item,
          quantity: nextQty,
        }
      : item
  );

  saveState();
  render();
  setStatus(`${targetHolding.name} ${fieldName.toLowerCase()} updated`, "ok");
}

function reorderHoldings(draggedId, targetId, insertAfter = false) {
  if (!draggedId || !targetId || draggedId === targetId) {
    return false;
  }

  const next = [...state.holdings];
  const fromIndex = next.findIndex((item) => item.id === draggedId);
  const targetIndex = next.findIndex((item) => item.id === targetId);
  if (fromIndex < 0 || targetIndex < 0) {
    return false;
  }

  const [moved] = next.splice(fromIndex, 1);
  let toIndex = targetIndex + (insertAfter ? 1 : 0);
  if (fromIndex < toIndex) {
    toIndex -= 1;
  }

  next.splice(toIndex, 0, moved);
  state.holdings = next;
  return true;
}

function clearDropIndicator() {
  if (!dragState.dropRow) {
    return;
  }

  dragState.dropRow.classList.remove("drop-before", "drop-after");
  dragState.dropRow = null;
  dragState.dropAfter = null;
}

function updateDropIndicator(row, insertAfter) {
  if (dragState.dropRow === row && dragState.dropAfter === insertAfter) {
    return;
  }

  if (dragState.dropRow && dragState.dropRow !== row) {
    dragState.dropRow.classList.remove("drop-before", "drop-after");
  }

  row.classList.remove("drop-before", "drop-after");
  row.classList.add(insertAfter ? "drop-after" : "drop-before");
  dragState.dropRow = row;
  dragState.dropAfter = insertAfter;
}

function renderSplitBar(snapshot) {
  const { totalTwd, stockTwd, etfTwd, cashTwd } = snapshot;

  if (totalTwd <= 0) {
    splitBar.innerHTML = `<div class="split-bar-empty">No data yet</div>`;
    splitLegend.innerHTML = "";
    return;
  }

  const stockPct = (stockTwd / totalTwd) * 100;
  const etfPct = (etfTwd / totalTwd) * 100;
  const cashPct = (cashTwd / totalTwd) * 100;

  splitBar.innerHTML = `
    <div class="split-bar-track">
      <div class="split-bar-segment stock" style="width:${stockPct.toFixed(2)}%" title="Stock ${stockPct.toFixed(1)}%"></div>
      <div class="split-bar-segment etf" style="width:${etfPct.toFixed(2)}%" title="ETF ${etfPct.toFixed(1)}%"></div>
      <div class="split-bar-segment cash" style="width:${cashPct.toFixed(2)}%" title="Cash ${cashPct.toFixed(1)}%"></div>
    </div>
  `;

  splitLegend.innerHTML = `
    <div class="split-legend-item">
      <span class="split-dot stock"></span>
      <span>Stock</span>
      <strong>${formatPercent(stockPct)}</strong>
      <span class="split-amount">${formatMoney(stockTwd, "TWD")}</span>
    </div>
    <div class="split-legend-item">
      <span class="split-dot etf"></span>
      <span>ETF</span>
      <strong>${formatPercent(etfPct)}</strong>
      <span class="split-amount">${formatMoney(etfTwd, "TWD")}</span>
    </div>
    <div class="split-legend-item">
      <span class="split-dot cash"></span>
      <span>Cash</span>
      <strong>${formatPercent(cashPct)}</strong>
      <span class="split-amount">${formatMoney(cashTwd, "TWD")}</span>
    </div>
  `;
}

function render() {
  const snapshot = buildRenderSnapshot();
  upsertDailyAssetSnapshot(snapshot.totalTwd);
  renderSummary(snapshot);
  renderAllocationPie(snapshot);
  renderSplitBar(snapshot);
  renderGrowthChart();
  renderHoldings(snapshot);
}

function updateFormVisibility() {
  const type = normalizeType(assetType.value);
  const isCash = isCashType(type);
  const usesQuantity = !isCash;
  symbolField.style.display = isCash ? "none" : "grid";
  quantityFieldLabel.textContent = usesQuantity ? "Quantity" : "Amount";
  assetSymbol.required = !isCash;
  assetQuantity.placeholder = usesQuantity ? "e.g. 100" : "e.g. 50000";
}

async function refreshAllData() {
  setStatus("Updating data...");

  const refreshWork = [
    refreshFxRate().catch((error) => {
      state.fxRate = state.fxRate || null;
      state.fxUpdatedAt = state.fxUpdatedAt || null;
      setStatus(error instanceof Error ? error.message : "Failed to update exchange rate", "bad");
    }),
    Promise.all(state.holdings.map((holding) => refreshHoldingQuote(holding))),
  ];

  const [, updatedHoldings] = await Promise.all(refreshWork);
  state.holdings = updatedHoldings;
  saveState();
  render();

  const hasErrors = state.holdings.some((item) => item.priceError);
  setStatus(hasErrors ? "Some quotes failed, but available data was kept" : "Data updated", hasErrors ? "bad" : "ok");
}

assetType.addEventListener("change", updateFormVisibility);
assetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const type = normalizeType(assetType.value);
  const isCash = isCashType(type);
  const symbol = isCash ? "" : assetSymbol.value.trim().toUpperCase();
  const quantity = toNumber(assetQuantity.value);

  if (quantity <= 0 || (!isCash && !symbol)) {
    setStatus(isCash ? "Please enter an amount" : "Please enter a symbol and quantity", "bad");
    return;
  }

  const name = isCash 
    ? (type === "cash-twd" ? "TWD Cash" : "USD Cash")
    : symbol;

  const newHolding = {
    id: createId(),
    type,
    name,
    symbol,
    quantity,
    lastPrice: null,
    priceSource: isCash ? "Cash" : "Waiting for update",
  };

  state.holdings.unshift(newHolding);

  if (!isCash) {
    setStatus(`Added ${name}, fetching quote...`);
    const updated = await refreshHoldingQuote(newHolding);
    state.holdings = state.holdings.map((item) => (item.id === newHolding.id ? updated : item));
  }

  saveState();
  assetForm.reset();
  assetType.value = type;
  updateFormVisibility();
  render();
  if (isCash) {
    setStatus(`Added ${name}`, "ok");
  } else {
    const justAdded = state.holdings.find((item) => item.id === newHolding.id);
    const hasQuoteError = Boolean(justAdded?.priceError);
    setStatus(hasQuoteError ? `${name} added, quote update failed` : `${name} added and quote updated`, hasQuoteError ? "bad" : "ok");
  }
});

refreshBtn.addEventListener("click", () => {
  void refreshAllData();
});

holdingsList.addEventListener("click", (event) => {
  const actionEl = event.target.closest("[data-action]");
  if (!actionEl) {
    return;
  }

  const row = actionEl.closest(".holding-row");
  const holdingId = row?.dataset.id;
  if (!holdingId) {
    return;
  }

  if (actionEl.dataset.action === "remove") {
    state.holdings = state.holdings.filter((item) => item.id !== holdingId);
    saveState();
    render();
    return;
  }

  if (actionEl.dataset.action === "update-quantity") {
    const qtyInput = row.querySelector('[data-action="edit-quantity"]');
    updateHoldingQuantity(holdingId, toNumber(qtyInput.value));
  }
});

holdingsList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.target.dataset.action !== "edit-quantity") {
    return;
  }

  event.preventDefault();
  const row = event.target.closest(".holding-row");
  const holdingId = row?.dataset.id;
  if (!holdingId) {
    return;
  }

  updateHoldingQuantity(holdingId, toNumber(event.target.value));
});

holdingsList.addEventListener("dragstart", (event) => {
  const row = event.target.closest(".holding-row");
  const control = event.target.closest("input, select, textarea, button");
  if (!row || control) {
    event.preventDefault();
    return;
  }

  dragState.holdingId = row.dataset.id;
  if (!dragState.holdingId) {
    event.preventDefault();
    return;
  }

  dragState.draggingRow = row;
  row.classList.add("dragging");
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", dragState.holdingId);
});

holdingsList.addEventListener("dragover", (event) => {
  if (!dragState.holdingId) {
    return;
  }

  const row = event.target.closest(".holding-row");
  if (!row || row.dataset.id === dragState.holdingId) {
    return;
  }

  event.preventDefault();
  const rect = row.getBoundingClientRect();
  const insertAfter = event.clientY >= rect.top + rect.height / 2;
  updateDropIndicator(row, insertAfter);
  event.dataTransfer.dropEffect = "move";
});

holdingsList.addEventListener("drop", (event) => {
  if (!dragState.holdingId) {
    return;
  }

  event.preventDefault();
  const row = event.target.closest(".holding-row");

  let moved = false;
  if (row && row.dataset.id && row.dataset.id !== dragState.holdingId) {
    const rect = row.getBoundingClientRect();
    const insertAfter = event.clientY >= rect.top + rect.height / 2;
    moved = reorderHoldings(dragState.holdingId, row.dataset.id, insertAfter);
  }

  if (moved) {
    saveState();
    render();
    setStatus("Holdings order updated", "ok");
  }

  clearDropIndicator();
  dragState.holdingId = null;
  dragState.draggingRow = null;
});

holdingsList.addEventListener("dragend", () => {
  if (dragState.draggingRow) {
    dragState.draggingRow.classList.remove("dragging");
  }
  clearDropIndicator();
  dragState.holdingId = null;
  dragState.draggingRow = null;
});

allocationPieChart.addEventListener("mousemove", (event) => {
  const slice = event.target.closest("[data-tip]");
  if (!slice || !pieTooltip) {
    return;
  }

  const rect = allocationPieChart.getBoundingClientRect();
  pieTooltip.textContent = slice.dataset.tip;
  pieTooltip.style.left = `${event.clientX - rect.left + 14}px`;
  pieTooltip.style.top = `${event.clientY - rect.top - 10}px`;
  pieTooltip.style.display = "block";
});

allocationPieChart.addEventListener("mouseleave", () => {
  if (pieTooltip) {
    pieTooltip.style.display = "none";
  }
});

clearBtn.addEventListener("click", () => {
  state.holdings = [];
  state.fxRate = null;
  state.fxUpdatedAt = null;
  saveState();
  render();
  setStatus("All data cleared", "ok");
});

async function initializeApp() {
  updateFormVisibility();
  render();

  if (location.protocol.startsWith("http")) {
    backendAvailable = await loadBackendData();
    updateFileStatusUI();
    if (backendAvailable) {
      render();
      setStatus("Connected to local data.json", "ok");
      void refreshAllData();
      return;
    }
  }

  setStatus(state.holdings.length ? "Data loaded" : "Add assets to get started", state.holdings.length ? "ok" : "warm");
  void refreshAllData();
}

void initializeApp();
