// =====================================
// SHARE APP — Bagikan Link Download Wallet
// =====================================

const SHARE_APP_URL = "https://github.com/MasAtos007/SDA-Wallet/releases/latest/download/app-release.apk";

function _shareAppMessage() {
    const lang = window.CURRENT_LANG || "id";
    const msg =
        (window.LANG?.[lang]?.share_app_message) ||
        "Yuk coba Sidra Wallet, wallet untuk SidraChain! Download di sini:";
    return msg + "\n" + SHARE_APP_URL;
}

// =====================================
// OPEN / CLOSE
// =====================================
function openShareAppModal() {
    const modal = document.getElementById("shareAppModal");
    if (!modal) return;

    const input = document.getElementById("shareAppLink");
    if (input) input.value = SHARE_APP_URL;

    modal.style.display = "flex";
}

function closeShareAppModal() {
    const modal = document.getElementById("shareAppModal");
    if (modal) modal.style.display = "none";
}

// =====================================
// COPY LINK
// =====================================
function copyShareAppLink() {
    const input = document.getElementById("shareAppLink");
    if (!input) return;

    input.select();
    input.setSelectionRange(0, 99999);

    try {
        navigator.clipboard?.writeText(input.value);
    } catch (e) {
        try { document.execCommand("copy"); } catch (e2) {}
    }

    const msg = (typeof t === "function" && t("link_copied")) || "Link disalin";
    showToast?.(msg, "success");
}

// =====================================
// DOWNLOAD LANGSUNG (.apk)
// =====================================
function downloadShareApp() {
    if (window.AndroidWallet && typeof window.AndroidWallet.openExternal === "function") {
        window.AndroidWallet.openExternal(SHARE_APP_URL);
    } else {
        window.open(SHARE_APP_URL, "_blank");
    }
}

// =====================================
// SHARE WHATSAPP
// =====================================
function shareAppWA() {
    const text = encodeURIComponent(_shareAppMessage());
    const url  = "https://wa.me/?text=" + text;

    if (window.AndroidWallet && typeof window.AndroidWallet.openExternal === "function") {
        window.AndroidWallet.openExternal(url);
    } else {
        window.open(url, "_blank");
    }
}

// =====================================
// SHARE TELEGRAM
// =====================================
function shareAppTelegram() {
    const lang = window.CURRENT_LANG || "id";
    const caption =
        (window.LANG?.[lang]?.share_app_message) ||
        "Yuk coba Sidra Wallet, wallet untuk SidraChain!";

    const url =
        "https://t.me/share/url?url=" +
        encodeURIComponent(SHARE_APP_URL) +
        "&text=" + encodeURIComponent(caption);

    if (window.AndroidWallet && typeof window.AndroidWallet.openExternal === "function") {
        window.AndroidWallet.openExternal(url);
    } else {
        window.open(url, "_blank");
    }
}

// =====================================
// EXPOSE
// =====================================
window.openShareAppModal  = openShareAppModal;
window.downloadShareApp   = downloadShareApp;
window.closeShareAppModal = closeShareAppModal;
window.copyShareAppLink   = copyShareAppLink;
window.shareAppWA         = shareAppWA;
window.shareAppTelegram   = shareAppTelegram;