// =====================================
// APP-VAULT-PATCH.JS  -  v2 PATCH
// [FIX-A] walletSelect change: pakai refreshAll bukan autoRefreshIfNeeded
// [FIX-B] window.onload: refreshAll setelah unlock selesai
// [FIX-C] _executeReset: hapus SEMUA cache saldo dari localStorage
// [FIX-D] cegah duplikat wallet saat sync
// =====================================

window.onload = async () => {

    isNewDay?.();

    // --- LANGUAGE ---------------------------------------
    const savedLang = localStorage.getItem("lang") || "id";
    window.CURRENT_LANG = savedLang;
    if (typeof applyLang === "function") applyLang();

    document.querySelectorAll(".lang-item").forEach(el => el.classList.remove("active"));
    document.querySelector(`[data-lang-select="${savedLang}"]`)?.classList.add("active");

    // --- SPLASH -----------------------------------------
setTimeout(() => {
    const splash = document.getElementById("splash");
    if (!splash) return;

    splash.style.transition = "opacity 1s ease";
    splash.style.opacity = "0";

    setTimeout(() => {
        splash.remove();
    }, 1000);

}, 3000);

    // --- ROUTING ----------------------------------------

    // 1. Vault belum ada -> onboarding
    if (!vault.exists()) {
        setTimeout(() => showWelcomeScreen(), 1400);
        return;
    }

    // 2. Vault ada -> render UI dulu, lalu minta PIN
    safeCall("renderWallets");
    safeCall("restoreLastSelectedWallet");
    safeCall("updateActiveWalletName");
    safeCall("updateAddressUI");
    safeCall("renderAssets");
    safeCall("renderTokenSelect");
    safeCall("renderTokenTab");

    setImg("tokenLogoBalance",  "img/sda.png");
    setImg("tokenLogoDropdown", "img/sda.png");

    renderSessionStatus?.();

    // [FIX-B] Tampilkan PIN unlock, setelah unlock refreshAll otomatis
    // (refreshAll dipanggil dari wallet-session.js unlockWallet)
    setTimeout(() => {
        if (!SESSION.unlocked) showPINUnlockScreen();
    }, 1400);
};

// --- WALLET SELECT CHANGE ----------------------------------------------------
// [FIX-A] Ganti autoRefreshIfNeeded -> refreshAll agar saldo selalu fresh
// saat ganti wallet dari dropdown, bukan hanya kalau cache kosong
// -----------------------------------------------------------------------------
const _walletSelectEl = document.getElementById("walletSelect");

if (_walletSelectEl && !_walletSelectEl._patchedByVault) {
    _walletSelectEl._patchedByVault = true;

    _walletSelectEl.addEventListener("change", () => {
        const idx = _walletSelectEl.value;
        if (idx !== "" && idx !== undefined) {
            localStorage.setItem("selectedWalletIndex", String(idx));
        }

        localStorage.removeItem("txHistory");
        renderTxHistory?.();
        updateBellBadge?.();
        updateActiveWalletName?.();
        updateAddressUI?.();
        renderAssets?.();
        loadBalance?.();
        updateSendBalance?.();

        // [FIX-A] Selalu refresh saldo terkini dari blockchain
        setTimeout(() => {
            if (typeof refreshAll === "function") refreshAll();
        }, 100);
    });
}

// --- GLOBAL MODAL CLOSE -----------------------------------------------------
window.onclick = function(e) {
    document.querySelectorAll(".modal").forEach(modal => {
        if (modal.id === "walletPickerModal" || modal.id === "savedAddressModal") return; // dikelola sendiri
        if (e.target === modal) modal.style.display = "none";
    });
};

// --- SAFE HELPERS ------------------------------------------------------------
function safeCall(fnName) {
    if (typeof window[fnName] === "function") window[fnName]();
}

function setImg(id, src) {
    const el = document.getElementById(id);
    if (el) el.src = src;
}

function toggleMenu() {
    const el = document.getElementById("menuDropdown");
    if (!el) return;
    el.style.display = (el.style.display === "block") ? "none" : "block";
}

window.addEventListener("click", function(e) {
    if (!e.target.closest(".menu-wrapper")) {
        const menu = document.getElementById("menuDropdown");
        if (menu) menu.style.display = "none";
    }
});

function isNewDay() {
    const last  = localStorage.getItem("agg_last_session_day");
    const now   = new Date();
    const today = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    if (last !== today) {
        localStorage.setItem("agg_last_session_day", today);
        window._sessionProfit = 0;
        localStorage.setItem("agg_session_profit", 0);
        return true;
    }
    return false;
}

// --- [FIX-C] RESET WALLET BERSIH ---------------------------------------------
// Override _executeReset dari ui-onboarding.js dengan versi yang
// hapus SEMUA cache saldo (key addr_native, addr_tokenaddr, dll)
// -----------------------------------------------------------------------------
function _executeReset() {
    // Hapus semua cache saldo terkait wallet PK
    // (key format: "0x...._native" atau "0x...._0x....")
    const keysToDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.match(/^0x[0-9a-fA-F]+_/)) {
            keysToDelete.push(k);
        }
    }
    keysToDelete.forEach(k => localStorage.removeItem(k));

    // Hapus vault & session
    vault.destroy();
    lockWallet?.();

    // Hapus semua data wallet
    localStorage.removeItem("sidra_wallets");
    localStorage.removeItem("sda_wallets");       // key alternatif
    localStorage.removeItem("selectedWalletIndex");
    localStorage.removeItem("PK_SESSION");
    localStorage.removeItem("sda_pk_wallet");
    localStorage.removeItem("PK_DELETED");
    localStorage.removeItem("txHistory");

    document.getElementById("resetConfirmBox")?.remove();

    // Re-render dropdown kosong
    renderWallets?.();

    showWelcomeScreen();
}

// --- [FIX-D] CEGAH DUPLIKAT WALLET ------------------------------------------
// Patch setWallets agar selalu deduplikasi berdasarkan address
// -----------------------------------------------------------------------------
const _origSetWallets = window.setWallets;
if (typeof _origSetWallets === "function") {
    window.setWallets = function(data) {
        // Deduplikasi  -  address yang sama hanya simpan satu, prioritas type "pk"
        const seen = new Map();
        (data || []).forEach(w => {
            const addr = w.address?.toLowerCase();
            if (!addr) return;
            const existing = seen.get(addr);
            // Kalau sudah ada dan yang baru tipenya "pk", override
            if (!existing || w.type === "pk") {
                seen.set(addr, w);
            }
        });
        const deduped = Array.from(seen.values());
        _origSetWallets(deduped);
    };
}