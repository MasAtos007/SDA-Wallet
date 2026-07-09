// =====================================
// SIDRA-BROWSER-V2.JS â€” FIXED
// dApp Browser dengan iframe architecture
// Fix: encoding, iframe load, FA icons, layout
// =====================================

(function () {
    "use strict";

    const BROWSER_STORAGE_KEY = "sidra_browser_v2";
    const MAX_HISTORY         = 50;

    const SIDRA_URLS = [
    "https://www.sidrachain.com",
    "https://sidrachain.com",
    "https://dex.sidrachain.com",
    "https://app.sidrachain.com",
    "https://kycport.com"
];

const NO_IFRAME_SITES = [
    "sidrachain.com",
    "www.sidrachain.com",
    "dex.sidrachain.com",
    "app.sidrachain.com",
    "kycport.com"
];

    const _state = {
        activeFrameId:  null,
        frames:         {},
        navHistory:     [],
        navIndex:       -1,
        isLoading:      false,
        browserVisible: false
    };

    let _frameCounter = 0;

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CSS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function _injectCSS() {
        if (document.getElementById("sbr-v2-css")) return;
        const s = document.createElement("style");
        s.id = "sbr-v2-css";
        s.textContent = `
            #sidraBrowserShell {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                background: #0d0d0d;
                display: flex;
                flex-direction: column;
                z-index: 9000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            #sbrToolbar {
                background: #111;
                border-bottom: 1px solid #1e1e1e;
                padding: 10px 12px 8px;
                flex-shrink: 0;
            }
            #sbrTopRow {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 8px;
            }
            .sbr-nav-btn {
                background: #1a1a1a;
                border: 1px solid #2a2a2a;
                color: #555;
                width: 34px; height: 34px;
                border-radius: 8px;
                font-size: 15px;
                cursor: pointer;
                display: flex; align-items: center; justify-content: center;
                flex-shrink: 0;
                transition: all 0.15s;
            }
            .sbr-nav-btn.active { color: #fff; }
            .sbr-nav-btn:active { background: #222; transform: scale(0.95); }
            #sbrConnStatus {
                font-size: 10px;
                padding: 4px 8px;
                border-radius: 20px;
                background: #1a1a1a;
                border: 1px solid #2a2a2a;
                color: #555;
                white-space: nowrap;
            }
            #sbrUrlRow {
    display: flex;
    align-items: center;
    gap: 4px;
}
            #sbrUrlBar {
    flex: 1 1 auto;
    min-width: 0;
                background: #1a1a1a;
                border: 1px solid #2a2a2a;
                border-radius: 10px;
                padding: 10px 12px;
                color: #fff;
                font-size: 14px;
                outline: none;
                font-family: inherit;
            }
            #sbrUrlBar:focus { border-color: #00ff88; }
            #sbrGoBtn {
    background: #00ff88;
    color: #000;
    border: none;
    border-radius: 10px;
    width: 56px;
    height: 42px;
    padding: 0;
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
                flex-shrink: 0;
            }
            #sbrGoBtn:active { opacity: 0.8; transform: scale(0.96); }
            #sbrLoadBar {
                height: 2px;
                background: #1a1a1a;
                margin-top: 8px;
                border-radius: 2px;
                overflow: hidden;
                display: none;
            }
            #sbrLoadFill {
                height: 100%;
                width: 40%;
                background: linear-gradient(90deg, transparent, #00ff88, transparent);
                animation: sbrScan 1.4s ease-in-out infinite;
            }
            @keyframes sbrScan {
                0%   { transform: translateX(-200%); }
                100% { transform: translateX(500%); }
            }
            #sbrHomePage {
                flex: 1;
                overflow-y: auto;
                padding: 20px 16px;
                display: flex;
                flex-direction: column;
                gap: 0;
            }
            .sbr-section-label {
                font-size: 11px;
                color: #444;
                text-transform: uppercase;
                letter-spacing: 1px;
                margin-bottom: 10px;
            }
            .sbr-quick-link {
                display: flex;
                align-items: center;
                gap: 14px;
                padding: 14px 16px;
                background: #1a1a1a;
                border: 1px solid #222;
                border-radius: 14px;
                margin-bottom: 10px;
                cursor: pointer;
                transition: background 0.15s;
                -webkit-tap-highlight-color: transparent;
            }
            .sbr-quick-link:active { background: #222; }
            .sbr-quick-icon {
                width: 44px; height: 44px;
                border-radius: 11px;
                display: flex; align-items: center; justify-content: center;
                font-size: 20px;
                flex-shrink: 0;
            }
            .sbr-quick-name {
                font-size: 14px;
                font-weight: 600;
                color: #fff;
            }
            .sbr-quick-desc {
                font-size: 12px;
                color: #555;
                margin-top: 2px;
            }
            .sbr-quick-arrow {
                margin-left: auto;
                color: #333;
                font-size: 14px;
            }
            #sbrIframeContainer {
                flex: 1;
                position: relative;
                overflow: hidden;
                display: none;
                background: #fff;
            }
            .sbr-iframe {
                position: absolute;
                top: 0; left: 0;
                width: 100%; height: 100%;
                border: none;
                background: #fff;
            }
            #sbrCloseBtn {
                background: none;
                border: none;
                color: #555;
                font-size: 20px;
                cursor: pointer;
                padding: 4px 6px;
                line-height: 1;
            }
        `;
        document.head.appendChild(s);
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // BUILD UI
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function _buildUI() {
        // Hapus shell lama jika ada
        document.getElementById("sidraBrowserShell")?.remove();

        _injectCSS();

        const shell = document.createElement("div");
        shell.id = "sidraBrowserShell";
        shell.innerHTML = `
            <div id="sbrToolbar">
                <div id="sbrTopRow">
                    <button class="sbr-nav-btn" id="sbrBack"
                        onclick="window.sidraBrowser.goBack()" title="Back">
                        &larr;
                    </button>
                    <button class="sbr-nav-btn" id="sbrFwd"
                        onclick="window.sidraBrowser.goForward()" title="Forward">
                        &rarr;
                    </button>
                    <button class="sbr-nav-btn active" id="sbrReload"
                        onclick="window.sidraBrowser.reload()" title="Reload">
                        &#8635;
                    </button>
                    <div style="flex:1"></div>
                    <div id="sbrConnStatus">&#9679; Tidak terhubung</div>
                    <button id="sbrCloseBtn"
                        onclick="window.sidraBrowser.close()">&#10005;</button>
                </div>
                <div id="sbrUrlRow">
                    <input id="sbrUrlBar" type="url" inputmode="url"
                        placeholder="URL atau cari..."
                        onkeydown="if(event.key==='Enter'){window.sidraBrowser.navigate(this.value);this.blur()}"
                    >
                    <button id="sbrGoBtn"
                        onclick="window.sidraBrowser.navigate(document.getElementById('sbrUrlBar').value)">
                        Go
                    </button>
                </div>
                <div id="sbrLoadBar"><div id="sbrLoadFill"></div></div>
            </div>

            <div id="sbrHomePage">
                <div class="sbr-section-label">Sidra Ecosystem</div>
                <div class="sbr-quick-link"
                    onclick="window.sidraBrowser.navigate('https://www.sidrachain.com')">
                    <div class="sbr-quick-icon" style="background:#0a2a1a">
                        <img src="img/sda.png" style="width:28px;height:28px;border-radius:6px"
                            onerror="this.outerHTML='&#128279;'">
                    </div>
                    <div>
                        <div class="sbr-quick-name">SidraChain</div>
                        <div class="sbr-quick-desc">Ekosistem utama Sidra</div>
                    </div>
                    <span class="sbr-quick-arrow">&#8250;</span>
                </div>
                <div class="sbr-quick-link"
                    onclick="window.sidraBrowser.navigate('https://kycport.com')">
                    <div class="sbr-quick-icon" style="background:#1a1a2a">
                        &#128196;
                    </div>
                    <div>
                        <div class="sbr-quick-name">KYC Port</div>
                        <div class="sbr-quick-desc">Login & verifikasi identitas</div>
                    </div>
                    <span class="sbr-quick-arrow">&#8250;</span>
                </div>
                <div class="sbr-quick-link"
                    onclick="window.sidraBrowser.navigate('https://dex.sidrachain.com')">
                    <div class="sbr-quick-icon" style="background:#1a0a2a">
                        &#128260;
                    </div>
                    <div>
                        <div class="sbr-quick-name">Sidra DEX</div>
                        <div class="sbr-quick-desc">Trade & Swap token</div>
                    </div>
                    <span class="sbr-quick-arrow">&#8250;</span>
                </div>
                <div class="sbr-quick-link"
                    onclick="window.sidraBrowser.navigate('https://app.sidrachain.com')">
                    <div class="sbr-quick-icon" style="background:#2a1a0a">
                        &#128640;
                    </div>
                    <div>
                        <div class="sbr-quick-name">Sidra App</div>
                        <div class="sbr-quick-desc">Fitur lengkap Sidra</div>
                    </div>
                    <span class="sbr-quick-arrow">&#8250;</span>
                </div>
            </div>

            <div id="sbrIframeContainer"></div>
        `;

        document.body.appendChild(shell);
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // NAVIGASI
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function _navigate(rawUrl) {

    const url = _normalize(rawUrl);
    if (!url) return;

    if (_isBlockedSite(url)) {
        _showBlockedPage(url);
        return;
    }

        // Update URL bar
        const urlBar = document.getElementById("sbrUrlBar");
        if (urlBar) urlBar.value = url;

        // Tampilkan iframe container, sembunyikan homepage
        const home    = document.getElementById("sbrHomePage");
        const ifrCon  = document.getElementById("sbrIframeContainer");
        if (home)   home.style.display   = "none";
        if (ifrCon) ifrCon.style.display = "block";

        // Loading on
        _setLoading(true);

        const origin  = _origin(url);
        const frameId = "f" + (++_frameCounter);

        // Buat iframe baru â€” hapus yang lama
        if (ifrCon) ifrCon.innerHTML = "";

        const iframe = document.createElement("iframe");
        iframe.id        = "sbr_iframe_" + frameId;
        iframe.className = "sbr-iframe";
        iframe.setAttribute("sandbox",
            "allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation"
        );

        iframe.onload = function () {
            _setLoading(false);
            _updateNavBtns();
            _updateConnStatus(origin);

            // Ambil URL aktual setelah redirect
            try {
                const actual = iframe.contentWindow?.location?.href;
                if (actual && actual !== "about:blank") {
                    if (urlBar) urlBar.value = actual;
                    _state.frames[frameId].url = actual;
                }
            } catch {}
        };

        iframe.onerror = function () {
            _setLoading(false);
        };

        if (ifrCon) ifrCon.appendChild(iframe);

        // Set src SETELAH append (penting untuk beberapa browser)
        iframe.src = url;

        // Daftarkan ke bridge
        window.browserBridge?.registerFrame(frameId, iframe, origin);

        _state.frames[frameId]  = { url, origin, loaded: false };
        _state.activeFrameId    = frameId;

        _pushHistory(url);
        _updateNavBtns();
        _updateConnStatus(origin);
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // BACK / FORWARD / RELOAD
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function goBack() {
        if (_state.navIndex <= 0) return;
        _state.navIndex--;
        _navigateDirect(_state.navHistory[_state.navIndex]);
    }

    function goForward() {
        if (_state.navIndex >= _state.navHistory.length - 1) return;
        _state.navIndex++;
        _navigateDirect(_state.navHistory[_state.navIndex]);
    }

    function reload() {
        const ifrCon = document.getElementById("sbrIframeContainer");
        const iframe = ifrCon?.querySelector("iframe");
        if (iframe) {
            _setLoading(true);
            iframe.src = iframe.src;
        }
    }

    function _navigateDirect(url) {
        if (!url) return;
        const urlBar = document.getElementById("sbrUrlBar");
        if (urlBar) urlBar.value = url;
        const iframe = document.getElementById("sbrIframeContainer")?.querySelector("iframe");
        if (iframe) {
            _setLoading(true);
            iframe.src = url;
        }
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // HELPERS
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function _normalize(input) {
        if (!input) return null;
        input = input.trim();
        if (!input) return null;
        if (/^https?:\/\//i.test(input)) return input;
        if (/^[\w-]+(\.[\w-]+)+/.test(input)) return "https://" + input;
        return "https://www.google.com/search?q=" + encodeURIComponent(input);
    }

    function _origin(url) {
        try { return new URL(url).origin; } catch { return url; }
    }

function _isBlockedSite(url) {

    try {

        const host = new URL(url).hostname;

        return NO_IFRAME_SITES.includes(host);

    } catch {

        return false;

    }
}

    function _pushHistory(url) {
        _state.navHistory = _state.navHistory.slice(0, _state.navIndex + 1);
        _state.navHistory.push(url);
        if (_state.navHistory.length > MAX_HISTORY) _state.navHistory.shift();
        _state.navIndex = _state.navHistory.length - 1;
    }

    function _setLoading(on) {
        _state.isLoading = on;
        const bar = document.getElementById("sbrLoadBar");
        if (bar) bar.style.display = on ? "block" : "none";
    }

    function _updateNavBtns() {
        const back = document.getElementById("sbrBack");
        const fwd  = document.getElementById("sbrFwd");
        if (back) back.className = "sbr-nav-btn" + (_state.navIndex > 0 ? " active" : "");
        if (fwd)  fwd.className  = "sbr-nav-btn" + (_state.navIndex < _state.navHistory.length - 1 ? " active" : "");
    }

function _showBlockedPage(url) {

    const home   = document.getElementById("sbrHomePage");
    const ifrCon = document.getElementById("sbrIframeContainer");

    if (home) home.style.display = "none";

    if (!ifrCon) return;

    ifrCon.style.display = "block";

    ifrCon.innerHTML = `
        <div style="
            padding:24px;
            background:#fff;
            color:#111;
            height:100%;
            overflow:auto;
            box-sizing:border-box;
        ">

            <h2>Website tidak dapat dibuka dalam iframe</h2>

            <p>
                Website ini memblokir tampilan dari aplikasi lain
                menggunakan kebijakan keamanan browser.
            </p>

            <p style="
                word-break:break-all;
                background:#f4f4f4;
                padding:10px;
                border-radius:8px;
            ">
                ${url}
            </p>

            <button id="sbrOpenExternal"
                style="
                    width:100%;
                    height:48px;
                    border:none;
                    border-radius:10px;
                    background:#00ff88;
                    font-weight:700;
                    cursor:pointer;
                ">
                Buka di Browser Eksternal
            </button>

        </div>
    `;

    document
        .getElementById("sbrOpenExternal")
        ?.addEventListener("click", () => {

            window.open(url, "_blank");

        });
}

    function _updateConnStatus(origin) {
        const el  = document.getElementById("sbrConnStatus");
        if (!el) return;
        const ok  = origin && window.permissionManager?.hasPermission(origin);
        el.innerHTML  = ok ? "&#9679; Terhubung" : "&#9679; Tidak terhubung";
        el.style.color       = ok ? "#00ff88" : "#555";
        el.style.borderColor = ok ? "rgba(0,255,136,0.3)" : "#2a2a2a";
    }

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // PUBLIC API
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    window.sidraBrowser = {

        open(url) {
            // Kalau di Android, pakai native browser
            if (window.__SIDRA_ANDROID__ && window.AndroidWallet) {
                window.AndroidWallet.openBrowser(
                    url || "https://www.sidrachain.com"
                );
                return;
            }
            // Fallback: browser iframe biasa
            _buildUI();
            _state.browserVisible = true;
            if (url) {
                setTimeout(() => _navigate(url), 50);
            }
        },

        navigate(url) {
            _navigate(url);
        },

        goBack,
        goForward,
        reload,

        close() {
            document.getElementById("sidraBrowserShell")?.remove();
            for (const id of Object.keys(_state.frames)) {
                window.browserBridge?.unregisterFrame(id);
            }
            _state.frames         = {};
            _state.activeFrameId  = null;
            _state.browserVisible = false;
        },

        openSidra() { this.open("https://www.sidrachain.com"); },
        openKYC()   { this.open("https://kycport.com"); },

        isVisible()    { return _state.browserVisible; },
        currentUrl()   {
            const id = _state.activeFrameId;
            return id ? (_state.frames[id]?.url || null) : null;
        },
        currentOrigin() {
            const id = _state.activeFrameId;
            return id ? (_state.frames[id]?.origin || null) : null;
        }
    };

    console.log("[SidraWallet] Browser V2 ready");

})();