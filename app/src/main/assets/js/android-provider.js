// =====================================
// ANDROID-PROVIDER.JS
// Adapter: AndroidBridge â†” provider-injection.js
// =====================================

(function () {
    "use strict";

    if (!window.AndroidWallet) return;

    console.log("[SidraWallet] Android Bridge adapter aktif âœ“");

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // HELPER: tunggu _sidraProvider siap (max 5 detik)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function waitForProvider(callback, timeout) {
        var start = Date.now();
        var interval = setInterval(function () {
            if (window._sidraProvider) {
                clearInterval(interval);
                callback(window._sidraProvider);
                return;
            }
            if (Date.now() - start > (timeout || 5000)) {
                clearInterval(interval);
                callback(null); // timeout
            }
        }, 100);
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // TERIMA REQUEST DARI ANDROID BRIDGE
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    window._androidBridgeRequest = async function (requestId, method, params, origin) {

        // Tunggu provider siap dulu
        waitForProvider(async function(provider) {
            if (!provider) {
                window.AndroidWallet.sendResponse(
                    requestId,
                    "null",
                    JSON.stringify({ code: -32603, message: "Provider tidak tersedia (timeout)" })
                );
                return;
            }

            window._bridgeRequestOrigin = origin;

            try {
                const result = await provider.request({ method: method, params: params || [], origin: origin });
                window.AndroidWallet.sendResponse(
                    requestId,
                    JSON.stringify(result),
                    "null"
                );
            } catch (err) {
                window.AndroidWallet.sendResponse(
                    requestId,
                    "null",
                    JSON.stringify({
                        code:    err.code    || -32603,
                        message: err.message || "Unknown error"
                    })
                );
            } finally {
                window._bridgeRequestOrigin = null;
            }
        }, 5000);
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // HOOK: Setelah approve di permission popup
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const _origOnConnect = window._providerOnConnect;
    window._providerOnConnect = function (address) {
        if (_origOnConnect) _origOnConnect(address);
        try {
            window.AndroidWallet.broadcastEvent(
                "accountsChanged",
                JSON.stringify([address])
            );
            window.AndroidWallet.broadcastEvent(
                "connect",
                JSON.stringify({ chainId: "0x17cad" })
            );
        } catch (e) {}
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // HOOK: Account switch
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const _origSwitch = window.switchSessionAccount;
    window.switchSessionAccount = async function (index) {
        if (_origSwitch) await _origSwitch(index);
        var addr = window.SESSION && window.SESSION.address;
        if (addr) {
            try {
                window.AndroidWallet.broadcastEvent(
                    "accountsChanged",
                    JSON.stringify([addr])
                );
            } catch (e) {}
        }
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Buka BrowserActivity dari wallet
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    window.openAndroidBrowser = function (url) {
        try {
            window.AndroidWallet.openBrowser(url || "https://www.sidrachain.com");
        } catch (e) {
            console.warn("[SidraWallet] openBrowser error:", e);
        }
    };

    // sidra-browser-v2.js dimuat SETELAH file ini dan menimpa window.sidraBrowser,
    // jadi override open() harus dipasang lagi setelah semua script selesai dimuat.
    // Di APK, dApp dibuka lewat BrowserActivity (provider di-inject native),
    // bukan iframe (iframe lintas-origin tidak bisa di-inject & sering diblokir X-Frame-Options).
    function _hookSidraBrowser() {
        var open = function (url) {
            window.openAndroidBrowser(url || "https://www.sidrachain.com");
        };
        if (window.sidraBrowser && typeof window.sidraBrowser === "object") {
            window.sidraBrowser.open = open;          // method lain (isVisible dll) tetap utuh
        } else {
            window.sidraBrowser = { open: open };
        }
    }
    _hookSidraBrowser();
    document.addEventListener("DOMContentLoaded", _hookSidraBrowser);
    window.addEventListener("load", _hookSidraBrowser);
    setTimeout(_hookSidraBrowser, 1500);

    // Log status provider setelah 1 detik
    setTimeout(function() {
        console.log("[SidraWallet] _sidraProvider status:", 
            window._sidraProvider ? "READY âœ“" : "NOT FOUND âœ—");
    }, 1000);

})();
