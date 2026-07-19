// =====================================================
// MODAL Z-INDEX & BACK BUTTON PATCH v5
// =====================================================

(function () {
    "use strict";

    const style = document.createElement("style");
    style.textContent = `

        /* Fix: body padding bikin modal tidak full layar di Android WebView */
        #txModal.modal {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            max-width: 100vw !important;
            margin: 0 !important;
        }

        /* Modal overlay lain: inset 0 tapi bukan full height (bottom sheet) */
        #txDetailModal,
        #sendSuccessModal,
        #swapSuccessModal,
        #swapConfirmModal,
        #sendConfirmModal {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            max-width: 100vw !important;
            margin: 0 !important;
            height: auto !important;
        }


        /* RPC badge: turunkan saat txModal terbuka */
        #_fetchFloatBadge {
            transition: opacity .2s;
        }
        #txModal.modal.show {
            /* txModal terbuka: sembunyikan RPC badge via JS */
        }


        /* =============================================
           4 modal sukses/konfirm di atas bottom-nav
        ============================================= */
        #sendSuccessModal,
        #swapSuccessModal,
        #swapConfirmModal,
        #sendConfirmModal {
            z-index: 100010 !important;
        }

        /* txDetailModal fix */
        #txDetailModal {
            position: fixed !important;
            inset: 0 !important;
            z-index: 100010 !important;
            display: none;
            background: rgba(0,0,0,0.72) !important;
            align-items: flex-end !important;
            justify-content: center !important;
            padding: 0 !important;
        }
        #txDetailModal.show { display: flex !important; }
        #txDetailModal .ssm-sheet {
            max-height: 90vh !important;
            overflow-y: auto !important;
            padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
        }
        #txDetailModal .ssm-btn-done {
            margin-bottom: 0 !important;
            width: 100% !important;
        }

        /* sendSuccessModal fix */
        #sendSuccessModal .ssm-sheet {
            max-height: 90vh !important;
            overflow-y: auto !important;
            padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
        }
        .ssm-btn-done {
            margin-bottom: 0 !important;
            width: 100% !important;
        }

        /* =============================================
           TX HISTORY MODAL - full layar premium
        ============================================= */
        #txModal.modal {
            position: fixed !important;
            inset: 0 !important;
            background: rgba(0,0,0,0.65) !important;
            display: none;
            align-items: flex-end !important;
            justify-content: center !important;
            padding: 0 !important;
            z-index: 10000 !important;
        }
        #txModal.modal.show { display: flex !important; }

        /* Container full layar dari bawah */
        #txModal .modal-content {
            background: #111 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: 100vh !important;
            max-height: none !important;
            padding: 0 !important;
            border-radius: 0 !important;
            overflow: hidden !important;
            overflow-y: unset !important;
            animation: txModalSlideUp .3s cubic-bezier(.32,1,.32,1) !important;
            display: flex !important;
            flex-direction: column !important;
            box-shadow: 0 -8px 40px rgba(0,0,0,0.6) !important;
        }
        @keyframes txModalSlideUp {
            from { transform: translateY(100%); opacity: 0; }
            to   { transform: translateY(0);    opacity: 1; }
        }

        #txModal .modal-content::before { display: none !important; }

        /* Sticky top: header + filter */
        #txModal .tx-sticky-top {
            flex-shrink: 0 !important;
            background: #111 !important;
        }

        /* Header */
        #txModal .modal-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 12px 16px !important;
            border-bottom: 1px solid #1f1f1f !important;
            margin-bottom: 0 !important;
            position: static !important;
        }
        #txModal .modal-header span {
            font-weight: 600 !important;
            font-size: 15px !important;
            color: #fff !important;
        }

        /* Close button - BUKAN full width */
        #txModal .modal-close {
            width: 32px !important;
            height: 32px !important;
            min-width: unset !important;
            max-width: 32px !important;
            flex: 0 0 32px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: #1a1e28 !important;
            border: none !important;
            border-radius: 50% !important;
            color: #666 !important;
            font-size: 14px !important;
            cursor: pointer !important;
            padding: 0 !important;
        }

        /* Filter tabs */
        #txModal .tx-filter-tabs,
        #txFilterTabs {
            display: flex !important;
            flex-direction: row !important;
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            gap: 6px !important;
            padding: 10px 12px !important;
            background: #111 !important;
            border-bottom: 1px solid #1f1f1f !important;
            scrollbar-width: none !important;
            box-sizing: border-box !important;
            position: static !important;
            width: 100% !important;
        }
        #txModal .tx-filter-tabs::-webkit-scrollbar,
        #txFilterTabs::-webkit-scrollbar { display: none !important; }

        /* Filter buttons */
        #txModal .tx-filter-tab,
        #txFilterTabs .tx-filter-tab {
            flex: 0 0 auto !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            width: auto !important;
            min-width: unset !important;
            max-width: unset !important;
            height: auto !important;
            padding: 6px 14px !important;
            border-radius: 20px !important;
            border: 1px solid #2a2a2a !important;
            background: #1a1a1a !important;
            color: #888 !important;
            font-size: 12px !important;
            font-weight: 500 !important;
            white-space: nowrap !important;
            line-height: normal !important;
            cursor: pointer !important;
        }
        #txModal .tx-filter-tab.active,
        #txFilterTabs .tx-filter-tab.active {
            background: #ff7a00 !important;
            border-color: #ff7a00 !important;
            color: #fff !important;
        }

        /* Scroll area */
        #txHistoryList {
            flex: 1 !important;
            overflow-y: auto !important;
            padding: 12px !important;
            -webkit-overflow-scrolling: touch !important;
        }
        
        
    `;
    document.head.appendChild(style);

    // ------------------------------------------------
    // ANDROID BACK BUTTON
    // ------------------------------------------------
    const MODALS = [
        { id: "txDetailModal",     close: () => closeTxDetail?.() },
        { id: "swapSuccessModal",  close: () => closeSwapSuccessModal?.() },
        { id: "sendSuccessModal",  close: () => closeSendSuccessModal?.() },
        { id: "swapConfirmModal",  close: () => _closeSwapConfirm?.() },
        { id: "sendConfirmModal",  close: () => closeSendConfirm?.() },
        { id: "qrModal",           close: () => closeQRModal?.() },
        { id: "receiveModal",      close: () => closeReceiveModal?.() },
        { id: "walletPickerModal", close: () => closeWalletPicker?.() },
        { id: "walletModal",       close: () => closeWalletSetting?.() },
        { id: "lpModal",           close: () => document.getElementById("closeLpModal")?.click() },
        { id: "swapModal",         close: () => { document.getElementById("swapModal")?.classList.remove("show"); setBottomNavActive?.("navHome"); } },
        { id: "sendModal",         close: () => { document.getElementById("sendModal")?.classList.remove("show"); setBottomNavActive?.("navHome"); } },
        { id: "txModal",           close: () => closeTxModal?.() },
        { id: "accountDetailBox",  close: () => document.getElementById("accountDetailBox")?.remove() },
        { id: "renameAccountBox",  close: () => document.getElementById("renameAccountBox")?.remove() },
        { id: "deleteAccountBox",  close: () => document.getElementById("deleteAccountBox")?.remove() },
        { id: "resetConfirmBox",   close: () => document.getElementById("resetConfirmBox")?.remove() },
        { id: "onboardingOverlay", close: () => {
            if (window.SESSION?.unlocked) _hideOnboarding?.();
        }},
    ];

    function isVisible(el) {
        if (!el) return false;
        return el.classList.contains("show") || 
               el.style.display === "flex" || 
               el.style.display === "block";
    }

    window._handleAndroidBack = function () {
        for (const m of MODALS) {
            const el = document.getElementById(m.id);
            if (!isVisible(el)) continue;

            // onboardingOverlay: cek apakah ini PIN lock screen
            // (bukan wallet manager atau screen lain yang boleh di-close)
            if (el.id === "onboardingOverlay") {
                const screen = window._onboardState?.screen;
                // Hanya blok back kalau ini benar-benar PIN lock screen
                const isLockScreen = screen === "PIN_UNLOCK" || 
                    screen === "WELCOME" ||
                    (!window.SESSION?.unlocked && 
                    screen !== "WALLET_MANAGE" &&
                    screen !== "IMPORT_CHOICE" &&
                    screen !== "IMPORT_PHRASE" &&
                    screen !== "IMPORT_PK" &&
                    screen !== "ADD_ACCOUNT" &&
                    screen !== "IMPORT_EXT" &&
                    screen !== "SET_PIN" &&
                    screen !== "SUCCESS");
                
                if (isLockScreen) {
                    return false; // minimize app
                }
                _hideOnboarding?.();
                return true;
            }

            m.close();
            return true;
        }
        return false;
    };

    // Fallback closeSendSuccessModal
    document.addEventListener("DOMContentLoaded", () => {
        if (typeof window.closeSendSuccessModal === "undefined") {
            window.closeSendSuccessModal = function () {
                const el = document.getElementById("sendSuccessModal");
                if (!el) return;
                el.classList.remove("show");
                el.style.display = "none";
                document.body.style.overflow = "";
            };
        }
    });

})();


// ------------------------------------------------
// FIX: Sembunyikan RPC badge saat txModal terbuka
// ------------------------------------------------
(function() {
    function getBadge() { return document.getElementById("_fetchFloatBadge"); }

    function hideBadge() {
        const b = getBadge();
        if (b) b.style.display = "none";
    }
    function showBadge() {
        const b = getBadge();
        if (b) b.style.display = "";
    }

    function observeTxModal() {
        const modal = document.getElementById("txModal");
        if (!modal) { setTimeout(observeTxModal, 500); return; }

        new MutationObserver(() => {
            modal.classList.contains("show") ? hideBadge() : checkAndShowBadge();
        }).observe(modal, { attributes: true, attributeFilter: ["class"] });
    }

    function observeOnboarding() {
        const el = document.getElementById("onboardingOverlay");
        if (!el) { setTimeout(observeOnboarding, 500); return; }

        new MutationObserver(() => {
            el.style.display !== "none" ? hideBadge() : checkAndShowBadge();
        }).observe(el, { attributes: true, attributeFilter: ["style"] });
    }

    function checkAndShowBadge() {
        const txModal = document.getElementById("txModal");
        const onboard = document.getElementById("onboardingOverlay");
        const txOpen  = txModal?.classList.contains("show");
        const obOpen  = onboard?.style.display !== "none";
        if (!txOpen && !obOpen) showBadge();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => { observeTxModal(); observeOnboarding(); });
    } else {
        observeTxModal();
        observeOnboarding();
    }
})();


// ------------------------------------------------
// FIX: Toast tertutup bottom-nav
// ------------------------------------------------
(function() {
    const s = document.createElement("style");
    s.textContent = `
        #toast {
            bottom: calc(64px + 16px + env(safe-area-inset-bottom, 0px)) !important;
            z-index: 999999 !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            white-space: nowrap !important;
        }
        .toast {
            bottom: calc(64px + 16px + env(safe-area-inset-bottom, 0px)) !important;
            z-index: 999999 !important;
        }
    `;
    document.head.appendChild(s);
})();


// ------------------------------------------------
// FIX: Wallet Manager header tidak bentrok RPC badge
// ------------------------------------------------
(function() {
    const s = document.createElement("style");
    s.textContent = `
        /* Onboarding overlay: beri padding-top agar tidak tertutup RPC badge */
        #onboardingOverlay {
            padding-top: env(safe-area-inset-top, 0px) !important;
        }
        /* Header wallet manager: padding kanan agar tidak bentrok RPC */
        #onboardingOverlay > div > div:first-child {
            padding-right: 70px !important;
            box-sizing: border-box !important;
        }
    `;
    document.head.appendChild(s);
})();