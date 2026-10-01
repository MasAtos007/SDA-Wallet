// =====================================
// DAPP-HUB.JS
// Dasbor internal "Browser dApp" — tampil SEBELUM URL eksternal dimuat.
// - Daftar dApp resmi ekosistem SidraChain
// - Banner peringatan keamanan (i18n)
// - Header + tombol kembali ke dashboard wallet
// - Buka dApp lewat bridge native (BrowserActivity / WebViewManager.setupBrowserWebView)
//
// Pasang di index.html SETELAH lang.js, android-provider.js, connect-modal.js,
// dapp-connection-manager.js dan SEBELUM sidra-browser-v2.js:
//   <script src="js/dapp-hub.js"></script>
// =====================================
(function () {
    "use strict";

    const HUB_ID = "sidraDappHub";

    // ─────────────────────────────────────────
    // DAFTAR dApp RESMI (satu-satunya sumber)
    // ─────────────────────────────────────────
    const OFFICIAL_DAPPS = [
        { id: "portal", url: "https://www.sidrachain.com/", host: "sidrachain.com",
          titleKey: "dapp_portal_title", descKey: "dapp_portal_desc", icon: "globe" },
        { id: "dex", url: "https://dex.sidrachain.com/", host: "dex.sidrachain.com",
          titleKey: "dapp_dex_title", descKey: "dapp_dex_desc", icon: "swap" }
    ];

    // ─────────────────────────────────────────
    // KAMUS BAWAAN (id / en / ar)
    // Di-merge ke window.LANG tiap hub dibuka, karena lang.js
    // MENIMPA LANG setelah data/lang.json selesai dimuat.
    // Sebaiknya string yang sama juga dimasukkan ke data/lang.json.
    // ─────────────────────────────────────────
    const STRINGS = {
        id: {
            dapp_hub_title: "Browser dApp",
            dapp_hub_subtitle: "dApp resmi ekosistem SidraChain",
            dapp_back_to_wallet: "Kembali ke Wallet",
            dapp_official_section: "dApp Resmi",
            dapp_open: "Buka",
            dapp_official_badge: "Resmi",
            dapp_portal_title: "SidraChain Portal",
            dapp_portal_desc: "Klaim token harian dan hubungkan wallet untuk mengonversi Sidra Token ke SDA.",
            dapp_dex_title: "Sidra DEX",
            dapp_dex_desc: "Bursa terdesentralisasi resmi untuk menukar token di SidraChain.",
            dapp_warning: "Jangan hubungkan wallet Anda ke dApp di luar ekosistem resmi. Risiko keamanan dan kehilangan aset sepenuhnya ditanggung sendiri oleh pengguna.",
            dapp_warning_title: "Peringatan Keamanan",
            conn_disconnect: "Cabut",
            conn_empty: "Belum ada situs yang terhubung",
            conn_section_title: "Situs Terhubung",
            toast_permission_revoked: "Izin dicabut",
            toast_wallet_connected: "Wallet terhubung ✓",
            connect_title: "Hubungkan Wallet?",
            connect_wants_access: "ingin mengakses wallet kamu.",
            connect_approve: "Hubungkan",
            connect_reject: "Tolak",
            connect_official_badge: "Sidra Official",
            connect_perm_address: "Melihat alamat wallet kamu",
            connect_perm_balance: "Melihat saldo token di SidraChain",
            connect_perm_noconfirm: "Tidak bisa memindahkan aset tanpa konfirmasi"
        },
        en: {
            dapp_hub_title: "dApp Browser",
            dapp_hub_subtitle: "Official SidraChain ecosystem dApps",
            dapp_back_to_wallet: "Back to Wallet",
            dapp_official_section: "Official dApps",
            dapp_open: "Open",
            dapp_official_badge: "Official",
            dapp_portal_title: "SidraChain Portal",
            dapp_portal_desc: "Claim daily tokens and connect your wallet to convert Sidra Token to SDA.",
            dapp_dex_title: "Sidra DEX",
            dapp_dex_desc: "The official decentralized exchange for swapping tokens on SidraChain.",
            dapp_warning: "Do not connect your wallet to dApps outside the official ecosystem. Security risks and loss of assets are entirely borne by the user.",
            dapp_warning_title: "Security Warning",
            conn_disconnect: "Disconnect",
            conn_empty: "No connected sites yet",
            conn_section_title: "Connected Sites",
            toast_permission_revoked: "Permission revoked",
            toast_wallet_connected: "Wallet connected ✓",
            connect_title: "Connect Wallet?",
            connect_wants_access: "wants to access your wallet.",
            connect_approve: "Connect",
            connect_reject: "Reject",
            connect_official_badge: "Sidra Official",
            connect_perm_address: "See your wallet address",
            connect_perm_balance: "See your token balances on SidraChain",
            connect_perm_noconfirm: "Cannot move assets without your confirmation"
        },
        ar: {
            dapp_hub_title: "متصفح dApp",
            dapp_hub_subtitle: "تطبيقات dApp الرسمية لمنظومة SidraChain",
            dapp_back_to_wallet: "العودة إلى المحفظة",
            dapp_official_section: "التطبيقات الرسمية",
            dapp_open: "فتح",
            dapp_official_badge: "رسمي",
            dapp_portal_title: "بوابة SidraChain",
            dapp_portal_desc: "احصل على الرموز اليومية واربط محفظتك لتحويل رمز Sidra إلى SDA.",
            dapp_dex_title: "Sidra DEX",
            dapp_dex_desc: "البورصة اللامركزية الرسمية لتبادل الرموز على SidraChain.",
            dapp_warning: "لا تربط محفظتك بتطبيقات dApp خارج المنظومة الرسمية. المخاطر الأمنية وفقدان الأصول يتحملها المستخدم بالكامل.",
            dapp_warning_title: "تحذير أمني",
            conn_disconnect: "فصل",
            conn_empty: "لا توجد مواقع متصلة بعد",
            conn_section_title: "المواقع المتصلة",
            toast_permission_revoked: "تم إلغاء الإذن",
            toast_wallet_connected: "تم ربط المحفظة ✓",
            connect_title: "ربط المحفظة؟",
            connect_wants_access: "يريد الوصول إلى محفظتك.",
            connect_approve: "ربط",
            connect_reject: "رفض",
            connect_official_badge: "رسمي من Sidra",
            connect_perm_address: "عرض عنوان محفظتك",
            connect_perm_balance: "عرض أرصدة الرموز على SidraChain",
            connect_perm_noconfirm: "لا يمكن نقل الأصول دون تأكيدك"
        }
    };

    function _mergeLang() {
        window.LANG = window.LANG || {};
        Object.keys(STRINGS).forEach(code => {
            window.LANG[code] = Object.assign({}, STRINGS[code], window.LANG[code] || {});
        });
    }

    function _t(key) {
        const code = window.CURRENT_LANG || "id";
        return (window.LANG?.[code]?.[key]) || STRINGS[code]?.[key] || STRINGS.id[key] || key;
    }

    // ─────────────────────────────────────────
    // CSS (di-inject sekali)
    // ─────────────────────────────────────────
    const CSS = `
    #${HUB_ID}{position:fixed;inset:0;z-index:9000;background:#0b0b0b;color:#fff;display:flex;
        flex-direction:column;font-family:inherit;overflow:hidden;animation:dhFade .18s ease}
    @keyframes dhFade{from{opacity:0}to{opacity:1}}
    #${HUB_ID} .dh-header{display:flex;align-items:center;gap:12px;
        padding:calc(env(safe-area-inset-top,0px) + 12px) 16px 12px;border-bottom:1px solid #1e1e1e;background:#101010}
    #${HUB_ID} .dh-back{width:40px;height:40px;min-width:40px;border:none;border-radius:12px;background:#1a1a1a;
        color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer}
    #${HUB_ID} .dh-back:active{transform:scale(.95)}
    #${HUB_ID} .dh-title{font-size:18px;font-weight:700;line-height:1.3}
    #${HUB_ID} .dh-sub{font-size:12px;color:#888;margin-top:2px}
    #${HUB_ID} .dh-body{flex:1;overflow-y:auto;padding:16px 16px calc(env(safe-area-inset-bottom,0px) + 24px);
        -webkit-overflow-scrolling:touch}
    #${HUB_ID} .dh-warn{display:flex;gap:10px;align-items:flex-start;background:rgba(255,170,0,.08);
        border:1px solid rgba(255,170,0,.3);border-radius:14px;padding:12px 14px;margin-bottom:18px}
    #${HUB_ID} .dh-warn svg{flex-shrink:0;margin-top:1px}
    #${HUB_ID} .dh-warn-title{font-size:13px;font-weight:700;color:#ffb21f;margin-bottom:2px}
    #${HUB_ID} .dh-warn-text{font-size:12px;line-height:1.55;color:#e0b45a}
    #${HUB_ID} .dh-section{font-size:12px;color:#777;text-transform:uppercase;letter-spacing:.5px;margin:0 2px 10px}
    #${HUB_ID} .dh-card{display:flex;gap:12px;align-items:flex-start;width:100%;text-align:start;
        background:#141414;border:1px solid #232323;border-radius:16px;padding:14px;margin-bottom:12px;
        color:inherit;font-family:inherit;cursor:pointer}
    #${HUB_ID} .dh-card:active{transform:scale(.985);background:#181818}
    #${HUB_ID} .dh-ico{width:44px;height:44px;min-width:44px;border-radius:12px;background:rgba(255,122,0,.12);
        display:flex;align-items:center;justify-content:center}
    #${HUB_ID} .dh-card-main{flex:1;min-width:0}
    #${HUB_ID} .dh-card-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    #${HUB_ID} .dh-card-title{font-size:15px;font-weight:600}
    #${HUB_ID} .dh-badge{font-size:10px;color:#00ff88;background:rgba(0,255,136,.08);
        border:1px solid rgba(0,255,136,.2);border-radius:20px;padding:1px 8px}
    #${HUB_ID} .dh-host{font-size:11px;color:#666;margin:2px 0 6px;direction:ltr;text-align:start}
    #${HUB_ID} .dh-desc{font-size:12.5px;line-height:1.55;color:#999}
    #${HUB_ID} .dh-open{align-self:center;font-size:12px;font-weight:600;color:#000;background:#ff7a00;
        border-radius:10px;padding:8px 14px;white-space:nowrap}
    #${HUB_ID} .dh-conn{margin-top:22px}
    @media (max-width:360px){#${HUB_ID} .dh-card{flex-wrap:wrap}#${HUB_ID} .dh-open{width:100%;text-align:center}}
    `;

    function _injectCSS() {
        if (document.getElementById("sidraDappHubCss")) return;
        const st = document.createElement("style");
        st.id = "sidraDappHubCss";
        st.textContent = CSS;
        document.head.appendChild(st);
    }

    // ─────────────────────────────────────────
    // IKON (inline SVG — tidak bergantung FontAwesome)
    // ─────────────────────────────────────────
    const ICONS = {
        back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" class="dh-flip"><path d="M15 18l-6-6 6-6"/></svg>',
        warn: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffb21f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><circle cx="12" cy="17" r=".6" fill="#ffb21f"/></svg>',
        globe: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff7a00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>',
        swap: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ff7a00" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>'
    };

    function _esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // ─────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────
    function _html() {
        const cards = OFFICIAL_DAPPS.map(d => `
            <button class="dh-card" data-dapp="${_esc(d.id)}" type="button">
                <div class="dh-ico">${ICONS[d.icon]}</div>
                <div class="dh-card-main">
                    <div class="dh-card-top">
                        <span class="dh-card-title">${_esc(_t(d.titleKey))}</span>
                        <span class="dh-badge">✓ ${_esc(_t("dapp_official_badge"))}</span>
                    </div>
                    <div class="dh-host">${_esc(d.host)}</div>
                    <div class="dh-desc">${_esc(_t(d.descKey))}</div>
                </div>
                <span class="dh-open">${_esc(_t("dapp_open"))}</span>
            </button>`).join("");

        return `
            <div class="dh-header">
                <button class="dh-back" id="dappHubBack" type="button" aria-label="${_esc(_t("dapp_back_to_wallet"))}">${ICONS.back}</button>
                <div>
                    <div class="dh-title">${_esc(_t("dapp_hub_title"))}</div>
                    <div class="dh-sub">${_esc(_t("dapp_hub_subtitle"))}</div>
                </div>
            </div>
            <div class="dh-body">
                <div class="dh-warn" role="alert">
                    ${ICONS.warn}
                    <div>
                        <div class="dh-warn-title">${_esc(_t("dapp_warning_title"))}</div>
                        <div class="dh-warn-text">${_esc(_t("dapp_warning"))}</div>
                    </div>
                </div>
                <div class="dh-section">${_esc(_t("dapp_official_section"))}</div>
                ${cards}
                <div class="dh-conn">
                    <div class="dh-section">${_esc(_t("conn_section_title"))}</div>
                    <div id="dappHubConnected"></div>
                </div>
            </div>`;
    }

    function _isRTL() { return (window.CURRENT_LANG || "id") === "ar"; }

    function _render() {
        const el = document.getElementById(HUB_ID);
        if (!el) return;
        _mergeLang();
        el.setAttribute("dir", _isRTL() ? "rtl" : "ltr");
        el.innerHTML = _html();
        if (_isRTL()) el.querySelectorAll(".dh-flip").forEach(s => (s.style.transform = "scaleX(-1)"));
        // Daftar situs terhubung + tombol Cabut (ditangani connect-modal.js / dapp-connection-manager.js)
        window.renderConnectedSites?.("dappHubConnected");
    }

    // ─────────────────────────────────────────
    // OPEN / CLOSE
    // ─────────────────────────────────────────
    function openHub() {
        if (document.getElementById(HUB_ID)) return;
        _injectCSS();
        _mergeLang();

        const el = document.createElement("div");
        el.id = HUB_ID;

        // SATU listener di root (tidak perlu re-bind saat re-render / ganti bahasa)
        el.addEventListener("click", (e) => {
            if (e.target.closest("#dappHubBack")) { closeHub(); return; }
            const card = e.target.closest("[data-dapp]");
            if (card) _launch(card.dataset.dapp);
        });

        document.body.appendChild(el);
        document.body.style.overflow = "hidden";
        _render();
        window.setBottomNavHidden?.(true);
    }

    function closeHub() {
        document.getElementById(HUB_ID)?.remove();
        document.body.style.overflow = "";
        // Kembali ke dashboard wallet utama
        window._hideOnboarding?.();
        window.setBottomNavHidden?.(false);
    }

    // ─────────────────────────────────────────
    // LAUNCH: hanya URL dari daftar resmi (id → url), bukan string bebas
    // ─────────────────────────────────────────
    function _launch(id) {
        const dapp = OFFICIAL_DAPPS.find(d => d.id === id);
        if (!dapp) return;
        if (window.AndroidWallet?.openOfficialDapp) {
            window.AndroidWallet.openOfficialDapp(dapp.url);   // native: whitelist + BrowserActivity
        } else if (window.AndroidWallet?.openBrowser) {
            window.AndroidWallet.openBrowser(dapp.url);        // fallback APK lama
        } else {
            window.open(dapp.url, "_blank", "noopener");       // web
        }
    }

    // ─────────────────────────────────────────
    // INTEGRASI
    // ─────────────────────────────────────────
    // 1) Tombol back Android: tutup hub dulu
    const _prevBack = window._handleAndroidBack;
    window._handleAndroidBack = function () {
        if (document.getElementById(HUB_ID)) { closeHub(); return true; }
        return typeof _prevBack === "function" ? _prevBack() : false;
    };

    // 2) Ganti bahasa saat hub terbuka → render ulang
    const _prevApply = window.applyLang;
    if (typeof _prevApply === "function") {
        window.applyLang = function () {
            _prevApply.apply(this, arguments);
            if (document.getElementById(HUB_ID)) _render();
        };
    }

    // 3) Setelah koneksi/disconnect berubah
    window.addEventListener("storage", () => {
        if (document.getElementById(HUB_ID)) window.renderConnectedSites?.("dappHubConnected");
    });

    window.sidraHub = { open: openHub, close: closeHub, dapps: OFFICIAL_DAPPS };
})();
