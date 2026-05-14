// ============================================================
//  FLOATING PANEL — Session PnL + Trade Log (minimalis)
//  • Ukuran kecil, tidak ganggu konten utama
//  • Auto-offset di bawah .header
//  • Trade log collapsible via dropdown toggle
// ============================================================

(function () {

    const PANEL_ID    = "aggSessionProfit";
    const LOG_LIST_ID = "aggTradeLogList";
    const KEY         = "agg_session_profit";

    window._sessionProfit    = Number(localStorage.getItem(KEY) || 0);
    window.TRADE_LOG_VISIBLE = false;
    window._cachedLogItems   = window._cachedLogItems || [];

    // ── HITUNG TOP OFFSET dari .header ───────────────────────
    function getTopOffset() {
        const h = document.querySelector(".header");
        if (!h) return 8;
        return Math.round(h.getBoundingClientRect().bottom) + 6;
    }

    // ── BUAT / AMBIL PANEL ───────────────────────────────────
    function getOrCreatePanel() {
        let el = document.getElementById(PANEL_ID);
        if (el) return el;

        el = document.createElement("div");
        el.id = PANEL_ID;
        Object.assign(el.style, {
            position:       "fixed",
            top:            getTopOffset() + "px",
            left:           "12px",
            padding:        "5px 9px",
            borderRadius:   "8px",
            background:     "rgba(0,0,0,.70)",
            color:          "#fff",
            fontSize:       "11px",
            fontWeight:     "600",
            zIndex:         999999,
            backdropFilter: "blur(8px)",
            lineHeight:     "1.4",
            userSelect:     "none",
            minWidth:       "110px"
        });
        document.body.appendChild(el);
        return el;
    }

    // ── RENDER ───────────────────────────────────────────────
    function renderSessionUI() {
        const el       = getOrCreatePanel();
        const val      = window._sessionProfit;
        const pnlColor = val >= 0 ? "#00ff9d" : "#ff4d4d";
        const logOn    = window.TRADE_LOG_VISIBLE;

        el.innerHTML = `
            <div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
                <span style="opacity:.45;font-size:9px;letter-spacing:.4px">PnL</span>
                <span style="color:${pnlColor};font-size:12px">
                    ${val >= 0 ? "+" : ""}${val.toFixed(4)} SDA
                </span>
                <button id="aggLogToggleBtn" style="
                    font-size:9px;padding:1px 5px;
                    border:1px solid rgba(255,255,255,.18);
                    border-radius:4px;
                    background:rgba(255,255,255,.06);
                    color:#aaa;cursor:pointer;line-height:1.6;
                ">${logOn ? "▲" : "▼"}</button>
            </div>

            <div id="${LOG_LIST_ID}" style="
                display:${logOn ? "block" : "none"};
                margin-top:6px;
                border-top:1px solid rgba(255,255,255,.1);
                padding-top:5px;
                max-height:200px;
                overflow-y:auto;
                min-width:160px;
            "></div>
        `;

        document.getElementById("aggLogToggleBtn")
            ?.addEventListener("click", () => {
                window.TRADE_LOG_VISIBLE = !window.TRADE_LOG_VISIBLE;
                const cache = window._cachedLogItems.slice();
                renderSessionUI();
                restoreLogItems(cache);
            });
    }

    // ── RESTORE LOG DARI CACHE ───────────────────────────────
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

    // ── ADD LOG ──────────────────────────────────────────────
    function addTradeLog(data) {
        getOrCreatePanel();
        const time   = new Date().toLocaleTimeString();
        const profit = Number(data.profit || 0);
        const pc     = profit >= 0 ? "#00ff9d" : "#ff4d4d";

        const itemHTML = `<div style="
            padding:4px 2px;
            border-bottom:1px solid rgba(255,255,255,.07);
            font-size:10px;line-height:1.5;
        ">
            <span style="opacity:.4">${time}</span>
            <span style="margin-left:4px;opacity:.8">${data.route || "TRADE"}</span>
            <span style="margin-left:4px;font-weight:700;color:${pc}">
                ${profit >= 0 ? "+" : ""}${profit.toFixed(4)}
            </span>
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
    }

    // ── SESSION API ──────────────────────────────────────────
    function updateSessionProfit(amount) {
        if (!isFinite(amount)) return;
        window._sessionProfit += amount;
        localStorage.setItem(KEY, window._sessionProfit);
        renderSessionUI();
        restoreLogItems(window._cachedLogItems);
    }

    function resetSessionProfit() {
        window._sessionProfit = 0;
        localStorage.setItem(KEY, 0);
        window._cachedLogItems = [];
        renderSessionUI();
    }

    // ── AUTO REPOSITION saat resize ─────────────────────────
    function repositionPanels() {
        const top = getTopOffset() + "px";
        const panel = document.getElementById(PANEL_ID);
        if (panel) panel.style.top = top;
        // fetch badge ikut offset yang sama, posisi kanan panel
        const badge = document.getElementById("_fetchFloatBadge");
        if (badge) badge.style.top = top;
    }

    window.addEventListener("resize", repositionPanels);
    setTimeout(repositionPanels, 400);

    // ── EXPOSE ───────────────────────────────────────────────
    window.addTradeLog         = addTradeLog;
    window.updateSessionProfit = updateSessionProfit;
    window.resetSessionProfit  = resetSessionProfit;

    renderSessionUI();

})();


// ============================================================
//  FETCH COUNTER FLOATING  (tidak berubah)
// ============================================================
window._fetchTracker = window._fetchTracker || {
    calls:         [],
    errors:        0,
    windowMs:      60000,
    _lastErrorToast: 0
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
                showToast(` RPC error #${tracker.errors} — kemungkinan kena limit!`, "error");
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

        // Posisi: sejajar top dengan panel PnL, tapi di kanan-nya
        // left dihitung dinamis agar tidak overlap
        const panelEl = document.getElementById("aggSessionProfit");
        const panelRight = panelEl
            ? panelEl.getBoundingClientRect().right + 8
            : 170;

        Object.assign(badge.style, {
            position:       "fixed",
            top:            (window._getTopOffset ? window._getTopOffset() : 8) + "px",
            left:           panelRight + "px",
            padding:        "4px 8px",
            borderRadius:   "7px",
            background:     "rgba(0,0,0,.65)",
            color:          "#fff",
            fontSize:       "10px",
            fontWeight:     "600",
            zIndex:         999999,
            backdropFilter: "blur(6px)",
            lineHeight:     "1.5",
            cursor:         "pointer",
            whiteSpace:     "nowrap"
        });
        badge.title   = "Klik reset";
        badge.onclick = function () {
            window._fetchTracker.calls  = [];
            window._fetchTracker.errors = 0;
            _updateFetchBadge();
        };
        document.body.appendChild(badge);
    }

    // Update posisi left setiap render (panel PnL bisa resize)
    const panelEl = document.getElementById("aggSessionProfit");
    if (panelEl) {
        const r = panelEl.getBoundingClientRect();
        badge.style.left = (r.right + 8) + "px";
        badge.style.top  = r.top + "px";
    }

    const errColor = errors > 0 ? "#ff4d4f" : "transparent";
    const rpcColor = count > 200 ? "#ff4d4f"
                   : count > 100 ? "#ff7a00"
                   : count >  50 ? "#ffcc00"
                   : "#00d084";

    badge.innerHTML =
        `<span style="opacity:.4;font-size:9px">RPC </span>` +
        `<span style="color:${rpcColor}">${count}</span>` +
        (errors > 0 ? ` <span style="color:${errColor};font-size:9px">${errors}err</span>` : "");
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