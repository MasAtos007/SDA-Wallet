// =====================================
// SIDRA-BROWSER.JS
// In-App Browser untuk sidrachain.com
// - Buka dari tombol di action bar
// - Navbar: back, forward, reload, URL bar, close
// - Auto-inject alamat wallet aktif ke URL jika relevan
// - Shortcut tab: Home, Trade, Swap, Send, Wallet
// =====================================

const SIDRA_BROWSER_HOME = "https://www.sidrachain.com/";

const SIDRA_BROWSER_TABS = [
    { label: "Home",   icon: "fa-house",        url: "https://www.sidrachain.com/" },
    { label: "Trade",  icon: "fa-chart-line",   url: "https://www.sidrachain.com/trade" },
    { label: "Swap",   icon: "fa-right-left",   url: "https://www.sidrachain.com/swap" },
    { label: "Send",   icon: "fa-paper-plane",  url: "https://www.sidrachain.com/wallets/send" },
    { label: "Wallet", icon: "fa-wallet",       url: "https://www.sidrachain.com/wallets" },
    { label: "Chat",   icon: "fa-comments",     url: "https://chat.sidrachain.com/" },
];

// Track history & state
window._sbrHistory  = [];
window._sbrIndex    = -1;
window._sbrLoading  = false;

// -------------------------------------
// BUKA BROWSER
// -------------------------------------
function openSidraBrowser(url) {
    url = url || SIDRA_BROWSER_HOME;
    _ensureSidraBrowserDOM();
    _sbrNavigate(url, true);
    document.getElementById("sidraBrowserOverlay").style.display = "flex";
    document.getElementById("sidraBrowserOverlay").style.animation = "sbrSlideUp 0.25s ease";
}

function closeSidraBrowser() {
    const overlay = document.getElementById("sidraBrowserOverlay");
    if (!overlay) return;
    overlay.style.animation = "sbrSlideDown 0.2s ease";
    setTimeout(() => { overlay.style.display = "none"; }, 180);
}

// -------------------------------------
// BUILD DOM (sekali saja)
// -------------------------------------
function _ensureSidraBrowserDOM() {
    if (document.getElementById("sidraBrowserOverlay")) return;

    // Inject CSS animations
    const style = document.createElement("style");
    style.textContent = `
        @keyframes sbrSlideUp {
            from { transform: translateY(100%); opacity:0; }
            to   { transform: translateY(0);    opacity:1; }
        }
        @keyframes sbrSlideDown {
            from { transform: translateY(0);    opacity:1; }
            to   { transform: translateY(100%); opacity:0; }
        }
        @keyframes sbrSpin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
        }
        #sidraBrowserOverlay {
            position: fixed;
            inset: 0;
            z-index: 199999;
            background: #0a0a0a;
            display: none;
            flex-direction: column;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #sbrNavbar {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 10px 12px;
            background: #111;
            border-bottom: 1px solid #222;
            flex-shrink: 0;
        }
        #sbrNavbar .sbr-icon-btn {
            background: none;
            border: none;
            color: #666;
            font-size: 16px;
            cursor: pointer;
            padding: 6px 7px;
            border-radius: 8px;
            transition: color 0.15s, background 0.15s;
            line-height: 1;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #sbrNavbar .sbr-icon-btn:hover { color: #fff; background: #1a1a1a; }
        #sbrNavbar .sbr-icon-btn:disabled { color: #333; cursor: default; }
        #sbrNavbar .sbr-icon-btn:disabled:hover { background: none; }
        #sbrUrlBar {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 6px;
            background: #1a1a1a;
            border: 1px solid #2a2a2a;
            border-radius: 10px;
            padding: 7px 10px;
            cursor: pointer;
        }
        #sbrUrlText {
            flex: 1;
            font-size: 12px;
            color: #888;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #sbrTabsRow {
            display: flex;
            gap: 6px;
            padding: 8px 12px;
            background: #0d0d0d;
            border-bottom: 1px solid #1a1a1a;
            overflow-x: auto;
            flex-shrink: 0;
            scrollbar-width: none;
        }
        #sbrTabsRow::-webkit-scrollbar { display: none; }
        .sbr-tab-btn {
            display: flex;
            align-items: center;
            gap: 5px;
            padding: 6px 12px;
            background: #1a1a1a;
            border: 1px solid #2a2a2a;
            border-radius: 20px;
            color: #888;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            white-space: nowrap;
            transition: all 0.15s;
            flex-shrink: 0;
        }
        .sbr-tab-btn:hover, .sbr-tab-btn.active {
            background: #ff7a00;
            border-color: #ff7a00;
            color: #fff;
        }
        #sbrLoadBar {
            height: 2px;
            background: #ff7a00;
            width: 0%;
            transition: width 0.4s ease;
            flex-shrink: 0;
        }
        #sbrIframe {
            flex: 1;
            border: none;
            width: 100%;
            background: #fff;
        }
        #sbrAddressChip {
            display: none;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: #0d1f0d;
            border-bottom: 1px solid #1a3a1a;
            font-size: 11px;
            color: #4caf50;
            flex-shrink: 0;
        }
    `;
    document.head.appendChild(style);

    // Build overlay
    const overlay = document.createElement("div");
    overlay.id = "sidraBrowserOverlay";

    // --- NAVBAR ---
    const tabsHTML = SIDRA_BROWSER_TABS.map(t =>
        `<button class="sbr-tab-btn" onclick="openSidraBrowser('${t.url}')" data-sbr-url="${t.url}">` +
        `<i class="fa-solid ${t.icon}"></i>${t.label}</button>`
    ).join("");

    overlay.innerHTML = `
        <!-- NAVBAR -->
        <div id="sbrNavbar">
            <button class="sbr-icon-btn" id="sbrBtnBack" onclick="_sbrBack()" disabled title="Back">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button class="sbr-icon-btn" id="sbrBtnFwd" onclick="_sbrForward()" disabled title="Forward">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
            <button class="sbr-icon-btn" id="sbrBtnReload" onclick="_sbrReload()" title="Reload">
                <i class="fa-solid fa-rotate-right" id="sbrReloadIcon"></i>
            </button>

            <div id="sbrUrlBar" onclick="_sbrOpenUrlInput()">
                <i class="fa-solid fa-lock" style="color:#4caf50;font-size:11px;flex-shrink:0;"></i>
                <span id="sbrUrlText">sidrachain.com</span>
            </div>

            <button class="sbr-icon-btn" id="sbrBtnWallet" onclick="_sbrInjectWallet()" title="Inject alamat wallet ke halaman">
                <i class="fa-solid fa-plug" style="color:#ff7a00;"></i>
            </button>

            <button class="sbr-icon-btn" onclick="closeSidraBrowser()" title="Tutup" style="color:#ff4444;">
                <i class="fa-solid fa-xmark"></i>
            </button>
        </div>

        <!-- LOAD BAR -->
        <div id="sbrLoadBar"></div>

        <!-- ADDRESS CHIP (muncul saat wallet terdetect inject) -->
        <div id="sbrAddressChip">
            <i class="fa-solid fa-circle-check"></i>
            <span id="sbrAddressChipText">Wallet aktif terhubung</span>
        </div>

        <!-- TABS SHORTCUT -->
        <div id="sbrTabsRow">${tabsHTML}</div>

        <!-- IFRAME -->
        <iframe
            id="sbrIframe"
            src="about:blank"
            allow="clipboard-read; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-top-navigation"
        ></iframe>
    `;

    document.body.appendChild(overlay);

    // Iframe load events
    const iframe = document.getElementById("sbrIframe");
    iframe.addEventListener("load", _sbrOnLoad);
}

// -------------------------------------
// NAVIGASI
// -------------------------------------
function _sbrNavigate(url, pushHistory) {
    // Validasi & sanitasi URL
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
    }

    // Pastikan hanya domain sidrachain / chat.sidrachain
    // (boleh dibuka semua, tapi warning jika keluar domain)
    const isSidra = url.includes("sidrachain.com") || url.includes("xsidra.com") || url.includes("minesidra.com");

    const iframe = document.getElementById("sbrIframe");
    if (!iframe) return;

    if (pushHistory) {
        // Potong forward history jika navigasi baru
        window._sbrHistory = window._sbrHistory.slice(0, window._sbrIndex + 1);
        window._sbrHistory.push(url);
        window._sbrIndex = window._sbrHistory.length - 1;
    }

    // Update URL bar
    _sbrSetUrlBar(url);

    // Update tab aktif
    _sbrUpdateActiveTabs(url);

    // Tunjukkan load bar
    _sbrStartLoad();

    iframe.src = url;

    // Update tombol back/fwd
    _sbrUpdateNavBtns();

    // Chip address
    _sbrUpdateAddressChip(url);
}

function _sbrBack() {
    if (window._sbrIndex <= 0) return;
    window._sbrIndex--;
    _sbrNavigate(window._sbrHistory[window._sbrIndex], false);
}

function _sbrForward() {
    if (window._sbrIndex >= window._sbrHistory.length - 1) return;
    window._sbrIndex++;
    _sbrNavigate(window._sbrHistory[window._sbrIndex], false);
}

function _sbrReload() {
    const iframe = document.getElementById("sbrIframe");
    if (!iframe) return;
    _sbrStartLoad();
    iframe.src = iframe.src;
}

function _sbrOnLoad() {
    _sbrStopLoad();

    // Coba baca URL dari iframe (mungkin blocked oleh CORS)
    try {
        const currentUrl = document.getElementById("sbrIframe")?.contentWindow?.location?.href;
        if (currentUrl && currentUrl !== "about:blank") {
            _sbrSetUrlBar(currentUrl);
            _sbrUpdateActiveTabs(currentUrl);
            _sbrUpdateAddressChip(currentUrl);
        }
    } catch(e) {
        // Cross-origin: tidak bisa baca URL, abaikan
    }
}

function _sbrUpdateNavBtns() {
    const back = document.getElementById("sbrBtnBack");
    const fwd  = document.getElementById("sbrBtnFwd");
    if (back) back.disabled = window._sbrIndex <= 0;
    if (fwd)  fwd.disabled  = window._sbrIndex >= window._sbrHistory.length - 1;
}

function _sbrSetUrlBar(url) {
    const el = document.getElementById("sbrUrlText");
    if (!el) return;
    try {
        const u = new URL(url);
        el.textContent = u.hostname + (u.pathname !== "/" ? u.pathname : "");
    } catch(e) {
        el.textContent = url;
    }
}

function _sbrUpdateActiveTabs(url) {
    document.querySelectorAll(".sbr-tab-btn").forEach(btn => {
        const btnUrl = btn.getAttribute("data-sbr-url") || "";
        btn.classList.toggle("active", url.startsWith(btnUrl) && btnUrl !== "");
    });
}

// Load bar animation
function _sbrStartLoad() {
    const bar = document.getElementById("sbrLoadBar");
    if (!bar) return;
    bar.style.width = "0%";
    bar.style.transition = "none";
    requestAnimationFrame(() => {
        bar.style.transition = "width 2s ease";
        bar.style.width = "85%";
    });
    const icon = document.getElementById("sbrReloadIcon");
    if (icon) {
        icon.style.animation = "sbrSpin 0.8s linear infinite";
    }
}

function _sbrStopLoad() {
    const bar = document.getElementById("sbrLoadBar");
    if (bar) {
        bar.style.transition = "width 0.2s ease";
        bar.style.width = "100%";
        setTimeout(() => { bar.style.width = "0%"; bar.style.transition = "none"; }, 300);
    }
    const icon = document.getElementById("sbrReloadIcon");
    if (icon) icon.style.animation = "";
}

// -------------------------------------
// URL INPUT (ketuk URL bar)
// -------------------------------------
function _sbrOpenUrlInput() {
    const currentUrl = window._sbrHistory[window._sbrIndex] || SIDRA_BROWSER_HOME;

    // Buat modal input sederhana
    const box = document.createElement("div");
    box.id = "sbrUrlInputBox";
    box.style.cssText = `
        position:fixed;inset:0;z-index:299999;
        background:rgba(0,0,0,0.85);
        display:flex;align-items:flex-start;justify-content:center;
        padding:60px 20px 20px;
        box-sizing:border-box;
    `;
    box.innerHTML = `
        <div style="
            background:#141414;border:1px solid #333;border-radius:16px;
            padding:16px;width:100%;max-width:440px;
        ">
            <div style="font-size:13px;color:#888;margin-bottom:8px;">Masukkan URL atau cari</div>
            <div style="display:flex;gap:8px;">
                <input id="sbrUrlInputField"
                    type="url"
                    value="${currentUrl}"
                    style="
                        flex:1;
                        padding:12px 14px;
                        background:#0d0d0d;border:1px solid #333;border-radius:10px;
                        color:#fff;font-size:13px;outline:none;
                    "
                    onkeydown="if(event.key==='Enter'){_sbrGoFromInput();}"
                >
                <button onclick="_sbrGoFromInput()" style="
                    padding:12px 16px;
                    background:#ff7a00;border:none;border-radius:10px;
                    color:#fff;font-size:13px;font-weight:600;cursor:pointer;
                "><i class="fa-solid fa-arrow-right"></i></button>
            </div>
            <!-- Shortcuts -->
            <div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px;">
                ${SIDRA_BROWSER_TABS.map(t =>
                    `<button onclick="document.getElementById('sbrUrlInputField').value='${t.url}';" style="
                        padding:5px 10px;background:#1a1a1a;border:1px solid #2a2a2a;
                        border-radius:8px;color:#888;font-size:11px;cursor:pointer;
                    ">${t.label}</button>`
                ).join("")}
            </div>
            <button onclick="document.getElementById('sbrUrlInputBox').remove()" style="
                width:100%;margin-top:10px;padding:10px;
                background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;
                color:#666;font-size:13px;cursor:pointer;
            ">Batal</button>
        </div>
    `;
    document.body.appendChild(box);
    setTimeout(() => {
        const inp = document.getElementById("sbrUrlInputField");
        inp?.focus();
        inp?.select();
    }, 50);
}

function _sbrGoFromInput() {
    const val = document.getElementById("sbrUrlInputField")?.value?.trim();
    document.getElementById("sbrUrlInputBox")?.remove();
    if (!val) return;
    openSidraBrowser(val);
}

// -------------------------------------
// INJECT WALLET ADDRESS
// Buka URL dengan address wallet aktif sebagai parameter
// atau tampilkan info koneksi
// -------------------------------------
function _sbrInjectWallet() {
    const addr = SESSION?.address || "";
    if (!addr) {
        showToast?.("Tidak ada wallet aktif", "error");
        return;
    }

    const currentUrl = window._sbrHistory[window._sbrIndex] || SIDRA_BROWSER_HOME;

    // Jika di halaman /wallets atau /wallets/send, tambah address sebagai query param
    let targetUrl = currentUrl;
    try {
        const u = new URL(currentUrl);
        // Coba inject ke /wallets/send sebagai ?to= atau halaman trade
        if (u.pathname.includes("/wallets") || u.pathname.includes("/send")) {
            u.searchParams.set("address", addr);
            targetUrl = u.toString();
        }
    } catch(e) {}

    // Tampilkan chip wallet
    const chip = document.getElementById("sbrAddressChip");
    const chipText = document.getElementById("sbrAddressChipText");
    if (chip && chipText) {
        chipText.textContent = addr.slice(0, 10) + "..." + addr.slice(-6) + " terhubung";
        chip.style.display = "flex";
        setTimeout(() => { chip.style.display = "none"; }, 4000);
    }

    // Salin address ke clipboard juga sebagai helper
    navigator.clipboard?.writeText(addr).catch(() => {});
    showToast?.("Address " + addr.slice(0, 8) + "... disalin ke clipboard", "success");
}

function _sbrUpdateAddressChip(url) {
    // Sembunyikan chip saat navigasi ke halaman baru
    const chip = document.getElementById("sbrAddressChip");
    if (chip) chip.style.display = "none";
}

// -------------------------------------
// INJECT TOMBOL KE ACTION BAR UTAMA
// Tambah tombol "Browser" di .actions
// -------------------------------------
function _injectSidraBrowserBtn() {
    const actions = document.querySelector(".actions");
    if (!actions) return;
    if (actions.querySelector(".sbr-action-btn")) return; // sudah ada

    const btn = document.createElement("div");
    btn.className = "action-btn sbr-action-btn";
    btn.onclick = () => openSidraBrowser();
    btn.innerHTML = `
        <i class="fa-solid fa-globe" style="background:#0d2a1a;color:#4caf50;"></i>
        <span>SidraWeb</span>
    `;
    actions.appendChild(btn);
}

// Jalankan saat DOM siap
document.addEventListener("DOMContentLoaded", function() {
    setTimeout(_injectSidraBrowserBtn, 600);
});

// Expose global
window.openSidraBrowser  = openSidraBrowser;
window.closeSidraBrowser = closeSidraBrowser;