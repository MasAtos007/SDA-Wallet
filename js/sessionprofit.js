// ============================================================
//  SESSION PnL PANEL â€” hanya muncul di dalam #swapModal
//  â€¢ Di-inject ke .swap-card, bukan document.body
//  â€¢ Auto show/hide mengikuti visibility #swapModal
//  â€¢ Logic API tidak berubah
// ============================================================

(function () {

    const PANEL_ID    = "aggSessionProfit";
    const LOG_LIST_ID = "aggTradeLogList";
    const KEY         = "agg_session_profit";

    window._sessionProfit  = Number(localStorage.getItem(KEY) || 0);
    window._cachedLogItems = window._cachedLogItems || [];
    window._pnlExpanded    = false;

    window._sessionStats = window._sessionStats || {
        totalProfit  : 0,
        totalLoss    : 0,
        tradeCount   : 0,
        winCount     : 0,
        bestTrade    : 0,
        startBalance : null
    };

    // â”€â”€ HELPER STAT CELL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function statCell(label, value, color, noBorderRight) {
        return `<div style="
            padding:7px 10px;
            border-bottom:1px solid rgba(255,255,255,.05);
            ${noBorderRight ? "" : "border-right:1px solid rgba(255,255,255,.05);"}
        ">
            <div style="font-size:9px;color:rgba(255,255,255,.3);font-weight:600;
                text-transform:uppercase;letter-spacing:.3px;">${label}</div>
            <div style="font-size:12px;font-weight:700;color:${color};margin-top:2px">${value}</div>
        </div>`;
    }

    // â”€â”€ INJECT PANEL KE .swap-card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function getOrCreatePanel() {
        let el = document.getElementById(PANEL_ID);
        if (el) return el;

        // target container: .swap-card di dalam #swapModal
        const container = document.querySelector("#swapModal .swap-card");
        if (!container) return null;

        el = document.createElement("div");
        el.id = PANEL_ID;
        Object.assign(el.style, {
            margin      : "8px 0 0",
            fontFamily  : "system-ui, sans-serif",
            userSelect  : "none"
        });

        // sisipkan sebelum .info (rate info) atau append jika tidak ada
        const rateEl = container.querySelector(".info, #swapRate");
        if (rateEl) {
            container.insertBefore(el, rateEl);
        } else {
            container.appendChild(el);
        }

        return el;
    }

    // â”€â”€ RENDER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function renderSessionUI() {
        const el = getOrCreatePanel();
        if (!el) return;

        const val      = window._sessionProfit;
        const stats    = window._sessionStats;
        const expanded = window._pnlExpanded;

        const pnlColor = val >= 0 ? "#00d084" : "#ff4d4f";
        const pnlBg    = val >= 0 ? "rgba(0,208,132,.12)" : "rgba(255,77,79,.12)";
        const pnlSign  = val >= 0 ? "+" : "-";
        const winRate  = stats.tradeCount > 0
            ? Math.round((stats.winCount / stats.tradeCount) * 100) : 0;
        const wrColor  = winRate >= 60 ? "#00d084" : winRate >= 40 ? "#ff7a00" : "#ff4d4f";

        const pctVal   = stats.startBalance && stats.startBalance > 0
            ? ((val / stats.startBalance) * 100).toFixed(2) : null;
        const pctBadge = pctVal !== null
            ? `<span style="background:${pnlBg};color:${pnlColor};font-size:10px;
                font-weight:700;padding:2px 7px;border-radius:20px;">
                ${val >= 0 ? "+" : "-"}${pctVal}%</span>`
            : "";

        el.innerHTML = `
        <!-- BAR -->
        <div id="aggPnlBar" style="
            display:flex;align-items:center;justify-content:space-between;
            background:rgba(0,0,0,.55);
            border:1px solid rgba(255,255,255,.08);
            border-radius:10px;
            padding:7px 11px;
            cursor:pointer;
            gap:8px;
        ">
            <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:9px;font-weight:600;letter-spacing:.4px;
                    color:rgba(255,255,255,.35);">PnL</span>
                <span style="font-size:13px;font-weight:700;color:${pnlColor}">
                    ${pnlSign}${val.toFixed(4)} SDA
                </span>
            </div>
            <div style="display:flex;align-items:center;gap:5px">
                ${pctBadge}
                <i class="ti ti-chevron-down" style="color:rgba(255,255,255,.3);font-size:14px;
                    display:inline-block;
                    transform:${expanded ? "rotate(180deg)" : "rotate(0deg)"};
                    transition:transform .2s;"></i>
            </div>
        </div>

        <!-- DETAIL -->
        <div id="aggPnlDetail" style="
            display:${expanded ? "block" : "none"};
            background:rgba(10,10,10,.88);
            border:1px solid rgba(255,255,255,.07);
            border-top:none;
            border-radius:0 0 10px 10px;
            overflow:hidden;
            margin-top:-4px;
            padding-top:4px;
        ">
            <div style="display:grid;grid-template-columns:1fr 1fr;
                border-bottom:1px solid rgba(255,255,255,.06);">
                ${statCell("Profit",   "+" + stats.totalProfit.toFixed(4), "#00d084", false)}
                ${statCell("Loss",     (stats.totalLoss > 0 ? "âˆ’" : "") + stats.totalLoss.toFixed(4), "#ff4d4f", true)}
                ${statCell("Trade",    String(stats.tradeCount), "#ddd", false)}
                ${statCell("Win rate", winRate + "%", wrColor, true)}
                ${statCell("Best",     "+" + stats.bestTrade.toFixed(4), "#00d084", false)}
                ${statCell("Modal",    stats.startBalance ? stats.startBalance.toFixed(2) + " SDA" : "N/A", "#666", true)}
            </div>

            <!-- LOG -->
            <div style="padding:7px 10px 4px">
                <div style="font-size:9px;font-weight:600;letter-spacing:.4px;
                    color:rgba(255,255,255,.28);margin-bottom:5px;text-transform:uppercase;">
                    Log trade</div>
                <div id="${LOG_LIST_ID}" style="max-height:140px;overflow-y:auto;"></div>
                <div style="font-size:9px;color:rgba(255,255,255,.18);
                    padding:4px 0 2px;text-align:center;">maks 20 trade terakhir</div>
            </div>

            <!-- RESET -->
            <div style="padding:0 10px 9px">
                <button id="aggResetBtn" style="
                    width:100%;padding:6px;
                    border:1px solid rgba(255,255,255,.1);
                    border-radius:7px;
                    background:rgba(255,255,255,.04);
                    color:rgba(255,255,255,.35);
                    font-size:10px;font-weight:600;cursor:pointer;
                    display:flex;align-items:center;justify-content:center;gap:5px;">
                    <i class="ti ti-refresh" style="font-size:13px;"></i> Reset sesi
                </button>
            </div>
        </div>
        `;

        document.getElementById("aggPnlBar")
            ?.addEventListener("click", () => {
                window._pnlExpanded = !window._pnlExpanded;
                const cache = window._cachedLogItems.slice();
                renderSessionUI();
                restoreLogItems(cache);
            });

        document.getElementById("aggResetBtn")
            ?.addEventListener("click", (e) => {
                e.stopPropagation();
                resetSessionProfit();
            });

        restoreLogItems(window._cachedLogItems);
    }

    // â”€â”€ RESTORE LOG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function restoreLogItems(items) {
        const list = document.getElementById(LOG_LIST_ID);
        if (!list) return;
        list.innerHTML = "";
        items.forEach(html => {
            const d = document.createElement("div");
            d.innerHTML = html;
            list.appendChild(d.firstElementChild || d);
        });
    }

    // â”€â”€ ADD LOG â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function addTradeLog(data) {
        const time   = new Date().toLocaleTimeString();
        const profit = Number(data.profit || 0);
        const pc     = profit >= 0 ? "#00d084" : "#ff4d4f";

        const stats = window._sessionStats;
        stats.tradeCount++;
        if (profit >= 0) {
            stats.totalProfit += profit;
            stats.winCount++;
            if (profit > stats.bestTrade) stats.bestTrade = profit;
        } else {
            stats.totalLoss += Math.abs(profit);
        }

        const itemHTML = `<div style="
            padding:4px 2px;
            border-bottom:1px solid rgba(255,255,255,.05);
            font-size:10px;line-height:1.5;
            display:flex;justify-content:space-between;align-items:center;gap:4px;">
            <span style="opacity:.35;flex-shrink:0">${time}</span>
            <span style="opacity:.7;flex:1;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${data.route || "TRADE"}</span>
            <span style="font-weight:700;color:${pc};flex-shrink:0">
                ${profit >= 0 ? "+" : ""}${profit.toFixed(4)}</span>
        </div>`;

        window._cachedLogItems.unshift(itemHTML);
        if (window._cachedLogItems.length > 20) window._cachedLogItems.pop();

        const list = document.getElementById(LOG_LIST_ID);
        if (list) {
            const d = document.createElement("div");
            d.innerHTML = itemHTML;
            list.prepend(d.firstElementChild || d);
            while (list.children.length > 20) list.removeChild(list.lastChild);
        }

        renderSessionUI();
        restoreLogItems(window._cachedLogItems);
    }

    // â”€â”€ SESSION API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function updateSessionProfit(amount) {
        if (!isFinite(amount)) return;

        if (window._sessionStats.startBalance === null) {
            const balEl = document.getElementById("swapWalletBalance");
            if (balEl) {
                const parsed = parseFloat(balEl.textContent.replace(/[^0-9.]/g, ""));
                if (!isNaN(parsed)) window._sessionStats.startBalance = parsed;
            }
        }

        window._sessionProfit += amount;
        localStorage.setItem(KEY, window._sessionProfit);
        renderSessionUI();
        restoreLogItems(window._cachedLogItems);
    }

    function resetSessionProfit() {
        window._sessionProfit = 0;
        localStorage.setItem(KEY, 0);
        window._cachedLogItems = [];
        window._sessionStats = {
            totalProfit  : 0,
            totalLoss    : 0,
            tradeCount   : 0,
            winCount     : 0,
            bestTrade    : 0,
            startBalance : null
        };
        renderSessionUI();
    }

    // â”€â”€ OBSERVE #swapModal â€” watch class "show" â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function observeSwapModal() {
        const modal = document.getElementById("swapModal");
        if (!modal) {
            setTimeout(observeSwapModal, 300);
            return;
        }

        const observer = new MutationObserver(() => {
            const isOpen      = modal.classList.contains("show");
            const panelExists = !!document.getElementById(PANEL_ID);

            if (isOpen && !panelExists) {
                // modal baru dibuka â€” inject panel
                renderSessionUI();
            } else if (!isOpen && panelExists) {
                // modal ditutup â€” buang panel
                document.getElementById(PANEL_ID)?.remove();
            }
        });

        observer.observe(modal, {
            attributes      : true,
            attributeFilter : ["class"]
        });

        // cek kondisi awal â€” kalau modal sudah .show saat script load
        if (modal.classList.contains("show")) renderSessionUI();
    }

    // â”€â”€ EXPOSE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    window.addTradeLog         = addTradeLog;
    window.updateSessionProfit = updateSessionProfit;
    window.resetSessionProfit  = resetSessionProfit;

    // mulai observasi setelah DOM ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", observeSwapModal);
    } else {
        observeSwapModal();
    }

})();


// ============================================================
//  FETCH COUNTER FLOATING  (tidak berubah)
// ============================================================
window._fetchTracker = window._fetchTracker || {
    calls           : [],
    errors          : 0,
    windowMs        : 60000,
    _lastErrorToast : 0
};

window._trackFetch = function (label, isError) {
    const now     = Date.now();
    const tracker = window._fetchTracker;

    tracker.calls = tracker.calls.filter(t => now - t < tracker.windowMs);
    tracker.calls.push(now);

    if (isError) {
        tracker.errors++;
        const now2 = Date.now();
        if (now2 - tracker._lastErrorToast > 30000) {
            tracker._lastErrorToast = now2;
            typeof showToast === "function" &&
                showToast(`RPC error #${tracker.errors} â€” kemungkinan kena limit!`, "error");
        }
    }

    _updateFetchBadge();
};

function _updateFetchBadge() {
    const tracker = window._fetchTracker;
    const count   = tracker.calls.length;
    const errors  = tracker.errors;

    let badge = document.getElementById("_fetchFloatBadge");
    if (!badge) {
        badge    = document.createElement("div");
        badge.id = "_fetchFloatBadge";
        Object.assign(badge.style, {
            position      : "fixed",
            top           : "8px",
            right         : "12px",
            padding       : "4px 8px",
            borderRadius  : "7px",
            background    : "rgba(0,0,0,.70)",
            color         : "#fff",
            fontSize      : "10px",
            fontWeight    : "600",
            zIndex        : 999999,
            backdropFilter: "blur(6px)",
            lineHeight    : "1.5",
            cursor        : "pointer",
            whiteSpace    : "nowrap"
        });
        badge.title   = "Klik reset";
        badge.onclick = function () {
            window._fetchTracker.calls  = [];
            window._fetchTracker.errors = 0;
            _updateFetchBadge();
        };
        document.body.appendChild(badge);
    }

    const errColor = errors > 0 ? "#ff4d4f" : "transparent";
    const rpcColor = count > 200 ? "#ff4d4f"
                   : count > 100 ? "#ff7a00"
                   : count >  50 ? "#ffcc00"
                   : "#00d084";

    badge.innerHTML =
        `<span style="opacity:.4;font-size:9px">RPC </span>` +
        `<span style="color:${rpcColor}">${count}</span>` +
        (errors > 0
            ? ` <span style="color:${errColor};font-size:9px">${errors}err</span>`
            : "");
}

if (!window._fetchOverridden) {
    window._fetchOverridden = true;
    const _origFetch = window.fetch.bind(window);
    window.fetch = function (...args) {
        const p = _origFetch(...args);
        window._trackFetch(String(args[0] || "").slice(0, 60), false);
        p.then(res => {
            if (!res.ok) window._trackFetch("", true);
        }).catch(() => {
            window._trackFetch("", true);
        });
        return p;
    };
}

setInterval(_updateFetchBadge, 5000);
_updateFetchBadge();