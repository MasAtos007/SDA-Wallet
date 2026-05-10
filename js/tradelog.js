(function () {

    const LOG_ID = "aggTradeLogPanel";
    const LIST_ID = "aggTradeLogList";
    const BTN_ID  = "aggTradeLogToggle";

    window.TRADE_LOG_VISIBLE = true;

    // ==============================
    // CREATE PANEL
    // ==============================
    function createPanel() {

        let el = document.getElementById(LOG_ID);
        if (el) return el;

        el = document.createElement("div");
        el.id = LOG_ID;

        Object.assign(el.style, {

            position: "fixed",
            bottom: "20px",
            right: "20px",

            width: "260px",
            maxHeight: "320px",

            background: "rgba(20,20,20,.85)",
            color: "#fff",

            borderRadius: "12px",
            padding: "10px",

            fontSize: "12px",
            zIndex: 999998,

            overflowY: "auto",
            backdropFilter: "blur(10px)"
        });

        el.innerHTML = `
            <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                margin-bottom:8px;
                font-weight:700;
                font-size:13px;
            ">
                <span>TRADE LOG</span>

                <button id="${BTN_ID}" style="
                    font-size:10px;
                    padding:4px 6px;
                    border:none;
                    border-radius:6px;
                    cursor:pointer;
                    background:#333;
                    color:#fff;
                ">Hide</button>
            </div>

            <div id="${LIST_ID}"></div>
        `;

        document.body.appendChild(el);

        // ==============================
        // TOGGLE BUTTON
        // ==============================
        setTimeout(() => {

            const btn = document.getElementById(BTN_ID);

            if (!btn) return;

            btn.addEventListener("click", () => {

                window.TRADE_LOG_VISIBLE = !window.TRADE_LOG_VISIBLE;

                const panel = document.getElementById(LOG_ID);

                if (!panel) return;

                if (window.TRADE_LOG_VISIBLE) {

                    panel.style.display = "block";
                    btn.innerText = "Hide";

                } else {

                    panel.style.display = "none";
                    btn.innerText = "Show";
                }
            });

        }, 0);

        return el;
    }

    // ==============================
    // ADD LOG
    // ==============================
    function addTradeLog(data) {

        if (!window.TRADE_LOG_VISIBLE) return;

        const panel = createPanel();
        const list = document.getElementById(LIST_ID);

        if (!list) return;

        const time = new Date().toLocaleTimeString();

        const profit = Number(data.profit || 0);

        const item = document.createElement("div");

        item.innerHTML = `
            <div style="
                margin-bottom:6px;
                padding:6px;
                border-bottom:1px solid rgba(255,255,255,.1)
            ">
                <div style="opacity:.6;font-size:10px">
                    ${time}
                </div>

                <div style="margin-top:2px">
                    ${data.route || "TRADE"}
                </div>

                <div style="
                    margin-top:3px;
                    font-weight:600;
                    color:${profit >= 0 ? "#00ff9d" : "#ff4d4d"};
                ">
                    ${profit >= 0 ? "+" : ""}${profit.toFixed(4)} SDA
                </div>
            </div>
        `;

        list.prepend(item);

        // ==============================
        // LIMIT MAX LOG (ANTI NUMPUK)
        // ==============================
        while (list.children.length > 20) {
            list.removeChild(list.lastChild);
        }

        // auto scroll top (latest visible)
        panel.scrollTop = 0;
    }

    // expose global
    window.addTradeLog = addTradeLog;

})();