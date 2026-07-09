// ==========================
// SIMPLE BOTTOM NAV
// ==========================

// Helper: cek apakah PIN lock screen aktif (bukan wallet menu)
function isPinLocked() {
    const overlay = document.getElementById("onboardingOverlay");
    return overlay && overlay.style.display !== "none" && window._pinContext === "lock";
}

// Sembunyikan / tampilkan bottom nav
function setBottomNavHidden(hidden) {
    const nav = document.getElementById("bottomNav");
    if (!nav) return;
    nav.style.display = hidden ? "none" : "";
}

window.isPinLocked        = isPinLocked;
window.setBottomNavHidden = setBottomNavHidden;

window.syncNavDot = function() {
    const dot = document.getElementById("navWalletDot");
    if (dot) dot.classList.toggle("visible", !!(window.SESSION?.unlocked));
};

// ==========================
// ANDROID BACK BUTTON HANDLER
// Dipanggil dari MainActivity.java via evaluateJavascript
// Return true  = sudah handle (tutup sesuatu)
// Return false = tidak ada yang perlu ditutup â†’ MainActivity minimize app
// ==========================
window._handleAndroidBack = function() {

    // 1. Confirm / prompt modal
    const confirmModal = document.getElementById("confirmModal");
    if (confirmModal && confirmModal.style.display !== "none") {
        if (typeof closeConfirmModal === "function") closeConfirmModal();
        else confirmModal.style.display = "none";
        return true;
    }

    // 2. Send confirm overlay
    const sendConfirm = document.getElementById("sendConfirmModal");
    if (sendConfirm && sendConfirm.style.display !== "none") {
        if (typeof closeSendConfirm === "function") closeSendConfirm();
        else sendConfirm.style.display = "none";
        return true;
    }

    // 3. Swap confirm overlay
    const swapConfirm = document.getElementById("swapConfirmModal");
    if (swapConfirm && swapConfirm.style.display !== "none") {
        swapConfirm.style.display = "none";
        return true;
    }

    // 4. Send modal
    const sendModal = document.getElementById("sendModal");
    if (sendModal && sendModal.classList.contains("show")) {
        sendModal.classList.remove("show");
        document.body.style.overflow = "";
        return true;
    }

    // 5. Swap modal
    const swapModal = document.getElementById("swapModal");
    if (swapModal && swapModal.classList.contains("show")) {
        swapModal.classList.remove("show");
        document.body.style.overflow = "";
        return true;
    }

    // 6. LP modal
    const lpModal = document.getElementById("lpModal");
    if (lpModal && lpModal.classList.contains("show")) {
        lpModal.classList.remove("show");
        document.body.style.overflow = "";
        return true;
    }

    // 7. TX History modal
    const txModal = document.getElementById("txModal");
    if (txModal && txModal.style.display !== "none") {
        if (typeof closeTxModal === "function") closeTxModal();
        else { txModal.classList.remove("show"); txModal.style.display = "none"; }
        return true;
    }

    // 8. Onboarding overlay (wallet manager, PIN screen, dll)
    const onboarding = document.getElementById("onboardingOverlay");
    if (onboarding && onboarding.style.display !== "none") {
        // PIN lock screen: tidak boleh ditutup dengan back
        if (window._pinContext === "lock") return true; // block back, stay on PIN
        // Wallet manager / screen lain: tutup
        onboarding.style.display = "none";
        window._pinContext = null;
        return true;
    }

    // 9. QR modal
    const qrModal = document.getElementById("qrModal");
    if (qrModal && qrModal.style.display !== "none") {
        qrModal.style.display = "none";
        return true;
    }

    // 10. Receive modal
    const receiveModal = document.getElementById("receiveModal");
    if (receiveModal && receiveModal.style.display !== "none") {
        receiveModal.style.display = "none";
        return true;
    }

    // 11. TX loading overlay
    const loadingOverlay = document.getElementById("swapLoadingOverlay");
    if (loadingOverlay && loadingOverlay.style.display !== "none") {
        return true; // block back saat transaksi berjalan
    }

    // Tidak ada yang perlu ditutup â†’ MainActivity akan minimize
    return false;
};

document.addEventListener("DOMContentLoaded", () => {
    const navHome    = document.getElementById("navHome");
    const navSend    = document.getElementById("navSend");
    const navSwap    = document.getElementById("navSwap");
    const navHistory = document.getElementById("navHistory");
    const navWallet  = document.getElementById("navWallet");

    function setActive(el) {
        document.querySelectorAll(".nav-item").forEach(i => {
            i.classList.remove("active");
        });
        el?.classList.add("active");
        const dot = document.getElementById("navWalletDot");
        if (dot) dot.classList.toggle("visible", !!(window.SESSION?.unlocked));
    }

    window.setBottomNavActive = function(id) {
        document.querySelectorAll(".nav-item").forEach(i => {
            i.classList.remove("active");
        });
        document.getElementById(id)?.classList.add("active");
    };

    function closeAllModals() {
        document.getElementById("sendModal")?.classList.remove("show");
        document.getElementById("swapModal")?.classList.remove("show");
        document.getElementById("lpModal")?.classList.remove("show");
        const sendConfirm = document.getElementById("sendConfirmModal");
        if (sendConfirm) sendConfirm.style.display = "none";
        document.body.style.overflow = "";

        // Tutup onboardingOverlay HANYA jika bukan wallet manager
        if (window._pinContext !== "wallet") {
            const onboarding = document.getElementById("onboardingOverlay");
            if (onboarding) onboarding.style.display = "none";
        }
    }

    // HOME
    navHome?.addEventListener("click", () => {
        if (isPinLocked()) return;
        const onboarding = document.getElementById("onboardingOverlay");
        if (onboarding) onboarding.style.display = "none";
        if (typeof closeTxModal === "function") closeTxModal();
        else {
            const txModal = document.getElementById("txModal");
            if (txModal) { txModal.classList.remove("show"); txModal.style.display = "none"; }
        }
        closeAllModals();
        setActive(navHome);

        // Scroll ke atas — kalau user sudah di Home & scroll jauh,
        // tap Home lagi otomatis balik ke balance utama.
        // Pakai window.scrollTo karena scroll sebenarnya terjadi di
        // level document, bukan di .app (yang tidak punya overflow sendiri).
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    // SEND
    navSend?.addEventListener("click", () => {
        if (isPinLocked()) return;
        const onboarding = document.getElementById("onboardingOverlay");
        if (onboarding) onboarding.style.display = "none";
        if (typeof closeTxModal === "function") closeTxModal();
        else {
            const txModal = document.getElementById("txModal");
            if (txModal) { txModal.classList.remove("show"); txModal.style.display = "none"; }
        }
        closeAllModals();
        setActive(navSend);
        document.getElementById("openSendBtn")?.click();
    });

    // SWAP
    navSwap?.addEventListener("click", () => {
        if (isPinLocked()) return;
        const onboarding = document.getElementById("onboardingOverlay");
        if (onboarding) onboarding.style.display = "none";
        if (typeof closeTxModal === "function") closeTxModal();
        else {
            const txModal = document.getElementById("txModal");
            if (txModal) { txModal.classList.remove("show"); txModal.style.display = "none"; }
        }
        closeAllModals();
        setActive(navSwap);
        document.getElementById("openSwapBtn")?.click();
    });

    // HISTORY
    navHistory?.addEventListener("click", () => {
        if (isPinLocked()) return;
        document.getElementById("sendModal")?.classList.remove("show");
        document.getElementById("swapModal")?.classList.remove("show");
        document.getElementById("lpModal")?.classList.remove("show");
        document.getElementById("pkModal")?.classList.remove("show");
        const onboarding = document.getElementById("onboardingOverlay");
        if (onboarding) onboarding.style.display = "none";
        setActive(navHistory);
        if (typeof openTxHistory === "function") openTxHistory();
    });

    // WALLET
    navWallet?.addEventListener("click", () => {
        if (isPinLocked()) return;
        document.getElementById("sendModal")?.classList.remove("show");
        document.getElementById("swapModal")?.classList.remove("show");
        document.getElementById("lpModal")?.classList.remove("show");
        if (typeof closeTxModal === "function") closeTxModal();
        else {
            const txModal = document.getElementById("txModal");
            if (txModal) { txModal.classList.remove("show"); txModal.style.display = "none"; }
        }
        setActive(navWallet);
        if (typeof openPKModal === "function") openPKModal();
    });
});