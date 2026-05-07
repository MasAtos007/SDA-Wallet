window.dingAudio = new Audio("audio/ding.mp3");
window.dingAudio.preload = "auto";

document.addEventListener("click", () => {
    window.dingAudio.play()
        .then(() => {
            window.dingAudio.pause();
            window.dingAudio.currentTime = 0;
        })
        .catch(()=>{});
}, { once:true });

// =====================================
// AGGREGATOR ENGINE v3
// =====================================


window.AGGREGATOR = (() => {

    const WSDA         = () => window.CONFIG?.WSDA;
    const FEE_PER_HOP  = 0.003;
    const SLIPPAGE     = 0.005;
    const SCAN_TIMEOUT = 15000;
    const BATCH_SIZE   = 2;
    const BATCH_DELAY  = 500;
    const MAX_RESULTS        = 15;
const MIN_AUTO_PROFIT_SDA = 0.1;
const MIN_SAFE_RECEIVE = 0.001;


    let _scanning      = false;
let _lastScanKey   = "";
let _lastResults   = [];
let _panelOpen     = false;
let _suspendWatcher = false;

    function _isNat(addr) { return !addr || addr === "native"; }
    function _same(a, b)  { return String(a).toLowerCase() === String(b).toLowerCase(); }

    function symbolOf(addr) {
        if (_isNat(addr)) return "SDA";
        return (window.TOKENS || []).find(t => _same(t.address, addr))?.symbol || addr.slice(0,6)+"...";
    }

    function logoOf(addr) {
        if (_isNat(addr)) return "img/sda.png";
        return (window.TOKENS || []).find(t => _same(t.address, addr))?.logo || "img/default.png";
    }

    function withTimeout(p, ms) {
        return Promise.race([p, new Promise((_,r) => setTimeout(() => r(new Error("timeout")), ms))]);
    }

function getTokenDecimals(addr) {
    if (_isNat(addr)) return 18;

    return (window.TOKENS || [])
        .find(t => _same(t.address, addr))
        ?.decimals || 18;
}

function formatTokenAmount(raw, decimals = 18) {
    if (!raw && raw !== 0) return null;

    const num = Number(raw) / (10 ** decimals);

    return isFinite(num) ? num : null;
}

function isAutoRunning() {
    return _autoRunning;
}

function setAutoRunning(v) {
    _autoRunning = !!v;
}

async function getWalletTokenBalance(token) {
    const wallet =
        getPKWallet?.() ||
        getSelectedWallet?.() ||
        window.wallet;

    if (!wallet) return 0;

    if (!token || token === "native") {
        const raw = await provider.getBalance(wallet.address);
        return Number(ethers.utils.formatEther(raw));
    }

    const erc20 = new ethers.Contract(
        token,
        [
            "function balanceOf(address) view returns (uint256)",
            "function decimals() view returns (uint8)"
        ],
        provider
    );

    const [raw, dec] = await Promise.all([
        erc20.balanceOf(wallet.address),
        erc20.decimals()
    ]);

    return Number(
        ethers.utils.formatUnits(raw, dec)
    );
}


let _wakeLock = null;

async function acquireWakeLock() {
    try {
        if (!("wakeLock" in navigator)) {
            console.warn("[AGG] WakeLock unsupported");
            return false;
        }

        if (_wakeLock) {
            return true;
        }

        _wakeLock = await navigator.wakeLock.request("screen");

        _wakeLock.addEventListener("release", () => {
            console.log("[AGG] WakeLock released");
            _wakeLock = null;
        });

        console.log("[AGG] WakeLock acquired");
        return true;

    } catch (e) {
        console.warn("[AGG] WakeLock fail:", e);
        _wakeLock = null;
        return false;
    }
}

async function releaseWakeLock() {
    try {
        if (_wakeLock) {
            await _wakeLock.release();
            _wakeLock = null;
            console.log("[AGG] WakeLock manually released");
        }
    } catch (e) {
        console.warn("[AGG] Release WakeLock fail:", e);
    }
}

// Auto reacquire jika tab/app kembali aktif
document.addEventListener("visibilitychange", async () => {
    try {
        if (
            document.visibilityState === "visible" &&
            !_wakeLock
        ) {
            await acquireWakeLock();
        }
    } catch (e) {
        console.warn("[AGG] Visibility WakeLock fail:", e);
    }
});

function toggleAggregatorCandidate(token){
    let list = getAggregatorCandidates();

    if(list.includes(token)){
        list = list.filter(x => x !== token);
        showToast?.("Removed from scan list", "info");
    }else{
        list.push(token);
        showToast?.("Added to scan list", "success");
    }

    saveAggregatorCandidates(list);

    // rerender panel agar icon bintang update semua
    if (_lastResults?.length) {
        const receiveToken = window.swapState?.receiveToken;
        const targetAmt = parseFloat(
            document.getElementById("receiveAmount")?.value
        ) || 1;

        renderPanel(_lastResults, receiveToken, targetAmt);
    }
}

function cleanupAggregatorCandidates() {

    const current =
        getAggregatorCandidates();

    if (!current?.length) return;

    const validScannedSet = new Set(
        (_lastResults || [])
            .filter(r =>
                !r.isSDA &&
                r.sdaEquiv !== null &&
                isFinite(r.sdaEquiv)
            )
            .map(r =>
                String(r.payToken).toLowerCase()
            )
    );

    const cleaned = current.filter(addr =>
        validScannedSet.has(
            String(addr).toLowerCase()
        )
    );

    if (cleaned.length !== current.length) {
        saveAggregatorCandidates(cleaned);

        console.log(
            "[AGG] Removed invalid/unroutable tokens only"
        );
    }
}

async function scanSpecificCandidate(
    payToken,
    receiveToken,
    targetAmt
) {
    try {
        const rateOut = await PRICE_ENGINE.getAmountOut(
            payToken,
            receiveToken,
            1
        );

        if (!rateOut || rateOut <= 0) {
            throw new Error("Invalid route");
        }

        const unitsNeeded = targetAmt / rateOut;

        let sdaPerToken = 1;

        if (payToken !== "native") {
            const sdaQuote =
                await PRICE_ENGINE.getAmountOut(
                    "native",
                    payToken,
                    1
                );

            sdaPerToken = 1 / sdaQuote;
        }

        const sdaEquiv = unitsNeeded * sdaPerToken;

        return {
            payToken,
            paySymbol: symbolOf(payToken),
            payLogo: logoOf(payToken),
            unitsNeeded,
            sdaEquiv,
            isSDA: payToken === "native",
            savingsPct: null,
            hops: payToken === "native" ? 1 : 2
        };

    } catch (e) {
        console.error(e);
        return null;
    }
}

async function refreshSingleRoute(
    payToken,
    receiveToken,
    targetAmt
) {
    showToast?.(
        `Refreshing ${symbolOf(payToken)}...`,
        "info"
    );

    const updated = await scanSpecificCandidate(
        payToken,
        receiveToken,
        targetAmt
    );

    if (!updated) {
        showToast?.("Refresh gagal", "error");
        return;
    }

    const idx = _lastResults.findIndex(
        x => x.payToken === payToken
    );

    if (idx >= 0) {
        // preserve old liquidity/maxsafe/logo/etc
        _lastResults[idx] = {
            ..._lastResults[idx],
            ...updated
        };
    }

    const baseline = _lastResults.find(x => x.isSDA);

    if (baseline?.sdaEquiv > 0) {
        _lastResults = _lastResults.map(r => ({
            ...r,
            savings: baseline.sdaEquiv - r.sdaEquiv,
            savingsPct:
                ((baseline.sdaEquiv - r.sdaEquiv) / baseline.sdaEquiv) * 100
        }));
    }

    // jangan filter minus
    _lastResults.sort((a, b) => {

    const aPlus = (a.savingsPct ?? -999) > 0;
    const bPlus = (b.savingsPct ?? -999) > 0;

    if (aPlus && !bPlus) return -1;
    if (!aPlus && bPlus) return 1;

    if (aPlus && bPlus) {
        return a.sdaEquiv - b.sdaEquiv;
    }

    return (a.savingsPct ?? 0) - (b.savingsPct ?? 0);
});

    renderPanel(
        _lastResults,
        receiveToken,
        targetAmt
    );

    showToast?.("Route refreshed", "success");
}

let _autoRunning = false;

function lockAutoButton(btn) {
    if (!btn) return;

    btn.disabled = true;
    btn.style.opacity = "0.55";
    btn.style.pointerEvents = "none";
}

function unlockAutoButtons() {
    document.querySelectorAll(".agg-auto-btn").forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = "";
        btn.style.pointerEvents = "";
    });
}
    // =====================================
    // CORE SCAN
    // =====================================
    async function scanCheapestPayer(receiveToken, amountOut) {
        if (!receiveToken) return [];

        const tokenList = typeof getAllTokens === "function"
    ? getAllTokens()
    : JSON.parse(localStorage.getItem("customTokens") || "[]");

const selectedCandidates = JSON.parse(
    localStorage.getItem("aggregatorCandidates") || "[]"
);

const selectedSet = new Set(
    selectedCandidates.map(a => String(a).toLowerCase())
);

let filteredCustom = tokenList.filter(
    t =>
        t.address &&
        selectedSet.has(String(t.address).toLowerCase())
);

const candidates = [
    { address: "native", symbol: "SDA", logo: "img/sda.png" },

    ...filteredCustom.filter(t =>
        t.address &&
        !_same(t.address, receiveToken) &&
        !_same(t.address, WSDA()) &&
        t.symbol !== "WSDA"
    )
];

        const targetAmt = amountOut > 0 ? amountOut : 1;
const panelEl   = document.getElementById("aggPanel");

if (!filteredCustom.length) {

    if (panelEl) {
        panelEl.innerHTML = `
            <div style="padding:12px;color:#888;font-size:12px;">
                Tidak ada kandidat dipilih.<br>
                Menggunakan SDA baseline saja.
            </div>
        `;
    }

    return [{
        payToken: "native",
        paySymbol: "SDA",
        payLogo: "img/sda.png",
        unitsNeeded: targetAmt,
        sdaEquiv: targetAmt,
        savings: 0,
        savingsPct: 0,
        hops: 1,
        isSDA: true,
        maxSafeReceive: null,
        liquidityWarn: false
    }];
}

        // debug helper â€” tampil langsung di panel
        const dbg = (msg) => {
            if (panelEl) panelEl.innerHTML +=
                `<div style="font-size:10px;color:#555;padding:1px 12px;">${msg}</div>`;
        };

        if (panelEl) panelEl.innerHTML =
    `<div style="padding:10px 12px;font-size:11px;color:#888;">
        Scan ${candidates.length} kandidat
        (${Math.max(candidates.length - 1, 0)} custom + SDA baseline)
        untuk ${symbolOf(receiveToken)}...
     </div>`;

        // baseline: berapa SDA untuk dapat 1 receiveToken
        let baselineSDACost = null;
        try {
            const sdaOut = await withTimeout(PRICE_ENGINE.getAmountOut("native", receiveToken, 1), SCAN_TIMEOUT);
            dbg(`SDA -> ${symbolOf(receiveToken)}: rate=${sdaOut}`);
            if (sdaOut > 0) baselineSDACost = targetAmt / sdaOut;
        } catch(e) {
            dbg(`baseline err: ${e.message}`);
        }

        const results = [];

        for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
            const batch = candidates.slice(i, i + BATCH_SIZE);

            const batchRes = await Promise.all(batch.map(async (token) => {
                try {
                    // rate: 1 token -> berapa receiveToken
                    const rateOut = await withTimeout(
                        PRICE_ENGINE.getAmountOut(token.address, receiveToken, 1),
                        SCAN_TIMEOUT
                    );
                    dbg(`${token.symbol} -> ${symbolOf(receiveToken)}: ${rateOut}`);
                    if (!rateOut || rateOut <= 0) return null;

                    const unitsNeeded = targetAmt / rateOut;

                    // harga token dalam SDA
                    let sdaPerToken = _isNat(token.address) ? 1 : null;
                    if (!sdaPerToken) {
                        const out2 = await withTimeout(
                            PRICE_ENGINE.getAmountOut("native", token.address, 1),
                            SCAN_TIMEOUT
                        );
                        dbg(`  SDA -> ${token.symbol}: ${out2}`);
                        sdaPerToken = out2 > 0 ? (1 / out2) : null;
                    }
                    if (!sdaPerToken || sdaPerToken <= 0) return null;

                    const totalSDAEq = unitsNeeded * sdaPerToken;
                    const hops       = _isNat(token.address) ? 1 : 2;
                    const feeAdj     = Math.pow(1 - FEE_PER_HOP, hops) * (1 - SLIPPAGE);
                    const netSDAEq   = totalSDAEq / feeAdj;

                    let savingsPct = null;

if (baselineSDACost && baselineSDACost > 0) {
    savingsPct =
        ((baselineSDACost - netSDAEq) / baselineSDACost) * 100;
}



// ================================
// LIQUIDITY CHECK PER ROUTE
// ================================
let maxSafeReceive = null;
let liquidityWarn  = false;

try {
    const liq = await PRICE_ENGINE.getPoolLiquidity(
        token.address,
        receiveToken
    );

    if (liq) {

if (liq.maxSwapOut) {

    console.log(
        "[AGG DEBUG]",
        symbolOf(receiveToken),
        "raw maxSwapOut:",
        liq.maxSwapOut,
        "decimals:",
        getTokenDecimals(receiveToken)
    );

    maxSafeReceive = formatTokenAmount(
        liq.maxSwapOut,
        getTokenDecimals(receiveToken)
    );
}

        else if (liq.maxSwapIn) {
            maxSafeReceive =
    formatTokenAmount(liq.maxSwapIn, getTokenDecimals(token.address))
    * rateOut;
        }

        if (maxSafeReceive && targetAmt > maxSafeReceive) {
            liquidityWarn = true;
        }
    }

} catch (e) {
    console.warn(
        "[AGG] Liquidity check fail:",
        token.symbol,
        e?.message || e
    );
}



return {
    payToken:  token.address,
    paySymbol: token.symbol || symbolOf(token.address),
    payLogo:   token.logo   || logoOf(token.address),

    unitsNeeded,
    sdaEquiv: netSDAEq,

    savings: _isNat(token.address)
    ? 0
    : (
        baselineSDACost
            ? baselineSDACost - netSDAEq
            : null
    ),

    savingsPct: _isNat(token.address)
    ? 0
    : savingsPct,
    hops,

    isSDA: _isNat(token.address),

    maxSafeReceive,
    liquidityWarn
};
                } catch(e) {
                    dbg(`${token.symbol} err: ${e.message}`);
                    return null;
                }
            }));

            results.push(...batchRes.filter(Boolean));
            if (results.length && _panelOpen) _renderIncremental(results, receiveToken, targetAmt);
            if (i + BATCH_SIZE < candidates.length) await new Promise(r => setTimeout(r, BATCH_DELAY));
        }

        results.sort((a, b) => {

    const aProfit = a.savings ?? -999999;
    const bProfit = b.savings ?? -999999;

    // PRIORITAS PROFIT SDA TERBESAR
    if (bProfit !== aProfit) {
        return bProfit - aProfit;
    }

    // PRIORITAS LIQUIDITY TERBESAR
    const aLiq = a.maxSafeReceive ?? 0;
    const bLiq = b.maxSafeReceive ?? 0;

    if (bLiq !== aLiq) {
        return bLiq - aLiq;
    }

    // BARU PERSENTASE
    return (b.savingsPct ?? -999) - (a.savingsPct ?? -999);

});

const profitable = results.filter(r => {

    const profit = Math.abs(r.savings ?? 0);

    return profit >= MIN_AUTO_PROFIT_SDA;
});

const reverseCandidates = results.filter(r =>
    (r.savingsPct ?? 0) <= -10
);

const neutral = results.filter(r =>
    (r.savingsPct ?? 0) <= 0 &&
    (r.savingsPct ?? 0) > -10
);

return [
    ...profitable.slice(0, 10),
    ...reverseCandidates.slice(0, 10),
    ...neutral.slice(0, 5)
];
    }

    // =====================================
    // RENDER
    // =====================================
    function renderPanel(results, receiveToken, targetAmt) {
        const el = document.getElementById("aggPanel");
        if (!el) return;

        if (!results?.length) {
            el.innerHTML = `<div style="padding:16px;text-align:center;color:#888;font-size:12px;">
                Tidak ada data â€” coba token lain</div>`;
            return;
        }

        const recvSym = symbolOf(receiveToken);
        const best    = results[0];

        el.innerHTML = `
            <div class="agg-header-info">
                Untuk dapat <b>${targetAmt} ${recvSym}</b> &bull;
                paling murah: <b style="color:#00d084">${best.paySymbol}</b>
            </div>
            ${results.map((r, idx) => _buildRow(r, idx, receiveToken, targetAmt)).join("")}
        `;
    }

    function _renderIncremental(results, receiveToken, targetAmt) {

    const sorted = [...results].sort((a, b) => {
        const aPlus = (a.savingsPct ?? -999) > 0;
        const bPlus = (b.savingsPct ?? -999) > 0;

        if (aPlus && !bPlus) return -1;
        if (!aPlus && bPlus) return 1;

        if (aPlus && bPlus) {
            return a.sdaEquiv - b.sdaEquiv;
        }

        return (a.savingsPct ?? 0) - (b.savingsPct ?? 0);
    });

    const profitable = sorted.filter(r =>
    (r.savings ?? 0) >= MIN_AUTO_PROFIT_SDA
);

    const reverseCandidates = sorted.filter(r =>
        (r.savingsPct ?? 0) <= -10
    );

    const neutral = sorted.filter(r =>
        (r.savingsPct ?? 0) <= 0 &&
        (r.savingsPct ?? 0) > -10
    );

    renderPanel(
        [
            ...profitable.slice(0, 10),
            ...reverseCandidates.slice(0, 10),
            ...neutral.slice(0, 5)
        ],
        receiveToken,
        targetAmt
    );
}

    function _buildRow(r, idx, receiveToken, targetAmt) {
    const isBest  = idx === 0;
    const cheaper = r.savingsPct !== null && r.savingsPct > 0.5;
    const pricier = r.savingsPct !== null && r.savingsPct < 0;

    const badge = r.isSDA
        ? `<span class="agg-tag blue">BASELINE</span>`
        : cheaper
            ? `<span class="agg-tag green">SAVE ${r.savingsPct.toFixed(1)}%</span>`
            : pricier
                ? `<span class="agg-tag red">${r.savingsPct.toFixed(1)}%</span>`
                : "";

    const unitsDisplay = r.unitsNeeded < 0.000001
        ? r.unitsNeeded.toExponential(3)
        : r.unitsNeeded.toFixed(6).replace(/\.?0+$/, "");

    const sdaDisplay = Number(r.sdaEquiv || 0).toFixed(4);
    
    const effectiveProfit =
    (r.savingsPct ?? 0) < 0
        ? Math.abs(r.savings || 0)
        : (r.savings || 0);

const profitDisplay =
    effectiveProfit > 0
        ? `${effectiveProfit.toFixed(4)} SDA`
        : "-";

        // Liquidity warning
        // =====================================
// LIQUIDITY DISPLAY
// =====================================
const hasLiqData = r.maxSafeReceive !== null && r.maxSafeReceive !== undefined;

const liqWarnHTML = hasLiqData
    ? `
        <div class="agg-liq"
             style="
                font-size:11px;
                margin-top:4px;
                color:${r.liquidityWarn ? '#ff4d4f' : '#888'};
             ">
            <i class="fa-solid ${
                r.liquidityWarn
                    ? 'fa-triangle-exclamation'
                    : 'fa-droplet'
            }"></i>
            ${
                r.liquidityWarn
                    ? 'Max Aman'
                    : 'Liq OK'
            }:
            ~${
    r.maxSafeReceive < 0.01
        ? Number(r.maxSafeReceive).toExponential(2)
        : Number(r.maxSafeReceive).toLocaleString(undefined,{
            maximumFractionDigits:2
        })
}
            ${symbolOf(receiveToken)}
        </div>
    `
    : "";

return `
    <div class="agg-row
                ${isBest ? 'agg-best' : ''}
                ${r.liquidityWarn ? 'agg-liq-danger' : ''}"
         onclick="AGGREGATOR.usePayToken(
             '${r.payToken}',
             '${receiveToken}',
             ${targetAmt}
         )">

        <div class="agg-row-left">

            <img src="${r.payLogo}"
                 onerror="this.src='img/default.png'"
                 style="
                    width:28px;
                    height:28px;
                    border-radius:50%;
                    flex-shrink:0;
                    object-fit:contain;
                 ">

            <div>
                <div class="agg-path">
                    Bayar dengan <b>${r.paySymbol}</b>
                </div>

                <div class="agg-meta">
    ${unitsDisplay} ${r.paySymbol}
    &equiv; ${sdaDisplay} SDA
</div>

<div class="agg-profit"
     style="
        font-size:11px;
        margin-top:2px;
        color:${effectiveProfit > 0 ? '#00d084' : '#888'};
     ">
    Profit Est:
    ${
        profitDisplay === "-"
            ? "-"
            : `+ ${profitDisplay}`
    }
</div>

                ${liqWarnHTML}

            </div>
        </div>

   <div class="agg-row-right">

    <!-- TOP: BADGE (LOCKED AREA) -->
    <div class="agg-top-badges">
        ${badge}

        ${isBest && !r.isSDA && !r.liquidityWarn && r.savingsPct !== null && r.savingsPct > 0.5
            ? `<div class="agg-best-tag">BEST</div>`
            : ""
        }
    </div>

    <!-- BOTTOM: ACTIONS (ALWAYS STACK SAFE) -->
    <div class="agg-right-actions">

        <button class="agg-pin-btn"
            onclick="event.stopPropagation();
            AGGREGATOR.refreshSingleRoute(
                '${r.payToken}',
                '${receiveToken}',
                ${targetAmt}
            )">
            ↻
        </button>

        ${!r.isSDA ? `
            <button class="agg-pin-btn"
                onclick="event.stopPropagation();
                AGGREGATOR.toggleAggregatorCandidate('${r.payToken}')">
                ${
                    getAggregatorCandidates().includes(r.payToken)
                        ? '★'
                        : '☆'
                }
            </button>
        ` : ''}

        ${
    !r.isSDA &&
    r.savingsPct !== null
? `
    <button class="agg-auto-btn"
    onclick="event.stopPropagation();
    if(AGGREGATOR.isAutoRunning()) return;
AGGREGATOR.setAutoRunning(true);
    AGGREGATOR.lockAutoButton(this);
        ${
            r.savingsPct > 0
            ? `
            AGGREGATOR.autoRouteBuy(
                '${r.payToken}',
                '${receiveToken}',
                ${(r.maxSafeReceive || 0) * 0.85}
            )
            `
            : `
            AGGREGATOR.autoRouteReverse(
                '${r.payToken}',
                '${receiveToken}',
                ${(r.maxSafeReceive || 0) * 0.85}
            )
            `
        }">
        ⚡ Auto
    </button>
`
: ''
}

    </div>

</div>
</div>
`;
    }

    // =====================================
    // USE PAY TOKEN
    // =====================================
    function usePayToken(payToken, receiveToken, targetAmt) {
        window.swapState.payToken = payToken;

        const paySymEl  = document.getElementById("payTokenSymbol");
        const payIconEl = document.getElementById("payTokenIcon");
        if (paySymEl)  paySymEl.innerText = symbolOf(payToken);
        if (payIconEl) payIconEl.src      = logoOf(payToken);

        _calcPayAmount(payToken, receiveToken, targetAmt);
        showToast?.(`Bayar dengan ${symbolOf(payToken)}`, "success");
        if (window.innerWidth < 520) {
            const w = document.getElementById("aggPanelWrap");
            if (w) w.style.display = "none";
            _panelOpen = false;
        }
    }

    async function _calcPayAmount(payToken, receiveToken, targetAmt) {
        try {
            const rate = await PRICE_ENGINE.getAmountOut(payToken, receiveToken, 1);
            if (!rate || rate <= 0) return;
            const payInput  = document.getElementById("payAmount");
            const recvInput = document.getElementById("receiveAmount");
            if (payInput)  payInput.value  = (targetAmt / rate).toFixed(6);
            if (recvInput) recvInput.value = Number(targetAmt).toFixed(6);
        } catch {}
    }

    // =====================================
    // TOGGLE
    // =====================================
    function togglePanel() {
        const wrap = document.getElementById("aggPanelWrap");
        if (!wrap) return;
        _panelOpen = !_panelOpen;
        wrap.style.display = _panelOpen ? "block" : "none";
        const btn = document.getElementById("aggToggleBtn");
        if (btn) btn.innerHTML = `<i class="fa-solid fa-magnifying-glass-dollar"></i> Best Price
            <i class="fa-solid fa-chevron-${_panelOpen?'up':'down'}" style="font-size:10px;margin-left:4px;"></i>`;
        if (_panelOpen) triggerScan();
    }

    // =====================================
    // TRIGGER SCAN
    // =====================================
    async function triggerScan() {
        if (_scanning) return;

        const receiveToken = window.swapState?.receiveToken;
        const amount = parseFloat(
    document.getElementById("receiveAmount")?.value
) || 1;

        if (!receiveToken) return;

        const scanKey = `${receiveToken}_${amount}`;
        if (scanKey === _lastScanKey && _lastResults.length) {
            renderPanel(_lastResults, receiveToken, amount);
            return;
        }

        _scanning = true;
       await acquireWakeLock();
        _lastScanKey = scanKey;
        _setBadge("...");

        try {
            const results = await scanCheapestPayer(receiveToken, amount);

            // Enrich dengan data likuiditas
            const enriched = window.LIQUIDITY_CHECK
                ? await window.LIQUIDITY_CHECK.enrichWithLiquidity(results, receiveToken)
                : results;

            _lastResults  = enriched;
            cleanupAggregatorCandidates();
            renderPanel(enriched, receiveToken, amount);
            const cheaper = enriched.filter(r => !r.isSDA && r.savingsPct > 0.5).length;
            _setBadge(cheaper > 0 ? cheaper : enriched.length);
        } catch(e) {
            const p = document.getElementById("aggPanel");
            if (p) p.innerHTML = `<div style="padding:12px;color:#f66;font-size:12px;">Error: ${e.message}</div>`;
        } finally {
    _scanning = false;
    await releaseWakeLock();
        }
    }

    function _setBadge(val) {
        const b = document.getElementById("aggBadge");
        if (!b) return;
        b.textContent  = val;
        b.style.display = val ? "inline-block" : "none";
    }

    function rescan() { _lastScanKey = ""; triggerScan(); }

    // =====================================
    // INJECT UI
    // =====================================
    function injectUI() {
        const anchor = document.getElementById("bestRoute");
        if (!anchor) return;
        document.getElementById("arbResults")?.closest(".market-scan-box")?.remove();

        anchor.innerHTML = `
            <div class="agg-toggle-row">
                <button id="aggToggleBtn" class="agg-toggle-btn" onclick="AGGREGATOR.togglePanel()">
                    <i class="fa-solid fa-magnifying-glass-dollar"></i> Best Price
                    <i class="fa-solid fa-chevron-down" style="font-size:10px;margin-left:4px;"></i>
                </button>
                <span id="aggBadge" class="agg-badge" style="display:none;"></span>
                <button class="agg-rescan-btn"
        onclick="openAggregatorCandidatePicker()"
        title="Aggregator Tokens">
    <i class="fa-solid fa-sliders"></i>
</button>
                <button class="agg-rescan-btn" onclick="AGGREGATOR.rescan()" title="Rescan">
                    <i class="fa-solid fa-rotate"></i>
                </button>
            </div>
            <div id="aggPanelWrap" style="display:none;">
                <div id="aggPanel" class="agg-panel">
                    <div style="padding:14px;text-align:center;color:#888;font-size:12px;">
                        Pilih token yang ingin dibeli dulu
                    </div>
                </div>
            </div>`;
    }

    // =====================================
    // WATCHER
    // =====================================
    function initWatcher() {
        let lastKey = "";
        setInterval(() => {
            if (!_panelOpen) return;
if (_suspendWatcher) return;
            const rt  = window.swapState?.receiveToken;
            const amt = document.getElementById("receiveAmount")?.value || "1";
            const key = `${rt}_${amt}`;
            if (key !== lastKey) { lastKey = key; triggerScan(); }
        }, 1500);
    }

    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => { injectUI(); initWatcher(); }, 600);
    });
    
async function autoRouteBuy(
    intermediateToken,
    finalToken,
    targetFinalOutInput
) {
    let interReceived = 0;
    let finalReceived = 0;

    try {

        window._aggStartSda =
            await getWalletTokenBalance("native");

        _suspendWatcher = true;
        await acquireWakeLock();

        if (!targetFinalOutInput || targetFinalOutInput <= 0) {
            showToast?.("Invalid target", "error");
            return;
        }

        let targetFinalOut =
            targetFinalOutInput * 0.95;

        const rateIntermediateToFinal =
            await PRICE_ENGINE.getAmountOut(
                intermediateToken,
                finalToken,
                1
            );

        if (!rateIntermediateToFinal || rateIntermediateToFinal <= 0) {
            throw new Error("Route invalid");
        }

        let intermediateNeeded =
            targetFinalOut / rateIntermediateToFinal;

        const rateSdaToIntermediate =
            await PRICE_ENGINE.getAmountOut(
                "native",
                intermediateToken,
                1
            );

        if (!rateSdaToIntermediate || rateSdaToIntermediate <= 0) {
            throw new Error("Cannot price SDA route");
        }

        let sdaNeeded =
            intermediateNeeded / rateSdaToIntermediate;

        const MAX_AUTO_SDA_SPEND = 10;

        let adjusted = false;

        if (sdaNeeded > MAX_AUTO_SDA_SPEND) {
            const scale =
                MAX_AUTO_SDA_SPEND / sdaNeeded;

            targetFinalOut *= scale;
            intermediateNeeded *= scale;
            sdaNeeded = MAX_AUTO_SDA_SPEND;

            adjusted = true;
        }

        const ok = confirm(
            `Auto Arbitrage Full\n\n` +
            `${adjusted ? '⚠ Spend capped\n\n' : ''}` +
            `Start SDA: ${
    sdaNeeded < 0.0001
        ? sdaNeeded.toExponential(4)
        : sdaNeeded.toFixed(4)
}\n` +
            `Route:\n` +
            `SDA → ${symbolOf(intermediateToken)} → ${symbolOf(finalToken)} → SDA`
        );

        if (!ok) return;

        // =========================
        // STEP 1 SDA -> INTERMEDIATE
        // =========================
        const balInterBefore =
            await getWalletTokenBalance(
                intermediateToken
            );

        showToast?.(
            `1/3 Buy ${symbolOf(intermediateToken)}...`,
            "info"
        );

        await SWAP_ENGINE.executeSwap(
            "native",
            intermediateToken,
            sdaNeeded
        );

        await new Promise(r =>
            setTimeout(r, 2000)
        );

        const balInterAfter =
            await getWalletTokenBalance(
                intermediateToken
            );

        interReceived =
            balInterAfter - balInterBefore;

        if (interReceived <= 0) {
            throw new Error(
                "Intermediate not received"
            );
        }

        const safeInter =
            Math.floor(interReceived * 10000) / 10000;

        // =========================
        // STEP 2 INTERMEDIATE -> FINAL
        // =========================
        const balFinalBefore =
            await getWalletTokenBalance(
                finalToken
            );

        showToast?.(
            `2/3 Buy ${symbolOf(finalToken)}...`,
            "info"
        );

        try {

            await SWAP_ENGINE.executeSwap(
                intermediateToken,
                finalToken,
                safeInter
            );

        } catch (step2Err) {

            showToast?.(
                "Step 2 gagal — recovery sell intermediate...",
                "warning"
            );

            try {
                await SWAP_ENGINE.executeSwap(
                    intermediateToken,
                    "native",
                    safeInter * 0.999
                );
            } catch {}

            throw step2Err;
        }

        await new Promise(r =>
            setTimeout(r, 2000)
        );

        const balFinalAfter =
            await getWalletTokenBalance(
                finalToken
            );

        finalReceived =
            balFinalAfter - balFinalBefore;

        if (finalReceived <= 0) {
            throw new Error(
                "Final token not received"
            );
        }

        const safeFinal =
            Math.floor(finalReceived * 10000) / 10000;
            
            // refresh background setelah swap 2 selesai
refreshRouteDataAfterAuto(
    intermediateToken,
    finalToken
).catch(console.warn);

        // =========================
        // STEP 3 FINAL -> SDA
        // =========================
        showToast?.(
            `3/3 Sell to SDA...`,
            "info"
        );

        try {

            await SWAP_ENGINE.executeSwap(
                finalToken,
                "native",
                safeFinal
            );

        } catch (step3Err) {

            showToast?.(
                "Step 3 gagal — retry emergency sell...",
                "warning"
            );

            try {
                await SWAP_ENGINE.executeSwap(
                    finalToken,
                    "native",
                    safeFinal * 0.995
                );
            } catch {}

            throw step3Err;
        }

        await new Promise(r =>
            setTimeout(r, 2000)
        );

        // =========================
        // RESULT
        // =========================
        const finalSdaAfter =
            await getWalletTokenBalance(
                "native"
            );

        if (typeof loadBalance === "function") {
            await loadBalance();
        }

        if (typeof updateAddressUI === "function") {
            updateAddressUI();
        }

        if (typeof renderAssets === "function") {
            renderAssets();
        }

        if (balanceEl) {
            balanceEl.textContent =
                `${finalSdaAfter.toFixed(4)} SDA`;
        }

        const initialSda =
            window._aggStartSda ||
            finalSdaAfter;

        const profit =
    Number(
        (
            finalSdaAfter -
            initialSda
        ).toFixed(6)
    );

        const profitPct =
    Math.abs(initialSda) > 0
        ? (profit / initialSda) * 100
        : 0;

        showToast?.(
    profit >= MIN_AUTO_PROFIT_SDA
        ? `Profit +${profit.toFixed(4)} SDA (+${profitPct.toFixed(2)}%)`
        : `Rugi ${profit.toFixed(4)} SDA (${profitPct.toFixed(2)}%)`,
    profit >= MIN_AUTO_PROFIT_SDA
        ? "success"
        : "error"
);

        try {
            const audio =
                new Audio("audio/ding.mp3");

            audio.volume = 1;
            audio.preload = "auto";

            await audio.play().catch(()=>{});

        } catch {}

        showToast?.(
            "Full arbitrage completed",
            "success"
        );

    } catch (e) {

        console.error(e);

        showToast?.(
            e?.message ||
            "Auto arbitrage gagal",
            "error"
        );

    } finally {

    _suspendWatcher = false;
    await releaseWakeLock();

    setAutoRunning(false);
    unlockAutoButtons();
}
}


async function autoRouteReverse(
    intermediateToken,
    finalToken,
    targetOutInput
) {
    try {

        window._aggStartSda =
            await getWalletTokenBalance("native");

        _suspendWatcher = true;
        await acquireWakeLock();

        let spendSda = 10;

        try {
            const finalPerSda =
                await PRICE_ENGINE.getAmountOut(
                    "native",
                    finalToken,
                    1
                );

            const neededSda =
                targetOutInput / finalPerSda;

            spendSda = Math.min(
                neededSda * 0.95,
                10
            );
        } catch {}

        if (spendSda <= 0) {
            throw new Error("Invalid spend SDA");
        }

        const ok = confirm(
            `Auto Reverse Arbitrage\n\n` +
            `Route:\n` +
            `SDA → ${symbolOf(finalToken)} → ${symbolOf(intermediateToken)} → SDA\n\n` +
            `Spend: ${spendSda.toFixed(4)} SDA`
        );

        if (!ok) return;

        // =========================
        // STEP 1 SDA -> FINAL
        // =========================
        const finalBefore =
            await getWalletTokenBalance(finalToken);

        await SWAP_ENGINE.executeSwap(
            "native",
            finalToken,
            spendSda
        );

        await new Promise(r=>setTimeout(r,2000));

        const finalAfter =
            await getWalletTokenBalance(finalToken);

        const finalReceived =
            finalAfter - finalBefore;

        if (finalReceived <= 0) {
            throw new Error("Final token tidak diterima");
        }

        // =========================
        // STEP 2 FINAL -> INTERMEDIATE
        // =========================
        const step2Liq =
            await PRICE_ENGINE.getPoolLiquidity(
                finalToken,
                intermediateToken
            );

        let sellFinalAmount =
            finalReceived * 0.999;

        if (step2Liq?.maxSwapIn) {
            const maxSafeStep2 =
                formatTokenAmount(
                    step2Liq.maxSwapIn,
                    getTokenDecimals(finalToken)
                ) * 0.95;

            sellFinalAmount = Math.min(
                sellFinalAmount,
                maxSafeStep2
            );
        }

        const interBefore =
            await getWalletTokenBalance(
                intermediateToken
            );

        await SWAP_ENGINE.executeSwap(
            finalToken,
            intermediateToken,
            sellFinalAmount
        );

        await new Promise(r=>setTimeout(r,2000));

        const interAfter =
            await getWalletTokenBalance(
                intermediateToken
            );

        const interReceived =
            interAfter - interBefore;

        if (interReceived <= 0) {
            throw new Error(
                "Intermediate token tidak diterima"
            );
        }

// refresh background setelah swap 2 selesai
refreshRouteDataAfterAuto(
    intermediateToken,
    finalToken
).catch(console.warn);

        // =========================
        // STEP 3 INTERMEDIATE -> SDA
        // =========================
        const step3Liq =
            await PRICE_ENGINE.getPoolLiquidity(
                intermediateToken,
                "native"
            );

        let sellInterAmount =
            interReceived * 0.999;

        if (step3Liq?.maxSwapIn) {
            const maxSafeStep3 =
                formatTokenAmount(
                    step3Liq.maxSwapIn,
                    getTokenDecimals(intermediateToken)
                ) * 0.95;

            sellInterAmount = Math.min(
                sellInterAmount,
                maxSafeStep3
            );
        }

        await SWAP_ENGINE.executeSwap(
            intermediateToken,
            "native",
            sellInterAmount
        );

        await new Promise(r=>setTimeout(r,2000));

        const endSda =
            await getWalletTokenBalance("native");

        const profit =
            endSda - window._aggStartSda;

        showToast?.(
            profit >= 0
                ? `Profit +${profit.toFixed(4)} SDA`
                : `Loss ${profit.toFixed(4)} SDA`,
            profit >= 0 ? "success" : "error"
        );

    } catch (e) {

        console.error(e);

        showToast?.(
            profit >= 0
                ? `Profit +${profit.toFixed(4)} SDA`
                : `Loss ${profit.toFixed(4)} SDA`,
            profit >= 0 ? "success" : "error"
        );
        
        try {
    window.dingAudio.currentTime = 0;
    await window.dingAudio?.play();
} catch {}

    } catch (e) {

        console.error(e);

        showToast?.(
            e?.message || "Auto reverse gagal",
            "error"
        );

    } finally {

    _suspendWatcher = false;
    await releaseWakeLock();

    setAutoRunning(false);
    unlockAutoButtons();
}
}


async function buyMaxSafe(payToken, receiveToken) {
    try {

        const bestRoute = _lastResults.find(
            r => r.payToken === payToken
        );

        if (!bestRoute || !bestRoute.maxSafeReceive) {
            showToast?.(
                "Data liquidity belum tersedia",
                "error"
            );
            return;
        }

        // =====================================
        // SAFE BUFFER 95%
        // =====================================
        const safeReceive =
            bestRoute.maxSafeReceive * 0.95;

        // =====================================
        // ESTIMATE PAY NEEDED
        // =====================================
        const rate = await PRICE_ENGINE.getAmountOut(
            payToken,
            receiveToken,
            1
        );

        if (!rate || rate <= 0) {
            showToast?.(
                "Gagal hitung route",
                "error"
            );
            return;
        }

        let payNeeded = safeReceive / rate;

        // =====================================
        // REFINE USING REAL QUOTE
        // =====================================
        try {
            const realOut =
                await PRICE_ENGINE.getAmountOut(
                    payToken,
                    receiveToken,
                    payNeeded
                );

            if (realOut > 0) {
                payNeeded =
                    payNeeded *
                    (safeReceive / realOut);
            }

        } catch (e) {
            console.warn(
                "Refine quote failed:",
                e
            );
        }

        // =====================================
        // UPDATE SWAP STATE
        // =====================================
        window.swapState.payToken = payToken;

        document.getElementById(
            "payTokenSymbol"
        ).innerText = symbolOf(payToken);

        document.getElementById(
            "payTokenIcon"
        ).src = logoOf(payToken);

        // =====================================
        // FILL INPUTS
        // =====================================
        const payInput =
            document.getElementById("payAmount");

        const recvInput =
            document.getElementById("receiveAmount");

        if (payInput) {
            payInput.value =
                payNeeded.toFixed(6);
        }

        if (recvInput) {
            recvInput.value =
                safeReceive.toFixed(6);
        }

        showToast?.(
            `Auto set max safe ~${safeReceive.toFixed(2)} ${symbolOf(receiveToken)}`,
            "success"
        );

    } catch (e) {
        console.error(
            "buyMaxSafe error:",
            e
        );

        showToast?.(
            e?.message ||
            "Gagal auto set max safe",
            "error"
        );
    }
}

async function refreshRouteDataAfterAuto(
    intermediateToken,
    finalToken
) {
    try {

        const targetAmt =
            parseFloat(
                document.getElementById("receiveAmount")?.value
            ) || 1;

        // refresh route item yg berubah
        await Promise.allSettled([

            refreshSingleRoute(
                intermediateToken,
                finalToken,
                targetAmt
            ),

            refreshSingleRoute(
                finalToken,
                "native",
                targetAmt
            )

        ]);

        // refresh ranking + liquidity full
        _lastScanKey = "";
        triggerScan().catch(console.warn);

    } catch (e) {

        console.warn(
            "[AGG] refreshRouteDataAfterAuto fail:",
            e
        );

    }
}

return {
    togglePanel,
    triggerScan,
    rescan,
    usePayToken,
    scanCheapestPayer,
    buyMaxSafe,
    autoRouteBuy,
    autoRouteReverse,
    refreshSingleRoute,

    isAutoRunning,
    setAutoRunning,
    lockAutoButton,
    unlockAutoButtons,

    toggleAggregatorCandidate
};

})();