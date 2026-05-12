window.dingAudio = new Audio("audio/ding.mp3");
window.dingAudio.preload = "auto";

window._scanAlarmInterval = null;

window.startScanAlarm = function () {

    if (window._scanAlarmInterval) {
        return;
    }

    const playAlarm = async () => {

        try {

            window.dingAudio.currentTime = 0;

            await window.dingAudio.play();

        } catch(e) {
            console.warn(e);
        }
    };

    // bunyi langsung
    playAlarm();

    // ulang tiap 4 detik
    window._scanAlarmInterval = setInterval(
        playAlarm,
        4000
    );
};

window.stopScanAlarm = function () {

    if (window._scanAlarmInterval) {

        clearInterval(
            window._scanAlarmInterval
        );

        window._scanAlarmInterval = null;
    }

    try {

        window.dingAudio.pause();
        window.dingAudio.currentTime = 0;

    } catch(e){}
};

document.addEventListener("click", () => {

    window.dingAudio.play()
        .then(() => {

            window.dingAudio.pause();
            window.dingAudio.currentTime = 0;

        })
        .catch(()=>{});

}, { once:true });

[
    "click",
    "touchstart",
    "keydown"
].forEach(evt => {

    document.addEventListener(evt, () => {

        window.stopScanAlarm?.();

    }, {
        passive: true
    });
});

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

// =====================================
// AUTO SPEND CONFIG
// =====================================

window.AUTO_SPEND_PERCENT =
    window.AUTO_SPEND_PERCENT || 25;

window.MAX_AUTO_SDA =
    window.MAX_AUTO_SDA || 15;


    let _scanning      = false;
    let _stopRequested = false;
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


async function showProfitPopup(data) {

    const old =
        document.getElementById("aggProfitPopup");

    if (old) old.remove();

    const el =
        document.createElement("div");

    el.id = "aggProfitPopup";

    const profit =
        typeof data === "object"
            ? data.profit
            : data;

    const balance =
        data?.balance;

    const initial =
        data?.initial;

    const positive =
        profit >= 0;

    el.innerHTML = `
        <div style="
            font-size:26px;
            font-weight:700;
            margin-bottom:6px;
        ">
            ${
                positive ? "+" : ""
            }${profit.toFixed(4)} SDA
        </div>

        ${
            balance !== undefined
                ? `<div style="font-size:13px;opacity:.9;">
                        Final: ${balance.toFixed(4)} SDA
                   </div>`
                : ""
        }

        ${
            initial !== undefined
                ? `<div style="font-size:12px;opacity:.8;margin-top:4px;">
                        Start: ${initial.toFixed(4)} SDA
                   </div>`
                : ""
        }

        <div style="
            font-size:13px;
            opacity:.9;
            margin-top:6px;
        ">
            ${
                positive
                    ? "REAL PROFIT"
                    : "REAL LOSS"
            }
        </div>
    `;

    Object.assign(el.style, {

        position: "fixed",
        top: "50%",
        left: "50%",
        transform:
            "translate(-50%,-50%) scale(.8)",

        background:
            positive
                ? "rgba(0,180,120,.95)"
                : "rgba(255,70,70,.95)",

        color: "#fff",

        padding: "22px 26px",

        borderRadius: "18px",

        zIndex: 999999,

        textAlign: "center",

        boxShadow:
            "0 10px 40px rgba(0,0,0,.35)",

        opacity: "0",

        transition:
            "all .35s ease",

        backdropFilter:
            "blur(8px)"
    });

    document.body.appendChild(el);

    requestAnimationFrame(() => {

        el.style.opacity = "1";

        el.style.transform =
            "translate(-50%,-50%) scale(1)";
    });

    await new Promise(r =>
        setTimeout(r, 2200)
    );

    el.style.opacity = "0";

    el.style.transform =
        "translate(-50%,-50%) scale(.9)";

    await new Promise(r =>
        setTimeout(r, 400)
    );

    el.remove();
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
        if (document.visibilityState !== "visible") return;
        if (_wakeLock) return;

        const modalOpen  = !!document.getElementById("aggAutoModal");
        const autoActive = AGGREGATOR?._autoRunning === true;

        if (modalOpen || autoActive) {
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

    if (_lastResults?.length) {
        const receiveToken = window.swapState?.receiveToken;
        const targetAmt = parseFloat(
            document.getElementById("receiveAmount")?.value
        ) || 1;

        renderPanel(_lastResults, receiveToken, targetAmt);
    }
}

function getSmartCandidates() {

    return JSON.parse(
        localStorage.getItem(
            "aggSmartCandidates"
        ) || "[]"
    );
}

function saveSmartCandidate(
    token,
    profit = 0
) {

    if (
        !token ||
        token === "native"
    ) return;

    let list = getSmartCandidates();

    const found = list.find(
        x => x.token === token
    );

    if (found) {

        found.score += 1;
        found.profit += profit;
        found.last = Date.now();

    } else {

        list.push({
            token,
            score: 1,
            profit,
            last: Date.now()
        });
    }

    list.sort((a,b) => {

        if (b.score !== a.score) {
            return b.score - a.score;
        }

        return b.profit - a.profit;
    });

    list = list.slice(0, 25);

    localStorage.setItem(
        "aggSmartCandidates",
        JSON.stringify(list)
    );
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

let maxSafeReceive = null;
let liquidityWarn = false;

try {

    const liq =
        await PRICE_ENGINE.getPoolLiquidity(
            payToken,
            receiveToken
        );

    if (liq) {

        if (liq.maxSwapOut) {

            maxSafeReceive =
                formatTokenAmount(
                    liq.maxSwapOut,
                    getTokenDecimals(receiveToken)
                );
        }

        else if (liq.maxSwapIn) {

            maxSafeReceive =
                formatTokenAmount(
                    liq.maxSwapIn,
                    getTokenDecimals(payToken)
                ) * rateOut;
        }

        if (
            maxSafeReceive &&
            targetAmt > maxSafeReceive
        ) {
            liquidityWarn = true;
        }
    }

} catch(e) {

    console.warn(
        "[AGG] Refresh liq fail:",
        e
    );
}

return {
    payToken,
    paySymbol: symbolOf(payToken),
    payLogo: logoOf(payToken),
    unitsNeeded,
    sdaEquiv,
    isSDA: payToken === "native",
    savingsPct: null,
    hops: payToken === "native" ? 1 : 2,

    maxSafeReceive,
    liquidityWarn
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

    // refresh baseline SDA dulu supaya savingsPct akurat
    const baselineUpdated = await scanSpecificCandidate(
        "native",
        receiveToken,
        targetAmt
    );

    if (baselineUpdated) {
        const baseIdx = _lastResults.findIndex(x =>
            x.payToken === "native" || x.isSDA === true
        );
        if (baseIdx >= 0) {
            _lastResults[baseIdx] = {
                ..._lastResults[baseIdx],
                ...baselineUpdated,
                savings: 0,
                savingsPct: 0
            };
        }
    }

    // refresh token yang diminta
    const updated = await scanSpecificCandidate(
        payToken,
        receiveToken,
        targetAmt
    );

    if (!updated) {
        showToast?.("Refresh gagal", "error");
        return;
    }

    const idx = _lastResults.findIndex(x =>
        String(x.payToken || "").toLowerCase() ===
        String(payToken || "").toLowerCase()
    );

    if (idx < 0) {
        showToast?.("Route tidak ditemukan", "error");
        return;
    }

    _lastResults[idx] = {
        ..._lastResults[idx],
        ...updated
    };

    // hitung ulang savingsPct semua row berdasar baseline fresh
    const baseline = _lastResults.find(x =>
        x.payToken === "native" ||
        x.isSDA === true
    );

    if (baseline?.sdaEquiv > 0) {
        _lastResults.forEach((row, i) => {
            if (row.payToken === "native" || row.isSDA) {
                row.savings    = 0;
                row.savingsPct = 0;
                return;
            }
            const equiv = Number(row.sdaEquiv || 0);
            if (equiv <= 0) return;

            // savingsPct: positif = lebih murah dari SDA (bagus)
            // negatif = lebih mahal dari SDA
            const pct = ((baseline.sdaEquiv - equiv) / baseline.sdaEquiv) * 100;
            row.savingsPct = Math.abs(pct) < 0.01 ? 0 : pct;
            row.savings    = (row.savingsPct / 100) * baseline.sdaEquiv;
            _lastResults[i] = row;
        });
    }

    // sort: profit positif dulu, lalu negatif
    _lastResults.sort((a, b) => {
        const aSafe = !a.liquidityWarn;
        const bSafe = !b.liquidityWarn;
        if (aSafe && !bSafe) return -1;
        if (!aSafe && bSafe) return 1;
        return (b.savingsPct ?? -999) - (a.savingsPct ?? -999);
    });

    renderPanel(_lastResults, receiveToken, targetAmt);

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

const smartList =
    getSmartCandidates();

const smartSet = new Set(
    smartList.map(x =>
        String(x.token).toLowerCase()
    )
);

let filteredCustom = tokenList.filter(
    t => {

        if (!t.address) {
            return false;
        }

        const addr =
            String(t.address).toLowerCase();

        if (selectedSet.has(addr)) {
            return true;
        }

        if (smartSet.has(addr)) {
            return true;
        }

        return false;
    }
);

const uniqueMap = new Map();

filteredCustom.forEach(t => {

    if (!t?.address) return;

    const key =
        String(t.address).toLowerCase();

    if (!uniqueMap.has(key)) {
        uniqueMap.set(key, t);
    }
});

const candidates = [
    {
        address: "native",
        symbol: "SDA",
        logo: "img/sda.png"
    },

    ...Array.from(uniqueMap.values()).filter(t =>
        t.address &&
        !_same(t.address, receiveToken) &&
        !_same(t.address, WSDA()) &&
        t.symbol !== "WSDA"
    )
];

const targetAmt =
    amountOut > 0
        ? amountOut
        : 1;

const panelEl =
    document.getElementById("aggPanel");

if (!filteredCustom.length) {

    if (panelEl) {

        const smartCount =
            smartList.length;

        panelEl.innerHTML = `
            <div style="
                padding:14px;
                color:#888;
                font-size:12px;
                line-height:1.5;
            ">
                Tidak ada kandidat manual dipilih.
                <br><br>

                Smart Kandidat:
                <b style="color:#00d084">
                    ${smartCount}
                </b>

                <br><br>

                Jalankan auto profit dulu
                agar sistem belajar token terbaik.
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

const dbg = (msg) => {

    if (!panelEl) return;

    panelEl.innerHTML += `
        <div style="
            font-size:10px;
            color:#555;
            padding:1px 12px;
        ">
            ${msg}
        </div>
    `;
};

if (panelEl) {

    const manualCount =
        filteredCustom.filter(t =>
            selectedSet.has(
                String(t.address).toLowerCase()
            )
        ).length;

    const smartOnlyCount =
        filteredCustom.length - manualCount;

    panelEl.innerHTML = `
        <div style="
            padding:10px 12px;
            font-size:11px;
            color:#888;
            line-height:1.5;
        ">
            Scan
            <b>${candidates.length}</b>
            kandidat
            untuk
            <b>${symbolOf(receiveToken)}</b>

            <br>

            Manual:
            ${manualCount}

            - Smart:
            ${smartOnlyCount}

            - SDA baseline
        </div>
    `;
}

let baselineSDACost = null;

try {

    const sdaOut =
        await withTimeout(
            PRICE_ENGINE.getAmountOut(
                "native",
                receiveToken,
                1
            ),
            SCAN_TIMEOUT
        );

    dbg(
        `SDA -> ${symbolOf(receiveToken)}: ${sdaOut}`
    );

    if (sdaOut > 0) {
        baselineSDACost =
            targetAmt / sdaOut;
    }

} catch(e) {

    dbg(
        `baseline err: ${e.message}`
    );
}

const results = [];

for (
    let i = 0;
    i < candidates.length;
    i += BATCH_SIZE
) {

    const batch =
        candidates.slice(
            i,
            i + BATCH_SIZE
        );

    const batchRes =
        await Promise.all(
            batch.map(async (token) => {

                try {

                    const rateOut =
                        await withTimeout(
                            PRICE_ENGINE.getAmountOut(
                                token.address,
                                receiveToken,
                                1
                            ),
                            SCAN_TIMEOUT
                        );

                    dbg(
                        `${token.symbol} -> ${symbolOf(receiveToken)}: ${rateOut}`
                    );

                    if (!rateOut || rateOut <= 0) {

    return {
        payToken: token.address,
        paySymbol: token.symbol,
        failed: true,
        reason: "No route"
    };
}

                    const unitsNeeded =
                        targetAmt / rateOut;

                    let sdaPerToken =
                        _isNat(token.address)
                            ? 1
                            : null;

                    if (!sdaPerToken) {

                        const out2 =
                            await withTimeout(
                                PRICE_ENGINE.getAmountOut(
                                    "native",
                                    token.address,
                                    1
                                ),
                                SCAN_TIMEOUT
                            );

                        dbg(
                            `SDA -> ${token.symbol}: ${out2}`
                        );

                        sdaPerToken =
                            out2 > 0
                                ? (1 / out2)
                                : null;
                    }

                    if (
                        !sdaPerToken ||
                        sdaPerToken <= 0
                    ) {
                        return null;
                    }

                    const totalSDAEq =
                        unitsNeeded *
                        sdaPerToken;

                    const hops =
                        _isNat(token.address)
                            ? 1
                            : 2;

                    const feeAdj =
                        Math.pow(
                            1 - FEE_PER_HOP,
                            hops
                        ) *
                        (1 - SLIPPAGE);

                    const netSDAEq =
                        totalSDAEq / feeAdj;

                    let savingsPct = null;

                    if (
                        baselineSDACost &&
                        baselineSDACost > 0
                    ) {

                        savingsPct =
                            (
                                (
                                    baselineSDACost -
                                    netSDAEq
                                ) /
                                baselineSDACost
                            ) * 100;
                    }


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

            // Cek stop request — simpan hasil sementara langsung ke cache
            if (_stopRequested) {
                console.log("[AGG] Scan dihentikan manual, simpan hasil sementara");
                break;
            }

            if (i + BATCH_SIZE < candidates.length) await new Promise(r => setTimeout(r, BATCH_DELAY));
        }

        results.sort((a, b) => {

    const aProfit = a.savings ?? -999999;
    const bProfit = b.savings ?? -999999;

    if (bProfit !== aProfit) {
        return bProfit - aProfit;
    }

    const aLiq = a.maxSafeReceive ?? 0;
    const bLiq = b.maxSafeReceive ?? 0;

    if (bLiq !== aLiq) {
        return bLiq - aLiq;
    }

    return (b.savingsPct ?? -999) - (a.savingsPct ?? -999);

});

return results
    .filter(r =>
        r &&
        r.sdaEquiv &&
        isFinite(r.sdaEquiv)
    )
    .sort((a, b) => {

        const aSafe = !a.liquidityWarn;
        const bSafe = !b.liquidityWarn;

        // Hapus prioritas safe — tampilkan semua, urut by profit
        // if (aSafe && !bSafe) return -1;
        // if (!aSafe && bSafe) return 1;

        const aProfit =
            Math.abs(a.savings || 0);

        const bProfit =
            Math.abs(b.savings || 0);

        if (bProfit !== aProfit) {
            return bProfit - aProfit;
        }

        const aLiq =
            a.maxSafeReceive || 0;

        const bLiq =
            b.maxSafeReceive || 0;

        return bLiq - aLiq;
    })
    .slice(0, 30);
    }

    // =====================================
    // RENDER
    // =====================================
    function renderPanel(results, receiveToken, targetAmt) {
        const el = document.getElementById("aggPanel");
        if (!el) return;

        if (!results?.length) {
            el.innerHTML = `<div style="padding:16px;text-align:center;color:#888;font-size:12px;">
                Tidak ada data — coba token lain</div>`;
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

    // Gabungkan semua termasuk liquidityWarn (merah) — jangan disembunyikan
    const allCombined = [
        ...profitable,
        ...reverseCandidates,
        ...neutral
    ];

    // Deduplicate by payToken
    const seen = new Set();
    const deduped = allCombined.filter(r => {
        const key = String(r.payToken).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    renderPanel(
        deduped.slice(0, 25),
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

    <div class="agg-top-badges">
        ${badge}

        ${isBest && !r.isSDA && !r.liquidityWarn && r.savingsPct !== null && r.savingsPct > 0.5
            ? `<div class="agg-best-tag">BEST</div>`
            : ""
        }
    </div>

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
onclick="
    event.stopPropagation();

    if(AGGREGATOR.isAutoRunning()) return;

    AGGREGATOR.setAutoRunning(true);
    AGGREGATOR.lockAutoButton(this);

    window._activeAutoRoute = {
        intermediateToken: '${r.payToken}',
        finalToken: '${receiveToken}',
        sdaMax: ${r.sdaEquiv || r.maxSafeReceive || 0}
    };

    window.ACTIVE_ROUTE = {
        payToken: '${r.payToken}',
        receiveToken: '${receiveToken}',
        rate: ${Number(r.unitsNeeded || 0) > 0
            ? (Number(r.unitsNeeded) / Number(r.sdaEquiv || 1))
            : 0},
        sdaEquiv: ${Number(r.sdaEquiv || 0)},
        unitsNeeded: ${Number(r.unitsNeeded || 0)},
        maxSafeReceive: ${Number(r.maxSafeReceive || 0)}
    };

    openAutoSpendModal(
        '${r.savingsPct > 0 ? 'buy' : 'reverse'}',
        '${r.payToken}',
        '${receiveToken}',
        ${r.sdaEquiv || r.maxSafeReceive || 0}
    );
">
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
    _stopRequested = false;

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
        _stopRequested = false;
        await acquireWakeLock();
        _lastScanKey = scanKey;
        _setBadge("...");

        // Tampilkan tombol stop
        const stopBtn = document.getElementById("aggStopBtn");
        if (stopBtn) stopBtn.style.display = "inline-flex";

        try {
            const results = await scanCheapestPayer(receiveToken, amount);

const enriched = window.LIQUIDITY_CHECK
    ? await window.LIQUIDITY_CHECK.enrichWithLiquidity(results, receiveToken)
    : results;

_lastResults = enriched;

AGGREGATOR._lastResults = enriched;

cleanupAggregatorCandidates();
renderPanel(enriched, receiveToken, amount);
            const cheaper = enriched.filter(r => !r.isSDA && r.savingsPct > 0.5).length;
            _setBadge(cheaper > 0 ? cheaper : enriched.length);
        } catch(e) {
            const p = document.getElementById("aggPanel");
            if (p) p.innerHTML = `<div style="padding:12px;color:#f66;font-size:12px;">Error: ${e.message}</div>`;
        } finally {

    _scanning = false;
    _stopRequested = false;

    // Sembunyikan tombol stop
    const stopBtn = document.getElementById("aggStopBtn");
    if (stopBtn) stopBtn.style.display = "none";

    try {

        window.startScanAlarm();

    } catch(e) {
        console.warn(e);
    }

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
                <button id="aggStopBtn" class="agg-rescan-btn"
                    onclick="AGGREGATOR.stopScan()"
                    title="Stop Scan & Save"
                    style="display:none; color:#ff6b6b;">
                    <i class="fa-solid fa-stop"></i>
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


async function emergencyBackToSDA(
    token,
    amount,
    retries = 3
) {

    if (!token || token === "native") {
        return false;
    }

    let lastErr = null;

    for (let i = 0; i < retries; i++) {

        try {

            showToast?.(
                `Recovery sell ${symbolOf(token)}...`,
                "warning"
            );

            await SWAP_ENGINE.executeSwap(
                token,
                "native",
                amount * 0.995
            );

            await new Promise(r =>
                setTimeout(r, 1200)
            );

            showToast?.(
                `${symbolOf(token)} recovered to SDA`,
                "success"
            );

            return true;

        } catch (e) {

            lastErr = e;

            console.warn(
                "[RECOVERY FAIL]",
                i + 1,
                e
            );

            await new Promise(r =>
                setTimeout(r, 1500)
            );
        }
    }

    console.error(
        "[RECOVERY FINAL FAIL]",
        lastErr
    );

    showToast?.(
        `Recovery gagal untuk ${symbolOf(token)}`,
        "error"
    );

    return false;
}

window.simulateFullCycle = async function (
    intermediateToken,
    finalToken,
    spendSda
) {

    try {

        const FEE_BUFFER = 0.003;
        const SLIP_BUFFER = 0.004;

        const HOP_BUFFER =
            (1 - FEE_BUFFER) *
            (1 - SLIP_BUFFER);

        if (!spendSda || spendSda <= 0) return null;
        if (!intermediateToken || !finalToken) return null;

        const interOut =
            await PRICE_ENGINE.getAmountOut(
                "native",
                intermediateToken,
                spendSda
            );

        if (!interOut || interOut <= 0 || !isFinite(interOut)) {
            return null;
        }

        const interNet = interOut * HOP_BUFFER;

        const finalOut =
            await PRICE_ENGINE.getAmountOut(
                intermediateToken,
                finalToken,
                interNet
            );

        if (!finalOut || finalOut <= 0 || !isFinite(finalOut)) {
            return null;
        }

        const finalNet = finalOut * HOP_BUFFER;

        const backToSda =
            await PRICE_ENGINE.getAmountOut(
                finalToken,
                "native",
                finalNet
            );

        if (!backToSda || backToSda <= 0 || !isFinite(backToSda)) {
            return null;
        }

        const backNet = backToSda * HOP_BUFFER;

        const estimatedProfit =
            backNet - spendSda;

        const estimatedPct =
            spendSda > 0
                ? (estimatedProfit / spendSda) * 100
                : 0;

        return {
            spendSda,
            estimatedBack: backNet,
            estimatedProfit,
            estimatedPct
        };

    } catch (e) {

        console.warn("[SIMULATION ERROR]", e);

        return null;
    }
};


// =====================================
// AUTO ROUTE BUY
// spendSda — langsung dari modal, tidak dihitung ulang di sini
// =====================================
async function autoRouteBuy(
    intermediateToken,
    finalToken,
    spendSda          // <-- WAJIB diisi dari modal, sudah final
) {

    let interReceived = 0;
    let finalReceived = 0;

    async function emergencyBackToSDA(
        token,
        amount,
        retries = 3
    ) {

        if (!token || token === "native") {
            return false;
        }

        let lastErr = null;

        for (let i = 0; i < retries; i++) {

            try {

                showToast?.(
                    `Recovery sell ${symbolOf(token)}...`,
                    "warning"
                );

                await SWAP_ENGINE.executeSwap(
                    token,
                    "native",
                    amount * 0.995
                );

                await new Promise(r =>
                    setTimeout(r, 2000)
                );

                showToast?.(
                    `${symbolOf(token)} recovered to SDA`,
                    "success"
                );

                return true;

            } catch (e) {

                lastErr = e;

                console.warn(
                    "[RECOVERY FAIL]",
                    i + 1,
                    e
                );

                await new Promise(r =>
                    setTimeout(r, 1500)
                );
            }
        }

        console.error(
            "[RECOVERY FINAL FAIL]",
            lastErr
        );

        showToast?.(
            `Recovery gagal untuk ${symbolOf(token)}`,
            "error"
        );

        return false;
    }

    try {

        // validasi spend dari modal
        if (!spendSda || spendSda <= 0) {
            showToast?.("Invalid spend SDA dari modal", "error");
            return;
        }

        window._aggStartSda =
            await getWalletTokenBalance("native");

        _suspendWatcher = true;

        await acquireWakeLock();

        // =====================================
        // STEP 1: SDA -> INTERMEDIATE
        // =====================================

        const balInterBefore =
            await getWalletTokenBalance(intermediateToken);

        showToast?.(
            `1/3 Buy ${symbolOf(intermediateToken)}...`,
            "info"
        );

        await SWAP_ENGINE.executeSwap(
            "native",
            intermediateToken,
            spendSda
        );

        await new Promise(r =>
            setTimeout(r, 1200)
        );

        const balInterAfter =
            await getWalletTokenBalance(intermediateToken);

        interReceived =
            balInterAfter - balInterBefore;

        if (interReceived <= 0) {
            throw new Error("Intermediate not received");
        }

        const safeInter =
            Math.floor(interReceived * 10000) / 10000;

        // =====================================
        // STEP 2: INTERMEDIATE -> FINAL
        // =====================================

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
                "Step 2 gagal — emergency recovery...",
                "warning"
            );

            await emergencyBackToSDA(
                intermediateToken,
                safeInter
            );

            window._saveTradeResult?.({
                pairKey:
                    `${String(intermediateToken).toLowerCase()}_${String(finalToken).toLowerCase()}`,
                mode:     "buy",
                spendSda,
                profitSda:  0,
                step1ok:    true,
                step2ok:    false,
                step3ok:    false,
                failedAt:   2,
                intermediateToken,
                finalToken,
                marginAtTrade: 0
            });

            throw step2Err;
        }

        await new Promise(r =>
            setTimeout(r, 1200)
        );

        const balFinalAfter =
            await getWalletTokenBalance(
                finalToken
            );

        finalReceived =
            balFinalAfter -
            balFinalBefore;

        if (finalReceived <= 0) {
            throw new Error(
                "Final token not received"
            );
        }

        const safeFinal =
            Math.floor(
                finalReceived * 10000
            ) / 10000;

        try {

            refreshRouteDataAfterAuto(
                intermediateToken,
                finalToken
            );

        } catch (e) {

            console.warn(e);
        }

        if (!isAutoRunning()) {

            throw new Error(
                "Auto interrupted before step 3"
            );
        }

        showToast?.(
            `3/3 Sell to SDA...`,
            "info"
        );

        // =====================================
        // STEP 3: FINAL -> SDA
        // =====================================

        try {

            await new Promise(r =>
                setTimeout(r, 1200)
            );

            await SWAP_ENGINE.executeSwap(
                finalToken,
                "native",
                safeFinal
            );

        } catch (step3Err) {

            showToast?.(
                "Step 3 gagal — retry sell SDA...",
                "warning"
            );

            await emergencyBackToSDA(
                finalToken,
                safeFinal
            );

            window._saveTradeResult?.({
                pairKey:
                    `${String(intermediateToken).toLowerCase()}_${String(finalToken).toLowerCase()}`,
                mode:     "buy",
                spendSda,
                profitSda:  0,
                step1ok:    true,
                step2ok:    true,
                step3ok:    false,
                failedAt:   3,
                intermediateToken,
                finalToken,
                marginAtTrade: 0
            });

            throw step3Err;
        }

        await new Promise(r =>
            setTimeout(r, 1200)
        );

        // =====================================
        // RESULT
        // =====================================

const finalSdaAfter =
    await getWalletTokenBalance("native");

const initialSda =
    window._aggStartSda || finalSdaAfter;

const profit = Number(
    (finalSdaAfter - initialSda).toFixed(6)
);

await showProfitPopup({
    profit,
    balance: finalSdaAfter,
    initial: initialSda
});

addTradeLog({
    profit,
    route: `SDA → ${symbolOf(intermediateToken)} → ${symbolOf(finalToken)} → SDA`
});

updateSessionProfit(profit);

try {

    const text =
        profit >= 0
            ? `Profit ${profit.toFixed(2)} SDA`
            : `Loss ${Math.abs(profit).toFixed(2)} SDA`;

    speechSynthesis.cancel();

    const utter =
        new SpeechSynthesisUtterance(
            text
        );

    utter.lang = "id-ID";

    utter.rate = 1;

    utter.pitch = 1;

    speechSynthesis.speak(
        utter
    );

} catch (e) {

    console.warn(e);
}

if (typeof loadBalance === "function") {
    await loadBalance();
}

if (typeof updateAddressUI === "function") {
    updateAddressUI();
}

if (typeof renderAssets === "function") {
    renderAssets();
}

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

if (profit > 0) {

    saveSmartCandidate(
        intermediateToken,
        profit
    );

    saveSmartCandidate(
        finalToken,
        profit
    );
}

window._saveTradeResult?.({
    pairKey:
        `${String(intermediateToken).toLowerCase()}_${String(finalToken).toLowerCase()}`,
    mode:              "buy",
    spendSda,
    profitSda:         profit,
    step1ok:           true,
    step2ok:           true,
    step3ok:           true,
    failedAt:          null,
    intermediateToken,
    finalToken,
    marginAtTrade:
        window._marginHistory?.[
            `${String(intermediateToken).toLowerCase()}_${String(finalToken).toLowerCase()}`
        ]?.slice(-1)?.[0]?.margin ?? 0
});

        showToast?.(
            "Full arbitrage completed",
            "success"
        );

    } catch (e) {

        console.error(e);

        try {

            if (finalReceived > 0) {

                await emergencyBackToSDA(
                    finalToken,
                    finalReceived
                );

            } else if (interReceived > 0) {

                await emergencyBackToSDA(
                    intermediateToken,
                    interReceived
                );
            }

        } catch {}

        showToast?.(
            e?.message ||
            "Auto arbitrage gagal",
            "error"
        );

    } finally {

        _suspendWatcher = false;

        try {

            await releaseWakeLock();

        } catch (e) {

            console.warn(e);
        }

        setAutoRunning(false);

        unlockAutoButtons();
    }
}


// =====================================
// AUTO ROUTE REVERSE
// spendSda — langsung dari modal, tidak dihitung ulang di sini
// =====================================
async function autoRouteReverse(
    intermediateToken,
    finalToken,
    spendSda          // <-- WAJIB diisi dari modal, sudah final
) {

    let finalReceived = 0;
    let interReceived = 0;

    async function emergencyBackToSDA(
        token,
        amount,
        retries = 3
    ) {

        if (!token || token === "native") {
            return false;
        }

        let lastErr = null;

        for (let i = 0; i < retries; i++) {

            try {

                showToast?.(
                    `Recovery sell ${symbolOf(token)}...`,
                    "warning"
                );

                await SWAP_ENGINE.executeSwap(
                    token,
                    "native",
                    amount * 0.995
                );

                await new Promise(r =>
                    setTimeout(r, 1200)
                );

                showToast?.(
                    `${symbolOf(token)} recovered to SDA`,
                    "success"
                );

                return true;

            } catch (e) {

                lastErr = e;

                console.warn(
                    "[RECOVERY FAIL]",
                    i + 1,
                    e
                );

                await new Promise(r =>
                    setTimeout(r, 1500)
                );
            }
        }

        console.error(
            "[RECOVERY FINAL FAIL]",
            lastErr
        );

        showToast?.(
            `Recovery gagal untuk ${symbolOf(token)}`,
            "error"
        );

        return false;
    }

    try {

        // validasi spend dari modal
        if (!spendSda || spendSda <= 0) {
            showToast?.("Invalid spend SDA dari modal", "error");
            return;
        }

        window._aggStartSda =
            await getWalletTokenBalance(
                "native"
            );

        _suspendWatcher = true;

        await acquireWakeLock();

        // =====================================
        // STEP 1: SDA -> FINAL
        // =====================================

        const finalBefore =
            await getWalletTokenBalance(
                finalToken
            );

        showToast?.(
            `1/3 Buy ${symbolOf(finalToken)}...`,
            "info"
        );

        await SWAP_ENGINE.executeSwap(
            "native",
            finalToken,
            spendSda
        );

        await new Promise(r =>
            setTimeout(r, 1200)
        );

        const finalAfter =
            await getWalletTokenBalance(
                finalToken
            );

        finalReceived =
            finalAfter - finalBefore;

        if (finalReceived <= 0) {

            throw new Error(
                "Final token tidak diterima"
            );
        }

        // =====================================
        // STEP 2: FINAL -> INTERMEDIATE
        // =====================================

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
                    getTokenDecimals(
                        finalToken
                    )
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

        showToast?.(
            `2/3 Swap to ${symbolOf(intermediateToken)}...`,
            "info"
        );

        try {

            await SWAP_ENGINE.executeSwap(
                finalToken,
                intermediateToken,
                sellFinalAmount
            );

        } catch (step2Err) {

            showToast?.(
                "Step 2 gagal — emergency recovery...",
                "warning"
            );

            await emergencyBackToSDA(
                finalToken,
                sellFinalAmount
            );

            window._saveTradeResult?.({
                pairKey:
                    `${String(intermediateToken).toLowerCase()}_${String(finalToken).toLowerCase()}`,
                mode:     "reverse",
                spendSda,
                profitSda:  0,
                step1ok:    true,
                step2ok:    false,
                step3ok:    false,
                failedAt:   2,
                intermediateToken,
                finalToken,
                marginAtTrade: 0
            });

            throw step2Err;
        }

        await new Promise(r =>
            setTimeout(r, 1200)
        );

        const interAfter =
            await getWalletTokenBalance(
                intermediateToken
            );

        interReceived =
            interAfter - interBefore;

        if (interReceived <= 0) {

            throw new Error(
                "Intermediate token tidak diterima"
            );
        }

        try {

            refreshRouteDataAfterAuto(
                intermediateToken,
                finalToken
            );

            setTimeout(() => {

                const btn =
                    document.querySelector(
                        ".agg-pin-btn"
                    );

                if (btn) btn.click();

            }, 300);

        } catch (e) {

            console.warn(e);
        }

        // =====================================
        // STEP 3: INTERMEDIATE -> SDA
        // =====================================

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
                    getTokenDecimals(
                        intermediateToken
                    )
                ) * 0.95;

            sellInterAmount = Math.min(
                sellInterAmount,
                maxSafeStep3
            );
        }

// =====================================
// LIVE PROFIT RECHECK
// =====================================

const liveBack =
    await PRICE_ENGINE.getAmountOut(
        intermediateToken,
        "native",
        sellInterAmount
    );

const liveProfit =
    liveBack - spendSda;

const livePct =
    (liveProfit / spendSda) * 100;

const SAFE_EXIT_BUFFER = 1.2;

if (
    !isFinite(liveProfit) ||
    liveProfit <= 0 ||
    livePct < SAFE_EXIT_BUFFER
) {

    showToast?.(
        `Profit drop ${livePct.toFixed(2)}% — emergency exit`,
        "warning"
    );

    await emergencyBackToSDA(
        intermediateToken,
        sellInterAmount
    );

    return;
}

        showToast?.(
            `3/3 Sell to SDA...`,
            "info"
        );

        try {

            await SWAP_ENGINE.executeSwap(
                intermediateToken,
                "native",
                sellInterAmount
            );

        } catch (step3Err) {

            showToast?.(
                "Step 3 gagal — retry sell SDA...",
                "warning"
            );

            await emergencyBackToSDA(
                intermediateToken,
                sellInterAmount
            );

            window._saveTradeResult?.({
                pairKey:
                    `${String(intermediateToken).toLowerCase()}_${String(finalToken).toLowerCase()}`,
                mode:     "reverse",
                spendSda,
                profitSda:  0,
                step1ok:    true,
                step2ok:    true,
                step3ok:    false,
                failedAt:   3,
                intermediateToken,
                finalToken,
                marginAtTrade: 0
            });

            throw step3Err;
        }

        await new Promise(r =>
            setTimeout(r, 1200)
        );

        // =====================================
        // RESULT
        // =====================================

const endSda =
    await getWalletTokenBalance("native");

const initialSda =
    window._aggStartSda || endSda;

const profit =
    endSda - initialSda;

showProfitPopup({
    profit,
    balance: endSda,
    initial: initialSda
}).catch(console.warn);

addTradeLog({
    profit,
    route: `SDA → ${symbolOf(finalToken)} → ${symbolOf(intermediateToken)} → SDA`
});

updateSessionProfit(profit);

try {

const text =
    profit >= 0
        ? `Profit ${profit.toFixed(2).replace(".", ",")} SDA`
        : `Loss ${Math.abs(profit).toFixed(2).replace(".", ",")} SDA`;

    speechSynthesis.cancel();

    const utter =
        new SpeechSynthesisUtterance(
            text
        );

    utter.lang = "id-ID";

    utter.rate = 1;

    utter.pitch = 1;

    speechSynthesis.speak(
        utter
    );

} catch (e) {

    console.warn(e);
}

showToast?.(
    profit >= 0
        ? `Profit +${profit.toFixed(4)} SDA`
        : `Loss ${profit.toFixed(4)} SDA`,
    profit >= 0
        ? "success"
        : "error"
);

        try {

            window.dingAudio.currentTime = 0;

            await window.dingAudio?.play();

        } catch {}

    } catch (e) {

        console.error(e);

        try {

            if (interReceived > 0) {

                await emergencyBackToSDA(
                    intermediateToken,
                    interReceived
                );

            } else if (finalReceived > 0) {

                await emergencyBackToSDA(
                    finalToken,
                    finalReceived
                );
            }

        } catch {}

        try {

            window.dingAudio.currentTime = 0;

            await window.dingAudio?.play();

        } catch {}

        showToast?.(
            e?.message ||
            "Auto reverse gagal",
            "error"
        );

    } finally {

        _suspendWatcher = false;

        try {

            await releaseWakeLock();

        } catch (e) {

            console.warn(e);
        }

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

        const safeReceive =
            bestRoute.maxSafeReceive * 0.95;

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

        window.swapState.payToken = payToken;

        document.getElementById(
            "payTokenSymbol"
        ).innerText = symbolOf(payToken);

        document.getElementById(
            "payTokenIcon"
        ).src = logoOf(payToken);

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

function refreshRouteDataAfterAuto(
    intermediateToken,
    finalToken
) {
    const targetAmt =
        parseFloat(
            document.getElementById("receiveAmount")?.value
        ) || 1;

    // receiveToken yang benar adalah finalToken
    // semua row di _lastResults perlu dihitung ulang savingsPct-nya
    (async () => {
        try {
            // refresh token intermediate terhadap finalToken
            await refreshSingleRoute(
                intermediateToken,
                finalToken,
                targetAmt
            );

            // juga refresh semua token lain yang ada di _lastResults
            // supaya panel tidak jadi single row
            const others = (_lastResults || []).filter(r =>
                r.payToken !== "native" &&
                !r.isSDA &&
                String(r.payToken || "").toLowerCase() !==
                String(intermediateToken || "").toLowerCase()
            );

            for (const row of others) {
                try {
                    const upd = await scanSpecificCandidate(
                        row.payToken,
                        finalToken,
                        targetAmt
                    );
                    if (!upd) continue;

                    const i = _lastResults.findIndex(x =>
                        String(x.payToken || "").toLowerCase() ===
                        String(row.payToken || "").toLowerCase()
                    );
                    if (i >= 0) {
                        _lastResults[i] = { ..._lastResults[i], ...upd };
                    }
                } catch(e) {
                    console.warn("[REFRESH OTHER]", e);
                }
            }

            // hitung ulang savingsPct semua setelah semua ter-refresh
            const baseline = _lastResults.find(x =>
                x.payToken === "native" || x.isSDA
            );

            if (baseline?.sdaEquiv > 0) {
                _lastResults.forEach((row, i) => {
                    if (row.payToken === "native" || row.isSDA) {
                        row.savings = 0; row.savingsPct = 0; return;
                    }
                    const equiv = Number(row.sdaEquiv || 0);
                    if (equiv <= 0) return;
                    const pct = ((baseline.sdaEquiv - equiv) / baseline.sdaEquiv) * 100;
                    row.savingsPct = Math.abs(pct) < 0.01 ? 0 : pct;
                    row.savings    = (row.savingsPct / 100) * baseline.sdaEquiv;
                    _lastResults[i] = row;
                });
            }

            _lastResults.sort((a, b) =>
                (b.savingsPct ?? -999) - (a.savingsPct ?? -999)
            );

            renderPanel(_lastResults, finalToken, targetAmt);

        } catch (e) {
            console.warn("[REFRESH AFTER AUTO]", e);
        }
    })();
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

    toggleAggregatorCandidate,

    stopScan: function() {
        if (!_scanning) return;
        _stopRequested = true;
        showToast?.("Scan dihentikan — hasil disimpan", "info");
    }
};

})();