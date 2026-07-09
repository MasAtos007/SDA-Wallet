// =====================================
// LP MODAL
// =====================================

window.lpState = {
    token0:      "native",
    token1:      null,
    fee:         3000,
    slippage:    0.5,
    fullRange:   true,
    priceMode:   "auto",   // "auto" | "manual"
    manualPrice: null,
    // harga aktual token0/token1 setelah sort
    // dipakai untuk custom range tick conversion
    currentPrice: 0
};


// =====================================
// LOGO PATH HELPER (sama dengan riwayat.js)
// =====================================
function normalizeLogo(raw, fallback) {
    if (!raw || typeof raw !== "string" || raw.trim() === "") return fallback || "img/sda.png";
    if (raw.startsWith("img/"))  return raw;
    if (raw.startsWith("http"))  return raw;
    if (!raw.includes("/"))      return "img/" + raw;
    return raw;
}


// =====================================
// OPEN / CLOSE
// =====================================
function openLPModal() {
    const modal = document.getElementById("lpModal");
    if (!modal) return;
    modal.classList.add("show");
    initLP();
}

function closeLPModal() {
    document.getElementById("lpModal")?.classList.remove("show");
}


// =====================================
// INIT
// =====================================
function initLP() {
    lpState.token0       = "native";
    lpState.token1       = null;
    lpState.currentPrice = 0;

    const symbolEl = document.getElementById("lpToken1Symbol");
    const iconBox  = document.getElementById("lpToken1IconBox");

    if (symbolEl) symbolEl.innerText = "Select token";
    if (iconBox)  iconBox.innerHTML  = '<i class="fa-solid fa-magnifying-glass"></i>';

    updateLPUI();
}


// =====================================
// TOKEN DATA HELPER
// =====================================
function getLPToken(addr) {
    if (!addr || addr === "native") return { symbol: "SDA", logo: "img/sda.png" };

    const t = (window.TOKENS || []).find(x => x.address === addr);
    return {
        symbol: t?.symbol || "???",
        logo:   t?.logo   || "img/default.png"
    };
}


// =====================================
// PAIR DISPLAY â€” selalu pakai urutan UI
// (token0 = yang user pilih di atas)
// =====================================
function updatePairUI() {
    const el = document.getElementById("lpPairInfo");
    if (!el) return;

    const a = getLPToken(lpState.token0).symbol;
    const b = getLPToken(lpState.token1).symbol;

    el.innerText = `${a} / ${b}`;
}


// =====================================
// UPDATE UI
// =====================================
async function updateLPUI() {

    // Token A
    const t0       = getLPToken(lpState.token0);
    const el0Sym   = document.querySelector("#lpToken0Select span");
    const el0Icon  = document.querySelector("#lpToken0Select img");
    if (el0Sym)  el0Sym.innerText = t0.symbol;
    if (el0Icon) el0Icon.src      = t0.logo;

    // Token B
    const symbolEl = document.getElementById("lpToken1Symbol");
    const iconBox  = document.getElementById("lpToken1IconBox");

    if (symbolEl && iconBox) {
        if (!lpState.token1) {
            symbolEl.innerText = "Select token";
            iconBox.innerHTML  = '<i class="fa-solid fa-magnifying-glass"></i>';
        } else {
            const t = getLPToken(lpState.token1);
            symbolEl.innerText = t.symbol;
            iconBox.innerHTML  = `<img src="${t.logo}" onerror="this.src='img/default.png'">`;
        }
    }

    await updateLPBalance();
    await updateLPPrice();
}


// =====================================
// PRICE ENGINE CALL
// Selalu pakai WSDA sebagai proxy SDA
// Harga yang dikembalikan = token0/token1
// dalam urutan UI (bukan sorted order)
// =====================================
async function fetchLPPrice() {
    if (!lpState.token1) return 0;

    const t0 = lpState.token0 === "native" ? window.CONFIG.WSDA : lpState.token0;
    const t1 = lpState.token1;

    try {
        const price = await window.PRICE_ENGINE.getPrice(t0, t1);
        return (typeof price === "number" && isFinite(price) && price > 0) ? price : 0;
    } catch {
        return 0;
    }
}


// =====================================
// SYNC POOL DATA + RANGE
// =====================================
async function syncPoolData() {
    if (!lpState.token1) return;

    const statusEl  = document.getElementById("lpPoolStatus");
    const manualBox = document.getElementById("lpManualPriceBox");
    const rangeBox  = document.getElementById("lpCustomRange");
    const minEl     = document.getElementById("lpMinPrice");
    const maxEl     = document.getElementById("lpMaxPrice");

    const price = await fetchLPPrice();

    // ==========================
    // POOL TIDAK AKTIF
    // ==========================
    if (!price) {
        lpState.priceMode    = "manual";
        lpState.currentPrice = 0;

        if (statusEl)  statusEl.innerText = "Pool belum aktif - set harga manual";
        if (manualBox) manualBox.style.display = "block";

        const initialPriceCard = document.getElementById("lpInitialPriceCard");
        if (initialPriceCard) initialPriceCard.style.display = "block";

        setLPPriceUI(0);
        updatePairUI();

        const inputB = document.getElementById("lpAmount1");
        if (inputB) inputB.value = "";
        return;
    }

    // ==========================
    // POOL AKTIF
    // ==========================
    lpState.priceMode    = "auto";
    lpState.currentPrice = price;

    if (statusEl)  statusEl.innerText = "Pool aktif - auto price";
    if (manualBox) manualBox.style.display = "none";

    const initialPriceCard = document.getElementById("lpInitialPriceCard");
    if (initialPriceCard) initialPriceCard.style.display = "none";
    const manualInput = document.getElementById("lpManualPrice");
    if (manualInput) manualInput.value = "";
    lpState.manualPrice = null;

    updatePairUI();
    setLPPriceUI(price);

    // RANGE
    if (rangeBox) {
        rangeBox.style.display = lpState.fullRange ? "none" : "block";
    }

    if (lpState.fullRange) {
        // reset range inputs
        if (minEl) { minEl.value = ""; delete minEl.dataset.userEdited; }
        if (maxEl) { maxEl.value = ""; delete maxEl.dataset.userEdited; }
    } else {
        // auto-fill hanya kalau user belum edit manual
        const userEdited = minEl?.dataset.userEdited === "1" || maxEl?.dataset.userEdited === "1";
        if (!userEdited) fillAutoRange(price);
    }

    // sync amount B dari amount A yang sudah ada
    await syncAmountFromPrice(price);
}


// =====================================
// PRICE UI
// =====================================
function setLPPriceUI(price) {
    const el = document.getElementById("lpPriceInfo");
    if (!el) return;

    if (!price || price === 0) {
        el.innerText = "Price: -";
        return;
    }

    const sym0 = getLPToken(lpState.token0).symbol;
    const sym1 = getLPToken(lpState.token1).symbol;
    el.innerText = `Price: 1 ${sym0} = ${price.toFixed(6)} ${sym1}`;
}


async function updateLPPrice() {
    const price = await fetchLPPrice();
    lpState.currentPrice = price;
    setLPPriceUI(price);
}


// =====================================
// AUTO RANGE â€” 5% di atas/bawah harga
// =====================================
function fillAutoRange(price) {
    if (!price) return;

    const minEl = document.getElementById("lpMinPrice");
    const maxEl = document.getElementById("lpMaxPrice");
    if (!minEl || !maxEl) return;

    minEl.value = (price * 0.95).toFixed(6);
    maxEl.value = (price * 1.05).toFixed(6);
}


// =====================================
// SYNC AMOUNT B dari AMOUNT A
// =====================================
async function syncAmountFromPrice(price) {
    const inputA = document.getElementById("lpAmount0");
    const inputB = document.getElementById("lpAmount1");
    if (!inputA || !inputB) return;

    const valA = parseFloat(inputA.value || 0);
    if (!valA || !price) { inputB.value = ""; return; }

    // Full range — rasio 1:1 berdasarkan harga
    if (lpState.fullRange) {
        inputB.value = (valA * price).toFixed(6);
        return;
    }

    // Custom range — hitung rasio V3
    // Formula: amount1 = amount0 * price * liquidityRatio
    // liquidityRatio = (sqrt(P) - sqrt(Pa)) / (1/sqrt(Pb) - 1/sqrt(P))
    // Sumber: Uniswap V3 whitepaper
    const minPrice = parseFloat(document.getElementById("lpMinPrice")?.value || 0);
    const maxPrice = parseFloat(document.getElementById("lpMaxPrice")?.value || 0);

    // Fallback ke full range kalau range belum diisi atau tidak valid
    if (!minPrice || !maxPrice || minPrice >= maxPrice || price <= minPrice || price >= maxPrice) {
        inputB.value = (valA * price).toFixed(6);
        return;
    }

    const sqrtP  = Math.sqrt(price);
    const sqrtPa = Math.sqrt(minPrice);
    const sqrtPb = Math.sqrt(maxPrice);

    // Liquidity dari amount0 (token atas)
    // L = amount0 / (1/sqrt(P) - 1/sqrt(Pb))
    const L = valA / (1 / sqrtP - 1 / sqrtPb);

    // amount1 dari L
    // amount1 = L * (sqrt(P) - sqrt(Pa))
    const amount1 = L * (sqrtP - sqrtPa);

    if (!isFinite(amount1) || amount1 <= 0) {
        inputB.value = (valA * price).toFixed(6);
        return;
    }

    inputB.value = amount1.toFixed(6);
}


// =====================================
// TICK DARI HARGA
// Harga yang masuk adalah price dalam
// skala token0/token1 (UI order)
// Kita harus sesuaikan dengan sorted order
// yang dipakai pool
// =====================================
function priceToTick(price) {
    if (!price || price <= 0) return 0;
    return Math.floor(Math.log(price) / Math.log(1.0001));
}

function getFullRangeTicks(fee) {
    const spacing = { 500: 10, 3000: 60, 10000: 200 }[fee] || 60;
    const MIN_TICK = -887272;
    const MAX_TICK =  887272;
    return {
        tickLower: Math.ceil(MIN_TICK / spacing) * spacing,
        tickUpper: Math.floor(MAX_TICK / spacing) * spacing
    };
}

function getCustomRangeTicks(minPrice, maxPrice, fee, isSwapped) {
    const spacing = { 500: 10, 3000: 60, 10000: 200 }[fee] || 60;

    // Kalau token urutan di pool ter-swap relatif ke UI,
    // harga min/max perlu di-invert
    let lo = minPrice;
    let hi = maxPrice;

    if (isSwapped) {
        lo = 1 / maxPrice;
        hi = 1 / minPrice;
    }

    const rawLower = priceToTick(lo);
    const rawUpper = priceToTick(hi);

    const tickLower = Math.floor(rawLower / spacing) * spacing;
    const tickUpper = Math.floor(rawUpper / spacing) * spacing;

    return { tickLower, tickUpper };
}


// =====================================
// BALANCE
// =====================================
async function updateLPBalance() {
    const w = getSelectedWallet?.();
    if (!w) return;

    const el0 = document.getElementById("lpBalance0");
    const el1 = document.getElementById("lpBalance1");

    try {
        const bal0Raw = await getTokenBalance(w.address, lpState.token0);
        const bal0    = parseFloat(bal0Raw || 0);
        const sym0    = getLPToken(lpState.token0).symbol;

        if (el0) {
            el0.innerHTML = `${bal0.toFixed(4)} ${sym0} <span class="max" id="lpMax0">MAX</span>`;

            document.getElementById("lpMax0")?.addEventListener("click", async () => {
                const input = document.getElementById("lpAmount0");
                if (input) input.value = bal0 > 0 ? bal0.toFixed(6) : "";
                const price = lpState.priceMode === "auto"
                    ? await fetchLPPrice()
                    : parseFloat(lpState.manualPrice || 0);
                if (price > 0) await syncAmountFromPrice(price);
                await validateLPBalances();
            });
        }

        if (!lpState.token1) {
            if (el1) el1.innerText = "0.00";
            return;
        }

        const bal1Raw = await getTokenBalance(w.address, lpState.token1);
        const bal1    = parseFloat(bal1Raw || 0);
        if (el1) el1.innerText = bal1.toFixed(4);

    } catch (err) {
        console.error("LP Balance Error:", err);
        if (el0) el0.innerText = "0.00";
        if (el1) el1.innerText = "0.00";
    }
}


// =====================================
// DECIMALS HELPER
// =====================================
async function getTokenDecimals(token) {
    if (!token || token === "native" || token === window.CONFIG.WSDA) return 18;
    try {
        const c = new ethers.Contract(token, ["function decimals() view returns (uint8)"], window.provider);
        return await c.decimals();
    } catch {
        return 18;
    }
}


// =====================================
// ADD LP HANDLER — STEP 1: VALIDASI + BUKA CONFIRM MODAL
// =====================================
async function handleAddLP() {
    try {
        // guard PK
        try { requirePK(); } catch { return; }

        const a0 = document.getElementById("lpAmount0")?.value?.trim();
        const a1 = document.getElementById("lpAmount1")?.value?.trim();

        if (!a0 || !a1)       return showToast?.("Isi amount dulu", "error");
        if (!lpState.token1)  return showToast?.("Pilih token pair dulu", "error");

        // ── VALIDASI BALANCE ─────────────────────────────────
        const w = getSelectedWallet?.();
        if (!w) return showToast?.("Wallet tidak ditemukan", "error");

        const [rawBal0, rawBal1] = await Promise.all([
            getTokenBalance(w.address, lpState.token0),
            getTokenBalance(w.address, lpState.token1)
        ]);

        const bal0   = parseFloat(rawBal0 || 0);
        const bal1   = parseFloat(rawBal1 || 0);
        const input0 = parseFloat(a0);
        const input1 = parseFloat(a1);

        const sym0 = getLPToken(lpState.token0).symbol;
        const sym1 = getLPToken(lpState.token1).symbol;

        if (input0 <= 0 || input1 <= 0)
            return showToast?.("Amount harus lebih dari 0", "error");

        if (input0 > bal0)
            return showToast?.(`Balance ${sym0} tidak cukup (ada: ${bal0.toFixed(4)})`, "error");

        if (input1 > bal1)
            return showToast?.(`Balance ${sym1} tidak cukup (ada: ${bal1.toFixed(4)})`, "error");
        // ── END VALIDASI ──────────────────────────────────────

        // Validasi range manual sebelum confirm (biar error muncul di awal, bukan setelah confirm)
        if (!lpState.fullRange) {
            const minPrice = parseFloat(document.getElementById("lpMinPrice")?.value || 0);
            const maxPrice = parseFloat(document.getElementById("lpMaxPrice")?.value || 0);
            if (!minPrice || !maxPrice) return showToast?.("Isi range harga dulu", "error");
            if (minPrice >= maxPrice)   return showToast?.("Min harus < Max", "error");
        }

        const feeLabel = ({500:"0.05%", 3000:"0.3%", 10000:"1%"})[lpState.fee] || `${lpState.fee/10000}%`;
        const rangeLabel = lpState.fullRange
            ? "Full Range"
            : `${parseFloat(document.getElementById("lpMinPrice")?.value || 0).toFixed(6)} - ${parseFloat(document.getElementById("lpMaxPrice")?.value || 0).toFixed(6)}`;

        // Simpan data yang sudah divalidasi untuk dieksekusi setelah confirm
        window._lpPendingConfirm = { a0, a1, sym0, sym1 };

        showLPConfirmModal({
            t0: getLPToken(lpState.token0),
            t1: getLPToken(lpState.token1),
            a0, a1,
            feeLabel,
            rangeLabel
        });

    } catch (e) {
        console.error("handleAddLP error:", e);
        showToast?.(e.message || "LP Failed", "error");
    }
}


// =====================================
// LP CONFIRM MODAL
// =====================================
function showLPConfirmModal({ t0, t1, a0, a1, feeLabel, rangeLabel }) {
    let modal = document.getElementById("lpConfirmModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "lpConfirmModal";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="confirm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:20000;
             display:flex;align-items:center;justify-content:center;">
            <div style="background:#151920;border:1px solid #252b38;border-radius:20px;
                        padding:24px 20px;width:90%;max-width:360px;">
                <div style="font-size:17px;font-weight:700;color:#fff;margin-bottom:16px;">Confirm Add Liquidity</div>

                <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:16px;">
                    <div style="text-align:center;">
                        <img src="${t0.logo}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:10px;color:#aaa;margin-top:3px;">${t0.symbol}</div>
                    </div>
                    <div style="font-size:18px;color:#9b5cff;">+</div>
                    <div style="text-align:center;">
                        <img src="${t1.logo}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:10px;color:#aaa;margin-top:3px;">${t1.symbol}</div>
                    </div>
                </div>

                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #1e2330;">
                    <span style="color:#888;">${t0.symbol}</span>
                    <b style="color:#fff;">${Number(a0).toLocaleString(undefined,{maximumFractionDigits:6})}</b>
                </div>
                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #1e2330;">
                    <span style="color:#888;">${t1.symbol}</span>
                    <b style="color:#fff;">${Number(a1).toLocaleString(undefined,{maximumFractionDigits:6})}</b>
                </div>
                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #1e2330;">
                    <span style="color:#888;">Fee Tier</span>
                    <b style="color:#fff;">${feeLabel}</b>
                </div>
                <div style="display:flex;justify-content:space-between;padding:10px 0;margin-bottom:16px;">
                    <span style="color:#888;">Range</span>
                    <b style="color:#fff;font-size:12px;">${rangeLabel}</b>
                </div>

                <button id="confirmLPBtn" style="width:100%;padding:14px;border:none;border-radius:14px;
                        background:linear-gradient(135deg,#9b5cff,#6a3fd4);color:#fff;font-size:15px;
                        font-weight:700;cursor:pointer;margin-bottom:10px;">Confirm Add Liquidity</button>
                <button id="cancelLPBtn" style="width:100%;padding:12px;border:1px solid #252b38;
                        border-radius:14px;background:transparent;color:#666;font-size:14px;cursor:pointer;">
                        Cancel</button>
            </div>
        </div>`;

    modal.style.cssText = "position:fixed;inset:0;z-index:20000;display:flex;";

    modal.querySelector("#cancelLPBtn").onclick = () => {
        modal.style.display = "none";
        window._lpPendingConfirm = null;
    };

    modal.querySelector("#confirmLPBtn").onclick = async () => {
        modal.style.display = "none";
        await executeAddLP();
    };
}

function closeLPConfirmModal() {
    const modal = document.getElementById("lpConfirmModal");
    if (modal) modal.style.display = "none";
}


// =====================================
// LP LOADING OVERLAY
// =====================================
function showLPLoading(text = "Preparing...", percent = 20, t0, t1) {
    let overlay = document.getElementById("lpLoadingOverlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "lpLoadingOverlay";
        document.body.appendChild(overlay);
    }

    overlay.style.cssText = `
        position:fixed;inset:0;z-index:30000;display:flex;
        align-items:center;justify-content:center;
        background:rgba(0,0,0,0.85);
    `;

    const inLogo  = t0?.logo || "img/sda.png";
    const outLogo = t1?.logo || "img/default.png";
    const inSym   = t0?.symbol || "?";
    const outSym  = t1?.symbol || "?";

    overlay.innerHTML = `
        <div style="background:#151920;border:1px solid #252b38;border-radius:20px;
                    padding:28px 20px;width:90%;max-width:340px;text-align:center;">

            <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:18px;">
                <div style="text-align:center;">
                    <img src="${inLogo}" onerror="this.src='img/default.png'"
                         style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                    <div style="font-size:10px;color:#aaa;margin-top:3px;">${inSym}</div>
                </div>
                <div style="font-size:18px;color:#9b5cff;animation:swapArrowPulse 1s infinite;">+</div>
                <div style="text-align:center;">
                    <img src="${outLogo}" onerror="this.src='img/default.png'"
                         style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                    <div style="font-size:10px;color:#aaa;margin-top:3px;">${outSym}</div>
                </div>
            </div>

            <div id="lpLoadingText" style="color:#fff;font-size:14px;font-weight:600;margin-bottom:16px;">${text}</div>

            <div style="width:100%;height:6px;background:#222;border-radius:6px;overflow:hidden;">
                <div id="lpProgressFill" style="height:100%;width:${percent}%;
                     background:linear-gradient(135deg,#9b5cff,#6a3fd4);
                     transition:width 0.3s ease;"></div>
            </div>
        </div>
    `;
}

function updateLPLoading(text, percent) {
    const txt  = document.getElementById("lpLoadingText");
    const fill = document.getElementById("lpProgressFill");
    if (txt)  txt.innerText = text;
    if (fill) fill.style.width = percent + "%";
}

function hideLPLoading() {
    const overlay = document.getElementById("lpLoadingOverlay");
    if (overlay) overlay.remove();
}

// =====================================
// PARSE ACTUAL AMOUNT DARI EVENT IncreaseLiquidity
// =====================================
const POSITION_MANAGER_ABI_MIN = [
    "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)"
];

function _parseActualLPAmounts(receipt, decUi0, decUi1, isSwapped) {
    try {
        if (!receipt?.logs?.length) return null;
        const iface = new ethers.utils.Interface(POSITION_MANAGER_ABI_MIN);
        const decSorted0 = isSwapped ? decUi1 : decUi0;
        const decSorted1 = isSwapped ? decUi0 : decUi1;

        for (const log of receipt.logs) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed.name === "IncreaseLiquidity") {
                    const sortedAmount0 = parseFloat(ethers.utils.formatUnits(parsed.args.amount0, decSorted0));
                    const sortedAmount1 = parseFloat(ethers.utils.formatUnits(parsed.args.amount1, decSorted1));
                    const tokenId = parsed.args.tokenId.toString();
                    const amount0 = isSwapped ? sortedAmount1 : sortedAmount0;
                    const amount1 = isSwapped ? sortedAmount0 : sortedAmount1;
                    return { amount0, amount1, tokenId };
                }
            } catch (e) {}
        }
        return null;
    } catch (e) {
        console.warn("[LP] parseActualLPAmounts error:", e);
        return null;
    }
}

// =====================================
// ADD LP — STEP 2: EKSEKUSI SETELAH CONFIRM
// =====================================
async function executeAddLP() {
    const pending = window._lpPendingConfirm;
    if (!pending) return;

    const { a0, a1 } = pending;

    try {
        const fee = lpState.fee;

        // ==========================
        // RESOLVE TOKENS
        // ==========================
        const resolvedT0 = lpState.token0 === "native" ? window.CONFIG.WSDA : lpState.token0;
        const resolvedT1 = lpState.token1;

        // Cek apakah pool akan ter-swap
        const isSwapped = resolvedT0.toLowerCase() > resolvedT1.toLowerCase();

        // ==========================
        // TICKS
        // ==========================
        let tickLower, tickUpper;

        if (lpState.fullRange) {
            const ticks = getFullRangeTicks(fee);
            tickLower   = ticks.tickLower;
            tickUpper   = ticks.tickUpper;
        } else {
            const minPrice = parseFloat(document.getElementById("lpMinPrice")?.value || 0);
            const maxPrice = parseFloat(document.getElementById("lpMaxPrice")?.value || 0);

            if (!minPrice || !maxPrice) return showToast?.("Isi range harga dulu", "error");
            if (minPrice >= maxPrice)   return showToast?.("Min harus < Max", "error");

            const ticks = getCustomRangeTicks(minPrice, maxPrice, fee, isSwapped);
            tickLower   = ticks.tickLower;
            tickUpper   = ticks.tickUpper;
        }

        // ==========================
        // DECIMALS + PARSE AMOUNT
        // ==========================
        const dec0 = await getTokenDecimals(lpState.token0);
        const dec1 = await getTokenDecimals(lpState.token1);

        const amount0 = ethers.utils.parseUnits(a0, dec0);
        const amount1 = ethers.utils.parseUnits(a1, dec1);

        const t0Data = getLPToken(lpState.token0);
        const t1Data = getLPToken(lpState.token1);

        showLPLoading("Preparing Transaction...", 15, t0Data, t1Data);

        const lpTx = await LP_ENGINE.addLP({
            token0: lpState.token0,
            token1: lpState.token1,
            fee,
            tickLower,
            tickUpper,
            amount0,
            amount1
        });

        if (lpTx?.hash) {
            updateLPLoading("Finalizing...", 95);

            const actual = _parseActualLPAmounts(lpTx.receipt, dec0, dec1, isSwapped);
            const finalA0 = actual?.amount0 ?? a0;
            const finalA1 = actual?.amount1 ?? a1;
            const finalTokenId = actual?.tokenId ?? lpTx.tokenId ?? null;

            await saveLPToHistory(lpTx, {
                token0:  lpState.token0,
                token1:  lpState.token1,
                amount0: finalA0,
                amount1: finalA1,
                tokenId: finalTokenId
            });

            renderTxHistory?.();
            updateBellBadge?.();

            // Refresh saldo dashboard + LP balance di modal
            refreshAll?.();
            await updateLPBalance?.();

            document.getElementById("lpAmount0").value = "";
            document.getElementById("lpAmount1").value = "";
            hideLPLoading();
            closeLPModal();

            showLPSuccessModal({
                hash: lpTx.hash,
                t0: getLPToken(lpState.token0),
                t1: getLPToken(lpState.token1),
                a0: finalA0,
                a1: finalA1,
                feeLabel: ({500:"0.05%", 3000:"0.3%", 10000:"1%"})[lpState.fee] || `${lpState.fee/10000}%`,
                explorerUrl: window.EXPLORER_TX_URL || window.EXPLORER_URL || "https://ledger.sidrachain.com/tx/"
            });

        } else {
            throw new Error("LP tx invalid");
        }

    } catch (e) {
        console.error("executeAddLP error:", e);
        showToast?.(e.message || "LP Failed", "error");
    } finally {
        hideLPLoading();
        window._lpPendingConfirm = null;
    }
}


// =====================================
// LP SUCCESS MODAL
// =====================================
let _lpmCurrentHash = "";
let _lpmExplorerUrl = "";

function showLPSuccessModal({ hash, t0, t1, a0, a1, feeLabel, explorerUrl }) {
    _lpmCurrentHash = hash || "";
    _lpmExplorerUrl = (explorerUrl || "https://ledger.sidrachain.com/tx/") + hash;

    let modal = document.getElementById("lpSuccessModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "lpSuccessModal";
        document.body.appendChild(modal);
    }

    const shortHash = hash ? hash.slice(0, 10) + "..." + hash.slice(-8) : "—";
    const now = new Date();
    const _locale = window.CURRENT_LANG === "en" ? "en-US" : window.CURRENT_LANG === "ar" ? "ar-SA" : "id-ID";
    const timeStr = now.toLocaleTimeString(_locale, { hour:"2-digit", minute:"2-digit", second:"2-digit" })
                  + " · " + now.toLocaleDateString(_locale, { day:"2-digit", month:"short", year:"numeric" });

    modal.innerHTML = `
        <div class="confirm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:20000;
             display:flex;align-items:center;justify-content:center;">
            <div style="background:#151920;border:1px solid #252b38;border-radius:20px;
                        padding:28px 20px;width:90%;max-width:360px;text-align:center;">

                <div style="width:56px;height:56px;border-radius:50%;background:rgba(0,204,102,0.15);
                            display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
                    <i class="fa-solid fa-check" style="color:#00cc66;font-size:24px;"></i>
                </div>

                <div style="font-size:17px;font-weight:700;color:#fff;margin-bottom:4px;">Liquidity Added</div>
                <div style="font-size:12px;color:#888;margin-bottom:18px;">${t0.symbol} / ${t1.symbol} Pool</div>

                <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:16px;">
                    <div style="text-align:center;">
                        <img src="${t0.logo}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:11px;color:#fff;margin-top:4px;">${Number(a0).toLocaleString(undefined,{maximumFractionDigits:6})} ${t0.symbol}</div>
                    </div>
                    <div style="font-size:18px;color:#9b5cff;">+</div>
                    <div style="text-align:center;">
                        <img src="${t1.logo}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:11px;color:#fff;margin-top:4px;">${Number(a1).toLocaleString(undefined,{maximumFractionDigits:6})} ${t1.symbol}</div>
                    </div>
                </div>

                <div style="text-align:left;background:#0e1117;border-radius:12px;padding:14px;margin-bottom:18px;">
                    <div style="display:flex;justify-content:space-between;padding:6px 0;">
                        <span style="color:#888;font-size:12px;">Fee Tier</span>
                        <span style="color:#fff;font-size:12px;">${feeLabel}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;">
                        <span style="color:#888;font-size:12px;">TX Hash</span>
                        <span style="color:#fff;font-size:12px;">${shortHash}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;">
                        <span style="color:#888;font-size:12px;">Time</span>
                        <span style="color:#fff;font-size:12px;">${timeStr}</span>
                    </div>
                </div>

                <button id="lpmExplorerBtn" style="width:100%;padding:13px;border:1px solid #252b38;border-radius:14px;
                        background:transparent;color:#9b5cff;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px;">
                        View on Explorer</button>
                <button id="lpmCloseBtn" style="width:100%;padding:14px;border:none;border-radius:14px;
                        background:linear-gradient(135deg,#9b5cff,#6a3fd4);color:#fff;font-size:15px;
                        font-weight:700;cursor:pointer;">Done</button>
            </div>
        </div>`;

    modal.style.cssText = "position:fixed;inset:0;z-index:20000;display:flex;";

    modal.querySelector("#lpmCloseBtn").onclick = () => {
        modal.style.display = "none";
    };

    modal.querySelector("#lpmExplorerBtn").onclick = () => {
        if (_lpmExplorerUrl) openExplorer?.(_lpmExplorerUrl);
    };

    modal.addEventListener("click", (e) => {
        if (e.target === modal.firstElementChild) modal.style.display = "none";
    });
}


// =====================================
// SAVE LP HISTORY
// =====================================
async function saveLPToHistory(tx, data) {
    try {
        const history = getTxHistory?.() || [];

        const t0 = getLPToken(data.token0);
        const t1 = getLPToken(data.token1);

        history.unshift({
            hash:      tx.hash,
            type:      "ADD_LP",

            // fields untuk render riwayat
            from:      tx.receipt?.from || "",
            to:        PM_ADDRESS,

            inSymbol:  t0.symbol,
            outSymbol: t1.symbol,
            inLogo:    normalizeLogo(t0.logo,  "img/sda.png"),
            outLogo:   normalizeLogo(t1.logo,  "img/default.png"),

            amount0:   parseFloat(data.amount0),
            amount1:   parseFloat(data.amount1),

            // tokenId kalau berhasil di-parse
            tokenId:   data.tokenId || tx.tokenId || null,

            timestamp: Math.floor(Date.now() / 1000),
            read:      false
        });

        saveTxHistory?.(history);
        console.log("LP history saved:", tx.hash);

    } catch (e) {
        console.warn("LP history save failed:", e);
    }
}


// =====================================
// BALANCE VALIDATION UI
// =====================================
async function validateLPBalances() {
    const w = getSelectedWallet?.();
    if (!w) return;

    const input0 = document.getElementById("lpAmount0");
    const input1 = document.getElementById("lpAmount1");
    const bal0El = document.getElementById("lpBalance0");
    const bal1El = document.getElementById("lpBalance1");

    if (!input0 || !input1) return;

    const amount0 = parseFloat(input0.value || 0);
    const amount1 = parseFloat(input1.value || 0);

    const bal0 = parseFloat(await getTokenBalance(w.address, lpState.token0) || 0);
    const bal1 = lpState.token1
        ? parseFloat(await getTokenBalance(w.address, lpState.token1) || 0)
        : 0;

    const over0 = amount0 > bal0;
    const over1 = amount1 > bal1;

    const COLOR_OK   = "#34d399";
    const COLOR_OVER = "#ff4d4f";

    // Warna preview amount0 — hanya kalau ada isi
    if (input0) {
        input0.style.color       = !amount0 ? "" : (over0 ? COLOR_OVER : COLOR_OK);
        input0.style.borderColor = over0 ? COLOR_OVER : "";
    }

    // Warna preview amount1 — hanya kalau ada isi
    if (input1) {
        input1.style.color       = !amount1 ? "" : (over1 ? COLOR_OVER : COLOR_OK);
        input1.style.borderColor = over1 ? COLOR_OVER : "";
    }

    // Label balance tetap merah kalau over, normal kalau cukup
    if (bal0El) bal0El.style.color = over0 ? COLOR_OVER : "";
    if (bal1El) bal1El.style.color = over1 ? COLOR_OVER : "";
}


// =====================================
// RANGE ADJUST BUTTONS
// =====================================
function adjustSingle(type, direction) {
    const el = document.getElementById(type === "min" ? "lpMinPrice" : "lpMaxPrice");
    if (!el) return;

    let val = parseFloat(el.value || 0);
    if (val === 0) val = lpState.currentPrice || 1;

    // 0.1% dari nilai saat ini per klik
    // direction: +1 naik, -1 turun
    val = val * (1 + (0.001 * direction));
    el.value = val.toFixed(6);
    el.dataset.userEdited = "1";

    // Sync amount B setelah range diubah
    if (lpState.currentPrice > 0) syncAmountFromPrice(lpState.currentPrice);
}


// =====================================
// TOKEN SELECTOR
// =====================================
function openLPSelector(type) {
    document.getElementById("tokenPopup")?.remove();

    const tokens   = window.TOKENS || [];
    let   itemsHTML = "";

    if (type === "token0") {
        itemsHTML += `
            <div class="token-item" data-address="native">
                <img src="img/sda.png" onerror="this.src='img/default.png'">
                <span>SDA</span>
            </div>`;
    }

    tokens.forEach(t => {
        if (t.address === window.CONFIG.WSDA) return;
        itemsHTML += `
            <div class="token-item" data-address="${t.address}">
                <img src="${t.logo || 'img/default.png'}" onerror="this.src='img/default.png'">
                <span>${t.symbol}</span>
            </div>`;
    });

    const box      = document.createElement("div");
    box.id         = "tokenPopup";
    box.innerHTML  = `
        <div class="popup-bg"></div>
        <div class="popup">
            <div id="tokenList">${itemsHTML}</div>
        </div>`;

    document.body.appendChild(box);

    box.addEventListener("click", async (e) => {
        if (e.target.classList.contains("popup-bg")) { box.remove(); return; }

        const item = e.target.closest(".token-item");
        if (!item) return;

        const addr = item.dataset.address;

        if (type === "token0") lpState.token0 = addr;
        else                   lpState.token1 = addr;

        box.remove();
        await updateLPUI();
        await syncPoolData();
    });
}


// =====================================
// FEE DROPDOWN
// =====================================
function openFeeDropdown(e) {
    attachDropdown(e.currentTarget, `
        <div class="dropdown-item" data-fee="500">0.05% - Stable Pair</div>
        <div class="dropdown-item" data-fee="3000">0.3% - Standard</div>
        <div class="dropdown-item" data-fee="10000">1% - High Volatility</div>
    `, (item) => {
        lpState.fee = parseInt(item.dataset.fee);
        const parts = item.innerText.split("-");
        document.getElementById("lpFeeLabel").innerText = parts[0].trim();
        document.getElementById("lpFeeDesc").innerText  = parts[1]?.trim() || "";
        syncPoolData();
    });
}


// =====================================
// SLIPPAGE DROPDOWN
// =====================================
function openSlippageDropdown(e) {
    attachDropdown(e.currentTarget, `
        <div class="dropdown-item" data-slip="0.1">0.1% - Very Safe</div>
        <div class="dropdown-item" data-slip="0.5">0.5% - Recommended</div>
        <div class="dropdown-item" data-slip="1">1% - Fast Execution</div>
    `, (item) => {
        lpState.slippage = parseFloat(item.dataset.slip);
        document.getElementById("lpSlippageLabel").innerText = item.dataset.slip + "%";
    });
}


// =====================================
// DROPDOWN CORE
// =====================================
function attachDropdown(triggerEl, contentHTML, onClick) {
    removeDropdown();

    const rect    = triggerEl.getBoundingClientRect();
    const navH    = 64;   // tinggi bottom nav
    const safeBot = navH + 8;
    const dropH   = Math.min((contentHTML.match(/dropdown-item/g)?.length || 3) * 48, 220);

    const spaceBelow = window.innerHeight - rect.bottom - safeBot;
    const spaceAbove = rect.top;

    let topVal;
    if (spaceBelow >= dropH || spaceBelow >= spaceAbove) {
        const maxBottom = window.innerHeight - safeBot;
        topVal = Math.min(rect.bottom + 6, maxBottom - dropH);
    } else {
        topVal = rect.top - dropH - 6;
    }

    const box = document.createElement("div");
    box.className     = "dropdown";
    box.style.cssText = `position:fixed;top:${topVal}px;left:${rect.left}px;width:${Math.max(rect.width, 180)}px;z-index:99999;`;
    box.innerHTML     = contentHTML;

    document.body.appendChild(box);

    box.addEventListener("click", (e) => {
        const item = e.target.closest(".dropdown-item");
        if (!item) return;
        onClick(item);
        box.remove();
    });

    setTimeout(() => {
        document.addEventListener("click", function handler(e) {
            if (!box.contains(e.target)) { box.remove(); document.removeEventListener("click", handler); }
        });
    }, 10);
}

function removeDropdown() {
    document.querySelectorAll(".dropdown").forEach(x => x.remove());
}


// =====================================
// EVENTS
// =====================================
document.addEventListener("DOMContentLoaded", () => {

    document.getElementById("openLpBtn")?.addEventListener("click", openLPModal);
    document.getElementById("closeLpModal")?.addEventListener("click", closeLPModal);

    document.getElementById("lpModal")?.addEventListener("click", (e) => {
        if (e.target.id === "lpModal") closeLPModal();
    });

    document.getElementById("lpToken0Select")?.addEventListener("click", (e) => {
        e.stopPropagation();
        openLPSelector("token0");
    });

    document.getElementById("lpToken1Select")?.addEventListener("click", (e) => {
        e.stopPropagation();
        openLPSelector("token1");
    });

    document.getElementById("lpFeeSelect")?.addEventListener("click", (e) => {
        e.stopPropagation();
        openFeeDropdown(e);
    });

    document.getElementById("lpSlippageSelect")?.addEventListener("click", (e) => {
        e.stopPropagation();
        openSlippageDropdown(e);
    });

    document.getElementById("btnAddLP")?.addEventListener("click", handleAddLP);

    // RANGE MODE SWITCH
    document.querySelectorAll(".lp2-range-tab").forEach(item => {
        item.addEventListener("click", async () => {
            document.querySelectorAll(".lp2-range-tab").forEach(x => x.classList.remove("active"));
            item.classList.add("active");

            lpState.fullRange = item.dataset.mode === "full";

            const rangeBox = document.getElementById("lpCustomRange");
            if (rangeBox) rangeBox.style.display = lpState.fullRange ? "none" : "block";

            if (!lpState.fullRange) {
                const minEl = document.getElementById("lpMinPrice");
                const maxEl = document.getElementById("lpMaxPrice");
                if (minEl) delete minEl.dataset.userEdited;
                if (maxEl) delete maxEl.dataset.userEdited;
            }

            await syncPoolData();
        });
    });

    // AMOUNT0 INPUT â€” auto sync amount1
    document.getElementById("lpAmount0")?.addEventListener("input", async () => {
        if (!lpState.token1) return;
        const price = lpState.priceMode === "auto"
            ? await fetchLPPrice()
            : parseFloat(lpState.manualPrice || 0);
        await syncAmountFromPrice(price);
        await validateLPBalances();
    });

    // AMOUNT1 INPUT â€” reverse sync amount0
    document.getElementById("lpAmount1")?.addEventListener("input", async () => {
        if (!lpState.token1) return;

        const price = lpState.priceMode === "auto"
            ? await fetchLPPrice()
            : parseFloat(lpState.manualPrice || 0);

        if (!price || price <= 0) { await validateLPBalances(); return; }

        const valB   = parseFloat(document.getElementById("lpAmount1")?.value || 0);
        const inputA = document.getElementById("lpAmount0");

        if (!valB || !isFinite(valB)) {
            if (inputA) inputA.value = "";
        } else {
            if (inputA) inputA.value = (valB / price).toFixed(6);
        }

        await validateLPBalances();
    });

    // MANUAL PRICE INPUT
    document.getElementById("lpManualPrice")?.addEventListener("input", () => {
        const price = parseFloat(document.getElementById("lpManualPrice")?.value || 0);
        lpState.manualPrice  = price;
        lpState.currentPrice = price;
        syncAmountFromPrice(price);
        fillAutoRange(price);
    });

    // USER EDIT RANGE â€” tandai supaya auto-fill tidak overwrite
    document.getElementById("lpMinPrice")?.addEventListener("input", async (e) => {
        e.target.dataset.userEdited = "1";
        if (lpState.currentPrice > 0) await syncAmountFromPrice(lpState.currentPrice);
    });
    document.getElementById("lpMaxPrice")?.addEventListener("input", async (e) => {
        e.target.dataset.userEdited = "1";
        if (lpState.currentPrice > 0) await syncAmountFromPrice(lpState.currentPrice);
    });
});