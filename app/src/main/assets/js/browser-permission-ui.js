// =====================================
// BROWSER-PERMISSION-UI.JS
// Popup permission khusus untuk dApp browser
// Mirip MetaMask, mobile-first
// Extend connect-modal.js dengan UI browser-specific
// =====================================

(function () {
    "use strict";

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CSS TAMBAHAN
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const PERM_CSS = `
        #sbr-perm-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.85);
            z-index: 99998;
            display: flex; align-items: flex-end;
            justify-content: center;
            backdrop-filter: blur(6px);
            animation: sbrPermFade 0.2s ease;
        }
        @keyframes sbrPermFade { from{opacity:0} to{opacity:1} }

        #sbr-perm-sheet {
            background: #111;
            border-radius: 22px 22px 0 0;
            width: 100%; max-width: 480px;
            border-top: 1px solid #222;
            animation: sbrPermUp 0.28s cubic-bezier(0.34,1.2,0.64,1);
            padding-bottom: env(safe-area-inset-bottom, 20px);
            max-height: 90vh;
            overflow-y: auto;
        }
        @keyframes sbrPermUp { from{transform:translateY(100%)} to{transform:translateY(0)} }

        .sbr-perm-pill {
            width: 36px; height: 4px; background: #2a2a2a;
            border-radius: 4px; margin: 12px auto 0;
        }

        .sbr-perm-header {
            padding: 20px 20px 16px;
            border-bottom: 1px solid #1a1a1a;
        }
        .sbr-perm-site-row {
            display: flex; align-items: center; gap: 12px; margin-bottom: 14px;
        }
        .sbr-perm-icon {
            width: 48px; height: 48px; border-radius: 12px;
            background: #1a1a1a; border: 1px solid #2a2a2a;
            display: flex; align-items: center; justify-content: center;
            font-size: 22px; color: #00ff88; flex-shrink: 0; overflow: hidden;
        }
        .sbr-perm-icon img { width: 100%; height: 100%; object-fit: cover; }
        .sbr-perm-site-name { font-size: 16px; font-weight: 700; color: #fff; }
        .sbr-perm-site-url  { font-size: 12px; color: #555; margin-top: 2px; }
        .sbr-perm-title {
            font-size: 20px; font-weight: 700; color: #fff; line-height: 1.3;
        }
        .sbr-perm-subtitle {
            font-size: 13px; color: #666; margin-top: 4px;
        }

        .sbr-perm-body { padding: 16px 20px; }

        .sbr-wallet-select {
            background: #1a1a1a; border-radius: 14px;
            border: 1px solid #2a2a2a; overflow: hidden; margin-bottom: 14px;
        }
        .sbr-wallet-item {
            display: flex; align-items: center; gap: 12px;
            padding: 14px 16px;
            border-bottom: 1px solid #1e1e1e;
            cursor: pointer; transition: background 0.1s;
        }
        .sbr-wallet-item:last-child { border-bottom: none; }
        .sbr-wallet-item:active { background: #222; }
        .sbr-wallet-item.selected { background: rgba(0,255,136,0.05); }
        .sbr-wallet-check {
            width: 20px; height: 20px; border-radius: 50%;
            border: 2px solid #2a2a2a;
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; font-size: 11px;
        }
        .sbr-wallet-check.checked {
            background: #00ff88; border-color: #00ff88; color: #000;
        }
        .sbr-wallet-addr {
            font-size: 11px; color: #555; font-family: monospace; margin-top: 2px;
        }
        .sbr-wallet-name { font-size: 13px; font-weight: 600; color: #fff; }
        .sbr-wallet-bal  { font-size: 11px; color: #00ff88; margin-left: auto; }

        .sbr-perm-section-title {
            font-size: 11px; color: #444; text-transform: uppercase;
            letter-spacing: 0.8px; margin-bottom: 8px;
        }
        .sbr-perm-grant-list {
            background: #1a1a1a; border-radius: 12px;
            border: 1px solid #2a2a2a; padding: 4px 0;
            margin-bottom: 14px;
        }
        .sbr-perm-grant-item {
            display: flex; align-items: center; gap: 10px;
            padding: 10px 14px;
            font-size: 13px; color: #aaa;
            border-bottom: 1px solid #1e1e1e;
        }
        .sbr-perm-grant-item:last-child { border-bottom: none; }
        .sbr-perm-grant-icon { font-size: 14px; width: 18px; text-align: center; }

        .sbr-perm-trusted-badge {
            display: inline-flex; align-items: center; gap: 5px;
            background: rgba(0,255,136,0.07);
            border: 1px solid rgba(0,255,136,0.18);
            border-radius: 20px; padding: 4px 10px;
            font-size: 11px; color: #00ff88; margin-bottom: 14px;
        }

        .sbr-perm-footer {
            padding: 0 20px 8px;
        }
        .sbr-perm-actions {
            display: flex; gap: 10px; margin-bottom: 8px;
        }
        .sbr-perm-btn {
            flex: 1; padding: 15px; border-radius: 14px;
            border: none; font-size: 15px; font-weight: 600;
            cursor: pointer; transition: all 0.15s; font-family: inherit;
        }
        .sbr-perm-btn:active { transform: scale(0.97); }
        .sbr-perm-btn-cancel {
            background: #1e1e1e; color: #777;
            border: 1px solid #2a2a2a;
        }
        .sbr-perm-btn-connect {
            background: #00ff88; color: #000;
        }
        .sbr-perm-disclaimer {
            font-size: 11px; color: #333; text-align: center; line-height: 1.5;
        }
    `;

    function _injectPermCSS() {
        if (document.getElementById("sbr-perm-css")) return;
        const s = document.createElement("style");
        s.id    = "sbr-perm-css";
        s.textContent = PERM_CSS;
        document.head.appendChild(s);
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // STATE
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let _selectedAccountIndex = 0;

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // HELPER
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function _getSiteInfo(origin) {
        try {
            const url  = new URL(origin);
            const host = url.hostname;
            return {
                name:    host.replace("www.", ""),
                url:     host,
                origin,
                favicon: `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
                trusted: window.permissionManager?.isTrusted(origin) || false
            };
        } catch {
            return { name: origin, url: origin, origin, favicon: null, trusted: false };
        }
    }

    function _shortAddr(a) {
        if (!a) return "-";
        return a.slice(0, 8) + "..." + a.slice(-6);
    }

    function _getAccounts() {
        const sess = window.SESSION;
        if (!sess?.unlocked) return [];
        return sess.accounts || [];
    }

    function _removeSheet() {
        document.getElementById("sbr-perm-overlay")?.remove();
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // RENDER WALLET LIST
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function _renderWalletList(accounts) {
        return accounts.map((acc, i) => `
            <div class="sbr-wallet-item ${i === _selectedAccountIndex ? "selected" : ""}"
                onclick="window._sbrPermSelectAccount(${i})">
                <div class="sbr-wallet-check ${i === _selectedAccountIndex ? "checked" : ""}">
                    ${i === _selectedAccountIndex ? "âœ“" : ""}
                </div>
                <div style="flex:1">
                    <div class="sbr-wallet-name">${acc.name || "Account " + (i+1)}</div>
                    <div class="sbr-wallet-addr">${_shortAddr(acc.address)}</div>
                </div>
                <div class="sbr-wallet-bal" id="sbrBal_${i}">...</div>
            </div>
        `).join("");
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // MAIN: SHOW BROWSER PERMISSION POPUP
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    window.showBrowserPermission = function (origin, onApprove, onReject) {
        _injectPermCSS();
        _removeSheet();

        const site     = _getSiteInfo(origin);
        const accounts = _getAccounts();

        if (!accounts.length) {
            showToast?.("Wallet terkunci. Unlock dulu.", "error");
            if (typeof window.showPINUnlockScreen === "function") {
                window._pendingConnectOrigin = origin;
                window.showPINUnlockScreen();
            }
            onReject?.(new Error("Wallet locked"));
            return;
        }

        _selectedAccountIndex = window.SESSION?.accountIndex || 0;

        const overlay  = document.createElement("div");
        overlay.id     = "sbr-perm-overlay";
        overlay.onclick = (e) => {
            if (e.target === overlay) _onPermReject(onReject);
        };

        overlay.innerHTML = `
            <div id="sbr-perm-sheet">
                <div class="sbr-perm-pill"></div>

                <div class="sbr-perm-header">
                    <div class="sbr-perm-site-row">
                        <div class="sbr-perm-icon">
                            ${site.favicon
                                ? `<img src="${site.favicon}" onerror="this.style.display='none'">`
                                : "ðŸŒ"}
                        </div>
                        <div>
                            <div class="sbr-perm-site-name">${site.name}</div>
                            <div class="sbr-perm-site-url">${site.url}</div>
                        </div>
                    </div>

                    <div class="sbr-perm-title">Hubungkan Wallet</div>
                    <div class="sbr-perm-subtitle">Pilih akun yang ingin dihubungkan</div>
                </div>

                <div class="sbr-perm-body">
                    ${site.trusted ? `
                        <div class="sbr-perm-trusted-badge">
                            âœ“ Sidra Official â€” Situs tepercaya
                        </div>
                    ` : ""}

                    <div class="sbr-perm-section-title">Pilih Akun</div>
                    <div class="sbr-wallet-select" id="sbrWalletList">
                        ${_renderWalletList(accounts)}
                    </div>

                    <div class="sbr-perm-section-title">Izin yang Diberikan</div>
                    <div class="sbr-perm-grant-list">
                        <div class="sbr-perm-grant-item">
                            <span class="sbr-perm-grant-icon" style="color:#00ff88">âœ“</span>
                            Melihat alamat & saldo wallet
                        </div>
                        <div class="sbr-perm-grant-item">
                            <span class="sbr-perm-grant-icon" style="color:#00ff88">âœ“</span>
                            Mengirim request transaksi (perlu konfirmasi)
                        </div>
                        <div class="sbr-perm-grant-item">
                            <span class="sbr-perm-grant-icon" style="color:#ff6b6b">âœ—</span>
                            Tidak dapat memindahkan aset tanpa konfirmasi
                        </div>
                        <div class="sbr-perm-grant-item">
                            <span class="sbr-perm-grant-icon" style="color:#ff6b6b">âœ—</span>
                            Tidak dapat mengakses private key
                        </div>
                    </div>
                </div>

                <div class="sbr-perm-footer">
                    <div class="sbr-perm-actions">
                        <button class="sbr-perm-btn sbr-perm-btn-cancel"
                            onclick="window._onPermReject()">
                            Tolak
                        </button>
                        <button class="sbr-perm-btn sbr-perm-btn-connect"
                            onclick="window._onPermApprove('${origin}')">
                            Hubungkan
                        </button>
                    </div>
                    <div class="sbr-perm-disclaimer">
                        Hanya hubungkan ke situs yang kamu percaya
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Simpan callback
        window._sbrPermApproveCallback = onApprove;
        window._sbrPermRejectCallback  = onReject;

        // Load saldo per akun
        _loadAccountBalances(accounts);
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // SELECT ACCOUNT
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    window._sbrPermSelectAccount = function (index) {
        _selectedAccountIndex = index;
        const accounts = _getAccounts();
        const list     = document.getElementById("sbrWalletList");
        if (list) list.innerHTML = _renderWalletList(accounts);
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // APPROVE / REJECT
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    window._onPermApprove = async function (origin) {
        _removeSheet();

        const accounts = _getAccounts();
        const account  = accounts[_selectedAccountIndex] || accounts[0];
        if (!account?.address) {
            showToast?.("Akun tidak valid", "error");
            return;
        }

        // Switch ke account yang dipilih jika beda
        if (_selectedAccountIndex !== window.SESSION?.accountIndex) {
            await window.switchSessionAccount?.(_selectedAccountIndex);
        }

        // Grant permission
        window.permissionManager?.grantPermission(origin, null, [account.address]);

        // Notify provider
        window._providerOnConnect?.(account.address);

        // Notify dApp via bridge
        window.browserBridge?.broadcastEvent("accountsChanged", [account.address]);
        window.browserBridge?.broadcastEvent("connect", { chainId: "0x" + (9700).toString(16) });

        // Update dApp connection manager
        window.dappConnectionManager?.setActiveConnection(origin, account.address);

        showToast?.(`Terhubung ke ${new URL(origin).hostname}`, "success");

        // Callback
        window._sbrPermApproveCallback?.(account.address);
        window._sbrPermApproveCallback = null;
        window._sbrPermRejectCallback  = null;

        // Juga resolve _providerResolve jika ada pending request
        if (typeof window._providerResolve === "function") {
            window._providerResolve([account.address]);
            window._providerResolve = null;
            window._providerReject  = null;
        }
    };

    window._onPermReject = function (cb) {
        _removeSheet();
        const err  = new Error("User rejected the request.");
        err.code   = 4001;

        const callback = cb || window._sbrPermRejectCallback;
        callback?.(err);

        window._sbrPermApproveCallback = null;
        window._sbrPermRejectCallback  = null;

        if (typeof window._providerReject === "function") {
            window._providerReject(err);
            window._providerResolve = null;
            window._providerReject  = null;
        }
    };

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // LOAD BALANCE PER AKUN (async, update UI)
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async function _loadAccountBalances(accounts) {
        const prov = window.provider;
        if (!prov) return;

        for (let i = 0; i < accounts.length; i++) {
            const acc = accounts[i];
            if (!acc?.address) continue;

            try {
                const bal = await prov.getBalance(acc.address);
                const fmt = parseFloat(ethers.utils.formatEther(bal)).toFixed(3);
                const el  = document.getElementById("sbrBal_" + i);
                if (el) el.textContent = fmt + " SDA";
            } catch {
                const el = document.getElementById("sbrBal_" + i);
                if (el) el.textContent = "â€”";
            }
        }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // OVERRIDE openConnectModal saat browser aktif
    // Gunakan showBrowserPermission sebagai gantinya
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const _originalOpenConnectModal = window.openConnectModal;

    window.openConnectModal = function (origin) {
        // Jika browser sedang aktif, pakai browser permission UI
        if (window.sidraBrowser?.isVisible()) {
            window.showBrowserPermission(
                origin,
                (address) => window._providerOnConnect?.(address),
                (err)     => window._providerReject?.(err)
            );
            return;
        }
        // Fallback ke original connect-modal.js
        _originalOpenConnectModal?.(origin);
    };

})();