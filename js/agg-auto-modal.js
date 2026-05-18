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

    // jangan catat duplikat dalam 30 detik dengan nilai sama
    if (hist.length > 0) {
        const last = hist[hist.length - 1];
        const tooSoon = (Date.now() - last.ts) < 30000;
        const sameVal = Math.abs(last.margin - margin) < 0.01;
        if (tooSoon && sameVal) return;
    }

    // reset jika tanda berbalik
    if (hist.length > 0) {
        const lastMargin = hist[hist.length - 1].margin;
        const signFlipped = (lastMargin < 0 && margin > 0) ||
                            (lastMargin > 0 && margin < 0);
        if (signFlipped) {
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
        spend: rawSpend * 0.35,
        reason: `Reverse volatile ↓ — spend dikurangi`,
        safetyLevel: "caution",
        multiplier: 0.35
    };
}

        // slope positif ringan tapi masih cukup dalam
        // kalau margin masih sangat dalam (< -20%), jangan penalti
        if (predicted < -2) {
            if (currentMargin < -20) {
                return {
                    spend: rawSpend,
                    reason: `Reverse dalam — spend penuh`,
                    safetyLevel: "safe",
                    multiplier: 1.0
                };
            }
            return {
                spend: rawSpend * 0.75,
                reason: `Reverse mulai menutup — spend -25%`,
                safetyLevel: "caution",
                multiplier: 0.75
            };
        }

        // slope positif, prediksi hampir 0 = mau habis
        // kalau margin masih sangat dalam, tetap spend penuh
        if (currentMargin < -20) {
            return {
                spend: rawSpend,
                reason: `Reverse sangat dalam — spend penuh`,
                safetyLevel: "safe",
                multiplier: 1.0
            };
        }

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

        if (!found) return _emptyCache(payToken, receiveToken);

        const savingsPct  = Number(found.savingsPct ?? found.marginPct ?? 0);
        const sdaEquiv    = Number(found.sdaEquiv   ?? 0);
        const maxSafeRecv = Number(found.maxSafeReceive ?? 0);
        const unitsNeeded = Number(found.unitsNeeded ?? 0);
        const paySymbol   = found.paySymbol || _safeSymbol(payToken);
        const recvSymbol  = _safeSymbol(receiveToken);
        const absSavings  = Math.abs(savingsPct);

        // =====================================
        // RATE: SDA per 1 intermediate token
        // Cari row intermediate token di scan result
        // intermediateSymbol = receiveToken symbol
        // kalau ada rownya, pakai sdaEquiv/unitsNeeded dari sana
        // =====================================
        const interRow = results.find(r =>
            String(r.payToken || "").toLowerCase() === String(receiveToken || "").toLowerCase()
        );

        let sdaPerIntermediate = 0;

        if (interRow && interRow.sdaEquiv > 0 && interRow.unitsNeeded > 0) {
            // rate dari row intermediate langsung — paling akurat
            sdaPerIntermediate = interRow.sdaEquiv / interRow.unitsNeeded;
        } else if (sdaEquiv > 0 && unitsNeeded > 0 && maxSafeRecv > 0) {
            // fallback: estimasi dari row payToken sendiri
            // sdaEquiv = nilai SDA dari unitsNeeded payToken
            // tidak langsung representasi harga intermediate
            // pakai sebagai proxy kasar
            sdaPerIntermediate = sdaEquiv / unitsNeeded;
        }

        // nilai SDA aktual yang tersedia di pool intermediate
        // INI BATAS KERAS — spend tidak boleh melebihi ini
        // maxSafeRecv 
        const sdaBaseRow = results.find(r =>
    r.isSDA === true ||
    r.payToken === "native" ||
    r.paySymbol === "SDA" ||
    String(r.payToken || "").toLowerCase() === "native"
);

        
        const sdaPerFinalToken = (sdaBaseRow && sdaBaseRow.sdaEquiv > 0 && sdaBaseRow.unitsNeeded > 0)
            ? sdaBaseRow.sdaEquiv / sdaBaseRow.unitsNeeded
            : 0;

        // actualPoolSda l
        const actualPoolSda = sdaPerFinalToken > 0
    ? maxSafeRecv * sdaPerFinalToken
    : maxSafeRecv > 0 && sdaEquiv > 0 && unitsNeeded > 0
        ? maxSafeRecv * (sdaEquiv / unitsNeeded)  // estimasi dari row sendiri
        : sdaEquiv;
        
        

        console.log("[MODAL RATE]", {
            maxSafeRecv,
            sdaPerFinalToken: sdaPerFinalToken.toFixed(6),
            actualPoolSda: actualPoolSda.toFixed(4),
            source: sdaPerFinalToken > 0 ? "sdaBaseRow" : "fallback"
        });

        console.log("[MODAL RATE]", {
            paySymbol,
            recvSymbol,
            interRowFound:      !!interRow,
            sdaPerIntermediate: sdaPerIntermediate.toFixed(6),
            maxSafeRecv:        maxSafeRecv.toFixed(6),
            actualPoolSda:      actualPoolSda.toFixed(6),
        });

        // =====================================
        // LIQ BUFFER — dari settings
        // =====================================
        const liqBuffer = window._autoModalSettings?.getLiqBuffer(absSavings) ?? (
            absSavings < 1 ? 0.55 : absSavings < 2 ? 0.65 :
            absSavings < 4 ? 0.75 : absSavings < 7 ? 0.82 : 0.88
        );

        // =====================================
        // MARGIN FACTOR — dari settings
        // =====================================
        const marginFactor = window._autoModalSettings?.getMarginFactor(absSavings) ?? (
            absSavings >= 20 ? 0.95 : absSavings >= 15 ? 0.85 :
            absSavings >= 10 ? 0.70 : absSavings >=  7 ? 0.55 :
            absSavings >=  5 ? 0.40 : absSavings >=  3 ? 0.28 :
            absSavings >=  2 ? 0.18 : absSavings >=  1 ? 0.10 : 0.05
        );

        // =====================================
        // DYNAMIC POOL USAGE — dari settings
        // =====================================
        const dynamicPoolUsage = window._autoModalSettings?.getDynamicPoolUsage(absSavings) ?? (
            absSavings >= 20 ? 0.85 : absSavings >= 15 ? 0.70 :
            absSavings >= 10 ? 0.45 : absSavings >=  7 ? 0.30 :
            absSavings >=  5 ? 0.22 : absSavings >=  3 ? 0.15 :
            absSavings >=  2 ? 0.10 : 0.05
        );

const fromLiq = actualPoolSda * dynamicPoolUsage * liqBuffer;

// fallback kalau pool gagal detect
const fromMargin = sdaEquiv * marginFactor;

// prioritaskan liquidity nyata
const sdaForMaxLiq = actualPoolSda > 0 ? fromLiq : fromMargin;

        console.log("[MODAL LIQ CALC]", {
            fromLiq:       fromLiq.toFixed(4),
            fromMargin:    fromMargin.toFixed(4),
            sdaForMaxLiq:  sdaForMaxLiq.toFixed(4)
        });

        // =====================================
        // FINAL SAFE MAX SPEND
        // =====================================
        const GLOBAL_MAX   = Number(window.AUTO_MAX_GLOBAL_SDA || 10);
        const protectionOn = window.AUTO_CAP_ENABLED !== false;

        // hitung sdaMax langsung dari margin + liq
        // empiric: 1 SDA spend → ~9% margin drop
        // target nutup 80% margin dalam 1 cycle
        const _dropRate = 9.0;
        const spendFromMargin = absSavings > 0
            ? (absSavings * 0.80) / _dropRate
            : sdaForMaxLiq;

        // batasi maksimal 50% dari liq real (maxSafeRecv × rate kasar)
        const liqCapSda = maxSafeRecv > 0 && sdaEquiv > 0 && unitsNeeded > 0
            ? (maxSafeRecv * (sdaEquiv / unitsNeeded)) * 0.50
            : sdaForMaxLiq;

        const smartMax = Math.min(spendFromMargin, liqCapSda);

        const effectiveMax = protectionOn
            ? Math.min(smartMax, GLOBAL_MAX, liveBalance)
            : Math.min(smartMax, liveBalance);

        const sdaMax = effectiveMax > 0 ? effectiveMax : sdaForMaxLiq;

        // chip default — dari settings
        const safePct = window._autoModalSettings?.getSafePct(absSavings) ?? (
            absSavings <= 0.5 ? 5  : absSavings < 1  ? 10 :
            absSavings < 2    ? 20 : absSavings < 3  ? 30 :
            absSavings < 5    ? 50 : absSavings < 8  ? 70 :
            absSavings < 10   ? 80 : 100
        );

        const pairKey = `${String(payToken).toLowerCase()}_${String(receiveToken).toLowerCase()}`;

        return {
            sdaMax, safePct, savingsPct,
            savingsAbs: Math.abs(Number(found.savings ?? 0)),
            sdaForMaxLiq, paySymbol, receiveSymbol: recvSymbol,
            sdaEquiv, maxSafeRecv,
            sdaPerReceive: sdaPerIntermediate,
            rate: found.rate || 0,
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
// CHIP CLICK HANDLER
// =====================================
window._onChipClick = function(btn, p) {
    window.AUTO_SPEND_PERCENT = p;
    document.querySelectorAll('.agg-auto-chip').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');

    const modal = document.getElementById('aggAutoModal');
    if (!modal) return;

    // selalu tampilkan spend — tidak butuh fetch
    const pv = document.getElementById('aggAutoPreview');
    pv.style.display = 'block';

    const { spend: rawSpend, trendAdj } = _calcFinalSpend(
        modal.__sdaMax    || 0,
        p,
        modal.__sdaPerRecv  || 0,
        modal.__maxSafeRecv || 0,
        window.AUTO_CAP_ENABLED !== false,
        Number(window.AUTO_MAX_GLOBAL_SDA || 10),
        modal.__pairKey    || "",
        modal.__savingsPct || 0,
        modal.__isReverse  || false
    );

    // hard guard: spend tidak boleh melebihi sdaMax apapun yang terjadi
    const spend = Math.min(rawSpend, modal.__sdaMax || rawSpend);

    const safetyColor = {
        safe:    "#00d084",
        caution: "#ff7a00",
        reduced: "#ff4d4f",
        blocked: "#ff4d4f"
    }[trendAdj?.safetyLevel || "safe"] || "#00d084";

    const trendNote = trendAdj?.reason
        ? `<div style="font-size:11px;color:${safetyColor};margin-top:4px;">⚠ ${trendAdj.reason}</div>`
        : "";

    // cek liq warning
    const maxSafeRecv  = modal.__maxSafeRecv || 0;
    const sdaPerRecv   = modal.__sdaPerRecv  || 0;
    const maxSdaByLiq  = (maxSafeRecv > 0 && sdaPerRecv > 0)
        ? maxSafeRecv * sdaPerRecv
        : 0;
    const absSavingsPct = Math.abs(modal.__savingsPct || 0);
    const liqTooLow     = maxSdaByLiq > 0 && maxSdaByLiq < 0.05 && absSavingsPct < 10;
    const liqWarnHtml  = liqTooLow
        ? `<div style="margin-top:6px;padding:5px 8px;background:rgba(255,77,79,.12);
            border:1px solid #ff4d4f;border-radius:8px;font-size:11px;color:#ff4d4f;">
            ⚠ Liq sangat tipis (~${maxSdaByLiq.toFixed(4)} SDA) — swap berisiko gagal
           </div>`
        : maxSafeRecv > 0
            ? `<div style="font-size:11px;color:#555;margin-top:4px;">
                Liq OK: ~${maxSafeRecv.toFixed(4)} token</div>`
            : "";

    if (spend <= 0) {
        pv.innerHTML = `<div class="agg-preview-top" style="color:#ff4d4f;">⛔ Spend 0 — ${trendAdj?.reason || "data tidak cukup"}</div>`;
    } else {
        pv.innerHTML = `
            <div class="agg-preview-top">Akan spend</div>
            <div class="agg-preview-value" style="color:${safetyColor};">${spend.toFixed(4)} SDA</div>
            <div class="agg-preview-sub" style="margin-top:2px;color:#555;">
                ${p}% dari <b style="color:#58a6ff;">${(modal.__sdaMax||0).toFixed(4)} SDA</b>
            </div>
            ${liqWarnHtml}
            ${trendNote}
        `;
    }

    // aktifkan / matikan START
    const startBtn = document.getElementById('aggAutoStartBtn');

    // kalau liq sangat tipis, matikan START
    if (startBtn && liqTooLow) {
        startBtn.style.opacity       = '0.3';
        startBtn.style.pointerEvents = 'none';
        startBtn.textContent         = '⚠ Liq Terlalu Tipis';
        return;
    }

    // langsung preview dari scan data — instant, tanpa RPC
    document.getElementById('aggSimBtn').style.display = 'none';
    window.runAutoPreview(modal);

    if (startBtn) {
        const canStart = spend > 0 && (trendAdj?.safetyLevel !== 'blocked');
        startBtn.style.opacity       = canStart ? '1'    : '0.4';
        startBtn.style.pointerEvents = canStart ? 'auto' : 'none';
        startBtn.style.background    = trendAdj?.safetyLevel === 'caution' ? '#ff7a00'
                                     : trendAdj?.safetyLevel === 'reduced' ? '#ff4d4f'
                                     : '';
        startBtn.textContent = spend <= 0                              ? '⛔ Spend 0'
            : trendAdj?.safetyLevel === 'blocked'                      ? '⛔ DIBLOKIR — Tren Bahaya'
            : trendAdj?.safetyLevel === 'caution'                      ? '⚡ START AUTO (Spend -25%)'
            : trendAdj?.safetyLevel === 'reduced'                      ? '⚡ START AUTO (Spend -50%)'
            : '⚡ START AUTO';
    }
};
// =====================================
// CUSTOM SPEND HANDLER
// =====================================
window._onCustomSpend = function(customSda, modal) {
    if (!modal) return;
    const pv = document.getElementById('aggAutoPreview');
    if (pv) pv.style.display = 'block';

    const capEnabled  = window.AUTO_CAP_ENABLED !== false;
    const globalMax   = Number(window.AUTO_MAX_GLOBAL_SDA || 10);
    const pairKey     = modal.__pairKey    || "";
    const savingsPct  = modal.__savingsPct || 0;
    const isReverse   = modal.__isReverse  || false;
    const balance     = modal.__balance    || 0;

    let spend = customSda;
    if (capEnabled && spend > globalMax) spend = globalMax;
    if (spend > balance) spend = balance;

    const trendAdj = pairKey
        ? window._adjustSpendByTrend(pairKey, spend, savingsPct, isReverse)
        : null;
    const finalSpend = trendAdj ? trendAdj.spend : spend;

    const safetyColor = {
        safe: "#00d084", caution: "#ff7a00",
        reduced: "#ff4d4f", blocked: "#ff4d4f"
    }[trendAdj?.safetyLevel || "safe"] || "#00d084";

    const capNote = capEnabled && customSda > globalMax
        ? `<div style="font-size:11px;color:#ff7a00;margin-top:4px;">⚠ Dibatasi global cap: max ${globalMax} SDA</div>`
        : customSda > balance
        ? `<div style="font-size:11px;color:#ff4d4f;margin-top:4px;">⚠ Melebihi balance — dipotong ke ${balance.toFixed(4)} SDA</div>`
        : "";
    const trendNote = trendAdj?.reason
        ? `<div style="font-size:11px;color:${safetyColor};margin-top:4px;">⚠ ${trendAdj.reason}</div>`
        : "";

    if (pv) {
        pv.innerHTML = finalSpend <= 0
            ? `<div class="agg-preview-top" style="color:#ff4d4f;">⛔ Spend 0 — ${trendAdj?.reason || "tidak valid"}</div>`
            : `
                <div class="agg-preview-top">Custom spend</div>
                <div class="agg-preview-value" style="color:${safetyColor};">${finalSpend.toFixed(4)} SDA</div>
                <div class="agg-preview-sub" style="margin-top:2px;color:#555;">
                    Input manual: <b style="color:#58a6ff;">${customSda.toFixed(4)} SDA</b>
                </div>
                ${capNote}${trendNote}
                <div class="agg-preview-sub" style="margin-top:6px;color:#444;">
                    Klik 🔍 Lihat Simulasi untuk estimasi profit
                </div>
            `;
    }

    modal.__customSpend = finalSpend > 0 ? finalSpend : null;

    const startBtn = document.getElementById('aggAutoStartBtn');
    if (startBtn) {
        const canStart = finalSpend > 0 && trendAdj?.safetyLevel !== 'blocked';
        startBtn.style.opacity       = canStart ? '1' : '0.4';
        startBtn.style.pointerEvents = canStart ? 'auto' : 'none';
        startBtn.textContent = finalSpend <= 0 ? '⛔ Spend 0'
            : `⚡ START AUTO (Custom ${finalSpend.toFixed(4)} SDA)`;
    }
};

// =====================================
// AUTO MODAL SETTINGS
// =====================================
window._autoModalSettings = (() => {
    const KEY = "_autoModalSettings";
    const DEF = {
        liqBuffer:        [ {lt:1,v:.55},{lt:2,v:.65},{lt:4,v:.75},{lt:7,v:.82},{lt:Infinity,v:.88} ],
        marginFactor:     [ {ge:20,v:.95},{ge:15,v:.85},{ge:10,v:.70},{ge:7,v:.55},{ge:5,v:.40},{ge:3,v:.28},{ge:2,v:.18},{ge:1,v:.10},{ge:0,v:.05} ],
        dynamicPoolUsage: [ {ge:20,v:.85},{ge:15,v:.70},{ge:10,v:.45},{ge:7,v:.30},{ge:5,v:.22},{ge:3,v:.15},{ge:2,v:.10},{ge:0,v:.05} ],
        safePct:          [ {le:.5,v:5},{le:1,v:10},{le:2,v:20},{le:3,v:30},{le:5,v:50},{le:8,v:70},{le:10,v:80},{le:Infinity,v:100} ]
    };
    function load() {
        try { const s=localStorage.getItem(KEY); return s?JSON.parse(s):JSON.parse(JSON.stringify(DEF)); }
        catch(e) { return JSON.parse(JSON.stringify(DEF)); }
    }
    function save(c) { try { localStorage.setItem(KEY,JSON.stringify(c)); } catch(e){} }
    function reset() { localStorage.removeItem(KEY); showToast?.("Settings direset","info"); }
    function getLiqBuffer(abs) {
        for(const r of load().liqBuffer) if(abs<r.lt) return r.v;
        return .88;
    }
    function getMarginFactor(abs) {
        for(const r of load().marginFactor) if(abs>=r.ge) return r.v;
        return .05;
    }
    function getDynamicPoolUsage(abs) {
        for(const r of load().dynamicPoolUsage) if(abs>=r.ge) return r.v;
        return .05;
    }
    function getSafePct(abs) {
        for(const r of load().safePct) if(abs<=r.le) return r.v;
        return 100;
    }
    return { load, save, reset, getLiqBuffer, getMarginFactor, getDynamicPoolUsage, getSafePct };
})();

// =====================================
// OPEN SETTINGS MODAL
// =====================================
window._openAutoSettings = function() {
    document.getElementById("_autoSettingsModal")?.remove();
    const cfg = window._autoModalSettings.load();

    function rowsHtml(arr, prefix, mode) {
            function friendlyLabel(mode, r, i, total) {
                const isLast = i === total - 1;
                if (mode === "lt") {
                    if (i === 0)    return "Margin sangat tipis  (< 1%)";
                    if (r.lt === 2) return "Margin tipis  (1–2%)";
                    if (r.lt === 4) return "Margin kecil  (2–4%)";
                    if (r.lt === 7) return "Margin sedang  (4–7%)";
                    if (isLast)     return "Margin besar  (≥ 7%)";
                }
                if (mode === "ge") {
                    if (r.ge === 20) return "Margin luar biasa  (≥ 20%)";
                    if (r.ge === 15) return "Margin sangat besar  (15–20%)";
                    if (r.ge === 10) return "Margin besar  (10–15%)";
                    if (r.ge === 7)  return "Margin lumayan  (7–10%)";
                    if (r.ge === 5)  return "Margin cukup  (5–7%)";
                    if (r.ge === 3)  return "Margin kecil  (3–5%)";
                    if (r.ge === 2)  return "Margin tipis  (2–3%)";
                    if (r.ge === 1)  return "Margin sangat tipis  (1–2%)";
                    if (r.ge === 0)  return "Margin hampir nol  (< 1%)";
                }
                if (mode === "le") {
                    if (r.le === .5)  return "Margin nyaris nol  (≤ 0.5%)";
                    if (r.le === 1)   return "Margin sangat tipis  (0.5–1%)";
                    if (r.le === 2)   return "Margin tipis  (1–2%)";
                    if (r.le === 3)   return "Margin kecil  (2–3%)";
                    if (r.le === 5)   return "Margin sedang  (3–5%)";
                    if (r.le === 8)   return "Margin bagus  (5–8%)";
                    if (r.le === 10)  return "Margin besar  (8–10%)";
                    if (isLast)       return "Margin luar biasa  (> 10%)";
                }
                return "Row " + (i+1);
            }

            return arr.map((r, i) => {
                const isSafePct = mode === "le" && r.le > 1;
                const step      = isSafePct ? 5   : 0.01;
                const min       = 0;
                const max       = isSafePct ? 100 : 1;
                const label     = friendlyLabel(mode, r, i, arr.length);
                const id        = prefix + "_" + i;
                const isp       = isSafePct ? "true" : "false";
                const dispVal   = isSafePct ? r.v + "%" : r.v;

                return `<tr>
                    <td style="padding:6px 6px;color:#aaa;font-size:11px;line-height:1.4;">${label}</td>
                    <td style="padding:6px 6px;text-align:right;white-space:nowrap;">
                        <div style="display:inline-flex;align-items:center;gap:4px;">
                            <button type="button"
                                onclick="var el=document.getElementById('${id}');var s=${step},mn=${min},isp=${isp};el.value=Math.max(mn,Math.round((parseFloat(el.value)-s)*1000)/1000);document.getElementById('${id}_disp').textContent=isp?el.value+'%':el.value;"
                                style="width:26px;height:26px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">−</button>
                            <span id="${id}_disp"
                                style="min-width:42px;text-align:center;font-size:12px;font-weight:600;color:#fff;">${dispVal}</span>
                            <input type="hidden" id="${id}" value="${r.v}">
                            <button type="button"
                                onclick="var el=document.getElementById('${id}');var s=${step},mx=${max},isp=${isp};el.value=Math.min(mx,Math.round((parseFloat(el.value)+s)*1000)/1000);document.getElementById('${id}_disp').textContent=isp?el.value+'%':el.value;"
                                style="width:26px;height:26px;background:#1a1a1a;border:1px solid #333;border-radius:6px;color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;">+</button>
                        </div>
                    </td>
                </tr>`;
            }).join("");
        }

    function section(title, color, arr, prefix, mode) {
        return `
            <div style="font-size:12px;font-weight:700;color:${color};margin:10px 0 5px;">${title}</div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
                <tbody>${rowsHtml(arr,prefix,mode)}</tbody>
            </table>`;
    }

    const modal = document.createElement("div");
    modal.id = "_autoSettingsModal";
    modal.innerHTML = `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:999998;"
            onclick="document.getElementById('_autoSettingsModal').remove();"></div>
        <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            background:#0d0d0d;border:1px solid #1a1a1a;border-radius:16px;
            width:min(420px,95vw);max-height:85vh;overflow-y:auto;z-index:999999;padding:16px;">

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="font-size:14px;font-weight:700;color:#fff;">⚙ Threshold Settings</div>
                <button onclick="document.getElementById('_autoSettingsModal').remove()"
                    style="background:none;border:none;color:#555;font-size:20px;cursor:pointer;">✕</button>
            </div>
            <div style="font-size:11px;color:#444;margin-bottom:8px;">
                Edit nilai threshold kalkulasi spend. Klik Simpan untuk terapkan.
            </div>

            ${section("Liq Buffer","#58a6ff",cfg.liqBuffer,"liq","lt")}
            ${section("Margin Factor","#ff7a00",cfg.marginFactor,"mf","ge")}
            ${section("Dynamic Pool Usage","#00d084",cfg.dynamicPoolUsage,"dpu","ge")}
            ${section("Default Chip % (safePct)","#ffcc00",cfg.safePct,"sp","le")}

            <div style="display:flex;gap:8px;margin-top:12px;">
                <button style="flex:1;padding:10px;background:#1a1a1a;border:1px solid #333;
                    border-radius:10px;color:#00d084;font-size:12px;cursor:pointer;font-weight:600;"
                    onclick="
                        const c = window._autoModalSettings.load();
                        c.liqBuffer.forEach((r,i)=>{ const el=document.getElementById('liq_'+i); if(el) r.v=parseFloat(el.value)||r.v; });
                        c.marginFactor.forEach((r,i)=>{ const el=document.getElementById('mf_'+i); if(el) r.v=parseFloat(el.value)||r.v; });
                        c.dynamicPoolUsage.forEach((r,i)=>{ const el=document.getElementById('dpu_'+i); if(el) r.v=parseFloat(el.value)||r.v; });
                        c.safePct.forEach((r,i)=>{ const el=document.getElementById('sp_'+i); if(el) r.v=parseFloat(el.value)||r.v; });
                        window._autoModalSettings.save(c);
                        document.getElementById('_autoSettingsModal').remove();
                        showToast?.('Settings disimpan','success');
                        window._rebuildAutoModal?.();
                    ">
                    💾 Simpan & Terapkan
                </button>
                <button style="flex:1;padding:10px;background:#1a1a1a;border:1px solid #333;
                    border-radius:10px;color:#ff4d4f;font-size:12px;cursor:pointer;"
                    onclick="if(confirm('Reset ke default?')){ window._autoModalSettings.reset(); document.getElementById('_autoSettingsModal').remove(); window._rebuildAutoModal?.(); }">
                    🗑 Reset Default
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

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
    pairKey, currentMargin, isReverse
) {
    let spend = sdaMax * (percent / 100);
    if (!isFinite(spend) || spend <= 0) return { spend: 0, trendAdj: null };

    // hard cap global protection
    if (capEnabled && spend > globalMax) {
        spend = globalMax;
    }

    // guard liq — sdaMax sudah dihitung smart di cache, ini cuma safety net
    if (sdaPerRecv > 0 && maxSafeRecv > 0) {
        const maxSdaByLiq = maxSafeRecv * sdaPerRecv * 0.95;
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

    // ambil langsung dari _lastResults sebelum apapun — ini sumber kebenaran tunggal
    const liveRow = (AGGREGATOR?._lastResults || []).find(r =>
        String(r.payToken || "").toLowerCase() ===
        String(payToken || "").toLowerCase()
    );

    const cached = _getSdaMaxFromCache(
    payToken,
    receiveToken,
    liveBalance,
    capEnabled
);

let sdaMax = cached.sdaMax || 0;

// =====================================
// SYNC DENGAN ROW LIVE TERBARU
// =====================================
const latestRow = (AGGREGATOR?._lastResults || [])
    .find(r =>
        String(r.payToken || "").toLowerCase() ===
        String(payToken || "").toLowerCase()
    );

const savingsPct = Number(
    latestRow?.savingsPct ??
    latestRow?.marginPct ??
    cached.savingsPct ??
    0
);
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
    el.__savingsPct = savingsPct; // dari liveRow — sinkron dengan scan
    el.__maxAmount     = maxAmount;
    el.__paySymbol     = paySymbol;
    el.__receiveSymbol = recvSymbol;
    el.__sdaEquiv    = Number(liveRow?.sdaEquiv      ?? cached.sdaEquiv     ?? 0);
    el.__maxSafeRecv = Number(liveRow?.maxSafeReceive ?? cached.maxSafeRecv  ?? 0);
    el.__sdaPerRecv  = cached.sdaPerReceive || 0;
    el.__activeRate    = cached.rate          || 0;
    el.__globalMax     = GLOBAL_MAX;
    el.__capEnabled    = capEnabled;
    const pairKey = cached.pairKey ||
        `${String(payToken).toLowerCase()}_${String(receiveToken).toLowerCase()}`;

    el.__pairKey = pairKey;
    
    el.__previewCache  = null;
    
    console.log("[AUTO MODAL RAW liveRow]", JSON.stringify(liveRow || latestRow || {}, null, 2));

    // coba ambil row SDA baseline untuk dapat rate STSX→SDA
    const sdaBaseRow = (AGGREGATOR?._lastResults || []).find(r =>
        r.isSDA === true || 
        String(r.payToken || "").toLowerCase() === "native" ||
        String(r.paySymbol || "").toLowerCase() === "sda"
    );
    console.log("[AUTO MODAL SDA BASE]", JSON.stringify(sdaBaseRow || {}, null, 2));

    // =====================================
    // VALIDASI DATA FRESHNESS
    // Deteksi kalau savingsPct tidak match dengan mode
    // reverse harusnya margin negatif, buy harusnya positif
    // kalau terbalik = data stale dari swap sebelumnya
    // =====================================
    const isModeReverse  = mode === "reverse";
    const dataStale      =
        (isModeReverse && savingsPct > 50)  ||
        (!isModeReverse && savingsPct < -50);

    if (dataStale) {
        // tampilkan peringatan, jangan buka modal dengan data salah
        el.innerHTML = `
            <div class="agg-auto-backdrop" onclick="window._closeAutoModal();"></div>
            <div class="agg-auto-box" style="display:flex;flex-direction:column;align-items:center;
                justify-content:center;gap:12px;padding:24px;text-align:center;">
                <div style="font-size:32px;">⚠️</div>
                <div style="font-size:14px;font-weight:700;color:#ffcc00;">Data Belum Fresh</div>
                <div style="font-size:12px;color:#555;line-height:1.6;">
                    Margin tercatat <b style="color:#ff7a00;">${savingsPct > 0 ? "+" : ""}${savingsPct.toFixed(1)}%</b>
                    tapi mode adalah <b style="color:#fff;">${mode.toUpperCase()}</b>.<br>
                    Kemungkinan data dari scan sebelumnya.<br>
                    Tunggu scan selesai lalu buka Auto lagi.
                </div>
                <button onclick="window._closeAutoModal();"
                    style="width:100%;height:44px;border:1px solid #333;border-radius:14px;
                    background:#1a1a1a;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">
                    ✕ Tutup & Scan Ulang
                </button>
            </div>
        `;
        document.body.appendChild(el);
        if (typeof acquireWakeLock === "function") await acquireWakeLock();
        return;
    }

    // catat margin fresh saat modal dibuka — ini titik data pertama yang valid
    window._recordMargin?.(pairKey, savingsPct);

    el.innerHTML = `
        <div class="agg-auto-backdrop"
            onclick="window._closeAutoModal();">
        </div>

        <div class="agg-auto-box" style="display:flex;flex-direction:column;max-height:90vh;overflow:hidden;">

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
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:10px;">
                <div style="flex:1;font-size:11px;color:#666;padding:6px 10px;
                    background:#0a0a0a;border-radius:8px;border-left:3px solid ${marginColor};">
                    Auto safe default: <b style="color:${marginColor}">${nearest}%</b>
                    &mdash; margin ${savingsPct.toFixed(1)}%
                </div>
                <button onclick="window._openAutoSettings()"
                    title="Settings threshold"
                    style="height:34px;width:34px;flex-shrink:0;background:#0a0a0a;
                    border:1px solid #222;border-radius:8px;color:#58a6ff;
                    font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    ⚙
                </button>
            </div>

            <div style="flex:1;overflow-y:auto;overflow-x:hidden;">
            <!-- CUSTOM SPEND INPUT -->
            <div style="margin-bottom:10px;">
                <div class="agg-auto-sub" style="margin-bottom:5px;">Custom Spend Manual (SDA)</div>
                <div style="display:flex;gap:6px;align-items:center;">
                    <input type="number" id="aggCustomSpendInput"
                        placeholder="0.0000 SDA (opsional)"
                        min="0" step="0.01"
                        style="flex:1;background:#0a0a0a;border:1px solid #222;border-radius:10px;
                        color:#fff;padding:8px 10px;font-size:12px;box-sizing:border-box;
                        outline:none;"
                        oninput="
                            const v = parseFloat(this.value);
                            const m = document.getElementById('aggAutoModal');
                            if(!isNaN(v) && v > 0) {
                                m.__customSpend = v;
                                document.querySelectorAll('.agg-auto-chip').forEach(x=>x.classList.remove('active'));
                                window._onCustomSpend(v, m);
                            } else {
                                m.__customSpend = null;
                            }
                        ">
                    <button onclick="
                        document.getElementById('aggCustomSpendInput').value='';
                        const m=document.getElementById('aggAutoModal');
                        m.__customSpend=null;
                        window._onChipClick(
                            document.querySelectorAll('.agg-auto-chip')[
                                [10,20,30,40,50,60,70,80,90,100].indexOf(window.AUTO_SPEND_PERCENT)
                            ] || document.querySelectorAll('.agg-auto-chip')[0],
                            window.AUTO_SPEND_PERCENT
                        );"
                        style="height:36px;width:36px;flex-shrink:0;background:#0a0a0a;
                        border:1px solid #222;border-radius:10px;color:#555;
                        font-size:15px;cursor:pointer;">
                        ✕
                    </button>
                </div>
            </div>
            <!-- CHIPS -->
            <div class="agg-auto-sub" style="margin-bottom:6px;">% dari Max Liq</div>
            <div class="agg-auto-toggle-row">
                ${chips.map(p => `
                    <button class="agg-auto-chip ${nearest === p ? "active" : ""}"
                        onclick="window._onChipClick(this,${p});">${p}%</button>
                `).join("")}
            </div>

            <!-- PREVIEW -->
            <div id="aggAutoPreview" class="agg-auto-preview" style="display:none;"></div>
            <button id="aggSimBtn"
    onclick="document.getElementById('aggAutoPreview').style.display='block';document.getElementById('aggSimBtn').style.display='none';window.runAutoPreview(document.getElementById('aggAutoModal'));"
    style="width:100%;height:40px;border:1px solid #1a1a1a;border-radius:12px;
    background:#0a0a0a;color:#555;font-size:11px;font-weight:600;
    cursor:pointer;margin-bottom:4px;display:none;">
    🔍 Konfirmasi via RPC (opsional)
</button>

            </div><!-- end scroll area -->
            <!-- BUTTONS -->
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px;flex-shrink:0;">

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

    // tampilkan spend instan saat modal buka — tanpa fetch
    window._onChipClick(
        el.querySelectorAll('.agg-auto-chip')[chips.indexOf(nearest)],
        nearest
    );

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

    const customOverride = modal.__customSpend;

    // pakai spend yang sudah ditampilkan di preview
    // supaya angka yang user lihat = angka yang dieksekusi
    const previewSpend = modal.__lastPreviewSpend;

    const { spend, trendAdj } = customOverride && isFinite(customOverride) && customOverride > 0
        ? { spend: Math.min(customOverride, modal.__balance || Infinity), trendAdj: null }
        : previewSpend && isFinite(previewSpend) && previewSpend > 0
        ? { spend: previewSpend, trendAdj: null }
        : _calcFinalSpend(
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
// FETCH RATE LIMITER TRACKER
// =====================================
window._fetchTracker = window._fetchTracker || {
    calls: [],
    limit: 560,       // sesuai limit RPC sebenarnya
    windowMs: 60000,
    warnAt: 0.80      // warning di 80%
};

window._trackFetch = function(label) {
    const now     = Date.now();
    const tracker = window._fetchTracker;
    tracker.calls = tracker.calls.filter(t => now - t < tracker.windowMs);
    tracker.calls.push(now);

    const count     = tracker.calls.length;
    const pct       = count / tracker.limit;
    const remaining = tracker.limit - count;

    // update badge di modal
    const badge = document.getElementById("_fetchRateBadge");
    if (badge) {
        const color =
            pct >= 1.0  ? "#ff4d4f" :
            pct >= 0.75 ? "#ff7a00" :
            pct >= 0.5  ? "#ffcc00" : "#00d084";
        badge.textContent       = `⚡ Fetch ${count}/${tracker.limit} — sisa ${remaining}`;
        badge.style.color       = color;
        badge.style.borderColor = color;
    }

    if (pct >= 1.0) {
        console.warn(`[FETCH LIMIT] HABIS — ${count}/${tracker.limit}`);
        // toast hanya sekali per 30 detik
        const now2 = Date.now();
        if (!tracker._lastToast || now2 - tracker._lastToast > 30000) {
            tracker._lastToast = now2;
            showToast?.("⛔ RPC limit hampir habis — scan melambat!", "error");
        }
        return false;
    }
    if (pct >= tracker.warnAt) {
        const now2 = Date.now();
        if (!tracker._lastWarn || now2 - tracker._lastWarn > 60000) {
            tracker._lastWarn = now2;
            showToast?.(`⚠ RPC ${count}/${tracker.limit} — ${remaining} sisa menit ini`, "warning");
        }
    }
    return true;
};

// override fetch global — auto track semua request
if (!window._fetchOverridden) {
    window._fetchOverridden = true;
    const _origFetch = window.fetch.bind(window);
    window.fetch = function(...args) {
        window._trackFetch(String(args[0] || "").slice(0, 60));
        return _origFetch(...args);
    };
}
// =====================================
// PREVIEW
// =====================================
window.runAutoPreview = function(modalEl) {

    const previewEl = modalEl?.querySelector("#aggAutoPreview");
    const startBtn  = modalEl?.querySelector("#aggAutoStartBtn");
    if (!previewEl) return;

    const route       = modalEl.__route;
    const sdaMax      = modalEl.__sdaMax     || 0;
    const savingsPct  = modalEl.__savingsPct || 0;
    const paySymbol   = modalEl.__paySymbol  || "?";
    const recvSymbol  = modalEl.__receiveSymbol || "?";
    const isReverse   = modalEl.__isReverse  || false;
    const maxSafeRecv = modalEl.__maxSafeRecv || 0;
    const sdaPerRecv  = modalEl.__sdaPerRecv  || 0;
    const capEnabled  = window.AUTO_CAP_ENABLED !== false;
    const globalMax   = Number(window.AUTO_MAX_GLOBAL_SDA || 10);
    const percent     = window.AUTO_SPEND_PERCENT || 10;
    const pairKey     = modalEl.__pairKey || "";

    if (!route?.intermediateToken || !route?.finalToken) {
        previewEl.innerHTML = `<div class="agg-preview-top" style="color:#ff4d4f;">⚠ Route tidak valid</div>`;
        return;
    }

    // hitung spend — sama persis dengan _startAuto
    const { spend, trendAdj } = _calcFinalSpend(
        sdaMax, percent, sdaPerRecv, maxSafeRecv,
        capEnabled, globalMax,
        pairKey, savingsPct, isReverse
    );

    // simpan spend ke modal supaya _startAuto pakai angka yang sama
    if (modalEl) modalEl.__lastPreviewSpend = spend;

    if (spend <= 0) {
        previewEl.innerHTML = `
            <div class="agg-preview-top" style="color:#ff4d4f;">
                ⚠ Spend 0 — ${trendAdj?.reason || "data tidak cukup"}
            </div>`;
        if (startBtn) {
            startBtn.style.opacity = "0.4";
            startBtn.style.pointerEvents = "none";
            startBtn.textContent = "⛔ Spend 0";
        }
        return;
    }

    // ── ambil dari _lastResults, 0 RPC ──
    const lastResults = window.AGGREGATOR?._lastResults || [];
    const scanRow = lastResults.find(r =>
        String(r.payToken || "").toLowerCase() ===
        String(route.intermediateToken || "").toLowerCase()
    );

    // est token step1: spend SDA → intermediate
    // rate: unitsNeeded / sdaEquiv = token per SDA
    const rateTokenPerSda = (scanRow?.unitsNeeded > 0 && scanRow?.sdaEquiv > 0)
        ? scanRow.unitsNeeded / scanRow.sdaEquiv
        : 0;
    const estStep1 = rateTokenPerSda > 0 ? spend * rateTokenPerSda : 0;

    // reverse: savings negatif dibalik jadi positif
    // buy: savings positif langsung dipakai
    const baseProfit = isReverse
        ? Math.abs(scanRow?.savings ?? 0)
        : (scanRow?.savings ?? 0);
    const baseSda   = scanRow?.sdaEquiv ?? spend;

    // buffer realistis: fee 3 hop × 0.3% + slippage 0.5% = ~1.4%
    // real profit sekitar 36% dari estimasi scan — pakai 0.40 sebagai buffer
    const REAL_BUFFER = 0.40;
    const profitEst = baseSda > 0
        ? (baseProfit / baseSda) * spend * REAL_BUFFER
        : 0;
    const estBack = spend + profitEst;

    // cek liq
    const exceedsLiq = maxSafeRecv > 0 && estStep1 > maxSafeRecv;

    // tren
    const trendData  = window._getMarginTrend?.(pairKey);
    const trendCheck = window._shouldAbortByTrend?.(pairKey, savingsPct) || { abort: false };

    // warna
    const profitColor = profitEst >= 0 ? "#00d084" : "#ff4d4f";
    const sign        = profitEst >= 0 ? "+" : "";
    const safetyColor = {
        safe:    "#00d084",
        caution: "#ff7a00",
        reduced: "#ff4d4f",
        blocked: "#ff4d4f"
    }[trendAdj?.safetyLevel || "safe"] || "#00d084";

    // liq html
    const liqHtml = maxSafeRecv > 0
        ? exceedsLiq
            ? `<div style="margin-top:6px;padding:6px 8px;
                background:rgba(255,77,79,.1);border:1px solid #ff4d4f;
                border-radius:8px;font-size:11px;color:#ff4d4f;">
                ⚠ Est. melebihi liq aman ~${maxSafeRecv.toFixed(4)} ${recvSymbol}
                <br><b>Kurangi % spend</b></div>`
            : `<div style="margin-top:4px;font-size:11px;color:#888;">
                ✔ Liq OK: ~${maxSafeRecv.toFixed(4)} ${recvSymbol}</div>`
        : "";

    // tren html
    const trendHtml = trendData ? (() => {
        const arrow  = trendData.slope > 0.2 ? "↑" : trendData.slope < -0.2 ? "↓" : "→";
        const tcolor = trendData.slope > 0.2 ? "#00d084" : trendData.slope < -0.2 ? "#ff4d4f" : "#aaa";
        const warn   = trendCheck.abort
            ? `<div style="margin-top:4px;font-size:11px;color:#ff4d4f;">⛔ ${trendCheck.reason}</div>`
            : trendData.predicted < savingsPct
                ? `<div style="margin-top:4px;font-size:11px;color:#ff7a00;">
                    ⚠ Prediksi: ${trendData.predicted.toFixed(2)}%</div>`
                : `<div style="margin-top:4px;font-size:11px;color:#555;">
                    Prediksi: ${trendData.predicted.toFixed(2)}%</div>`;
        return `
            <div style="margin-top:8px;padding:7px 10px;background:#0a0a0a;
                border:1px solid #1a1a1a;border-radius:9px;">
                <div style="font-size:10px;color:#555;margin-bottom:3px;">
                    Tren (${trendData.dataPoints} data)
                </div>
                <div style="font-size:13px;font-weight:700;color:${tcolor};">
                    ${arrow} ${trendData.current.toFixed(2)}% → ${trendData.predicted.toFixed(2)}%
                </div>
                ${warn}
            </div>`;
    })() : "";

    const trendNote = trendAdj?.reason
        ? `<div style="font-size:11px;color:${safetyColor};margin-top:4px;">⚠ ${trendAdj.reason}</div>`
        : "";

    const capNote = (capEnabled && spend < sdaMax * (percent / 100))
        ? `<div class="agg-preview-sub" style="color:#ff7a00;margin-top:4px;">
            ⚠ Dibatasi oleh protection (${globalMax} SDA max)</div>`
        : "";

    // aktifkan/matikan START
    const ok = spend > 0
        && profitEst > 0
        && !exceedsLiq
        && !trendCheck.abort
        && trendAdj?.safetyLevel !== "blocked";

    if (startBtn) {
        startBtn.style.opacity       = ok ? "1" : "0.4";
        startBtn.style.pointerEvents = ok ? "auto" : "none";
        startBtn.style.background    = trendAdj?.safetyLevel === "caution" ? "#ff7a00"
                                     : trendAdj?.safetyLevel === "reduced" ? "#ff4d4f" : "";
        startBtn.textContent = trendCheck.abort                        ? "⛔ DITAHAN — Tren Turun"
            : exceedsLiq                                               ? "⚠ Liq Terlewati"
            : profitEst <= 0                                           ? "⚠ Profit Negatif"
            : trendAdj?.safetyLevel === "blocked"                      ? "⛔ DIBLOKIR — Tren Bahaya"
            : trendAdj?.safetyLevel === "caution"                      ? "⚡ START AUTO (Spend -25%)"
            : trendAdj?.safetyLevel === "reduced"                      ? "⚡ START AUTO (Spend -50%)"
            : "⚡ START AUTO";
    }

    // render
    previewEl.innerHTML = `
        <div class="agg-preview-top">Akan spend</div>
        <div class="agg-preview-value" style="color:${safetyColor};">
            ${spend.toFixed(4)} SDA
        </div>
        <div class="agg-preview-sub" style="margin-top:2px;color:#555;">
            ${percent}% dari <b style="color:#58a6ff;">${sdaMax.toFixed(4)} SDA</b>
        </div>

        ${estStep1 > 0
            ? `<div class="agg-preview-sub" style="margin-top:4px;">
                ≈ <b style="color:#fff;">${estStep1.toFixed(4)}</b> ${isReverse ? recvSymbol : paySymbol}
               </div>`
            : ""}

        ${liqHtml}
        ${capNote}
        ${trendNote}

        <div style="margin-top:10px;padding-top:10px;border-top:1px solid #1a1a1a;">
            <div class="agg-preview-sub" style="margin-bottom:4px;">
                Est. back: <b style="color:#fff;">${estBack.toFixed(4)} SDA</b>
            </div>
            <div style="font-size:15px;font-weight:800;color:${profitColor};">
                ${sign}${profitEst.toFixed(4)} SDA
                <span style="font-size:12px;opacity:.8;">
                    (${sign}${Math.abs(savingsPct).toFixed(2)}%)
                </span>
            </div>
            <div class="agg-preview-sub" style="margin-top:4px;color:#555;">
                Data dari scan — instan
            </div>
        </div>

        ${trendHtml}
    `;
};