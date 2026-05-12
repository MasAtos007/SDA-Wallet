// =====================================
// AUTO MODAL ENGINE â€” FINAL v6
// spend SDA dihitung di sini, langsung dikirim ke engine
// engine tidak kalkulasi ulang
// =====================================

window.AUTO_SPEND_PERCENT = window.AUTO_SPEND_PERCENT || 100;
window.AUTO_CAP_ENABLED   = window.AUTO_CAP_ENABLED !== undefined ? window.AUTO_CAP_ENABLED : true;
window.AUTO_MAX_GLOBAL_SDA = window.AUTO_MAX_GLOBAL_SDA || 10;

// =====================================
// MARGIN TREND TRACKER
// =====================================
// load dari localStorage saat pertama init
window._marginHistory = (() => {
    try {
        const saved = localStorage.getItem("_marginHistory");
        return saved ? JSON.parse(saved) : {};
    } catch(e) {
        return {};
    }
})();

window._recordMargin = function(pairKey, margin) {
    if (!window._marginHistory[pairKey]) {
        window._marginHistory[pairKey] = [];
    }
    const hist = window._marginHistory[pairKey];

    // jika tanda margin berbalik (misal dari negatif ke positif atau sebaliknya)
    // reset history supaya tren lama tidak mencemari tren baru
    if (hist.length > 0) {
        const lastMargin = hist[hist.length - 1].margin;
        const signFlipped = (lastMargin < 0 && margin > 0) ||
                            (lastMargin > 0 && margin < 0);
        if (signFlipped) {
            console.log(`[TREND] Sign flip detected for ${pairKey}: ${lastMargin.toFixed(2)} → ${margin.toFixed(2)}, reset history`);
            window._marginHistory[pairKey] = [];
        }
    }

    window._marginHistory[pairKey].push({ margin, ts: Date.now() });
    if (window._marginHistory[pairKey].length > 20) {
        window._marginHistory[pairKey].shift();
    }

    // simpan ke localStorage
    try {
        localStorage.setItem(
            "_marginHistory",
            JSON.stringify(window._marginHistory)
        );
    } catch(e) {
        console.warn("[TREND] localStorage save fail:", e);
    }
};

window._getMarginTrend = function(pairKey) {
    const hist = window._marginHistory[pairKey];
    if (!hist || hist.length < 3) return null;

    const recent = hist.slice(-6);
    const n = recent.length;
    let sumX=0, sumY=0, sumXY=0, sumX2=0;
    recent.forEach((p,i) => {
        sumX  += i;
        sumY  += p.margin;
        sumXY += i * p.margin;
        sumX2 += i * i;
    });
    const slope     = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
    const intercept = (sumY - slope*sumX) / n;
    const predicted = intercept + slope * (n + 2);
    const current   = recent[n-1].margin;
    const drop      = current - predicted;

    return { slope, predicted, current, drop, dataPoints: n };
};

// =====================================
// AUTO ADJUST SPEND BERDASAR TREN
// return: { spend, reason, safetyLevel }
// safetyLevel: "safe" | "caution" | "reduced" | "blocked"
// =====================================
window._adjustSpendByTrend = function(pairKey, rawSpend, currentMargin, isReverse) {

    const trend = window._getMarginTrend(pairKey);

    // belum cukup data — pakai spend penuh, jangan blokir
    if (!trend || trend.dataPoints < 4) {
        return {
            spend: rawSpend,
            reason: trend ? `Data tren: ${trend.dataPoints}/4` : null,
            safetyLevel: "safe",
            multiplier: 1.0
        };
    }

    const { slope, predicted, drop } = trend;

    // ── MODE REVERSE: margin negatif adalah NORMAL ───
    // Yang berbahaya bukan margin negatif,
    // tapi margin yang makin KURANG negatif (artinya peluang reverse menutup)
    if (isReverse) {

        // margin makin mendekati 0 = peluang reverse hilang = bahaya
        if (currentMargin < 0 && predicted > currentMargin * 0.5 && predicted > -1) {
            return {
                spend: 0,
                reason: `Peluang reverse menutup — margin menuju ${predicted.toFixed(2)}%`,
                safetyLevel: "blocked",
                multiplier: 0
            };
        }

        // margin reverse makin dalam (makin negatif) = peluang makin besar = aman
        if (slope <= 0) {
            return {
                spend: rawSpend,
                reason: `Reverse makin dalam ↓ — spend penuh`,
                safetyLevel: "safe",
                multiplier: 1.0
            };
        }

        // slope positif ringan tapi masih cukup dalam
        if (predicted < -2) {
            return {
                spend: rawSpend * 0.75,
                reason: `Reverse mulai menutup — spend -25%`,
                safetyLevel: "caution",
                multiplier: 0.75
            };
        }

        // slope positif, prediksi hampir 0 = mau habis
        return {
            spend: rawSpend * 0.40,
            reason: `Reverse hampir habis — spend -60%`,
            safetyLevel: "reduced",
            multiplier: 0.40
        };
    }

    // ── MODE BUY NORMAL ──────────────────────────────

    // tren naik / stabil
    if (slope >= 0 && predicted >= currentMargin * 0.8) {
        return {
            spend: rawSpend,
            reason: `Tren stabil ↑ — spend penuh`,
            safetyLevel: "safe",
            multiplier: 1.0
        };
    }

    // turun ringan
    if (slope >= -0.5 && predicted > 0) {
        return {
            spend: rawSpend * 0.75,
            reason: `Tren turun ringan — spend -25%`,
            safetyLevel: "caution",
            multiplier: 0.75
        };
    }

    // turun sedang
    if (slope >= -0.8 && predicted > -1) {
        return {
            spend: rawSpend * 0.50,
            reason: `Tren turun sedang — spend -50%`,
            safetyLevel: "reduced",
            multiplier: 0.50
        };
    }

    // turun tajam
    if (slope < -0.8 || predicted <= -1 || drop > 4) {
        return {
            spend: 0,
            reason: `Tren berbahaya — diblokir (prediksi ${predicted.toFixed(2)}%)`,
            safetyLevel: "blocked",
            multiplier: 0
        };
    }

    return {
        spend: rawSpend * 0.5,
        reason: `Tren tidak pasti — spend -50%`,
        safetyLevel: "reduced",
        multiplier: 0.5
    };
};

// =====================================
// EXPORT HISTORY
// =====================================
window._exportMarginHistory = function() {
    try {
        const data = {
            version: 1,
            exported: new Date().toISOString(),
            history: window._marginHistory
        };

        const json    = JSON.stringify(data, null, 2);
        const blob    = new Blob([json], { type: "application/json" });
        const url     = URL.createObjectURL(blob);
        const a       = document.createElement("a");
        const ts      = new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");

        a.href        = url;
        a.download    = `margin-history-${ts}.json`;
        a.click();

        URL.revokeObjectURL(url);

        const pairCount = Object.keys(window._marginHistory).length;
        const ptCount   = Object.values(window._marginHistory)
            .reduce((s, arr) => s + arr.length, 0);

        showToast?.(
            `Export OK — ${pairCount} pair, ${ptCount} data point`,
            "success"
        );

    } catch(e) {
        console.error("[TREND EXPORT]", e);
        showToast?.("Export gagal: " + e.message, "error");
    }
};

// =====================================
// IMPORT HISTORY
// =====================================
window._importMarginHistory = function() {
    const input    = document.createElement("input");
    input.type     = "file";
    input.accept   = ".json";

    input.onchange = function(e) {
        const file   = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();

        reader.onload = function(ev) {
            try {
                const parsed = JSON.parse(ev.target.result);

                // validasi format
                if (!parsed.history || typeof parsed.history !== "object") {
                    showToast?.("Format file tidak valid", "error");
                    return;
                }

                // merge dengan history yang ada — jangan overwrite
                let merged   = 0;
                let added    = 0;

                Object.entries(parsed.history).forEach(([key, arr]) => {
                    if (!Array.isArray(arr)) return;

                    if (!window._marginHistory[key]) {
                        window._marginHistory[key] = [];
                        added++;
                    } else {
                        merged++;
                    }

                    // gabungkan, hapus duplikat berdasar timestamp
                    const existing = new Set(
                        window._marginHistory[key].map(x => x.ts)
                    );

                    arr.forEach(point => {
                        if (
                            point.ts &&
                            point.margin !== undefined &&
                            !existing.has(point.ts)
                        ) {
                            window._marginHistory[key].push(point);
                        }
                    });

                    // sort by timestamp, ambil 20 terbaru
                    window._marginHistory[key].sort((a,b) => a.ts - b.ts);
                    if (window._marginHistory[key].length > 20) {
                        window._marginHistory[key] =
                            window._marginHistory[key].slice(-20);
                    }
                });

                // simpan hasil merge
                localStorage.setItem(
                    "_marginHistory",
                    JSON.stringify(window._marginHistory)
                );

                const totalPt = Object.values(window._marginHistory)
                    .reduce((s, arr) => s + arr.length, 0);

                showToast?.(
                    `Import OK — ${added} pair baru, ${merged} pair digabung, total ${totalPt} data`,
                    "success"
                );

            } catch(e) {
                console.error("[TREND IMPORT]", e);
                showToast?.("Import gagal: " + e.message, "error");
            }
        };

        reader.readAsText(file);
    };

    input.click();
};

// =====================================
// LIHAT RINGKASAN HISTORY
// =====================================
window._showMarginHistorySummary = function() {
    const hist  = window._marginHistory;
    const pairs = Object.keys(hist);

    if (!pairs.length) {
        showToast?.("Belum ada data history", "info");
        return;
    }

    const old = document.getElementById("_marginSummaryModal");
    if (old) old.remove();

    const rows = pairs.map(key => {
        const arr     = hist[key];
        const last    = arr[arr.length - 1];
        const first   = arr[0];
        const margins = arr.map(x => x.margin);
        const avg     = margins.reduce((a,b) => a+b, 0) / margins.length;
        const min     = Math.min(...margins);
        const max     = Math.max(...margins);
        const age     = last?.ts
            ? Math.round((Date.now() - last.ts) / 60000)
            : "?";

        const color   = last.margin >= 2  ? "#00d084"
                      : last.margin >= 0  ? "#ffcc00"
                      : "#ff4d4f";

        return `
            <div style="padding:8px 10px;border-bottom:1px solid #111;
                display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;">
                <div>
                    <div style="font-size:12px;font-weight:700;color:#fff;">
                        ${key.replace("_"," → ").toUpperCase()}
                    </div>
                    <div style="font-size:10px;color:#555;margin-top:2px;">
                        ${arr.length} data &bull;
                        avg ${avg.toFixed(2)}% &bull;
                        min ${min.toFixed(2)}% &bull;
                        max ${max.toFixed(2)}%
                        &bull; ${age}m ago
                    </div>
                </div>
                <div style="font-size:14px;font-weight:800;color:${color};">
                    ${last.margin > 0 ? "+" : ""}${last.margin.toFixed(2)}%
                </div>
            </div>
        `;
    }).join("");

    const modal = document.createElement("div");
    modal.id    = "_marginSummaryModal";

    modal.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,.7);
            z-index:999998;" onclick="document.getElementById('_marginSummaryModal').remove();">
        </div>
        <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            background:#0d0d0d;border:1px solid #1a1a1a;border-radius:16px;
            width:min(420px,95vw);max-height:80vh;overflow-y:auto;
            z-index:999999;padding:16px;">

            <div style="display:flex;justify-content:space-between;
                align-items:center;margin-bottom:12px;">
                <div style="font-size:14px;font-weight:700;color:#fff;">
                    📊 Margin History
                </div>
                <div style="display:flex;gap:8px;">
                    <button onclick="window._exportMarginHistory()"
                        style="padding:5px 10px;background:#1a1a1a;border:1px solid #333;
                        border-radius:8px;color:#58a6ff;font-size:11px;cursor:pointer;">
                        ⬇ Export
                    </button>
                    <button onclick="window._importMarginHistory()"
                        style="padding:5px 10px;background:#1a1a1a;border:1px solid #333;
                        border-radius:8px;color:#00d084;font-size:11px;cursor:pointer;">
                        ⬆ Import
                    </button>
                    <button onclick="document.getElementById('_marginSummaryModal').remove()"
                        style="background:none;border:none;color:#555;
                        font-size:20px;cursor:pointer;line-height:1;">✕</button>
                </div>
            </div>

            <div style="font-size:10px;color:#444;margin-bottom:10px;">
                Total: ${pairs.length} pair &bull;
                ${Object.values(hist).reduce((s,a)=>s+a.length,0)} data point &bull;
                tersimpan di localStorage
            </div>

            ${rows}

            <div style="display:flex;gap:8px;margin-top:12px;">
                <button onclick="
                    if(confirm('Reset semua history?')) {
                        window._marginHistory = {};
                        localStorage.removeItem('_marginHistory');
                        document.getElementById('_marginSummaryModal').remove();
                        showToast?.('History direset', 'info');
                    }"
                    style="flex:1;padding:8px;background:#1a1a1a;border:1px solid #333;
                    border-radius:10px;color:#ff4d4f;font-size:12px;cursor:pointer;">
                    🗑 Reset Semua
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
};

// =====================================
// TRADE RESULT TRACKER
// Simpan hasil swap nyata per pair
// =====================================
window._tradeResults = (() => {
    try {
        const saved = localStorage.getItem("_tradeResults");
        return saved ? JSON.parse(saved) : {};
    } catch(e) { return {}; }
})();

window._saveTradeResult = function({
    pairKey,
    mode,           // "buy" | "reverse"
    spendSda,
    profitSda,
    step1ok,        // bool
    step2ok,        // bool
    step3ok,        // bool
    failedAt,       // null | 1 | 2 | 3
    intermediateToken,
    finalToken,
    marginAtTrade   // savingsPct saat trade dijalankan
}) {
    if (!pairKey) return;

    if (!window._tradeResults[pairKey]) {
        window._tradeResults[pairKey] = {
            trades: [],
            totalProfit: 0,
            totalSpend: 0,
            wins: 0,
            losses: 0,
            step1Fails: 0,
            step2Fails: 0,
            step3Fails: 0,
            intermediateToken,
            finalToken
        };
    }

    const rec = window._tradeResults[pairKey];

    rec.trades.push({
        ts: Date.now(),
        mode,
        spendSda,
        profitSda,
        step1ok, step2ok, step3ok,
        failedAt,
        marginAtTrade
    });

    // ringkasan agregat
    rec.totalProfit += profitSda || 0;
    rec.totalSpend  += spendSda  || 0;
    if (profitSda > 0) rec.wins++;
    else               rec.losses++;
    if (failedAt === 1) rec.step1Fails++;
    if (failedAt === 2) rec.step2Fails++;
    if (failedAt === 3) rec.step3Fails++;

    // simpan max 50 trade terakhir per pair
    if (rec.trades.length > 50) rec.trades = rec.trades.slice(-50);

    try {
        localStorage.setItem(
            "_tradeResults",
            JSON.stringify(window._tradeResults)
        );
    } catch(e) {
        console.warn("[TRADE TRACKER] save fail:", e);
    }
};

// =====================================
// AMBIL TOKEN PALING PROFITABLE
// untuk dipakai smart scan
// =====================================
window._getTopProfitTokens = function(limit = 10) {
    const results = window._tradeResults;

    return Object.entries(results)
        .filter(([, rec]) =>
            rec.totalProfit > 0 &&
            rec.wins > 0
        )
        .map(([pairKey, rec]) => {
            const winRate  = rec.wins / (rec.wins + rec.losses || 1);
            const avgProfit = rec.totalProfit / (rec.wins + rec.losses || 1);
            const stepReliability =
                1 -
                ((rec.step1Fails + rec.step2Fails + rec.step3Fails) /
                 Math.max(rec.trades.length, 1));

            // score gabungan: profit * winrate * reliability
            const score = avgProfit * winRate * stepReliability;

            return {
                pairKey,
                intermediateToken: rec.intermediateToken,
                finalToken:        rec.finalToken,
                totalProfit:       rec.totalProfit,
                avgProfit,
                winRate,
                stepReliability,
                score,
                wins:   rec.wins,
                losses: rec.losses,
                step1Fails: rec.step1Fails,
                step2Fails: rec.step2Fails,
                step3Fails: rec.step3Fails
            };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
};

// =====================================
// EXPORT / IMPORT TRADE RESULTS
// =====================================
window._exportTradeResults = function() {
    try {
        const data = {
            version: 1,
            exported: new Date().toISOString(),
            tradeResults: window._tradeResults
        };
        const blob = new Blob(
            [JSON.stringify(data, null, 2)],
            { type: "application/json" }
        );
        const url = URL.createObjectURL(blob);
        const a   = document.createElement("a");
        const ts  = new Date().toISOString().slice(0,16).replace(/[:T]/g,"-");
        a.href     = url;
        a.download = `trade-results-${ts}.json`;
        a.click();
        URL.revokeObjectURL(url);

        const total = Object.values(window._tradeResults)
            .reduce((s, r) => s + r.trades.length, 0);
        showToast?.(
            `Export OK — ${Object.keys(window._tradeResults).length} pair, ${total} trade`,
            "success"
        );
    } catch(e) {
        showToast?.("Export gagal: " + e.message, "error");
    }
};

window._importTradeResults = function() {
    const input  = document.createElement("input");
    input.type   = "file";
    input.accept = ".json";

    input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const parsed = JSON.parse(ev.target.result);
                if (!parsed.tradeResults) {
                    showToast?.("Format tidak valid", "error");
                    return;
                }

                // merge
                Object.entries(parsed.tradeResults).forEach(([key, rec]) => {
                    if (!window._tradeResults[key]) {
                        window._tradeResults[key] = rec;
                    } else {
                        // gabung trades, dedupe by ts
                        const existingTs = new Set(
                            window._tradeResults[key].trades.map(t => t.ts)
                        );
                        rec.trades.forEach(t => {
                            if (!existingTs.has(t.ts)) {
                                window._tradeResults[key].trades.push(t);
                            }
                        });
                        // recalculate agregat dari trades gabungan
                        const all = window._tradeResults[key].trades;
                        window._tradeResults[key].totalProfit  = all.reduce((s,t) => s + (t.profitSda||0), 0);
                        window._tradeResults[key].totalSpend   = all.reduce((s,t) => s + (t.spendSda||0), 0);
                        window._tradeResults[key].wins         = all.filter(t => t.profitSda > 0).length;
                        window._tradeResults[key].losses       = all.filter(t => t.profitSda <= 0).length;
                        window._tradeResults[key].step1Fails   = all.filter(t => t.failedAt === 1).length;
                        window._tradeResults[key].step2Fails   = all.filter(t => t.failedAt === 2).length;
                        window._tradeResults[key].step3Fails   = all.filter(t => t.failedAt === 3).length;
                    }
                });

                localStorage.setItem(
                    "_tradeResults",
                    JSON.stringify(window._tradeResults)
                );

                showToast?.("Import trade results OK", "success");

            } catch(e) {
                showToast?.("Import gagal: " + e.message, "error");
            }
        };
        reader.readAsText(file);
    };
    input.click();
};

window._shouldAbortByTrend = function(pairKey, currentMargin) {
    const trend = window._getMarginTrend(pairKey);
    if (!trend) return { abort: false, reason: null };

    if (trend.slope < -0.8 && trend.predicted < 0)
        return { abort: true, reason: `Tren turun tajam, prediksi ${trend.predicted.toFixed(2)}%` };

    if (currentMargin > 0 && trend.predicted < -1)
        return { abort: true, reason: `Margin diprediksi jatuh ke ${trend.predicted.toFixed(2)}%` };

    if (trend.drop > 4)
        return { abort: true, reason: `Potensi drop ${trend.drop.toFixed(2)}% — terlalu riskan` };

    return { abort: false, reason: null, trend };
};

// =====================================
// SAFE SYMBOL
// =====================================
function _safeSymbol(token) {
    if (!token) return "TOKEN";
    if (token === "native" || token === "SDA") return "SDA";
    try {
        const list = typeof getAllTokens === "function"
            ? getAllTokens()
            : JSON.parse(localStorage.getItem("customTokens") || "[]");
        const found = list.find(t =>
            String(t.address || "").toLowerCase() === String(token).toLowerCase()
        );
        return found?.symbol || found?.name || "TOKEN";
    } catch(e) { return "TOKEN"; }
}

// =====================================
// AMBIL DATA DARI SCAN RESULT
// =====================================
function _getSdaMaxFromCache(payToken, receiveToken, liveBalance, capEnabled) {
    try {
        const results = AGGREGATOR?._lastResults || window._lastResults || [];

        const found = results.find(r =>
            String(r.payToken || "").toLowerCase() === String(payToken || "").toLowerCase()
        );

        console.log("[MODAL CACHE] payToken:", payToken, "found:", found);

        if (!found) return _emptyCache(payToken, receiveToken);

        const savingsPct  = Number(found.savingsPct ?? found.marginPct ?? 0);
        const savingsAbs  = Number(found.savings    ?? 0);
        const sdaEquiv    = Number(found.sdaEquiv   ?? 0);
        const maxSafeRecv = Number(found.maxSafeReceive ?? 0);

        const paySymbol  = found.paySymbol || _safeSymbol(payToken);
        const recvSymbol = _safeSymbol(receiveToken);

        const targetAmt = parseFloat(
            document.getElementById("receiveAmount")?.value
        ) || 1;

        const sdaPerReceive = (sdaEquiv > 0 && targetAmt > 0)
            ? sdaEquiv / targetAmt : 0;

        // =====================================
        // SMART LIQ BUFFER
        // =====================================
        let liqBuffer = 0.85;
        if      (savingsPct < 1) liqBuffer = 0.55;
        else if (savingsPct < 2) liqBuffer = 0.65;
        else if (savingsPct < 4) liqBuffer = 0.75;
        else if (savingsPct < 7) liqBuffer = 0.82;
        else                     liqBuffer = 0.90;

        const sdaForMaxLiq = (maxSafeRecv > 0 && sdaPerReceive > 0)
            ? maxSafeRecv * sdaPerReceive * liqBuffer
            : 0;

        // =====================================
        // FINAL SAFE MAX SPEND
        // =====================================
        const GLOBAL_MAX   = Number(window.AUTO_MAX_GLOBAL_SDA || 5);
        const protectionOn = window.AUTO_CAP_ENABLED !== false;

        const effectiveMax = protectionOn
            ? Math.min(sdaForMaxLiq, GLOBAL_MAX, liveBalance)
            : Math.min(sdaForMaxLiq, liveBalance);

        const sdaMax = effectiveMax;

        let safePct;
        if      (savingsPct <= 0)  safePct = 10;
        else if (savingsPct < 1)   safePct = 15;
        else if (savingsPct < 2)   safePct = 25;
        else if (savingsPct < 3)   safePct = 35;
        else if (savingsPct < 5)   safePct = 50;
        else if (savingsPct < 8)   safePct = 70;
        else if (savingsPct < 10)  safePct = 85;
        else                       safePct = 100;

        console.log("[MODAL CACHE RESULT]", {
            savingsPct, savingsAbs, sdaEquiv, maxSafeRecv,
            sdaPerReceive, sdaForMaxLiq, sdaMax, safePct
        });

        // catat ke history tren
        const pairKey = `${String(payToken).toLowerCase()}_${String(receiveToken).toLowerCase()}`;
        window._recordMargin?.(pairKey, savingsPct);

        return {
            sdaMax, safePct, savingsPct, savingsAbs,
            sdaForMaxLiq, paySymbol, receiveSymbol: recvSymbol,
            sdaEquiv, maxSafeRecv, sdaPerReceive, rate: found.rate || 0,
            pairKey
        };

    } catch(e) {
        console.warn("[MODAL] cache error:", e);
        return _emptyCache(payToken, receiveToken);
    }
}

function _emptyCache(payToken, receiveToken) {
    return {
        sdaMax: 0, safePct: 100, savingsPct: 0, savingsAbs: 0,
        sdaForMaxLiq: 0, paySymbol: _safeSymbol(payToken),
        receiveSymbol: _safeSymbol(receiveToken),
        sdaEquiv: 0, maxSafeRecv: 0, sdaPerReceive: 0, rate: 0
    };
}

// =====================================
// REBUILD SETELAH TOGGLE CAP
// =====================================
window._rebuildAutoModal = function() {
    const modal = document.getElementById("aggAutoModal");
    if (!modal) return;
    const { intermediateToken, finalToken } = modal.__route || {};
    window.openAutoSpendModal(modal.__mode || "buy", intermediateToken, finalToken, modal.__maxAmount || 0);
};

// =====================================
// CLOSE HELPER
// =====================================
window._closeAutoModal = function() {
    document.getElementById("aggAutoModal")?.remove();
    if (typeof releaseWakeLock === "function") releaseWakeLock();
    AGGREGATOR.setAutoRunning(false);
    AGGREGATOR.unlockAutoButtons();
};

// =====================================
// HITUNG SPEND FINAL (dipakai preview & START)
// =====================================
function _calcFinalSpend(
    sdaMax, percent, sdaPerRecv, maxSafeRecv,
    capEnabled, globalMax,
    pairKey, currentMargin, isReverse   // <-- tambah isReverse
) {
    let spend = sdaMax * (percent / 100);

    if (!isFinite(spend) || spend <= 0) return { spend: 0, trendAdj: null };

    // hard cap global protection
    if (capEnabled && spend > globalMax) {
        spend = globalMax;
    }

    // cap by liquidity
    if (sdaPerRecv > 0 && maxSafeRecv > 0) {
        const maxSdaByLiq = maxSafeRecv * sdaPerRecv * 0.90;
        if (spend > maxSdaByLiq) spend = maxSdaByLiq;
    }

    // sesuaikan berdasar tren margin
    const trendAdj = pairKey
        ? window._adjustSpendByTrend(pairKey, spend, currentMargin || 0, !!isReverse)
        : null;

    const finalSpend = trendAdj ? trendAdj.spend : spend;

    return { spend: finalSpend, trendAdj };
}

// =====================================
// OPEN MODAL
// =====================================
window.openAutoSpendModal = async function(mode, payToken, receiveToken, maxAmount) {
    document.getElementById("aggAutoModal")?.remove();

    // balance live
    let liveBalance = 0;
    try {
        const wallet = typeof getSelectedWallet === "function" ? getSelectedWallet() : null;
        if (wallet) {
            try {
                const raw = await provider.getBalance(wallet.address);
                liveBalance = parseFloat(ethers.utils.formatEther(raw)) || 0;
            } catch {
                liveBalance = parseFloat(localStorage.getItem(wallet.address + "_native") || "0") || 0;
            }
        }
    } catch(e) { console.warn("[MODAL] balance error:", e); }

    const capEnabled = window.AUTO_CAP_ENABLED !== false;
    const GLOBAL_MAX = Number(window.AUTO_MAX_GLOBAL_SDA || 5);

    const cached     = _getSdaMaxFromCache(payToken, receiveToken, liveBalance, capEnabled);
    let   sdaMax     = cached.sdaMax || 0;

    // baca savingsPct langsung dari _lastResults supaya selalu fresh
    const freshResult = (AGGREGATOR?._lastResults || []).find(r =>
        String(r.payToken || "").toLowerCase() === String(payToken || "").toLowerCase()
    );
    const savingsPct = Number(freshResult?.savingsPct ?? cached.savingsPct ?? 0);
    const rawLiqMax  = cached.sdaForMaxLiq || 0;
    const paySymbol  = cached.paySymbol || _safeSymbol(payToken);
    const recvSymbol = cached.receiveSymbol || _safeSymbol(receiveToken);

    if (sdaMax <= 0 && maxAmount > 0) {
        sdaMax = Math.min(
            maxAmount,
            capEnabled ? GLOBAL_MAX : Number(window.MAX_AUTO_SDA || 15),
            liveBalance
        );
    }

    const chips   = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const safePct = cached.safePct || 100;
    const nearest = chips.reduce((a, b) =>
        Math.abs(b - safePct) < Math.abs(a - safePct) ? b : a
    );
    window.AUTO_SPEND_PERCENT = nearest;

    const capCapped   = capEnabled && rawLiqMax > GLOBAL_MAX;
    const marginColor =
        savingsPct >= 5 ? "#00d084" :
        savingsPct >= 2 ? "#ffcc00" :
        savingsPct >  0 ? "#ff7a00" : "#ff4d4f";

    const el = document.createElement("div");
    el.id = "aggAutoModal";
    el.__route         = { intermediateToken: payToken, finalToken: receiveToken };
    el.__balance       = liveBalance;
    el.__sdaMax        = sdaMax;
    el.__mode          = mode;
    el.__isReverse     = mode === "reverse";
    el.__savingsPct    = savingsPct;
    el.__maxAmount     = maxAmount;
    el.__paySymbol     = paySymbol;
    el.__receiveSymbol = recvSymbol;
    el.__sdaEquiv      = cached.sdaEquiv     || 0;
    el.__maxSafeRecv   = cached.maxSafeRecv  || 0;
    el.__sdaPerRecv    = cached.sdaPerReceive || 0;
    el.__activeRate    = cached.rate          || 0;
    el.__globalMax     = GLOBAL_MAX;
    el.__capEnabled    = capEnabled;
    const pairKey = cached.pairKey ||
        `${String(payToken).toLowerCase()}_${String(receiveToken).toLowerCase()}`;

    el.__pairKey = pairKey;

    // catat margin fresh saat modal dibuka — ini titik data pertama yang valid
    window._recordMargin?.(pairKey, savingsPct);

    el.innerHTML = `
        <div class="agg-auto-backdrop"
            onclick="window._closeAutoModal();">
        </div>

        <div class="agg-auto-box">

            <!-- HEADER -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div class="agg-auto-title">Auto ${mode === "reverse" ? "REVERSE" : mode.toUpperCase()}</div>
                <button onclick="window._closeAutoModal();"
                    style="background:none;border:none;color:#555;font-size:22px;cursor:pointer;line-height:1;padding:0;">&#x2715;</button>
            </div>

            <!-- 3 KOLOM INFO -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">
                <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:10px;padding:8px 10px;">
                    <div style="font-size:10px;color:#555;margin-bottom:2px;">Balance</div>
                    <div style="font-size:13px;font-weight:700;color:#00d084;">${liveBalance.toFixed(4)}</div>
                    <div style="font-size:10px;color:#444;">SDA</div>
                </div>
                <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:10px;padding:8px 10px;">
                    <div style="font-size:10px;color:#555;margin-bottom:2px;">Max Liq</div>
                    <div style="font-size:13px;font-weight:700;color:#58a6ff;">${sdaMax.toFixed(4)}</div>
                    <div style="font-size:10px;color:#444;">SDA</div>
                </div>
                <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-radius:10px;padding:8px 10px;">
                    <div style="font-size:10px;color:#555;margin-bottom:2px;">Margin</div>
                    <div style="font-size:13px;font-weight:700;color:${marginColor};">
                        ${savingsPct > 0 ? "+" : ""}${savingsPct.toFixed(1)}%
                    </div>
                    <div style="font-size:10px;color:#444;">vs SDA</div>
                </div>
            </div>

            <!-- CAP TOGGLE -->
            <div style="display:flex;align-items:center;justify-content:space-between;
                padding:10px 12px;margin-bottom:10px;background:#0a0a0a;
                border:1px solid ${capEnabled ? "#ff7a00" : "#1a1a1a"};border-radius:10px;">
                <div>
                    <div style="font-size:12px;font-weight:700;color:${capEnabled ? "#ff7a00" : "#aaa"};">
                        Global Protection ${GLOBAL_MAX} SDA
                    </div>
                    <div style="font-size:10px;color:#555;margin-top:2px;">
                        ${capEnabled
                            ? capCapped
                                ? `ON &mdash; spend dibatasi max ${GLOBAL_MAX} SDA`
                                : `ON &mdash; liquidity tetap dibaca otomatis`
                            : `OFF &mdash; unrestricted smart liquidity`
                        }
                    </div>
                </div>
                <div onclick="window.AUTO_CAP_ENABLED = !window.AUTO_CAP_ENABLED; window._rebuildAutoModal();"
                    style="width:44px;height:24px;border-radius:12px;
                    background:${capEnabled ? "#ff7a00" : "#222"};
                    position:relative;cursor:pointer;transition:.2s;flex-shrink:0;
                    border:1px solid ${capEnabled ? "#ff7a00" : "#333"};">
                    <div style="position:absolute;top:3px;left:${capEnabled ? "22px" : "3px"};
                        width:16px;height:16px;border-radius:50%;background:#fff;transition:.2s;"></div>
                </div>
            </div>

            <!-- MARGIN NOTE -->
            <div style="font-size:11px;color:#666;margin-bottom:10px;padding:6px 10px;
                background:#0a0a0a;border-radius:8px;border-left:3px solid ${marginColor};">
                Auto safe default: <b style="color:${marginColor}">${nearest}%</b>
                &mdash; margin ${savingsPct.toFixed(1)}%
            </div>

            <!-- CHIPS -->
            <div class="agg-auto-sub" style="margin-bottom:6px;">% dari Max Liq</div>
            <div class="agg-auto-toggle-row">
                ${chips.map(p => `
                    <button class="agg-auto-chip ${nearest === p ? "active" : ""}"
                        onclick="
                            window.AUTO_SPEND_PERCENT = ${p};
                            document.querySelectorAll('.agg-auto-chip').forEach(x => x.classList.remove('active'));
                            this.classList.add('active');
                            window.runAutoPreview(document.getElementById('aggAutoModal'));
                        ">${p}%</button>
                `).join("")}
            </div>

            <!-- PREVIEW -->
            <div id="aggAutoPreview" class="agg-auto-preview">
                <div class="agg-preview-top">Menghitung simulasi...</div>
            </div>

            <!-- BUTTONS -->
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;">

                <button id="aggAutoStartBtn" class="agg-auto-run"
                    style="width:100%;margin-top:0;opacity:0.5;pointer-events:none;"
                    onclick="window._startAuto();">
                    &#x26A1; START AUTO
                </button>

                <div style="display:flex;gap:6px;">
                    <button onclick="window._showMarginHistorySummary()"
                        style="flex:1;height:38px;border:1px solid #1a1a1a;border-radius:12px;
                        background:#0a0a0a;color:#58a6ff;font-size:11px;font-weight:600;cursor:pointer;">
                        📊 History
                    </button>
                    <button onclick="window._exportMarginHistory()"
                        style="flex:1;height:38px;border:1px solid #1a1a1a;border-radius:12px;
                        background:#0a0a0a;color:#00d084;font-size:11px;font-weight:600;cursor:pointer;">
                        ⬇ Export
                    </button>
                    <button onclick="window._importMarginHistory()"
                        style="flex:1;height:38px;border:1px solid #1a1a1a;border-radius:12px;
                        background:#0a0a0a;color:#ffcc00;font-size:11px;font-weight:600;cursor:pointer;">
                        ⬆ Import
                    </button>
                </div>

                <button onclick="window._closeAutoModal();"
                    style="width:100%;height:40px;border:1px solid #222;border-radius:16px;
                    background:transparent;color:#555;font-size:13px;font-weight:600;cursor:pointer;">
                    &#x2190; Back
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(el);
    window.runAutoPreview(el);

    if (typeof acquireWakeLock === "function") await acquireWakeLock();
};

// =====================================
// START AUTO â€” langsung pakai spend dari preview
// tidak ada kalkulasi ulang, tidak ada confirm() browser
// =====================================
window._startAuto = function() {
    const modal = document.getElementById("aggAutoModal");
    if (!modal) return;

    const route      = modal.__route;
    const sdaMax     = modal.__sdaMax     || 0;
    const mod        = modal.__mode       || "buy";
    const capEnabled = window.AUTO_CAP_ENABLED !== false;
    const globalMax  = Number(window.AUTO_MAX_GLOBAL_SDA || 10);
    const maxSafeRecv  = modal.__maxSafeRecv  || 0;
    const sdaPerRecv   = modal.__sdaPerRecv   || 0;
    const percent    = window.AUTO_SPEND_PERCENT || 10;

    if (!route || sdaMax <= 0) {
        showToast?.("Route / liquidity belum siap. Tunggu scan selesai.", "error");
        return;
    }

    // hitung spend final â€” satu tempat, konsisten dengan preview
    const pairKey      = document.getElementById("aggAutoModal")?.__pairKey || "";
    const currentMargin = document.getElementById("aggAutoModal")?.__savingsPct || 0;

    const isReverse = document.getElementById("aggAutoModal")?.__isReverse || false;

    const { spend, trendAdj } = _calcFinalSpend(
        sdaMax, percent, sdaPerRecv, maxSafeRecv,
        capEnabled, globalMax,
        pairKey, currentMargin, isReverse
    );

    if (!isFinite(spend) || spend <= 0) {
        showToast?.(
            trendAdj?.reason || "Spend tidak valid — data belum ready",
            "error"
        );
        return;
    }

    if (trendAdj?.safetyLevel === "reduced" || trendAdj?.safetyLevel === "caution") {
        showToast?.(
            `⚠ ${trendAdj.reason}`,
            "warning"
        );
    }

    console.log("[AUTO START] spend SDA:", spend, "mode:", mod,
        "route:", route.intermediateToken, "->", route.finalToken);

    // tutup modal dulu sebelum eksekusi
    modal.remove();
    if (typeof releaseWakeLock === "function") releaseWakeLock();

    // jalankan â€” spend sudah final, engine tidak kalkulasi ulang
    if (mod === "buy") {
        AGGREGATOR.autoRouteBuy(
            route.intermediateToken,
            route.finalToken,
            spend
        ).catch(e => {
            console.error("[AUTO BUY ERROR]", e);
            showToast?.(e?.message || "Auto buy gagal", "error");
        });
    } else {
        AGGREGATOR.autoRouteReverse(
            route.intermediateToken,
            route.finalToken,
            spend
        ).catch(e => {
            console.error("[AUTO REVERSE ERROR]", e);
            showToast?.(e?.message || "Auto reverse gagal", "error");
        });
    }
};

// =====================================
// PREVIEW
// =====================================
window.runAutoPreview = async function(modalEl) {

    const previewEl = modalEl?.querySelector("#aggAutoPreview");
    const startBtn  = modalEl?.querySelector("#aggAutoStartBtn");
    if (!previewEl) return;

    const route       = modalEl?.__route;
    const sdaMax      = modalEl.__sdaMax        || 0;
    const savingsPct  = modalEl.__savingsPct    || 0;
    const paySymbol   = modalEl.__paySymbol     || "?";
    const recvSymbol  = modalEl.__receiveSymbol || "?";
    const isReverse   = modalEl.__isReverse     || false;
    const maxSafeRecv = modalEl.__maxSafeRecv   || 0;
    const sdaPerRecv  = modalEl.__sdaPerRecv    || 0;
    const capEnabled  = window.AUTO_CAP_ENABLED !== false;
    const globalMax   = Number(window.AUTO_MAX_GLOBAL_SDA || 10);
    const percent     = window.AUTO_SPEND_PERCENT || 10;
    const pairKey     = modalEl.__pairKey || "";
    const trendCheck  = window._shouldAbortByTrend?.(pairKey, savingsPct) || { abort: false };
    const trendData   = window._getMarginTrend?.(pairKey);

    if (!route?.intermediateToken || !route?.finalToken) {
        previewEl.innerHTML = `<div class="agg-preview-top" style="color:#ff4d4f;">&#x26A0; Route tidak valid</div>`;
        return;
    }

    // hitung spend — sama persis dengan _startAuto
    const { spend, trendAdj } = _calcFinalSpend(
        sdaMax, percent, sdaPerRecv, maxSafeRecv,
        capEnabled, globalMax,
        pairKey, savingsPct, isReverse
    );

    // warna & label tombol START berdasar safety level
    const safetyLevel = trendAdj?.safetyLevel || "safe";
    const btnConfig = {
        safe:    { color: "",        text: "⚡ START AUTO" },
        caution: { color: "#ff7a00", text: "⚡ START AUTO (Spend -25%)" },
        reduced: { color: "#ff4d4f", text: "⚡ START AUTO (Spend -50%)" },
        blocked: { color: "",        text: "⛔ DIBLOKIR — Tren Bahaya" }
    }[safetyLevel] || { color: "", text: "⚡ START AUTO" };

    if (startBtn) {
        const ok = spend > 0;
        startBtn.style.opacity       = ok ? "1"    : "0.35";
        startBtn.style.pointerEvents = ok ? "auto" : "none";
        startBtn.style.background    = btnConfig.color || "";
        startBtn.textContent         = btnConfig.text;
    }

    if (spend <= 0) {
        previewEl.innerHTML = `
            <div class="agg-preview-top" style="color:#ff4d4f;">&#x26A0; Liq tidak cukup / margin terlalu tipis</div>
            <div class="agg-preview-sub" style="margin-top:6px;">Pair: ${paySymbol} &rarr; ${recvSymbol}</div>
            <div class="agg-preview-sub" style="color:#666;margin-top:4px;">Margin vs SDA: ${savingsPct.toFixed(2)}%</div>
        `;
        return;
    }

    previewEl.innerHTML = `
        <div class="agg-preview-top">Akan spend</div>
        <div class="agg-preview-value" style="color:#00d084;">${spend.toFixed(4)} SDA</div>
        <div class="agg-preview-sub" style="margin-top:4px;color:#444;">Simulasi full cycle...</div>
    `;

    try {
        const step1Token = isReverse ? route.finalToken        : route.intermediateToken;
        const step2Token = isReverse ? route.intermediateToken : route.finalToken;
        const firstSym   = isReverse ? recvSymbol              : paySymbol;
        const secondSym  = isReverse ? paySymbol               : recvSymbol;

        let estStep1 = 0;
        try {
            estStep1 = await PRICE_ENGINE.getAmountOut("native", step1Token, spend) || 0;
        } catch(e) { console.warn("[PREVIEW] step1:", e); }

        let estStep2 = 0;
        try {
            if (estStep1 > 0) {
                estStep2 = await PRICE_ENGINE.getAmountOut(step1Token, step2Token, estStep1 * 0.997) || 0;
            }
        } catch(e) { console.warn("[PREVIEW] step2:", e); }

        const liqCheckAmt = isReverse ? estStep1 : estStep2;
        const exceedsLiq  = maxSafeRecv > 0 && liqCheckAmt > maxSafeRecv;

        const liqHtml = maxSafeRecv > 0
            ? exceedsLiq
                ? `<div style="margin-top:6px;padding:6px 8px;background:rgba(255,77,79,.1);
                    border:1px solid #ff4d4f;border-radius:8px;font-size:11px;color:#ff4d4f;">
                    &#x26A0; Est. ${liqCheckAmt.toFixed(4)} melebihi liq aman ${maxSafeRecv.toFixed(4)} ${isReverse ? firstSym : secondSym}<br>
                    <b>Kurangi % agar swap tidak gagal</b></div>`
                : `<div style="margin-top:4px;font-size:11px;color:#888;">
                    &#x2714; Liq OK: ~${maxSafeRecv.toFixed(4)} ${isReverse ? firstSym : secondSym}</div>`
            : "";

        const sim = isReverse
            ? await window.simulateFullCycle(route.finalToken, route.intermediateToken, spend)
            : await window.simulateFullCycle(route.intermediateToken, route.finalToken, spend);

        if (startBtn) {
            const ok = !exceedsLiq && spend > 0 && !!sim;
            startBtn.style.opacity       = ok ? "1"    : "0.4";
            startBtn.style.pointerEvents = ok ? "auto" : "none";
        }

        if (!sim) {
            previewEl.innerHTML = `
                <div class="agg-preview-top">Akan spend</div>
                <div class="agg-preview-value" style="color:#00d084;">${spend.toFixed(4)} SDA</div>
                <div class="agg-preview-sub" style="margin-top:4px;">&asymp; <b style="color:#fff;">${estStep1.toFixed(4)}</b> ${firstSym}</div>
                ${liqHtml}
                <div class="agg-preview-sub" style="color:#ff4d4f;margin-top:8px;">&#x26A0; Simulasi gagal &mdash; likuiditas kurang</div>
            `;
            return;
        }

        const profitColor = sim.estimatedProfit >= 0 ? "#00d084" : "#ff4d4f";
        const sign        = sim.estimatedProfit >= 0 ? "+"        : "";
        
        // kunci START jika tren berbahaya
        if (trendCheck.abort && startBtn) {
            startBtn.style.opacity       = "0.3";
            startBtn.style.pointerEvents = "none";
            startBtn.textContent         = "⛔ DITAHAN — Tren Turun";
        }

        // build HTML tren
        const trendHtml = trendData ? (() => {
            const arrow  = trendData.slope >  0.2 ? "↑"
                         : trendData.slope < -0.2 ? "↓" : "→";
            const tcolor = trendData.slope >  0.2 ? "#00d084"
                         : trendData.slope < -0.2 ? "#ff4d4f" : "#aaa";
            const warnBlock = trendCheck.abort
                ? `<div style="margin-top:4px;padding:5px 8px;background:rgba(255,77,79,.12);
                    border:1px solid #ff4d4f;border-radius:7px;font-size:11px;color:#ff4d4f;">
                    ⛔ ${trendCheck.reason}</div>`
                : trendData.predicted < 1 && trendData.predicted < savingsPct
                    ? `<div style="margin-top:4px;font-size:11px;color:#ff7a00;">
                        ⚠ Prediksi: ${trendData.predicted.toFixed(2)}% — waspadai penurunan</div>`
                    : `<div style="margin-top:4px;font-size:11px;color:#555;">
                        Prediksi: ${trendData.predicted.toFixed(2)}%</div>`;
            return `
                <div style="margin-top:8px;padding:7px 10px;background:#0a0a0a;
                    border:1px solid #1a1a1a;border-radius:9px;">
                    <div style="font-size:10px;color:#555;margin-bottom:3px;">Tren Margin (${trendData.dataPoints} data)</div>
                    <div style="font-size:13px;font-weight:700;color:${tcolor};">
                        ${arrow} ${trendData.current.toFixed(2)}% → prediksi ${trendData.predicted.toFixed(2)}%
                    </div>
                    ${warnBlock}
                </div>`;
        })() : "";

        // tampilkan spend yang sudah final (setelah semua cap diterapkan)
        const capNote = (capEnabled && spend < sdaMax * (percent / 100))
            ? `<div class="agg-preview-sub" style="color:#ff7a00;margin-top:4px;">
                &#x26A0; Dibatasi oleh protection (${globalMax} SDA max)
               </div>`
            : "";

        previewEl.innerHTML = `
            <div class="agg-preview-top">Akan spend</div>

            <div class="agg-preview-value" style="color:#00d084;">
                ${spend.toFixed(4)} SDA
            </div>

            <div class="agg-preview-sub" style="margin-top:4px;">
                &asymp; <b style="color:#fff;">${estStep1.toFixed(4)}</b> ${firstSym}
            </div>

            <div class="agg-preview-sub" style="margin-top:2px;color:#aaa;">
                &rarr; est. <b style="color:#fff;">${estStep2.toFixed(4)}</b> ${secondSym}
            </div>

            ${liqHtml}
            ${capNote}

            <div class="agg-preview-sub" style="margin-top:4px;color:#666;">
                Route: SDA &rarr; ${firstSym} &rarr; ${secondSym} &rarr; SDA
            </div>

            <div class="agg-preview-sub">
                ${percent}% dari <b style="color:#58a6ff;">${sdaMax.toFixed(4)} SDA</b>
                &rarr; final <b style="color:#00d084;">${spend.toFixed(4)} SDA</b>
            </div>

            <div style="margin-top:10px;padding-top:10px;border-top:1px solid #1a1a1a;">

                <div class="agg-preview-sub" style="margin-bottom:4px;">
                    Est. back: <b style="color:#fff;">${sim.estimatedBack.toFixed(4)} SDA</b>
                </div>

                <div style="font-size:15px;font-weight:800;color:${profitColor};">
                    ${sign}${sim.estimatedProfit.toFixed(4)} SDA
                    <span style="font-size:12px;opacity:.8;">(${sign}${sim.estimatedPct.toFixed(2)}%)</span>
                </div>

                <div class="agg-preview-sub" style="margin-top:6px;color:${profitColor};">
                    Margin vs SDA: ${savingsPct > 0 ? "+" : ""}${savingsPct.toFixed(2)}%
                </div>

            </div>

            ${trendHtml}
        `;

    } catch(e) {
        console.warn("[PREVIEW ERROR]", e);
        previewEl.innerHTML = `<div class="agg-preview-top" style="color:#ff4d4f;">&#x26A0; Preview gagal: ${e.message}</div>`;
    }
};