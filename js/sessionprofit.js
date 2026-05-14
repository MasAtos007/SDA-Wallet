// ==============================
// SESSION PROFIT COUNTER
// ==============================

(function () {

    const KEY = "agg_session_profit";

    // init session
    window._sessionProfit = Number(
        localStorage.getItem(KEY) || 0
    );

    function updateSessionProfit(amount) {

        if (!isFinite(amount)) return;

        window._sessionProfit += amount;

        localStorage.setItem(
            KEY,
            window._sessionProfit
        );

        renderSessionUI();
    }

    function resetSessionProfit() {

        window._sessionProfit = 0;

        localStorage.setItem(KEY, 0);

        renderSessionUI();
    }

    function renderSessionUI() {

        let el =
            document.getElementById(
                "aggSessionProfit"
            );

        if (!el) {

            el = document.createElement("div");

            el.id = "aggSessionProfit";

            Object.assign(el.style, {

    position: "fixed",

    top: "12px",
    left: "12px",
    right: "auto",   // 🔥 penting

    padding: "10px 14px",
    borderRadius: "10px",

    background: "rgba(0,0,0,.75)",
    color: "#fff",

    fontSize: "13px",
    fontWeight: "600",

    zIndex: 999999,

    backdropFilter: "blur(8px)"
});

            document.body.appendChild(el);
        }

        const val = window._sessionProfit;

        el.innerHTML = `
            SESSION PnL<br>
            <span style="color:${
                val >= 0 ? "#00ff9d" : "#ff4d4d"
            }">
                ${val >= 0 ? "+" : ""}${val.toFixed(4)} SDA
            </span>
        `;
    }
    // expose global API
    window.updateSessionProfit = updateSessionProfit;
    window.resetSessionProfit = resetSessionProfit;
    renderSessionUI();
})();

// =====================================
// FETCH COUNTER FLOATING
// =====================================
window._fetchTracker = window._fetchTracker || {
    calls: [],
    errors: 0,
    windowMs: 60000,
    _lastErrorToast: 0
};

window._trackFetch = function(label, isError) {
    const now     = Date.now();
    const tracker = window._fetchTracker;

    // buang yang sudah > 1 menit
    tracker.calls = tracker.calls.filter(t => now - t < tracker.windowMs);
    tracker.calls.push(now);

    if (isError) {
        tracker.errors++;
        // catat error rate  ini petunjuk limit RPC
        const now2 = Date.now();
        if (now2 - tracker._lastErrorToast > 30000) {
            tracker._lastErrorToast = now2;
            showToast?.(` RPC error #${tracker.errors}  kemungkinan kena limit!`, "error");
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
            position:       "fixed",
            top:            "12px",
            left:           "160px",  // sebelah kanan session PnL
            padding:        "10px 14px",
            borderRadius:   "10px",
            background:     "rgba(0,0,0,.75)",
            color:          "#fff",
            fontSize:       "12px",
            fontWeight:     "600",
            zIndex:         999999,
            backdropFilter: "blur(8px)",
            lineHeight:     "1.5",
            cursor:         "pointer"
        });
        badge.title   = "Klik untuk reset counter";
        badge.onclick = function() {
            window._fetchTracker.calls  = [];
            window._fetchTracker.errors = 0;
            _updateFetchBadge();
        };
        document.body.appendChild(badge);
    }

    const errColor = errors > 0 ? "#ff4d4f" : "#555";
    const rpcColor = count > 200 ? "#ff4d4f"
                   : count > 100 ? "#ff7a00"
                   : count >  50 ? "#ffcc00"
                   : "#00d084";

    badge.innerHTML = `
        RPC/min<br>
        <span style="color:${rpcColor};">${count}</span>
        <span style="color:${errColor};font-size:10px;">
            ${errors > 0 ? ` ${errors}err` : ""}
        </span>
    `;
}

// override fetch global  track semua
if (!window._fetchOverridden) {
    window._fetchOverridden = true;
    const _origFetch = window.fetch.bind(window);
    window.fetch = function(...args) {
        const p = _origFetch(...args);
        window._trackFetch(String(args[0] || "").slice(0, 60), false);
        // deteksi error dari response
        p.then(res => {
            if (!res.ok) window._trackFetch("", true);
        }).catch(() => {
            window._trackFetch("", true);
        });
        return p;
    };
}

// update badge setiap 5 detik otomatis
setInterval(_updateFetchBadge, 5000);
_updateFetchBadge();