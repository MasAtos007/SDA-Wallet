// =====================================
// DAPP-CONNECTION-MANAGER.JS
// Kelola connected dApps:
// - active connections
// - reconnect on session restore
// - disconnect
// - account sync
// Integrasi dengan permission-manager.js
// =====================================

(function () {
    "use strict";

    const CONN_STORAGE_KEY = "sidra_dapp_connections_v1";

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // STRUKTUR DATA KONEKSI:
    // {
    //   "https://www.sidrachain.com": {
    //     origin:        "https://www.sidrachain.com",
    //     address:       "0x...",
    //     chainId:       "0x25E4",
    //     connectedAt:   1234567890,
    //     lastActiveAt:  1234567890,
    //     sessionActive: true/false
    //   }
    // }
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const SIDRA_CHAIN_ID = "0x" + (9700).toString(16);

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // LOAD / SAVE
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function _load() {
        try { return JSON.parse(localStorage.getItem(CONN_STORAGE_KEY)) || {}; }
        catch { return {}; }
    }

    function _save(data) {
        try { localStorage.setItem(CONN_STORAGE_KEY, JSON.stringify(data)); }
        catch {}
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // PUBLIC API
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const dappConnectionManager = {

        // Set active connection (dipanggil setelah approve)
        setActiveConnection(origin, address) {
            const data = _load();
            data[origin] = {
                origin,
                address,
                chainId:       SIDRA_CHAIN_ID,
                connectedAt:   data[origin]?.connectedAt || Date.now(),
                lastActiveAt:  Date.now(),
                sessionActive: true
            };
            _save(data);

            // Sync ke permission-manager juga
            window.permissionManager?.grantPermission(origin, null, [address]);

            _notifyBrowserUI(origin, true);
        },

        // Tandai koneksi tidak aktif (bukan hapus permission)
        markInactive(origin) {
            const data = _load();
            if (data[origin]) {
                data[origin].sessionActive = false;
                _save(data);
            }
            _notifyBrowserUI(origin, false);
        },

        // Disconnect penuh â€” hapus dari permission juga
        disconnect(origin) {
            const data = _load();
            delete data[origin];
            _save(data);

            window.permissionManager?.revokePermission(origin);
            window._providerOnDisconnect?.();
            window.browserBridge?.broadcastEvent("accountsChanged", []);

            _notifyBrowserUI(origin, false);
            showToast?.("Wallet dicabut dari " + _hostname(origin), "info");
        },

        // Disconnect semua
        disconnectAll() {
            const data = _load();
            for (const origin of Object.keys(data)) {
                window.permissionManager?.revokePermission(origin);
            }
            _save({});
            window._providerOnDisconnect?.();
            window.browserBridge?.broadcastEvent("accountsChanged", []);
        },

        // Cek apakah origin aktif
        isActive(origin) {
            const data = _load();
            return !!(data[origin]?.sessionActive);
        },

        // Ambil koneksi aktif semua
        getAll() {
            return Object.values(_load());
        },

        // Ambil koneksi untuk origin tertentu
        getConnection(origin) {
            return _load()[origin] || null;
        },

        // Reconnect saat wallet unlock kembali
        // Kirim accountsChanged ke semua frame yang sudah punya permission
        async reconnectAll() {
            if (!window.SESSION?.unlocked) return;
            const address = window.SESSION.address;
            if (!address) return;

            const all = this.getAll();
            for (const conn of all) {
                // Update address ke account aktif
                conn.address       = address;
                conn.sessionActive = true;
                conn.lastActiveAt  = Date.now();

                // Update permission
                window.permissionManager?.updateAccounts(conn.origin, [address]);

                // Notify iframe via bridge
                window.browserBridge?.broadcastEvent("accountsChanged", [address]);
            }

            // Save updated
            const data = _load();
            for (const conn of all) {
                if (data[conn.origin]) {
                    data[conn.origin].address       = address;
                    data[conn.origin].sessionActive = true;
                    data[conn.origin].lastActiveAt  = Date.now();
                }
            }
            _save(data);

            if (all.length > 0) {
                console.log("[dAppConnMgr] Reconnected", all.length, "dApp(s)");
            }
        },

        // Saat account switch â€” update semua koneksi aktif
        onAccountSwitch(newAddress) {
            if (!newAddress) return;
            const data = _load();
            let   changed = false;

            for (const origin of Object.keys(data)) {
                if (data[origin].sessionActive) {
                    data[origin].address      = newAddress;
                    data[origin].lastActiveAt = Date.now();
                    changed = true;

                    // Notify iframe
                    window.browserBridge?.broadcastEvent("accountsChanged", [newAddress]);
                    window.permissionManager?.updateAccounts(origin, [newAddress]);
                }
            }

            if (changed) {
                _save(data);
                window._providerOnAccountChange?.(newAddress);
            }
        },

        // Render daftar connected sites ke element
        renderConnectedList(containerId) {
            const el = document.getElementById(containerId);
            if (!el) return;

            const all = this.getAll();
            if (!all.length) {
                el.innerHTML = `
                    <div style="text-align:center;padding:30px 0;color:#333;font-size:13px">
                        Belum ada dApp yang terhubung
                    </div>`;
                return;
            }

            el.innerHTML = all.map(conn => `
                <div style="
                    display:flex;align-items:center;gap:12px;
                    padding:14px 0;border-bottom:1px solid #1a1a1a;
                ">
                    <div style="
                        width:40px;height:40px;border-radius:10px;
                        background:#1a1a1a;border:1px solid #2a2a2a;
                        display:flex;align-items:center;justify-content:center;
                        font-size:18px;flex-shrink:0;overflow:hidden;
                    ">
                        <img src="https://www.google.com/s2/favicons?domain=${_hostname(conn.origin)}&sz=64"
                            onerror="this.style.display='none'" style="width:100%;height:100%">
                    </div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:14px;font-weight:600;color:#fff;
                                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                            ${_hostname(conn.origin)}
                        </div>
                        <div style="font-size:11px;color:#444;margin-top:2px;font-family:monospace">
                            ${_shortAddr(conn.address)}
                        </div>
                        <div style="font-size:10px;margin-top:3px">
                            <span style="
                                display:inline-block;padding:1px 6px;border-radius:10px;
                                ${conn.sessionActive
                                    ? "background:rgba(0,255,136,0.08);color:#00ff88;border:1px solid rgba(0,255,136,0.2)"
                                    : "background:#1a1a1a;color:#444;border:1px solid #222"
                                }
                            ">
                                ${conn.sessionActive ? "â— Aktif" : "â— Tidak aktif"}
                            </span>
                        </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
                        <button onclick="window.sidraBrowser?.open('${conn.origin}')"
                            style="
                                background:#1a1a1a;border:1px solid #2a2a2a;color:#aaa;
                                padding:5px 10px;border-radius:7px;font-size:11px;cursor:pointer
                            ">
                            Buka
                        </button>
                        <button onclick="window.dappConnectionManager.disconnect('${conn.origin}');window.dappConnectionManager.renderConnectedList('${containerId}')"
                            style="
                                background:none;border:1px solid rgba(255,100,100,0.2);
                                color:#ff6b6b;padding:5px 10px;border-radius:7px;
                                font-size:11px;cursor:pointer
                            ">
                            Cabut
                        </button>
                    </div>
                </div>
            `).join("");
        }
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // HELPERS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function _hostname(origin) {
        try { return new URL(origin).hostname.replace("www.", ""); }
        catch { return origin; }
    }

    function _shortAddr(a) {
        if (!a) return "-";
        return a.slice(0, 8) + "..." + a.slice(-4);
    }

    function _notifyBrowserUI(origin, connected) {
        // Update status bar di browser jika origin cocok dengan yang aktif
        if (window.sidraBrowser?.currentOrigin() === origin) {
            const el = document.getElementById("sbrConnStatus");
            if (el) {
                el.textContent   = connected ? "â— Terhubung" : "â— Tidak terhubung";
                el.style.color   = connected ? "#00ff88" : "#555";
                el.style.borderColor = connected ? "rgba(0,255,136,0.3)" : "#2a2a2a";
            }
        }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // HOOKS KE SESSION
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    // Reconnect saat unlock
    const _origUnlock = window.unlockWallet;
    window.unlockWallet = async function (pin) {
        const result = await _origUnlock(pin);
        if (result) {
            setTimeout(() => {
                dappConnectionManager.reconnectAll();
                window._resumePendingConnect?.();
                window._syncProviderSession?.();
            }, 600);
        }
        return result;
    };

    // Disconnect saat lock
    const _origLock = window.lockWallet;
    window.lockWallet = function () {
        _origLock?.();
        // Mark semua koneksi sebagai inactive (tidak hapus permission)
        const data = _load();
        for (const origin of Object.keys(data)) {
            data[origin].sessionActive = false;
        }
        _save(data);
        window.browserBridge?.broadcastEvent("accountsChanged", []);
    };

    // Sync saat account switch
    const _origSwitch = window.switchSessionAccount;
    window.switchSessionAccount = async function (index) {
        await _origSwitch?.(index);
        const newAddr = window.SESSION?.address;
        if (newAddr) {
            setTimeout(() => dappConnectionManager.onAccountSwitch(newAddr), 200);
        }
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // EXPOSE GLOBAL
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    window.dappConnectionManager = dappConnectionManager;

    // Init saat DOMContentLoaded
    document.addEventListener("DOMContentLoaded", () => {
        // Jika sudah ada session aktif saat load (misal reload halaman)
        if (window.SESSION?.unlocked) {
            setTimeout(() => dappConnectionManager.reconnectAll(), 800);
        }
    });

})();
