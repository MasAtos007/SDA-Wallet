// =====================================
// SWAP - LIVE PRICES (SidraDEX)
// Membuka halaman di browser internal app (BrowserActivity)
// Muat SETELAH swap-modal.js di index.html
// =====================================
(function () {
    const LIVE_PRICES_URL = "https://masatos007.github.io/SidraDEX-Live-Prices/";

    function _lp(key, fallback) {
        try {
            const lang = window.CURRENT_LANG || "id";
            return window.LANG?.[lang]?.[key] || fallback;
        } catch (e) { return fallback; }
    }

    // AndroidBridge.openBrowser(String url) sudah ada -> BrowserActivity
    function openLivePrices() {
        try {
            if (window.AndroidWallet && typeof window.AndroidWallet.openBrowser === "function") {
                window.AndroidWallet.openBrowser(LIVE_PRICES_URL);
                return;
            }
        } catch (e) { console.error("openBrowser error:", e); }

        // fallback kalau dijalankan di browser biasa (bukan APK)
        window.open(LIVE_PRICES_URL, "_blank");
    }
    window.openLivePrices = openLivePrices;

    function injectButton() {
        if (document.getElementById("livePricesBtn")) return;

        const anchor = document.getElementById("btnReviewSwap");
        if (!anchor || !anchor.parentNode) return;

        const btn = document.createElement("button");
        btn.id = "livePricesBtn";
        btn.type = "button";
        btn.dataset.lang = "swap_live_prices"; // diterjemahkan otomatis oleh applyLang()
        btn.style.cssText =
            "width:100%;margin:0 0 12px;padding:12px 16px;border-radius:14px;" +
            "border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);" +
            "color:inherit;font-size:14px;font-weight:600;cursor:pointer;" +
            "display:flex;align-items:center;justify-content:center;gap:8px;";

        const icon = document.createElement("i");
        icon.className = "fa-solid fa-chart-line";
        btn.appendChild(icon);
        // text node terpisah: applyLang() hanya mengganti text node, ikon tetap aman
        btn.appendChild(document.createTextNode(_lp("swap_live_prices", "Live Prices")));

        btn.addEventListener("click", openLivePrices);
        anchor.parentNode.insertBefore(btn, anchor);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", injectButton);
    } else {
        injectButton();
    }
})();
