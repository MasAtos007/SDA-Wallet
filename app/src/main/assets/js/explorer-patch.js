// =====================================
// EXPLORER-PATCH.JS
// Tambah tombol buka explorer SidraChain
// URL: https://ledger.sidrachain.com/address/{address}
// =====================================

const SIDRA_EXPLORER = "https://ledger.sidrachain.com/address/";

/**
 * Buka explorer untuk address tertentu
 */
function openExplorer(address) {
    if (!address) return;
    const url = SIDRA_EXPLORER + address;
    if (window.AndroidWallet?.openUrl) window.AndroidWallet.openUrl(url);
    else if (window.AndroidWallet?.openBrowser) window.AndroidWallet.openBrowser(url);
    else window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Buka explorer untuk address wallet aktif
 */
function openExplorerActive() {
    const addr =
        document.getElementById("showAddress")?.textContent?.trim() ||
        SESSION?.address ||
        "";
    if (!addr) { showToast?.("Tidak ada address aktif", "error"); return; }
    openExplorer(addr);
}

/**
 * Inject tombol explorer ke address-bar di card utama.
 * Dipanggil sekali saat DOM siap, atau setelah updateAddressUI().
 *
 * Cari .address-actions dan inject icon globe jika belum ada.
 */
function _injectExplorerBtn() {
    const actions = document.querySelector(".address-actions");
    if (!actions) return;
    if (actions.querySelector(".explorer-btn")) return; // sudah ada

    const btn = document.createElement("i");
    btn.className = "fa-solid fa-arrow-up-right-from-square explorer-btn";
    btn.title = "Lihat di Explorer SidraChain";
    btn.style.cssText = `
        cursor:pointer;
        color:#888;
        font-size:14px;
        transition:color 0.15s;
        padding:4px;
    `;
    btn.onmouseenter = function() { this.style.color = "#ff7a00"; };
    btn.onmouseleave = function() { this.style.color = "#888"; };
    btn.onclick = openExplorerActive;

    // Insert sebelum icon copy (fa-copy), atau append
    const copyIcon = actions.querySelector(".fa-copy, .fa-regular.fa-copy, [onclick*='copyAddress']");
    if (copyIcon) {
        actions.insertBefore(btn, copyIcon);
    } else {
        actions.appendChild(btn);
    }
}

// Patch updateAddressUI agar inject ulang setiap kali address berubah
(function() {
    const _origUpdateAddr = window.updateAddressUI;
    window.updateAddressUI = function() {
        if (_origUpdateAddr) _origUpdateAddr.apply(this, arguments);
        setTimeout(_injectExplorerBtn, 50);
    };
})();

// Juga inject saat DOM ready
document.addEventListener("DOMContentLoaded", function() {
    setTimeout(_injectExplorerBtn, 500);
});

// =====================================
// Patch showWalletManageScreen di ui-onboarding.js
// agar tiap account punya tombol explorer
// Caranya: override _buildAccountActions
// =====================================

/**
 * Buka explorer dari Wallet Manager (dipanggil dari inline onclick)
 */
function _openExplorerForAccount(addr) {
    if (!addr) return;
    openExplorer(addr);
}