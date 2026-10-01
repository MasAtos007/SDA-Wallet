// =====================================
// CONNECT-MODAL.JS
// UI Popup untuk:
// 1. Connect Wallet request (eth_requestAccounts)
// 2. Sign Message request (personal_sign, eth_sign)
// 3. Send Transaction confirmation (eth_sendTransaction)
// =====================================
//
// Inject HTML modal ke body secara dinamis.
// Mobile-first, dark theme, SidraChain branding.
// =====================================

(function () {
    "use strict";

    // ─────────────────────────────────────────
    // CSS MODAL
    // ─────────────────────────────────────────
    const MODAL_CSS = `
        #sidra-modal-overlay {
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.75);
            z-index: 99999;
            display: flex; align-items: flex-end;
            justify-content: center;
            padding: 0;
            backdrop-filter: blur(4px);
            animation: sidraFadeIn 0.2s ease;
        }
        @keyframes sidraFadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
        }
        #sidra-modal-box {
            background: #121212;
            border-radius: 20px 20px 0 0;
            width: 100%;
            max-width: 480px;
            padding: 0 0 env(safe-area-inset-bottom, 16px);
            border-top: 1px solid #2a2a2a;
            animation: sidraSlideUp 0.25s cubic-bezier(0.34,1.2,0.64,1);
        }
        @keyframes sidraSlideUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
        }
        .sidra-modal-handle {
            width: 40px; height: 4px;
            background: #333; border-radius: 4px;
            margin: 12px auto 0;
        }
        .sidra-modal-header {
            padding: 16px 20px 12px;
            border-bottom: 1px solid #1e1e1e;
        }
        .sidra-modal-site {
            display: flex; align-items: center; gap: 10px;
            margin-bottom: 8px;
        }
        .sidra-modal-site-icon {
            width: 36px; height: 36px;
            border-radius: 8px;
            background: #1e1e1e;
            display: flex; align-items: center; justify-content: center;
            font-size: 18px; color: #00ff88;
            border: 1px solid #2a2a2a;
            overflow: hidden;
        }
        .sidra-modal-site-icon img { width: 100%; height: 100%; object-fit: cover; }
        .sidra-modal-site-name {
            font-size: 13px; font-weight: 600;
            color: #fff; font-family: inherit;
        }
        .sidra-modal-site-url {
            font-size: 11px; color: #666; font-family: inherit;
        }
        .sidra-modal-title {
            font-size: 18px; font-weight: 700;
            color: #fff; line-height: 1.3; font-family: inherit;
        }
        .sidra-modal-body {
            padding: 16px 20px;
        }
        .sidra-modal-desc {
            font-size: 13px; color: #888;
            line-height: 1.6; font-family: inherit; margin-bottom: 14px;
        }
        .sidra-account-card {
            background: #1a1a1a; border-radius: 12px;
            padding: 12px 14px;
            border: 1px solid #2a2a2a;
            display: flex; align-items: center; gap: 10px;
            margin-bottom: 12px;
        }
        .sidra-account-dot {
            width: 10px; height: 10px; border-radius: 50%;
            background: #00ff88; flex-shrink: 0;
        }
        .sidra-account-info { flex: 1; }
        .sidra-account-name {
            font-size: 13px; font-weight: 600; color: #fff;
            font-family: inherit;
        }
        .sidra-account-addr {
            font-size: 11px; color: #666;
            font-family: monospace;
        }
        .sidra-permission-list {
            background: #1a1a1a; border-radius: 12px;
            padding: 10px 14px;
            border: 1px solid #2a2a2a;
            margin-bottom: 12px;
        }
        .sidra-permission-item {
            display: flex; align-items: center; gap: 8px;
            padding: 6px 0;
            font-size: 12px; color: #aaa;
            font-family: inherit;
            border-bottom: 1px solid #222;
        }
        .sidra-permission-item:last-child { border-bottom: none; }
        .sidra-permission-icon { color: #00ff88; font-size: 13px; width: 16px; }
        .sidra-sign-box {
            background: #0d0d0d; border-radius: 10px;
            padding: 12px 14px;
            border: 1px solid #1e1e1e;
            margin-bottom: 12px;
            max-height: 120px; overflow-y: auto;
        }
        .sidra-sign-label {
            font-size: 11px; color: #555; margin-bottom: 6px;
            text-transform: uppercase; letter-spacing: 0.5px;
            font-family: inherit;
        }
        .sidra-sign-text {
            font-size: 12px; color: #ccc;
            font-family: monospace; word-break: break-all;
            white-space: pre-wrap; line-height: 1.5;
        }
        .sidra-warning-box {
            background: rgba(255,170,0,0.08);
            border: 1px solid rgba(255,170,0,0.2);
            border-radius: 10px; padding: 10px 14px;
            font-size: 12px; color: #ffaa00;
            display: flex; align-items: flex-start; gap: 8px;
            margin-bottom: 12px; font-family: inherit;
        }
        .sidra-modal-actions {
            display: flex; gap: 10px;
            padding: 0 20px 16px;
        }
        .sidra-btn {
            flex: 1; padding: 14px;
            border-radius: 12px; border: none;
            font-size: 15px; font-weight: 600;
            cursor: pointer; font-family: inherit;
            transition: all 0.15s;
        }
        .sidra-btn:active { transform: scale(0.97); }
        .sidra-btn-cancel {
            background: #1e1e1e; color: #888;
            border: 1px solid #2a2a2a;
        }
        .sidra-btn-approve {
            background: #00ff88; color: #000;
        }
        .sidra-btn-approve:disabled {
            background: #1a3a2a; color: #2a6a4a; cursor: not-allowed;
        }
        .sidra-badge-trusted {
            display: inline-flex; align-items: center; gap: 4px;
            background: rgba(0,255,136,0.08);
            border: 1px solid rgba(0,255,136,0.2);
            border-radius: 20px; padding: 2px 8px;
            font-size: 10px; color: #00ff88; font-family: inherit;
        }
        .sidra-tx-detail {
            background: #1a1a1a; border-radius: 12px;
            border: 1px solid #2a2a2a; overflow: hidden;
            margin-bottom: 12px;
        }
        .sidra-tx-row {
            display: flex; justify-content: space-between;
            align-items: center; padding: 10px 14px;
            border-bottom: 1px solid #1e1e1e;
            font-family: inherit;
        }
        .sidra-tx-row:last-child { border-bottom: none; }
        .sidra-tx-key { font-size: 12px; color: #666; }
        .sidra-tx-val { font-size: 12px; color: #ccc; font-family: monospace; }
        .sidra-wallet-chip {
            display: inline-flex; align-items: center; gap: 6px;
            background: #1a1a1a; border: 1px solid #2a2a2a;
            border-radius: 20px; padding: 3px 10px 3px 4px;
            font-size: 11px; color: #ddd; font-family: inherit;
            margin-bottom: 10px;
        }
    `;

    // ─────────────────────────────────────────
    // INJECT CSS
    // ─────────────────────────────────────────
    function _injectCSS() {
        if (document.getElementById("sidra-modal-css")) return;
        const style = document.createElement("style");
        style.id = "sidra-modal-css";
        style.textContent = MODAL_CSS;
        document.head.appendChild(style);
    }

    // ─────────────────────────────────────────
    // IDENTITAS WALLET (satu sumber kebenaran)
    // ─────────────────────────────────────────
    const WALLET_NAME = "Sidra Wallet";
    const WALLET_LOGO = "img/logo.png";
    // Fallback inline (SVG data URI) kalau img/logo.png gagal dimuat
    const WALLET_LOGO_FALLBACK =
        "data:image/svg+xml;utf8," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">' +
        '<rect width="64" height="64" rx="14" fill="#1a1a1a"/>' +
        '<path d="M16 24h32a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H16a4 4 0 0 1-4-4V28a4 4 0 0 1 4-4zm0 0V20a4 4 0 0 1 4-4h24" ' +
        'fill="none" stroke="#ff7a00" stroke-width="3" stroke-linecap="round"/>' +
        '<circle cx="42" cy="36" r="3" fill="#ff7a00"/></svg>');

    // Dipakai handler onerror: ganti sekali saja (hindari loop error)
    window._sidraLogoFallback = function (img) {
        if (!img || img.dataset.fb) return;
        img.dataset.fb = "1";
        img.src = WALLET_LOGO_FALLBACK;
    };

    function _walletLogoHTML(size) {
        const px = size || 20;
        return `<img src="${WALLET_LOGO}" alt="${WALLET_NAME}" width="${px}" height="${px}"
                     style="border-radius:6px;object-fit:cover;display:block"
                     onerror="window._sidraLogoFallback(this)">`;
    }

    // ─────────────────────────────────────────
    // i18n: pakai LANG[CURRENT_LANG], fallback ke default (id)
    // ─────────────────────────────────────────
    function _t(key, fallback) {
        const L = window.LANG && window.LANG[window.CURRENT_LANG || "id"];
        return (L && L[key]) || fallback;
    }

    // ─────────────────────────────────────────
    // HELPER: buat overlay
    // ─────────────────────────────────────────
    function _createOverlay(innerHTML) {
        _removeOverlay();
        _injectCSS();

        const overlay  = document.createElement("div");
        overlay.id     = "sidra-modal-overlay";
        overlay.innerHTML = `
            <div id="sidra-modal-box">
                <div class="sidra-modal-handle"></div>
                ${innerHTML}
            </div>
        `;

        // Tap outside = reject; tombol connect lewat delegasi (tanpa inline onclick,
        // jadi origin/address tidak pernah di-interpolasi ke atribut JS)
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) { window._onUserReject("connect"); return; }
            const btn = e.target.closest("[data-sidra-action]");
            if (!btn) return;
            if (btn.dataset.sidraAction === "approve-connect") {
                window._onUserApproveConnect(btn.dataset.origin, btn.dataset.address);
            } else if (btn.dataset.sidraAction === "reject-connect") {
                window._onUserReject("connect");
            }
        });

        document.body.appendChild(overlay);
        return overlay;
    }

    function _removeOverlay() {
        document.getElementById("sidra-modal-overlay")?.remove();
    }

    // ─────────────────────────────────────────
    // HELPER: site info
    // ─────────────────────────────────────────
    function _getSiteDisplay(origin) {
        try {
            const url  = new URL(origin);
            const name = url.hostname.replace("www.", "");
            const icon = `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
            return { name, url: url.hostname, icon };
        } catch {
            return { name: origin, url: origin, icon: null };
        }
    }

    function _shortAddr(addr) {
        if (!addr) return "-";
        return addr.slice(0, 8) + "..." + addr.slice(-6);
    }

    // ─────────────────────────────────────────
    // HELPER: decode message
    // ─────────────────────────────────────────
    function _decodeMessage(msg) {
        if (!msg) return "(pesan kosong)";
        try {
            if (msg.startsWith("0x")) {
                const hex   = msg.slice(2);
                const bytes = new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
                return new TextDecoder().decode(bytes);
            }
        } catch {}
        return msg;
    }

    // ─────────────────────────────────────────
    // 1. CONNECT MODAL
    // Dipanggil oleh eth_requestAccounts
    // ─────────────────────────────────────────
    window.openConnectModal = function (origin) {

        // Kalau wallet belum unlock, minta PIN dulu
        if (!window.SESSION?.unlocked) {
            // Simpan pending request
            window._pendingConnectOrigin = origin;

            if (typeof window.showPINUnlockScreen === "function") {
                window.showPINUnlockScreen();
                showToast?.("Unlock wallet untuk lanjut ke Connect", "info");
            }
            return;
        }

        const site    = _getSiteDisplay(origin);
        const address = window.SESSION.address || "-";
        const accName = window.SESSION.accounts?.[window.SESSION.accountIndex]?.name || "Account 1";
        const trusted = window.permissionManager?.isTrusted(origin);

        _createOverlay(`
            <div class="sidra-modal-header">
                <div class="sidra-wallet-chip">
                    ${_walletLogoHTML(20)}<span>${WALLET_NAME}</span>
                </div>
                <div class="sidra-modal-site">
                    <div class="sidra-modal-site-icon">
                        ${site.icon
                            ? `<img src="${_escapeHtml(site.icon)}" onerror="this.style.display='none'">`
                            : "🌐"}
                    </div>
                    <div>
                        <div class="sidra-modal-site-name">${_escapeHtml(site.name)}</div>
                        <div class="sidra-modal-site-url">${_escapeHtml(site.url)}</div>
                    </div>
                    ${trusted ? `<span class="sidra-badge-trusted">✓ ${_t("connect_official_badge", "Sidra Official")}</span>` : ""}
                </div>
                <div class="sidra-modal-title">${_t("connect_title", "Hubungkan Wallet?")}</div>
            </div>

            <div class="sidra-modal-body">
                <p class="sidra-modal-desc">
                    <strong style="color:#fff">${_escapeHtml(site.name)}</strong> ${_t("connect_wants_access", "ingin mengakses wallet kamu.")}
                </p>

                <div class="sidra-account-card">
                    <div class="sidra-account-dot"></div>
                    <div class="sidra-account-info">
                        <div class="sidra-account-name">${_escapeHtml(accName)}</div>
                        <div class="sidra-account-addr">${_shortAddr(address)}</div>
                    </div>
                    <span style="font-size:11px;color:#555;">SidraChain</span>
                </div>

                <div class="sidra-permission-list">
                    <div class="sidra-permission-item">
                        <span class="sidra-permission-icon">✓</span>
                        ${_t("connect_perm_address", "Melihat alamat wallet kamu")}
                    </div>
                    <div class="sidra-permission-item">
                        <span class="sidra-permission-icon">✓</span>
                        ${_t("connect_perm_balance", "Melihat saldo token di SidraChain")}
                    </div>
                    <div class="sidra-permission-item">
                        <span class="sidra-permission-icon" style="color:#ff6b6b">✗</span>
                        ${_t("connect_perm_noconfirm", "Tidak bisa memindahkan aset tanpa konfirmasi")}
                    </div>
                </div>

                ${trusted ? "" : `<div class="sidra-warning-box">⚠️ ${_t("dapp_warning", "Jangan hubungkan wallet Anda ke dApp di luar ekosistem resmi. Risiko keamanan dan kehilangan aset sepenuhnya ditanggung sendiri oleh pengguna.")}</div>`}
            </div>

            <div class="sidra-modal-actions">
                <button class="sidra-btn sidra-btn-cancel" data-sidra-action="reject-connect">
                    ${_t("connect_reject", "Tolak")}
                </button>
                <button class="sidra-btn sidra-btn-approve" data-sidra-action="approve-connect"
                        data-origin="${_escapeHtml(origin)}" data-address="${_escapeHtml(address)}">
                    ${_t("connect_approve", "Hubungkan")}
                </button>
            </div>
        `);
    };

    // ─────────────────────────────────────────
    // 2. SIGN MODAL
    // Dipanggil oleh personal_sign, eth_sign
    // ─────────────────────────────────────────
    window.openSignModal = function ({ method, params, origin }) {

        const site    = _getSiteDisplay(origin);
        let   message = "";
        let   address = window.SESSION.address || "-";

        if (method === "personal_sign") {
            message = _decodeMessage(params[0]);
        } else if (method === "eth_sign") {
            message = params[1] || params[0] || "";
        } else {
            // eth_signTypedData
            try {
                const data = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
                message    = JSON.stringify(data, null, 2).slice(0, 500);
            } catch {
                message = String(params[1]).slice(0, 500);
            }
        }

        _createOverlay(`
            <div class="sidra-modal-header">
                <div class="sidra-modal-site">
                    <div class="sidra-modal-site-icon">
                        ${site.icon ? `<img src="${site.icon}" onerror="this.style.display='none'">` : "✍️"}
                    </div>
                    <div>
                        <div class="sidra-modal-site-name">${site.name}</div>
                        <div class="sidra-modal-site-url">${site.url}</div>
                    </div>
                </div>
                <div class="sidra-modal-title">Tanda Tangani Pesan</div>
            </div>

            <div class="sidra-modal-body">
                <p class="sidra-modal-desc">
                    <strong style="color:#fff">${site.name}</strong> meminta tanda tangan dari
                    <span style="color:#00ff88">${_shortAddr(address)}</span>
                </p>

                <div class="sidra-sign-box">
                    <div class="sidra-sign-label">Pesan</div>
                    <div class="sidra-sign-text">${_escapeHtml(message)}</div>
                </div>

                <div class="sidra-warning-box">
                    ⚠️ Tanda tangan tidak memindahkan aset. Hanya lanjutkan jika kamu percaya situs ini.
                </div>
            </div>

            <div class="sidra-modal-actions">
                <button class="sidra-btn sidra-btn-cancel" onclick="window._onUserReject('sign')">
                    Tolak
                </button>
                <button class="sidra-btn sidra-btn-approve" onclick="window._onUserApproveSign('${method}', ${JSON.stringify(JSON.stringify(params))})">
                    Tanda Tangani
                </button>
            </div>
        `);
    };

    // ─────────────────────────────────────────
    // 3. TX MODAL
    // Dipanggil oleh eth_sendTransaction
    // ─────────────────────────────────────────
    window.openTxModal = function ({ txParams, origin }) {

        const site = _getSiteDisplay(origin);
        const to   = txParams.to   || "-";
        const value = txParams.value
            ? parseFloat(ethers.utils.formatEther(txParams.value)).toFixed(6) + " SDA"
            : "0 SDA";
        const gasLimit = txParams.gas || txParams.gasLimit || "auto";

        _createOverlay(`
            <div class="sidra-modal-header">
                <div class="sidra-modal-site">
                    <div class="sidra-modal-site-icon">
                        ${site.icon ? `<img src="${site.icon}" onerror="this.style.display='none'">` : "📤"}
                    </div>
                    <div>
                        <div class="sidra-modal-site-name">${site.name}</div>
                        <div class="sidra-modal-site-url">${site.url}</div>
                    </div>
                </div>
                <div class="sidra-modal-title">Konfirmasi Transaksi</div>
            </div>

            <div class="sidra-modal-body">
                <div class="sidra-tx-detail">
                    <div class="sidra-tx-row">
                        <span class="sidra-tx-key">Dari</span>
                        <span class="sidra-tx-val">${_shortAddr(window.SESSION.address)}</span>
                    </div>
                    <div class="sidra-tx-row">
                        <span class="sidra-tx-key">Ke</span>
                        <span class="sidra-tx-val">${_shortAddr(to)}</span>
                    </div>
                    <div class="sidra-tx-row">
                        <span class="sidra-tx-key">Nilai</span>
                        <span class="sidra-tx-val" style="color:#00ff88">${value}</span>
                    </div>
                    <div class="sidra-tx-row">
                        <span class="sidra-tx-key">Gas Limit</span>
                        <span class="sidra-tx-val">${gasLimit}</span>
                    </div>
                    <div class="sidra-tx-row">
                        <span class="sidra-tx-key">Network</span>
                        <span class="sidra-tx-val">SidraChain</span>
                    </div>
                </div>

                <div class="sidra-warning-box">
                    ⚠️ Transaksi ini tidak bisa dibatalkan setelah dikirim.
                </div>
            </div>

            <div class="sidra-modal-actions">
                <button class="sidra-btn sidra-btn-cancel" onclick="window._onUserReject('tx')">
                    Tolak
                </button>
                <button class="sidra-btn sidra-btn-approve" onclick="window._onUserApproveTx(${JSON.stringify(JSON.stringify(txParams))})">
                    Kirim
                </button>
            </div>
        `);
    };

    // ─────────────────────────────────────────
    // APPROVE HANDLERS
    // ─────────────────────────────────────────

    window._onUserApproveConnect = function (origin, address) {
        _removeOverlay();

        // 1) izin (permission-manager) — dipakai provider untuk eth_accounts
        window.permissionManager?.grantPermission(origin, null, [address]);

        // 2) koneksi aktif persisten (dapp-connection-manager → CONN_STORAGE_KEY).
        //    Inilah yang ditampilkan di Settings & bisa di-disconnect.
        try {
            if (window.dappConnectionManager?.setActiveConnection) {
                window.dappConnectionManager.setActiveConnection(origin, address);
            } else {
                console.warn("[SidraWallet] dappConnectionManager belum dimuat; koneksi tidak tercatat di Settings");
            }
        } catch (e) {
            console.error("[SidraWallet] setActiveConnection gagal:", e);
        }

        // 3) resolve promise provider + broadcast event ke dApp
        window._providerOnConnect?.(address);

        // 4) refresh daftar di Settings kalau sedang terbuka
        window._refreshConnectedLists?.();

        showToast?.(_t("toast_wallet_connected", "Wallet terhubung ✓"), "success");
    };

    window._onUserApproveSign = async function (method, paramsJson) {
        _removeOverlay();

        try {
            const params  = JSON.parse(paramsJson);
            const signer  = window.SESSION.signer;
            if (!signer) throw new Error("Wallet tidak aktif");

            let signature;

            if (method === "personal_sign") {
                // params[0] = message (hex atau plain)
                const msg = _decodeMessage(params[0]);
                signature = await signer.signMessage(msg);

            } else if (method === "eth_sign") {
                // eth_sign: sign raw hash — BERBAHAYA, tapi dibutuhkan untuk compatibility
                const msgHash = params[1] || params[0];
                const msgBytes = ethers.utils.arrayify(msgHash);
                signature = await signer.signMessage(msgBytes);

            } else if (method.includes("signTypedData")) {
                // EIP-712
                try {
                    const typedData = typeof params[1] === "string"
                        ? JSON.parse(params[1])
                        : params[1];
                    const { domain, types, message } = typedData;
                    // Hapus EIP712Domain dari types (ethers tidak butuh ini)
                    const cleanTypes = { ...types };
                    delete cleanTypes.EIP712Domain;
                    signature = await signer._signTypedData(domain, cleanTypes, message);
                } catch (e) {
                    throw new Error("signTypedData error: " + e.message);
                }
            }

            if (typeof window._signResolve === "function") {
                window._signResolve(signature);
                window._signResolve = null;
                window._signReject  = null;
            }

            showToast?.("Pesan berhasil ditandatangani ✓", "success");

        } catch (e) {
            console.error("Sign error:", e);
            if (typeof window._signReject === "function") {
                window._signReject(new Error(e.message));
                window._signResolve = null;
                window._signReject  = null;
            }
            showToast?.("Sign gagal: " + e.message, "error");
        }
    };

    window._onUserApproveTx = async function (txParamsJson) {
        _removeOverlay();

        try {
            const txParams = JSON.parse(txParamsJson);
            const signer   = window.SESSION.signer;
            if (!signer) throw new Error("Wallet tidak aktif");

            // Pastikan value adalah BigNumber
            if (txParams.value && typeof txParams.value === "string") {
                txParams.value = ethers.BigNumber.from(txParams.value);
            }

            // Hapus field yang tidak dikenal ethers.js
            const cleanTx = {
                to:       txParams.to,
                value:    txParams.value || ethers.constants.Zero,
                data:     txParams.data  || "0x",
                gasLimit: txParams.gas   || txParams.gasLimit,
                gasPrice: txParams.gasPrice,
                nonce:    txParams.nonce
            };

            // Hapus undefined
            Object.keys(cleanTx).forEach(k => {
                if (cleanTx[k] === undefined) delete cleanTx[k];
            });

            const tx = await signer.sendTransaction(cleanTx);

            if (typeof window._txResolve === "function") {
                window._txResolve(tx.hash);
                window._txResolve = null;
                window._txReject  = null;
            }

            showToast?.("Transaksi berhasil: " + tx.hash.slice(0, 10) + "...", "success");

            // Simpan ke history
            if (typeof window.saveTxToHistory === "function") {
                saveTxToHistory(tx.hash, txParams.value || "0",
                    { symbol: "SDA", logo: "img/sda.png", address: null });
            }

        } catch (e) {
            console.error("TX error:", e);
            if (typeof window._txReject === "function") {
                window._txReject(new Error(e.message));
                window._txResolve = null;
                window._txReject  = null;
            }
            showToast?.("TX gagal: " + (e.reason || e.message), "error");
        }
    };

    // ─────────────────────────────────────────
    // REJECT HANDLER
    // ─────────────────────────────────────────
    window._onUserReject = function (type) {
        _removeOverlay();

        const err = new Error("User rejected the request.");
        err.code  = 4001;

        if (type === "connect") {
            if (typeof window._providerReject === "function") {
                window._providerReject(err);
                window._providerResolve = null;
                window._providerReject  = null;
            }
        } else if (type === "sign") {
            if (typeof window._signReject === "function") {
                window._signReject(err);
                window._signResolve = null;
                window._signReject  = null;
            }
        } else if (type === "tx") {
            if (typeof window._txReject === "function") {
                window._txReject(err);
                window._txResolve = null;
                window._txReject  = null;
            }
        }
    };

    // ─────────────────────────────────────────
    // HELPER: escape HTML untuk keamanan
    // ─────────────────────────────────────────
    function _escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // ─────────────────────────────────────────
    // PENDING CONNECT: lanjutkan setelah PIN unlock
    // Dipanggil dari wallet-session.js setelah unlock berhasil
    // ─────────────────────────────────────────
    window._resumePendingConnect = function () {
        const origin = window._pendingConnectOrigin;
        if (origin) {
            window._pendingConnectOrigin = null;
            setTimeout(() => window.openConnectModal?.(origin), 300);
        }
    };

    // ─────────────────────────────────────────
    // DAFTAR SITUS TERHUBUNG (Settings)
    // Sumber utama: dappConnectionManager.renderConnectedList(containerId).
    // Fallback: render dari permissionManager. Tombol "Cabut" memakai
    // delegasi event (1 listener per container) dan origin lewat data-attribute.
    // ─────────────────────────────────────────
    const _containers = new Set();

    window._refreshConnectedLists = function () {
        _containers.forEach(id => window.renderConnectedSites(id));
    };

    function _bindRevoke(el, containerId) {
        if (el.dataset.revokeBound) return;           // cegah listener ganda
        el.dataset.revokeBound = "1";
        el.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-revoke-origin]");
            if (btn) window._revokeAndRefresh(btn.dataset.revokeOrigin, containerId);
        });
    }

    window.renderConnectedSites = function (containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        _containers.add(containerId);

        // Pakai renderer manager kalau ada
        if (typeof window.dappConnectionManager?.renderConnectedList === "function") {
            window.dappConnectionManager.renderConnectedList(containerId);
            return;
        }

        const sites = window.permissionManager?.getAll() || [];
        if (!sites.length) {
            el.innerHTML = `<p style="color:#555;font-size:13px;text-align:center;padding:20px 0">
                ${_t("conn_empty", "Belum ada situs yang terhubung")}</p>`;
            return;
        }

        const locale = ({ id: "id-ID", en: "en-US", ar: "ar" })[window.CURRENT_LANG] || "id-ID";
        el.innerHTML = sites.map(site => `
            <div style="display:flex;align-items:center;justify-content:space-between;
                        padding:12px 0;border-bottom:1px solid #1e1e1e;">
                <div>
                    <div style="font-size:13px;color:#fff;font-weight:600">${_escapeHtml(site.name)}</div>
                    <div style="font-size:11px;color:#555">${_escapeHtml(site.origin)}</div>
                    <div style="font-size:11px;color:#444;margin-top:2px">
                        ${new Date(site.grantedAt).toLocaleDateString(locale)}
                    </div>
                </div>
                <button data-revoke-origin="${_escapeHtml(site.origin)}"
                    style="background:#1e1e1e;border:1px solid #2a2a2a;color:#ff6b6b;
                           padding:6px 12px;border-radius:8px;font-size:12px;cursor:pointer">
                    ${_t("conn_disconnect", "Cabut")}
                </button>
            </div>
        `).join("");
        _bindRevoke(el, containerId);
    };

    window._revokeAndRefresh = function (origin, containerId) {
        // Hapus di KEDUA store supaya izin benar-benar hilang
        try { window.dappConnectionManager?.disconnect?.(origin); } catch (e) { console.error(e); }
        window.permissionManager?.revokePermission(origin);
        window._providerOnDisconnect?.();
        window.renderConnectedSites?.(containerId);
        showToast?.(_t("toast_permission_revoked", "Izin dicabut"), "info");
    };

})();
