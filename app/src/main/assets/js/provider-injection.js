// =====================================
// PROVIDER-INJECTION.JS
// =====================================

(function () {
    "use strict";
    try {

    const CHAIN_ID     = "0x" + (97453).toString(16);  // 0x17c8d
    const CHAIN_ID_INT = 97453;
    const RPC_URL      = "https://node.sidrachain.com";

    const _listeners = {};

    function _emit(event, data) {
        (_listeners[event] || []).forEach(function(cb) {
            try { cb(data); } catch(e) {}
        });
    }

    function _getActiveSigner() {
        if (window.SESSION && window.SESSION.unlocked && window.SESSION.signer) {
            return window.SESSION.signer;
        }
        if (window.WALLET_SESSION &&
            window.WALLET_SESSION.pkWallet &&
            !window.WALLET_SESSION.pkLocked) {
            return window.WALLET_SESSION.pkWallet;
        }
        return null;
    }

    function _getActiveAddress() {
        if (window.SESSION && window.SESSION.unlocked && window.SESSION.address) {
            return window.SESSION.address;
        }
        if (window.WALLET_SESSION && window.WALLET_SESSION.activeAddress) {
            return window.WALLET_SESSION.activeAddress;
        }
        return null;
    }

    function _isUnlocked() {
        return !!_getActiveSigner();
    }

    function _getProvider() {
        return window.provider ||
            window.pkProvider ||
            new ethers.providers.JsonRpcProvider(RPC_URL);
    }

    function _requireSigner() {
        var signer = _getActiveSigner();
        if (!signer) {
            if (typeof showPINUnlockScreen === "function") showPINUnlockScreen();
            throw Object.assign(
                new Error("Wallet terkunci. Masukkan PIN."),
                { code: 4001 }
            );
        }
        return signer;
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // REQUEST HANDLER
    // FIX: _handleRequest terima origin sebagai parameter ke-3
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async function _handleRequest(method, params, origin) {
        origin = origin || "unknown";

        if (method === "eth_chainId") return CHAIN_ID;
        if (method === "net_version") return String(CHAIN_ID_INT);

        if (method === "eth_accounts") {
            var addr = _getActiveAddress();
            return addr ? [addr] : [];
        }

        if (method === "eth_requestAccounts") {
            var addr = _getActiveAddress();

            // Sudah punya permission â€” langsung return
            if (window.permissionManager && window.permissionManager.hasPermission(origin)) {
                if (_isUnlocked() && addr) {
                    _emit("accountsChanged", [addr]);
                    _emit("connect", { chainId: CHAIN_ID });
                    return [addr];
                }
            }

            // Sudah unlock â€” tampilkan connect modal
            if (_isUnlocked() && addr) {
                return new Promise(function(resolve, reject) {
                    window._providerResolve = resolve;
                    window._providerReject  = reject;

                    window._providerOnConnect = function(address) {
                        if (window.permissionManager) {
                            window.permissionManager.grantPermission(origin, null, [address]);
                        }
                        _emit("accountsChanged", [address]);
                        _emit("connect", { chainId: CHAIN_ID });
                        if (window._providerResolve) {
                            window._providerResolve([address]);
                            window._providerResolve = null;
                            window._providerReject  = null;
                        }
                    };

                    if (typeof window.openConnectModal === "function") {
                        window.openConnectModal(origin);
                    } else {
                        // Fallback: auto approve
                        if (window._providerResolve) {
                            window._providerResolve([addr]);
                            window._providerResolve = null;
                            window._providerReject  = null;
                        }
                    }

                    setTimeout(function() {
                        if (window._providerReject) {
                            window._providerReject(
                                Object.assign(new Error("User rejected"), { code: 4001 })
                            );
                            window._providerResolve = null;
                            window._providerReject  = null;
                        }
                    }, 300000);
                });
            }

            // Belum unlock â€” tampilkan PIN screen
            return new Promise(function(resolve, reject) {
                window._providerResolve      = resolve;
                window._providerReject       = reject;
                window._pendingConnectOrigin = origin;

                if (typeof showPINUnlockScreen === "function") {
                    showPINUnlockScreen();
                }

                setTimeout(function() {
                    if (window._providerReject) {
                        window._providerReject(
                            Object.assign(new Error("User rejected"), { code: 4001 })
                        );
                        window._providerResolve = null;
                        window._providerReject  = null;
                    }
                }, 300000);
            });
        }

        if (method === "wallet_requestPermissions") {
            await _handleRequest("eth_requestAccounts", [], origin);
            return [{ parentCapability: "eth_accounts", caveats: [] }];
        }

        if (method === "wallet_getPermissions") {
            var addr = _getActiveAddress();
            if (!addr) return [];
            return [{ parentCapability: "eth_accounts", caveats: [] }];
        }

        if (method === "eth_getBalance") {
            var address = params[0] || _getActiveAddress();
            var block   = params[1] || "latest";
            if (!address) throw Object.assign(new Error("No address"), { code: -32602 });
            var bal = await _getProvider().getBalance(address, block);
            return bal.toHexString();
        }

        if (method === "eth_blockNumber") {
            var num = await _getProvider().getBlockNumber();
            return "0x" + num.toString(16);
        }

        if (method === "eth_getTransactionCount") {
            var address = params[0] || _getActiveAddress();
            var block   = params[1] || "latest";
            var count   = await _getProvider().getTransactionCount(address, block);
            return "0x" + count.toString(16);
        }

        if (method === "eth_gasPrice") {
            var price = await _getProvider().getGasPrice();
            return price.toHexString();
        }

        if (method === "eth_estimateGas") {
            var est = await _getProvider().estimateGas(params[0] || {});
            return est.toHexString();
        }

        if (method === "eth_call") {
            return await _getProvider().call(params[0] || {}, params[1] || "latest");
        }

        if (method === "eth_getCode") {
            return await _getProvider().getCode(params[0], params[1] || "latest");
        }

        if (method === "eth_getLogs") {
            return await _getProvider().getLogs(params[0] || {});
        }

        if (method === "eth_getTransactionByHash") {
            return await _getProvider().getTransaction(params[0]);
        }

        if (method === "eth_getTransactionReceipt") {
            return await _getProvider().getTransactionReceipt(params[0]);
        }

        if (method === "eth_getBlockByNumber" || method === "eth_getBlockByHash") {
            return await _getProvider().getBlock(params[0]);
        }

        if (method === "eth_sendTransaction") {
            var signer = _requireSigner();
            var tx     = params[0] || {};

            // Tampilkan TX modal untuk konfirmasi
            return new Promise(function(resolve, reject) {
                window._txResolve = resolve;
                window._txReject  = reject;

                if (typeof window.openTxModal === "function") {
                    window.openTxModal({ txParams: tx, origin: origin });
                } else {
                    // Fallback: langsung kirim
                    var txReq = {};
                    if (tx.to)       txReq.to       = tx.to;
                    if (tx.value)    txReq.value    = tx.value;
                    if (tx.data)     txReq.data     = tx.data;
                    if (tx.gas)      txReq.gasLimit = tx.gas;
                    if (tx.gasPrice) txReq.gasPrice = tx.gasPrice;
                    if (tx.nonce)    txReq.nonce    = tx.nonce;

                    signer.sendTransaction(txReq).then(function(sent) {
                        resolve(sent.hash);
                    }).catch(reject);
                }
            });
        }

        if (method === "eth_signTransaction") {
            return await _requireSigner().signTransaction(params[0] || {});
        }

        if (method === "eth_sign") {
            return await _requireSigner().signMessage(
                ethers.utils.arrayify(params[1])
            );
        }

        if (method === "personal_sign") {
            // Tampilkan sign modal
            return new Promise(function(resolve, reject) {
                window._signResolve = resolve;
                window._signReject  = reject;

                if (typeof window.openSignModal === "function") {
                    window.openSignModal({ method: method, params: params, origin: origin });
                } else {
                    // Fallback: langsung sign
                    var signer  = _requireSigner();
                    var message = params[0];
                    var bytes   = ethers.utils.isHexString(message)
                        ? ethers.utils.arrayify(message) : message;
                    signer.signMessage(bytes).then(resolve).catch(reject);
                }
            });
        }

        if (method === "eth_signTypedData" ||
            method === "eth_signTypedData_v3" ||
            method === "eth_signTypedData_v4") {
            return new Promise(function(resolve, reject) {
                window._signResolve = resolve;
                window._signReject  = reject;

                if (typeof window.openSignModal === "function") {
                    window.openSignModal({ method: method, params: params, origin: origin });
                } else {
                    var signer     = _requireSigner();
                    var typedData  = typeof params[1] === "string"
                        ? JSON.parse(params[1]) : params[1];
                    var domain     = typedData.domain;
                    var types      = Object.assign({}, typedData.types);
                    delete types.EIP712Domain;
                    signer._signTypedData(domain, types, typedData.message)
                        .then(resolve).catch(reject);
                }
            });
        }

        if (method === "wallet_switchEthereumChain") {
            var reqChainId = params[0] && params[0].chainId;
            if (reqChainId && reqChainId.toLowerCase() !== CHAIN_ID.toLowerCase()) {
                throw Object.assign(
                    new Error("Chain tidak didukung. Sidra Wallet hanya support SidraChain."),
                    { code: 4902 }
                );
            }
            return null;
        }

        if (method === "wallet_addEthereumChain") {
            var chainId = params[0] && params[0].chainId;
            if (chainId && chainId.toLowerCase() === CHAIN_ID.toLowerCase()) return null;
            throw Object.assign(
                new Error("Sidra Wallet tidak support tambah chain lain"),
                { code: 4902 }
            );
        }

        if (method === "eth_sendRawTransaction") {
            var tx = await _getProvider().sendTransaction(params[0]);
            return tx.hash;
        }

        throw Object.assign(
            new Error("Method tidak didukung: " + method),
            { code: -32601 }
        );
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // PROVIDER OBJECT (EIP-1193)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    var _sidraProvider = {
        isMetaMask:     false,
        isSidraWallet:  true,
        chainId:        CHAIN_ID,
        networkVersion: String(CHAIN_ID_INT),

        get selectedAddress() { return _getActiveAddress(); },
        get _isConnected()    { return _isUnlocked(); },

        request: function(args) {
            return _handleRequest(args.method, args.params || [], args.origin || window._bridgeRequestOrigin || null);
        },

        send: function(method, params, callback) {
            if (typeof method === "object") {
                var payload = method, cb = params;
                this.request(payload)
                    .then(function(r) { cb(null, { id: payload.id, jsonrpc: "2.0", result: r }); })
                    .catch(function(e) { cb(e, null); });
                return;
            }
            if (typeof callback === "function") {
                this.request({ method: method, params: params })
                    .then(function(r) { callback(null, r); })
                    .catch(function(e) { callback(e, null); });
                return;
            }
            return this.request({ method: method, params: params });
        },

        sendAsync: function(payload, callback) {
            this.request(payload)
                .then(function(r) { callback(null, { id: payload.id, jsonrpc: "2.0", result: r }); })
                .catch(function(e) { callback(e, null); });
        },

        enable: function() {
            return this.request({ method: "eth_requestAccounts" });
        },

        emit:           function(event, data) { _emit(event, data); return this; },
        on:             function(event, cb)   { if (!_listeners[event]) _listeners[event] = []; _listeners[event].push(cb); return this; },
        off:            function(event, cb)   { if (_listeners[event]) _listeners[event] = _listeners[event].filter(function(c) { return c !== cb; }); return this; },
        removeListener: function(event, cb)   { return this.off(event, cb); },
        once:           function(event, cb)   { var self = this; var w = function(d) { cb(d); self.off(event, w); }; return this.on(event, w); },
        isConnected:    function()            { return _isUnlocked(); }
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // EXPOSE
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    window._sidraProvider = _sidraProvider;

    // Hook: setelah unlock, lanjutkan pending connect
    var _origUnlock = window.unlockWallet;
    if (typeof _origUnlock === "function") {
        window.unlockWallet = async function(pin) {
            var result = await _origUnlock.call(this, pin);
            var addr = _getActiveAddress();
            if (addr && window._pendingConnectOrigin) {
                var pendingOrigin = window._pendingConnectOrigin;
                window._pendingConnectOrigin = null;
                setTimeout(function() {
                    if (typeof window.openConnectModal === "function") {
                        window.openConnectModal(pendingOrigin);
                    } else if (window._providerResolve) {
                        window._providerResolve([addr]);
                        window._providerResolve = null;
                        window._providerReject  = null;
                    }
                }, 300);
            }
            return result;
        };
    }

    // Hook untuk android-provider.js
    window._providerOnConnect = window._providerOnConnect || function(address) {
        _emit("accountsChanged", [address]);
        _emit("connect", { chainId: CHAIN_ID });
    };

    console.log("[SidraWallet] provider-injection.js loaded v3 âœ“");

    } catch(err) {
        alert("[provider-injection ERROR]\n" + err.message + "\n\n" + (err.stack||"").substring(0,300));
    }

})();
