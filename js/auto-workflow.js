// =====================================
// AUTO WORKFLOW OVERLAY CONTROLLER
// =====================================
window.AWF = (() => {

    const SEGMENTS = 7; // -3 -2 -1 0 +1 +2 +3

    function _buildMarginBar() {
        const bar = document.getElementById("awfMarginBar");
        if (!bar) return;
        bar.innerHTML = "";
        for (let i = 0; i < SEGMENTS; i++) {
            const seg = document.createElement("div");
            seg.className = "awf-margin-seg";
            seg.id = `awfSeg${i}`;
            bar.appendChild(seg);
        }
    }

    function _updateMargin(pct) {
        const val = document.getElementById("awfMarginValue");
        const hint = document.getElementById("awfMarginHint");

        if (val) {
            val.textContent = (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%";
            val.style.color = pct > 0 ? "#00d084" : pct < 0 ? "#ff4d4f" : "#aaa";
        }

        // map pct ke segment: -3% = seg0, 0 = seg3, +3% = seg6
        const clamped = Math.max(-3, Math.min(3, pct));
        const activeIdx = Math.round(((clamped + 3) / 6) * (SEGMENTS - 1));

        for (let i = 0; i < SEGMENTS; i++) {
            const seg = document.getElementById(`awfSeg${i}`);
            if (!seg) continue;
            seg.className = "awf-margin-seg";
            if (i === activeIdx) {
                seg.classList.add(pct >= 0 ? "active-pos" : "active-neg");
            } else if (i < 3) {
                seg.classList.add("neg");
            } else if (i === 3) {
                seg.classList.add("zero");
            } else {
                seg.classList.add("pos");
            }
        }

        if (hint) {
            hint.textContent = pct > 0.5
                ? `Profit estimasi +${pct.toFixed(2)}% dari modal`
                : pct < 0
                ? `Potensi rugi ${Math.abs(pct).toFixed(2)}%`
                : "Margin tipis, hati-hati";
        }
    }

    function _buildRoute(mode, interToken, finalToken) {
        const route = document.getElementById("awfRoute");
        if (!route) return;

        const tokens = mode === "buy"
            ? ["native", interToken, finalToken, "native"]
            : ["native", finalToken, interToken, "native"];

        const syms = tokens.map(t => t === "native" ? "SDA" : (window.AGGREGATOR?.symbolOf?.(t) || t.slice(0,6)));
        const logos = tokens.map(t => t === "native" ? "img/sda.png" : ((window.TOKENS||[]).find(x=>x.address?.toLowerCase()===t?.toLowerCase())?.logo || "img/default.png"));

        route.innerHTML = tokens.map((t, i) => `
            <div class="awf-route-token">
                <img id="awfRouteImg${i}" src="${logos[i]}" onerror="this.src='img/default.png'">
                <span>${syms[i]}</span>
            </div>
            ${i < tokens.length - 1 ? `<div class="awf-route-arrow" id="awfArrow${i}">→</div>` : ""}
        `).join("");
    }

    function _buildSteps(mode, interToken, finalToken) {
        const el = document.getElementById("awfSteps");
        if (!el) return;

        const interSym = window.AGGREGATOR?.symbolOf?.(interToken) || "TOKEN";
        const finalSym = window.AGGREGATOR?.symbolOf?.(finalToken) || "TOKEN";

        const steps = mode === "buy"
            ? [
                { label: `Beli\n${interSym}` },
                { label: `Beli\n${finalSym}` },
                { label: `Jual\nke SDA` }
              ]
            : [
                { label: `Beli\n${finalSym}` },
                { label: `Swap ke\n${interSym}` },
                { label: `Jual\nke SDA` }
              ];

        el.innerHTML = steps.map((s, i) => `
            <div class="awf-step">
                <div class="awf-step-dot" id="awfDot${i}">${i+1}</div>
                <div class="awf-step-label" id="awfStepLbl${i}">${s.label.replace("\n","<br>")}</div>
            </div>
        `).join("");
    }

    function _setStep(idx) {
        for (let i = 0; i < 3; i++) {
            const dot = document.getElementById(`awfDot${i}`);
            const lbl = document.getElementById(`awfStepLbl${i}`);
            if (!dot || !lbl) continue;
            dot.className = "awf-step-dot" + (i < idx ? " done" : i === idx ? " active" : "");
            lbl.className = "awf-step-label" + (i < idx ? " done" : i === idx ? " active" : "");
        }
        // aktifkan arrow & logo
        for (let i = 0; i < 4; i++) {
            const img = document.getElementById(`awfRouteImg${i}`);
            const arrow = document.getElementById(`awfArrow${i}`);
            if (img) img.classList.toggle("active", i <= idx);
            if (arrow) arrow.classList.toggle("active", i === idx);
        }
    }

    function _setStatus(msg) {
        const el = document.getElementById("awfStatus");
        if (el) el.textContent = msg;
    }

    function _setInfo(html) {
        const el = document.getElementById("awfInfoBox");
        if (el) el.innerHTML = html;
    }

    function show(mode, interToken, finalToken, spendSda, savingsPct) {
        const overlay = document.getElementById("autoWorkflowOverlay");
        if (!overlay) return;

        const badge = document.getElementById("awfModeBadge");
        if (badge) {
            badge.textContent = mode === "buy" ? "⚡ BUY MODE" : "⚡ REVERSE MODE";
            badge.style.color = mode === "buy" ? "#00d084" : "#ff9f43";
        }

        _buildMarginBar();
        _buildRoute(mode, interToken, finalToken);
        _buildSteps(mode, interToken, finalToken);
        _updateMargin(savingsPct || 0);
        _setStep(0);
        _setStatus("Memulai proses...");

        const interSym = window.AGGREGATOR?.symbolOf?.(interToken) || "TOKEN";
        const finalSym = window.AGGREGATOR?.symbolOf?.(finalToken) || "TOKEN";

        _setInfo(mode === "buy"
            ? `Beli <b>${interSym}</b> lebih murah, lalu swap ke <b>${finalSym}</b>, kemudian jual kembali ke <b class="green">SDA</b>`
            : `Beli <b>${finalSym}</b> dulu, swap ke <b>${interSym}</b>, lalu jual ke <b class="green">SDA</b>`
        );

        overlay.classList.add("show");
    }

    function updateStep(idx, statusMsg) {
        _setStep(idx);
        _setStatus(statusMsg);
    }

    function updateMargin(pct) {
        _updateMargin(pct);
    }

    function hide() {
        const overlay = document.getElementById("autoWorkflowOverlay");
        if (overlay) overlay.classList.remove("show");
    }

    return { show, hide, updateStep, updateMargin };
})();