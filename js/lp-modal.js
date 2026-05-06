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

        if (statusEl)  statusEl.innerText       = "Pool belum aktif - set harga manual";
        if (manualBox) manualBox.style.display   = "block";

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

    if (statusEl)  statusEl.innerText     = "Pool aktif - auto price";
    if (manualBox) manualBox.style.display = "none";

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

    inputB.value = (valA * price).toFixed(6);
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
// ADD LP HANDLER
// =====================================
async function handleAddLP() {
    try {
        // guard PK
        try { requirePK(); } catch { return; }

        const a0 = document.getElementById("lpAmount0")?.value?.trim();
        const a1 = document.getElementById("lpAmount1")?.value?.trim();

        if (!a0 || !a1)       return showToast?.("Isi amount dulu", "error");
        if (!lpState.token1)  return showToast?.("Pilih token pair dulu", "error");

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

        // amount0 = selalu untuk token0 UI (resolvedT0)
        // amount1 = selalu untuk token1 UI (resolvedT1)
        // lp-engine yang handle sort + swap amount
        const amount0 = ethers.utils.parseUnits(a0, dec0);
        const amount1 = ethers.utils.parseUnits(a1, dec1);

        showToast?.("Executing LP...", "info");

        const lpTx = await LP_ENGINE.addLP({
            token0: lpState.token0,   // kirim token0 asli (native atau address)
            token1: lpState.token1,   // lp-engine yang resolve + sort
            fee,
            tickLower,
            tickUpper,
            amount0,
            amount1
        });

        if (lpTx?.hash) {
            await saveLPToHistory(lpTx, {
                token0:  lpState.token0,
                token1:  lpState.token1,
                amount0: a0,
                amount1: a1
            });

            renderTxHistory?.();
            updateBellBadge?.();

            showToast?.("LP berhasil ditambahkan", "success");
            document.getElementById("lpAmount0").value = "";
            document.getElementById("lpAmount1").value = "";
            closeLPModal();
        } else {
            throw new Error("LP tx invalid");
        }

    } catch (e) {
        console.error("handleAddLP error:", e);
        showToast?.(e.message || "LP Failed", "error");
    }
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
            tokenId:   tx.tokenId || null,

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

    if (bal0El)  bal0El.style.color        = over0 ? "#ff4d4f" : "";
    if (bal1El)  bal1El.style.color        = over1 ? "#ff4d4f" : "";
    if (input0)  input0.style.borderColor  = over0 ? "#ff4d4f" : "";
    if (input1)  input1.style.borderColor  = over1 ? "#ff4d4f" : "";
}


// =====================================
// RANGE ADJUST BUTTONS
// =====================================
function adjustSingle(type, percent) {
    const el = document.getElementById(type === "min" ? "lpMinPrice" : "lpMaxPrice");
    if (!el) return;

    let val = parseFloat(el.value || 0);
    if (val === 0) val = lpState.currentPrice || 1;

    val = val * (1 + percent / 100);
    el.value = val.toFixed(6);
    el.dataset.userEdited = "1";
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

    const rect = triggerEl.getBoundingClientRect();
    const box  = document.createElement("div");
    box.className     = "dropdown";
    box.style.cssText = `position:fixed;top:${rect.bottom + 6}px;left:${rect.left}px;width:${rect.width}px;z-index:9999;`;
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
    document.querySelector("#lpModal .close-btn")?.addEventListener("click", closeLPModal);

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
    document.querySelectorAll(".range-item").forEach(item => {
        item.addEventListener("click", async () => {
            document.querySelectorAll(".range-item").forEach(x => x.classList.remove("active"));
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
    document.getElementById("lpMinPrice")?.addEventListener("input", (e) => {
        e.target.dataset.userEdited = "1";
    });
    document.getElementById("lpMaxPrice")?.addEventListener("input", (e) => {
        e.target.dataset.userEdited = "1";
    });
});