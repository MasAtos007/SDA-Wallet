// =====================================
// AUTO MODAL ENGINE â€” FINAL v5
// =====================================

window.AUTO_SPEND_PERCENT = window.AUTO_SPEND_PERCENT || 100;
window.AUTO_CAP_ENABLED   = window.AUTO_CAP_ENABLED !== undefined ? window.AUTO_CAP_ENABLED : true;
window.AUTO_MAX_GLOBAL_SDA = window.AUTO_MAX_GLOBAL_SDA || 10;

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
// SKIP CONFIRM â€” SAFE (no redeclare)
// =====================================
if (!window._confirmPatched) {
    window._confirmPatched = true;
    const _orig = window.confirm.bind(window);
    window.confirm = function(msg) {
        if (window._skipAutoConfirm) {
            console.log("[AUTO] confirm() dilewati:", msg);
            return true;
        }
        return _orig(msg);
    };
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

        return {
            sdaMax, safePct, savingsPct, savingsAbs,
            sdaForMaxLiq, paySymbol, receiveSymbol: recvSymbol,
            sdaEquiv, maxSafeRecv, sdaPerReceive, rate: found.rate || 0
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
// CLOSE HELPER (dengan WakeLock release)
// =====================================
window._closeAutoModal = function() {
    document.getElementById("aggAutoModal")?.remove();
    if (typeof releaseWakeLock === "function") releaseWakeLock();
    AGGREGATOR.setAutoRunning(false);
    AGGREGATOR.unlockAutoButtons();
};

// =====================================
// OPEN MODAL
// =====================================
window.openAutoSpendModal = async function(mode, payToken, receiveToken, maxAmount) {
    document.getElementById("aggAutoModal")?.remove();

    // balance â€” live dulu, fallback cache
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
    const savingsPct = cached.savingsPct || 0;
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
                    onclick="
                        const modal      = document.getElementById('aggAutoModal');
                        const route      = modal?.__route;
                        const sdaMax     = modal?.__sdaMax || 0;
                        const mod        = modal?.__mode || 'buy';
                        const capOn      = window.AUTO_CAP_ENABLED !== false;
                        const globalMax  = Number(window.AUTO_MAX_GLOBAL_SDA || 10);
                        const maxRecv    = modal?.__maxSafeRecv || 0;
                        const sdaPerRecv = modal?.__sdaPerRecv || 0;

                        if (!route || sdaMax <= 0) {
                            alert('Route / liquidity belum siap. Tunggu scan selesai.');
                            return;
                        }

                        const percent = window.AUTO_SPEND_PERCENT || 10;
                        const spend   = Math.min(sdaMax * (percent / 100), sdaMax);

                        if (!isFinite(spend) || spend <= 0) {
                            alert('Spend tidak valid - data belum ready');
                            return;
                        }

                        if (capOn && spend > globalMax) {
                            alert('Spend ' + spend.toFixed(4) + ' SDA melebihi global protection ' + globalMax + ' SDA');
                            return;
                        }

                        if (sdaPerRecv > 0 && maxRecv > 0) {
                            const maxSdaByLiq = maxRecv * sdaPerRecv * 0.90;
                            if (spend > maxSdaByLiq) {
                                alert('Spend ' + spend.toFixed(4) + ' SDA melebihi batas liq aman (' + maxSdaByLiq.toFixed(4) + ' SDA).\\nSwap akan gagal!');
                                return;
                            }
                        }

                        modal.remove();
                        if (typeof releaseWakeLock === 'function') releaseWakeLock();
                        window._skipAutoConfirm = true;

                        if (mod === 'buy') {
                            AGGREGATOR.autoRouteBuy(route.intermediateToken, route.finalToken, spend)
                                .finally(() => { window._skipAutoConfirm = false; });
                        } else {
                            AGGREGATOR.autoRouteReverse(route.intermediateToken, route.finalToken, spend)
                                .finally(() => { window._skipAutoConfirm = false; });
                        }
                    ">
                    &#x26A1; START AUTO
                </button>

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

    // WakeLock â€” jaga layar tetap nyala selama modal terbuka
    if (typeof acquireWakeLock === "function") await acquireWakeLock();
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
    const percent     = window.AUTO_SPEND_PERCENT || 10;

    if (!route?.intermediateToken || !route?.finalToken) {
        previewEl.innerHTML = `<div class="agg-preview-top" style="color:#ff4d4f;">&#x26A0; Route tidak valid</div>`;
        return;
    }

    let spend = Math.min(sdaMax * (percent / 100), sdaMax);
    if (!isFinite(spend) || spend <= 0) spend = 0;

    if (startBtn) {
        startBtn.style.opacity       = spend > 0 ? "1"    : "0.4";
        startBtn.style.pointerEvents = spend > 0 ? "auto" : "none";
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
        // =====================================
        // ARAH ROUTE
        // intermediateToken = GACP (token A)
        // finalToken        = TAP  (token B)
        //
        // BUY:     SDA -> GACP -> TAP  -> SDA
        // REVERSE: SDA -> TAP  -> GACP -> SDA
        // =====================================

        // FIX: reverse swap step1/step2 token DAN symbol dengan benar
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

        // cek liq â€” untuk reverse, liq check di step1 (TAP pool)
        //           untuk buy,     liq check di step2 (TAP pool)
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

        // =====================================
        // FIX SIMULASI REVERSE
        // simulateFullCycle(tokenA, tokenB, sdaSpend)
        // BUY:     simulateFullCycle(intermediateToken, finalToken, spend)
        //          = simulateFullCycle(GACP, TAP, spend)
        // REVERSE: simulateFullCycle(finalToken, intermediateToken, spend)
        //          = simulateFullCycle(TAP, GACP, spend)
        // =====================================
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

            <div class="agg-preview-sub" style="margin-top:4px;color:#666;">
                Route: SDA &rarr; ${firstSym} &rarr; ${secondSym} &rarr; SDA
            </div>

            <div class="agg-preview-sub">
                ${percent}% dari <b style="color:#58a6ff;">${sdaMax.toFixed(4)} SDA</b>
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
        `;

    } catch(e) {
        console.warn("[PREVIEW ERROR]", e);
        previewEl.innerHTML = `<div class="agg-preview-top" style="color:#ff4d4f;">&#x26A0; Preview gagal: ${e.message}</div>`;
    }
};