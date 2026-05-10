// ==============================
// FLOATING TRADE LOG HISTORY
// ==============================

(function () {

    const LOG_ID = "aggTradeLogPanel";

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
                font-weight:700;
                margin-bottom:8px;
                font-size:13px;
            ">
                TRADE LOG
            </div>
            <div id="aggTradeLogList"></div>
        `;

        document.body.appendChild(el);

        return el;
    }

    function addTradeLog(data) {

        const panel = createPanel();

        const list = document.getElementById("aggTradeLogList");

        const time = new Date().toLocaleTimeString();

        const item = document.createElement("div");

        const profit = data.profit ?? 0;

        item.innerHTML = `
            <div style="margin-bottom:6px;padding:6px;border-bottom:1px solid rgba(255,255,255,.1)">
                <div style="opacity:.7">${time}</div>
                <div>
                    ${data.route || "TRADE"}
                </div>
                <div style="
                    color:${profit >= 0 ? "#00ff9d" : "#ff4d4d"};
                    font-weight:600;
                ">
                    ${profit >= 0 ? "+" : ""}${profit.toFixed(4)} SDA
                </div>
            </div>
        `;

        list.prepend(item);

        // limit max log
        if (list.children.length > 20) {
            list.removeChild(list.lastChild);
        }
    }

    // expose global
    window.addTradeLog = addTradeLog;

})();