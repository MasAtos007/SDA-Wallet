// =====================================
// APP.JS â€” Init & Global Orchestrator
// =====================================

window.provider = window.provider ||
    new ethers.providers.JsonRpcProvider("https://node.sidrachain.com");

window.wallet = null;

// ==========================
// SAFE GLOBAL ELEMENTS
// ==========================
const walletSelectEl = document.getElementById("walletSelect");
const tokenSelectEl  = document.getElementById("tokenSelect");


// ==========================
// WALLET SELECT EVENT
// ==========================
if (walletSelectEl) {
    walletSelectEl.addEventListener("change", () => {

        // simpan index yang dipilih
        const idx = walletSelectEl.value;
        if (idx !== "" && idx !== undefined) {
            localStorage.setItem("selectedWalletIndex", String(idx));
        }

        updateActiveWalletName?.();
        updateAddressUI?.();
        renderAssets?.();
        loadBalance?.();
        updateSendBalance?.();

        setTimeout(() => autoRefreshIfNeeded?.(), 100);
    });
}


// ==========================
// INIT APP
// ==========================
window.onload = () => {

    // ==========================
    // DAILY SESSION CHECK (WAJIB DI ATAS)
    // ==========================
    isNewDay();

    // LANGUAGE
    const savedLang = localStorage.getItem("lang") || "id";

    window.CURRENT_LANG = savedLang;
    if (typeof applyLang === "function") applyLang();

    // RENDER WALLET DROPDOWN DULU
    safeCall("renderWallets");

    // ============================================
    // FIX UTAMA â€” restore wallet terakhir dipilih
    // JANGAN set value = 0 di sini
    // restoreLastSelectedWallet() di wallet.js
    // sudah handle ini via DOMContentLoaded,
    // tapi kita panggil lagi untuk jaga-jaga
    // kalau onload jalan setelah dropdown terisi
    // ============================================
    if (typeof restoreLastSelectedWallet === "function") {
        restoreLastSelectedWallet();
    }

    // UI WALLET
    safeCall("updateActiveWalletName");
    safeCall("updateAddressUI");

    // RENDER UI
    safeCall("renderAssets");
    safeCall("renderTokenSelect");
    safeCall("renderTokenTab");

    // ICON DEFAULT
    setImg("tokenLogoBalance",  "img/sda.png");
    setImg("tokenLogoDropdown", "img/sda.png");

    // LOAD DATA
    const wallets = getWallets?.() || [];

    if (wallets.length > 0) {
        safeCall("loadBalance");
        safeCall("refreshAll");

        setTimeout(() => {
            safeCall("loadBalance");
            safeCall("renderAssets");
        }, 300);
    } else {
        safeCall("startGuide");
    }

    // ACTIVE LANG MENU
    document.querySelectorAll(".lang-item").forEach(el => {
        el.classList.remove("active");
    });
    document.querySelector(`[data-lang-select="${savedLang}"]`)
        ?.classList.add("active");

    // SPLASH SCREEN
    setTimeout(() => {
        const splash = document.getElementById("splash");
        if (!splash) return;
        splash.style.opacity    = "0";
        splash.style.transition = "0.5s";
        setTimeout(() => { splash.style.display = "none"; }, 500);
    }, 1500);
};


// ==========================
// GLOBAL MODAL CLOSE
// ==========================
window.onclick = function (e) {
    document.querySelectorAll(".modal").forEach(modal => {
        if (e.target === modal) modal.style.display = "none";
    });
};


// ==========================
// SAFE HELPERS
// ==========================
function safeCall(fnName) {
    if (typeof window[fnName] === "function") window[fnName]();
}

function setImg(id, src) {
    const el = document.getElementById(id);
    if (el) el.src = src;
}


// ==========================
// MENU LANGUAGE
// ==========================
function toggleMenu() {
    const el = document.getElementById("menuDropdown");
    if (!el) return;
    el.style.display = (el.style.display === "block") ? "none" : "block";
}

window.addEventListener("click", function (e) {
    if (!e.target.closest(".menu-wrapper")) {
        const menu = document.getElementById("menuDropdown");
        if (menu) menu.style.display = "none";
    }
});


function isNewDay() {

    const last =
        localStorage.getItem("agg_last_session_day");

    const now = new Date();

    const today =
        `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

    if (last !== today) {

        localStorage.setItem("agg_last_session_day", today);

        window._sessionProfit = 0;
        localStorage.setItem("agg_session_profit", 0);

        return true;
    }

    return false;
}