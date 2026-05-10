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