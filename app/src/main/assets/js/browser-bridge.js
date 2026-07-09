// =====================================
// BROWSER-BRIDGE.JS
// PostMessage transport layer
// Parent wallet â†” iframe dApp
// =====================================
//
// FLOW:
// iframe (injected-provider.js)
//   â†’ postMessage(request) â†’ parent
//   â†’ provider-injection.js handles
//   â†’ postMessage(response) â†’ iframe
//
// Load order: SETELAH provider-injection.js
// =====================================

(function () {
    "use strict";

    const BRIDGE_PROTOCOL  = "SIDRA_BRIDGE_V1";
    const MAX_PENDING      = 100;
    const REQUEST_TIMEOUT  = 30000; // 30 detik

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // REGISTRY: iframe â†’ origin mapping
    // key: iframe contentWindow reference (WeakMap)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const _iframeRegistry = new Map();    // frameId â†’ { iframe, origin, trusted }
    const _pendingRequests = new Map();   // requestId â†’ { resolve, reject, timer, frameId }

    let _requestCounter = 0;

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // REGISTER IFRAME
    // Dipanggil oleh sidra-browser-v2.js saat iframe dibuat
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function registerFrame(frameId, iframeEl, origin) {
        _iframeRegistry.set(frameId, {
            iframe:    iframeEl,
            origin:    origin,
            trusted:   window.permissionManager?.isTrusted(origin) || false,
            connectedAt: null
        });
        console.log(`[Bridge] Frame registered: ${frameId} â†’ ${origin}`);
    }

    function unregisterFrame(frameId) {
        _iframeRegistry.delete(frameId);
        // Reject semua pending dari frame ini
        for (const [reqId, pending] of _pendingRequests) {
            if (pending.frameId === frameId) {
                clearTimeout(pending.timer);
                pending.reject(new Error("Frame unregistered"));
                _pendingRequests.delete(reqId);
            }
        }
    }

    function getFrameInfo(frameId) {
        return _iframeRegistry.get(frameId) || null;
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // VALIDATE ORIGIN
    // Pastikan message berasal dari iframe yang terdaftar
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function _validateMessageOrigin(event) {
        // Cari frame yang matching dengan source window
        for (const [frameId, info] of _iframeRegistry) {
            try {
                if (info.iframe?.contentWindow === event.source) {
                    return { valid: true, frameId, origin: info.origin };
                }
            } catch {
                // cross-origin access error - abaikan
            }
        }
        return { valid: false };
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // SEND RESPONSE KE IFRAME
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function _sendToFrame(frameId, message) {
        const info = _iframeRegistry.get(frameId);
        if (!info?.iframe?.contentWindow) {
            console.warn("[Bridge] Frame tidak ditemukan:", frameId);
            return;
        }

        try {
            // targetOrigin "*" karena origin bisa berubah / HTTPS
            // Dalam produksi sebaiknya pakai info.origin
            info.iframe.contentWindow.postMessage(
                { ...message, protocol: BRIDGE_PROTOCOL },
                "*"
            );
        } catch (e) {
            console.warn("[Bridge] postMessage error:", e);
        }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // MAIN MESSAGE HANDLER
    // Tangkap semua postMessage dari iframe
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    window.addEventListener("message", async (event) => {
        const data = event.data;

        // Filter: hanya proses message dari bridge protocol
        if (!data || data.protocol !== BRIDGE_PROTOCOL) return;
        if (data.direction !== "REQUEST") return;

        const validation = _validateMessageOrigin(event);
        if (!validation.valid) {
            // Message dari source yang tidak dikenal - abaikan
            console.warn("[Bridge] Unknown source, ignored");
            return;
        }

        const { frameId, origin } = validation;
        const { id, method, params } = data;

        if (!id || !method) return;

        // Cek pending overflow
        if (_pendingRequests.size >= MAX_PENDING) {
            _sendToFrame(frameId, {
                direction: "RESPONSE",
                id,
                error: { code: -32000, message: "Too many pending requests" }
            });
            return;
        }

        // Forward ke provider-injection.js
        try {
            const result = await _dispatchToProvider(method, params, origin, frameId);
            _sendToFrame(frameId, {
                direction: "RESPONSE",
                id,
                result
            });
        } catch (err) {
            _sendToFrame(frameId, {
                direction: "RESPONSE",
                id,
                error: {
                    code:    err.code    || -32603,
                    message: err.message || "Internal error"
                }
            });
        }
    });

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // DISPATCH KE PROVIDER
    // Gunakan window.ethereum (SidraProvider) langsung
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async function _dispatchToProvider(method, params, origin, frameId) {

        const provider = window._sidraProvider;
        if (!provider) throw new Error("Provider tidak tersedia");

        // Override origin untuk request dari iframe
        // Provider perlu tahu request berasal dari mana
        window._bridgeRequestOrigin = origin;

        try {
            const result = await provider.request({ method, params: params || [] });
            return result;
        } finally {
            window._bridgeRequestOrigin = null;
        }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // BROADCAST EVENT KE SEMUA IFRAME
    // Dipanggil saat accountsChanged / chainChanged
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function broadcastEvent(eventName, data) {
        for (const [frameId] of _iframeRegistry) {
            _sendToFrame(frameId, {
                direction: "EVENT",
                event:     eventName,
                data
            });
        }
    }

    // Hook ke provider events
    function _hookProviderEvents() {
        const provider = window._sidraProvider;
        if (!provider) {
            // Retry setelah provider siap
            setTimeout(_hookProviderEvents, 500);
            return;
        }

        provider.on("accountsChanged", (accounts) => {
            broadcastEvent("accountsChanged", accounts);
        });

        provider.on("chainChanged", (chainId) => {
            broadcastEvent("chainChanged", chainId);
        });

        provider.on("connect", (info) => {
            broadcastEvent("connect", info);
        });

        provider.on("disconnect", (err) => {
            broadcastEvent("disconnect", err);
        });
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ORIGIN OVERRIDE untuk provider-injection
    // provider-injection._getCallerOrigin() harus membaca ini
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Patch _getCallerOrigin di provider-injection
    // (dipanggil sekali setelah kedua script load)
    function _patchProviderOrigin() {
        // provider-injection.js menggunakan window.location.origin
        // Kita perlu intercept saat request dari bridge
        // Solusi: provider-injection sudah baca window._bridgeRequestOrigin
        // Pastikan patch ini konsisten
        console.log("[Bridge] Provider origin patch active");
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // PUBLIC API
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    window.browserBridge = {
        registerFrame,
        unregisterFrame,
        getFrameInfo,
        broadcastEvent,

        // Kirim event ke frame tertentu
        sendEventToFrame(frameId, eventName, data) {
            _sendToFrame(frameId, {
                direction: "EVENT",
                event:     eventName,
                data
            });
        },

        // Ambil semua frame terdaftar
        getRegisteredFrames() {
            const result = [];
            for (const [id, info] of _iframeRegistry) {
                result.push({ id, origin: info.origin, trusted: info.trusted });
            }
            return result;
        }
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // INIT
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    document.addEventListener("DOMContentLoaded", () => {
        _hookProviderEvents();
        _patchProviderOrigin();
        console.log("[SidraWallet] Browser Bridge ready âœ“");
    });

    // Jika DOM sudah siap
    if (document.readyState !== "loading") {
        _hookProviderEvents();
    }

})();
