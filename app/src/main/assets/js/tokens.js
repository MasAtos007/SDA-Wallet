// =====================================
// TOKENS.JS — Token Manager + State
// Gabungan tokenManager.js + tokens.js
// =====================================

// ===== ONE-TIME CLEANUP — hapus setelah dijalankan sekali =====
if (!localStorage.getItem("_cleanup_done_v1")) {
    localStorage.removeItem("customTokens");
    Object.keys(localStorage).forEach(k => {
        if (/^0x[0-9a-fA-F]+_/.test(k)) localStorage.removeItem(k);
    });
    localStorage.setItem("_cleanup_done_v1", "1");
    console.log("Cleanup selesai");
}
// ===== END CLEANUP =====

// ===== ONE-TIME MIGRATION — tandai token lama sebagai manual =====
if (!localStorage.getItem("_migrate_manual_v1")) {
    try {
        const raw = JSON.parse(localStorage.getItem("customTokens") || "[]");
        const migrated = raw.map(tk => ({ ...tk, manual: true }));
        localStorage.setItem("customTokens", JSON.stringify(migrated));
        console.log("Migrasi manual flag selesai:", migrated.length, "token");
    } catch (e) {
        console.error("[migrate manual]", e);
    }
    localStorage.setItem("_migrate_manual_v1", "1");
}
// ===== END MIGRATION =====

// ===== ONE-TIME CLEANUP — hapus custom token yang duplikat dgn dirinya sendiri =====
if (!localStorage.getItem("_dedupe_custom_v1")) {
    try {
        const custom = JSON.parse(localStorage.getItem("customTokens") || "[]");
        const seen = new Set();
        const deduped = custom.filter(t => {
            const key = (t.address || "").toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        localStorage.setItem("customTokens", JSON.stringify(deduped));
        console.log("Dedupe customTokens selesai:", custom.length, "->", deduped.length);
    } catch (e) {
        console.error("[dedupe custom]", e);
    }
    localStorage.setItem("_dedupe_custom_v1", "1");
}
// ===== END CLEANUP =====

// =====================================
// GLOBAL TOKEN STATE
// =====================================
window.selectedToken     = localStorage.getItem("selectedToken") || "native";
window.selectedTokenData = null;
window.TOKENS            = [];

let DEFAULT_TOKENS = [];
let customTokens   = JSON.parse(localStorage.getItem("customTokens") || "[]");

function _t(key, fallback) {
    try {
        const lang = window.CURRENT_LANG || "id";
        return (window.LANG?.[lang]?.[key]) || fallback;
    } catch { return fallback; }
}
// =====================================
// NORMALIZER — satu sumber kebenaran
// =====================================
function normalizeToken(t) {
    return {
        symbol:    t.symbol,
        name:      t.name     || t.symbol,
        address:   t.address,
        logo:      t.logo     || ("img/" + (t.icon || "default.png")),
        decimals:  t.decimals || 18,
        type:      t.type     || "erc20",
        isNative:  t.address  === "native",
        manual:    t.manual   || false,
        userAdded: t.userAdded || false,
        // Token hasil Dynamic Token Discovery (Blockscout) — belum diverifikasi user
        isSpamDetected: t.isSpamDetected || false
    };
}

// =====================================
// SANITIZER — untuk teks token dari sumber luar (Blockscout).
// Nama/simbol token spam bebas diisi siapa saja, dan nanti
// masuk ke innerHTML (renderAssets, openTokenDropdown), jadi
// karakter HTML dibuang di sini, satu pintu masuk.
// =====================================
function sanitizeTokenText(str, maxLen, fallback) {
    const clean = String(str == null ? "" : str)
        .replace(/[\u0000-\u001F\u007F]/g, "")
        .replace(/[<>"'`&\\]/g, "")
        .trim()
        .slice(0, maxLen || 32);
    return clean || fallback || "";
}
window.sanitizeTokenText = sanitizeTokenText;

// =====================================
// VERIFIED + LOGO HELPERS
// "Verified" = alamat token ada di data/tokens.json (DEFAULT_TOKENS).
// Logo: kalau tidak ada file logo asli (kosong / default.png / gagal
// dimuat) otomatis diganti avatar bulat berisi inisial simbol token.
// Avatar dibuat sebagai SVG data-URI, jadi tetap berupa <img> —
// ukuran/class/ID elemen yang sudah ada tidak berubah.
// =====================================
function isVerifiedToken(address) {
    if (!address || address === "native") return true;
    const a = String(address).toLowerCase();
    return (DEFAULT_TOKENS || []).some(x => (x.address || "").toLowerCase() === a);
}

function tokenInitials(symbol) {
    const s = String(symbol || "").replace(/[^A-Za-z0-9]/g, "");
    return (s.slice(0, 2) || "?").toUpperCase();
}

function tokenAvatarURI(symbol) {
    const ini = tokenInitials(symbol);
    let h = 0;
    for (const ch of String(symbol || "?")) h = (h * 31 + ch.charCodeAt(0)) % 360;
    const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
        '<circle cx="32" cy="32" r="32" fill="hsl(' + h + ',45%,32%)"/>' +
        '<text x="32" y="32" dy=".35em" text-anchor="middle" ' +
        'font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="26" fill="#fff">' +
        ini + '</text></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function hasRealLogo(logo) {
    return !!logo && !/(^|\/)default\.png$/i.test(String(logo));
}

// Set ikon token pada <img> yang sudah ada di index.html (ID tetap).
function setTokenImg(img, logo, symbol) {
    if (!img) return;
    img.dataset.symbol = symbol || "";
    img.onerror = function () { tokenLogoFallback(this); };
    img.src = tokenLogoSrc(logo, symbol);
}
window.setTokenImg = setTokenImg;

function tokenLogoSrc(logo, symbol) {
    return hasRealLogo(logo) ? logo : tokenAvatarURI(symbol);
}

// Dipakai sebagai onerror="tokenLogoFallback(this)".
// Simbol dibaca dari data-symbol (atau alt).
function tokenLogoFallback(img) {
    if (!img) return;
    if (String(img.src || "").indexOf("data:image/svg+xml") === 0) return; // anti-loop
    img.src = tokenAvatarURI(img.dataset?.symbol || img.alt || "?");
}

function _escAttr(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// opts: { size, cls, style }
function tokenLogoHTML(token, opts) {
    opts = opts || {};
    const symbol = token?.symbol || "?";
    const logo   = token?.logo || token?.icon;
    const sizeCss = opts.size
        ? "width:" + opts.size + "px;height:" + opts.size + "px;border-radius:50%;object-fit:contain;"
        : "";
    return '<img src="' + _escAttr(tokenLogoSrc(logo, symbol)) + '"' +
        ' data-symbol="' + _escAttr(symbol) + '"' +
        (opts.cls ? ' class="' + _escAttr(opts.cls) + '"' : "") +
        ' style="' + sizeCss + (opts.style || "") + '"' +
        ' onerror="tokenLogoFallback(this)">';
}

// Ikon status di samping nama token:
// centang hijau = ada di tokens.json, tanda seru = tidak terverifikasi
function tokenVerifyBadgeHTML(address) {
    if (isVerifiedToken(address)) {
        return '<i class="fa-solid fa-circle-check token-verify ok" ' +
            'title="' + _escAttr(_t("token_verified", "Terverifikasi")) + '" ' +
            'style="color:#00cc66;font-size:12px;margin-left:5px;"></i>';
    }
    return '<i class="fa-solid fa-circle-exclamation token-verify warn" ' +
        'title="' + _escAttr(_t("token_unverified", "Tidak terverifikasi")) + '" ' +
        'onclick="event.stopPropagation();showToast?.(_t(\'token_unverified_note\',' +
        '\'Token tidak ada di daftar resmi. Hati-hati sebelum berinteraksi.\'),\'error\')" ' +
        'style="color:#ff9f1a;font-size:12px;margin-left:5px;cursor:pointer;"></i>';
}

// =====================================
// RESOLVE TOKEN META — untuk token yang TIDAK ada di tokens.json /
// customTokens (mis. pasangan LP dari token luar). Baca symbol, name,
// decimals langsung dari kontrak, lalu cache.
// Teks dari kontrak disanitasi karena kontrak bebas mengisi apa saja.
// =====================================
const _tokenMetaCache = Object.create(null);
const TOKEN_META_LS_KEY = "tokenMetaCache_v1";

async function resolveTokenMeta(address) {
    if (!address) return null;
    const key = String(address).toLowerCase();

    const known = getAllTokens().find(x => (x.address || "").toLowerCase() === key);
    if (known) return known;

    if (_tokenMetaCache[key]) return _tokenMetaCache[key];

    let ls = {};
    try { ls = JSON.parse(localStorage.getItem(TOKEN_META_LS_KEY) || "{}"); } catch {}
    if (ls[key]) return (_tokenMetaCache[key] = ls[key]);

    const prov = window.provider || (typeof provider !== "undefined" ? provider : null);
    const shortAddr = address.slice(0, 6) + "…" + address.slice(-4);
    const fallback = {
        symbol: shortAddr, name: shortAddr, address, decimals: 18,
        logo: "img/default.png", type: "erc20", isNative: false,
        manual: false, userAdded: false, isSpamDetected: false, isUnresolved: true
    };
    if (!prov) return fallback;

    const abi = [
        "function symbol() view returns (string)",
        "function name() view returns (string)",
        "function decimals() view returns (uint8)"
    ];
    const c = new ethers.Contract(address, abi, prov);
    const guard = p => Promise.race([
        p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 6000))
    ]);

    const [sym, name, dec] = await Promise.all([
        guard(c.symbol()).catch(() => null),
        guard(c.name()).catch(() => null),
        guard(c.decimals()).catch(() => null)
    ]);

    // Semua gagal (RPC down / bukan ERC-20): jangan di-cache
    if (sym == null && dec == null) return fallback;

    const decN = Number(dec);
    const meta = {
        symbol:   sanitizeTokenText(sym, 12, shortAddr),
        name:     sanitizeTokenText(name, 32, sanitizeTokenText(sym, 12, shortAddr)),
        address,
        decimals: Number.isInteger(decN) && decN >= 0 && decN <= 36 ? decN : 18,
        logo: "img/default.png", type: "erc20", isNative: false,
        manual: false, userAdded: false, isSpamDetected: false
    };

    _tokenMetaCache[key] = meta;
    try {
        ls[key] = meta;
        localStorage.setItem(TOKEN_META_LS_KEY, JSON.stringify(ls));
    } catch {}
    return meta;
}
window.resolveTokenMeta = resolveTokenMeta;


// =====================================
// STORAGE HELPERS
// =====================================
// Batas MAX_CUSTOM_TOKENS HANYA menghitung token yang user tambah
// sendiri. Token hasil Deteksi Saldo (JSON / luar) tidak dibatasi,
// supaya token yang punya saldo selalu ikut tampil di tab Aset.
function _manualTokenCount(list) {
    return (list || []).filter(x => x && x.userAdded).length;
}
function getCustomTokens() {
    try   { return JSON.parse(localStorage.getItem("customTokens") || "[]"); }
    catch { return []; }
}

function saveCustomTokens(data) {
    localStorage.setItem("customTokens", JSON.stringify(data));
}

// =====================================
// AGGREGATOR CANDIDATE STORAGE
// =====================================
function getAggregatorCandidates() {
    try {
        return JSON.parse(
            localStorage.getItem("aggregatorCandidates") || "[]"
        );
    } catch {
        return [];
    }
}

function saveAggregatorCandidates(data) {
    localStorage.setItem(
        "aggregatorCandidates",
        JSON.stringify(data)
    );
}
// =====================================
// REBUILD GLOBAL TOKENS
// =====================================
function rebuildTokens() {
    customTokens = getCustomTokens();
    window.customTokens = customTokens;

    const combined = [
        ...DEFAULT_TOKENS,
        ...customTokens.map(normalizeToken)
    ];

    const seen = new Set();
    window.TOKENS = combined.filter(t => {
        const key = (t.address || "").toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}


// =====================================
// LOAD TOKENS.JSON
// =====================================
async function loadDefaultTokens() {
    try {

        let raw;

        // Android WebView: pakai AndroidWallet.readAsset (sama seperti lang.js)
        if (window.AndroidWallet && typeof window.AndroidWallet.readAsset === "function") {
            const text = window.AndroidWallet.readAsset("data/tokens.json");
            if (!text) throw new Error("tokens.json kosong");
            raw = JSON.parse(text);

        } else {
            // Browser biasa (development): pakai fetch
            const res = await fetch("data/tokens.json");
            if (!res.ok) throw new Error("HTTP " + res.status);
            raw = await res.json();
        }

        DEFAULT_TOKENS = raw.map(normalizeToken);
        rebuildTokens();

    } catch (e) {
        console.error("[loadDefaultTokens]", e);
    }
}

// =====================================
// GETTERS
// =====================================
function getAllTokens()  { return window.TOKENS || []; }
function getHomeTokens() { return getAllTokens(); }
function getSendTokens() { return getAllTokens(); }

function getSwapTokens() {
    return getAllTokens().filter(t => t.symbol !== "WSDA");
}

function getTokenData(addr) {
    if (!addr) return { symbol: "?", logo: "img/default.png" };

    const token = getAllTokens().find(
        t => t.address?.toLowerCase() === addr.toLowerCase()
    );

    if (token) return { ...token };

    return {
        symbol: addr.slice(0, 6) + "...",
        logo:   "img/default.png"
    };
}

// alias — dipanggil di ui.js dan app.js
function syncCustomTokens() { rebuildTokens(); }
function syncTokenState()   { rebuildTokens(); }


// =====================================
// SET GLOBAL TOKEN — satu-satunya pintu
// untuk ganti token aktif
// =====================================
function setGlobalToken(val) {

    window.selectedToken = val || "native";
    localStorage.setItem("selectedToken", window.selectedToken);

    let logo = "img/sda.png";

    if (val === "native" || !val) {
        window.selectedTokenData = {
            symbol:   "SDA",
            type:     "native",
            decimals: 18,
            logo:     "img/sda.png"
        };
    } else {
        const token = getAllTokens().find(t => t.address === val);
        if (token) {
            logo = token.logo || "img/default.png";
            window.selectedTokenData = { ...token, type: "erc20" };
        }
    }

    // Sync dropdown
    const mainSelect = document.getElementById("tokenSelect");
    const sendSelect = document.getElementById("sendTokenSelect");
    if (mainSelect) mainSelect.value = val;
    if (sendSelect) sendSelect.value = val;

    // Sync icon
    const logoBalance  = document.getElementById("tokenLogoBalance");
    const logoDropdown = document.getElementById("tokenLogoDropdown");
    const _sym = window.selectedTokenData?.symbol || "SDA";
    setTokenImg(logoBalance,  logo, _sym);
    setTokenImg(logoDropdown, logo, _sym);

    // Sync semua modul
    syncSendTokenUI?.();
    applySendTokenState?.();
    loadBalance?.();
    updateSendBalance?.();
    renderAssets?.();

    // Auto-refresh saldo token yang baru dipilih — pakai versi cepat
    // (1 RPC call utk token ini saja), bukan refreshAll yang nunggu
    // batch semua customTokens dulu baru update layar.
    if (typeof refreshSelectedTokenOnly === "function") {
        refreshSelectedTokenOnly();
    }
}


// =====================================
// RENDER TOKEN SELECT (HOME DROPDOWN)
// =====================================
function renderTokenSelect() {

    const select = document.getElementById("tokenSelect");
    if (!select) return;

    select.innerHTML = "";

    getAllTokens().forEach(t => {
        const opt          = document.createElement("option");
        opt.value          = t.address;
        opt.textContent    = t.symbol;
        opt.dataset.icon   = t.logo || "img/default.png";
        select.appendChild(opt);
    });

    select.value = window.selectedToken || "native";

    select.onchange = (e) => setGlobalToken(e.target.value);
}


// =====================================
// TOKEN POPUP DROPDOWN
// =====================================
function openTokenDropdown(target) {

    const tokens = getAllTokens();

    const itemsHTML = tokens.map(t => `
        <div class="token-item"
             data-address="${t.address}"
             data-symbol="${t.symbol.toLowerCase()}">
            ${tokenLogoHTML(t, { size: 28, style: "flex-shrink:0;" })}
            <div>
                <b>${t.symbol}</b>${tokenVerifyBadgeHTML(t.address)}<br>
                <small style="color:#888;">${t.name}</small>
            </div>
        </div>
    `).join("");

    const box = document.createElement("div");
    box.id = "tokenPopup";
    box.innerHTML = `
        <div class="popup-bg"></div>
        <div class="popup">
            <div class="token-search">
                <input id="tokenSearchInput" placeholder="Search token...">
            </div>
            <div id="tokenList">${itemsHTML}</div>
        </div>
    `;

    document.body.appendChild(box);

    // Search filter
    box.querySelector("#tokenSearchInput")?.addEventListener("input", (e) => {
        const kw = e.target.value.toLowerCase();
        box.querySelectorAll(".token-item").forEach(item => {
            item.style.display = item.dataset.symbol.includes(kw) ? "flex" : "none";
        });
    });

    // Select token
    box.addEventListener("click", (e) => {
        if (e.target.classList.contains("popup-bg")) { box.remove(); return; }

        const item = e.target.closest(".token-item");
        if (!item) return;

        const addr = item.dataset.address;
        setGlobalToken(addr);
        box.remove();
    });
}

// Intercept native dropdown — pakai popup
document.getElementById("tokenSelect")?.addEventListener("mousedown", (e) => {
    e.preventDefault();
    openTokenDropdown("home");
});

document.getElementById("sendTokenSelect")?.addEventListener("mousedown", (e) => {
    e.preventDefault();
    openTokenDropdown("send");
});


// =====================================
// ADD TOKEN FROM LIST (token tab)
// =====================================
async function addTokenFromList(token) {

    let custom = getCustomTokens();

    if (_manualTokenCount(custom) >= (window.MAX_CUSTOM_TOKENS ?? Infinity)) {
        return showToast(t("max_token") || "Max token reached", "error");
    }

    const exist = custom.find(
        t => t.address.toLowerCase() === token.address.toLowerCase()
    );
    if (exist) return showToast(t("token_exists") || "Sudah ditambahkan", "error");

    custom.push({ ...token, manual: true, userAdded: true });
    saveCustomTokens(custom);
    rebuildTokens();

    showToast(t("token_added") || "Token ditambahkan", "success");

    const wallet = getSelectedWallet?.();
    switchTab?.("assets");

    if (wallet) {
        try {
            const abi = [
                "function balanceOf(address) view returns (uint256)",
                "function decimals() view returns (uint8)"
            ];
            const contract = new ethers.Contract(token.address, abi, provider);
            const [bal, dec] = await Promise.all([
                contract.balanceOf(wallet.address),
                contract.decimals().catch(() => 18)
            ]);
            const value = parseFloat(ethers.utils.formatUnits(bal, dec)).toFixed(4);
            localStorage.setItem(wallet.address + "_" + token.address, value + " " + token.symbol);
        } catch {
            const key = wallet.address + "_" + token.address;
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, "0.00 " + token.symbol);
            }
        }
    }

    renderAssets?.();
    renderTokenTab?.();
    renderTokenSelect?.();
}


// =====================================
// ADD TOKEN MANUAL (dari input address)
// =====================================
async function addToken(symbol, address) {

    symbol  = symbol.trim().toUpperCase();
    address = address.trim();

    if (!ethers.utils.isAddress(address)) {
        return showToast(t("invalid_address") || "Invalid contract address", "error");
    }

    const exists = getAllTokens().find(
        t => t.address.toLowerCase() === address.toLowerCase()
    );
    if (exists) return showToast(t("token_exists") || "Token already added", "error");

    let custom = getCustomTokens();

    if (_manualTokenCount(custom) >= (window.MAX_CUSTOM_TOKENS ?? Infinity)) {
        return showToast(t("max_token") || "Max token reached", "error");
    }

    const newToken = normalizeToken({ symbol, address, manual: true, userAdded: true });

    custom.push(newToken);
    saveCustomTokens(custom);
    rebuildTokens();

    const wallet = getSelectedWallet?.();

    if (wallet) {
        try {
            const abi = [
                "function balanceOf(address) view returns (uint256)",
                "function decimals() view returns (uint8)"
            ];
            const contract = new ethers.Contract(newToken.address, abi, provider);
            const [bal, dec] = await Promise.all([
                contract.balanceOf(wallet.address),
                contract.decimals().catch(() => 18)
            ]);
            const value = parseFloat(ethers.utils.formatUnits(bal, dec)).toFixed(4);
            localStorage.setItem(wallet.address + "_" + newToken.address, value + " " + newToken.symbol);
        } catch (e) {
            const key = wallet.address + "_" + newToken.address;
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, "0.00 " + newToken.symbol);
            }
        }
    }

    showToast(t("token_added") || "Token ditambahkan", "success");

    renderAssets?.();
    renderTokenTab?.();
    renderTokenSelect?.();
    renderTokenList?.();
}

// =====================================
// RESET SEMUA TOKEN (manual + hasil detect)
// =====================================
function resetAllTokens() {

    const doReset = () => {
        const wallet = getSelectedWallet?.();

        saveCustomTokens([]);

        if (wallet) {
            const nativeKey = wallet.address + "_native";
            Object.keys(localStorage).forEach(k => {
                if (k === nativeKey) return; // jangan hapus saldo SDA native
                if (k.startsWith(wallet.address + "_") || k === "emptyScanned_" + wallet.address) {
                    localStorage.removeItem(k);
                }
            });
        }

        rebuildTokens();
        renderAssets?.();
        renderTokenTab?.();
        renderTokenSelect?.();

        showToast?.(t("reset_done") || "Semua token direset", "success");
    };

    if (typeof showConfirm === "function") {
        showConfirm(t("reset_token_confirm") || "Hapus semua token (termasuk yang tersembunyi)?", doReset);
    } else if (confirm(t("reset_token_confirm") || "Hapus semua token (termasuk yang tersembunyi)?")) {
        doReset();
    }
}

window.resetAllTokens = resetAllTokens;

// =====================================
// REMOVE TOKEN
// =====================================
function removeToken(address) {

    const doRemove = () => {
        let custom = getCustomTokens();
        custom = custom.filter(
            t => t.address.toLowerCase() !== address.toLowerCase()
        );
        saveCustomTokens(custom);
        rebuildTokens();

        const wallet = getSelectedWallet?.();
        if (wallet) {
            localStorage.removeItem(wallet.address + "_" + address);
        }

        renderAssets?.();
        renderTokenTab?.();
        renderTokenSelect?.();
        renderTokenList?.();

        showToast?.(t("token_removed") || "Token dihapus", "success");
    };

    const msg = t("remove_token_confirm") || "Hapus token ini?";

    if (typeof showConfirm === "function") {
        showConfirm(msg, doRemove);
    } else if (confirm(msg)) {
        doRemove();
    }
}


// =====================================
// RENDER TOKEN LIST (manager page)
// =====================================
function renderTokenList() {

    const list = document.getElementById("token-list");
    if (!list) return;

    list.innerHTML = "";

    customTokens.forEach(token => {
        const div       = document.createElement("div");
        div.style.marginBottom = "6px";
        div.innerHTML = `
            <img src="${token.logo || 'img/default.png'}"
                 onerror="this.src='img/default.png'"
                 style="width:16px;height:16px;margin-right:6px;">
            <span>${token.symbol}</span>
            <button onclick="removeToken('${token.address}')">Remove</button>
        `;
        list.appendChild(div);
    });
}

// =====================================
// AGGREGATOR TOKEN PICKER UI
// =====================================
function openAggregatorCandidatePicker() {

    document.getElementById("aggCandidateModal")?.remove();

    const tokens = getAllTokens().filter(
        t => t.address !== "native"
    );

    const selected = getAggregatorCandidates();

    const html = tokens.map(t => `
        <label class="agg-candidate-item"
               data-symbol="${(t.symbol || '').toLowerCase()}"
               data-name="${(t.name || '').toLowerCase()}">

            <input type="checkbox"
                   value="${t.address}"
                   ${selected.includes(t.address) ? "checked" : ""}>

            <img src="${t.logo || 'img/default.png'}"
                 onerror="this.src='img/default.png'">

            <span>${t.symbol}</span>
        </label>
    `).join("");

    const box = document.createElement("div");
    box.id = "aggCandidateModal";
    box.className = "show";

    box.innerHTML = `
        <div class="agg-candidate-popup">

            <h3>${_t("agg_candidate_title", "Select Aggregator Candidates")}</h3>

            <input
                id="aggCandidateSearch"
                type="text"
                placeholder="Search token..."
                style="
                    width:100%;
                    padding:10px;
                    margin-bottom:10px;
                    border:none;
                    border-radius:10px;
                    background:#111827;
                    color:#fff;
                "
            >

            <div class="agg-candidate-toolbar">
                <button id="aggSelectAllBtn" type="button">
                    Select All
                </button>

                <button id="aggClearAllBtn" type="button">
                    Clear All
                </button>
            </div>

            <div class="agg-candidate-popup-list">
                ${html}
            </div>

            <button id="saveAggCandidatesBtn">
                Save
            </button>

        </div>
    `;

    document.body.appendChild(box);

    // SEARCH FILTER
    box.querySelector("#aggCandidateSearch").oninput = (e) => {
        const q = e.target.value.toLowerCase();

        box.querySelectorAll(".agg-candidate-item")
            .forEach(el => {
                const sym  = el.dataset.symbol || "";
                const name = el.dataset.name || "";

                el.style.display =
                    sym.includes(q) || name.includes(q)
                        ? ""
                        : "none";
            });
    };

    box.querySelector("#aggSelectAllBtn").onclick = () => {
        box.querySelectorAll(
            ".agg-candidate-item input[type='checkbox']"
        ).forEach(cb => cb.checked = true);
    };

    box.querySelector("#aggClearAllBtn").onclick = () => {
        box.querySelectorAll(
            ".agg-candidate-item input[type='checkbox']"
        ).forEach(cb => cb.checked = false);
    };

    box.onclick = (e) => {
        if (e.target === box) box.remove();
    };

    box.querySelector("#saveAggCandidatesBtn").onclick = () => {

        const checked = [
            ...box.querySelectorAll("input:checked")
        ].map(x => x.value);

        saveAggregatorCandidates(checked);

        showToast?.(_t("agg_candidates_updated", "Aggregator candidates updated"), "success");

        box.remove();

        AGGREGATOR?.rescan?.();
    };
}



// =====================================
// INIT
// =====================================
document.addEventListener("DOMContentLoaded", async () => {
    await loadDefaultTokens();

    // set selectedTokenData awal
    setGlobalToken(window.selectedToken);

    renderTokenList?.();
    renderTokenSelect?.();
    renderTokenTab?.();
    loadSendTokens?.();
});


// =====================================
// EXPOSE — kompatibilitas modul lain
// =====================================
// =====================================
// ENSURE TOKEN TRACKED — pastikan token masuk customTokens
// supaya bisa di-render & di-refresh. Dipanggil setelah swap
// sukses ke token yang belum pernah ditambahkan user.
// =====================================
function ensureTokenTracked(addr) {
    if (!addr || addr === "native") return;

    const custom = getCustomTokens();
    const exists = custom.find(
        t => t.address.toLowerCase() === addr.toLowerCase()
    );

    if (exists) {
        // Sudah ada tapi belum userAdded (misal dari detect lama) —
        // upgrade jadi userAdded supaya tidak hilang kalau saldo sempat 0
        if (!exists.userAdded) {
            exists.userAdded = true;
            saveCustomTokens(custom);
            rebuildTokens();
        }
        return;
    }

    // Cari metadata dari DEFAULT_TOKENS (tokens.json)
    const meta = (DEFAULT_TOKENS || []).find(
        t => t.address?.toLowerCase() === addr.toLowerCase()
    );

    if (!meta) return; // token tidak dikenal sama sekali — skip, tidak bisa dapat symbol/decimals

    if (_manualTokenCount(custom) >= (window.MAX_CUSTOM_TOKENS ?? Infinity)) return; // hormati limit

    custom.push({ ...meta, manual: true, userAdded: true });
    saveCustomTokens(custom);
    rebuildTokens();
}

window.ensureTokenTracked = ensureTokenTracked;

window.tokenmanager = {
    loadDefaultTokens,
    rebuildTokens,
    getAllTokens,
    getHomeTokens,
    getSendTokens,
    getSwapTokens,
    getTokenData,
    syncCustomTokens
};

window.SIDRAPULSE = window.tokenmanager;

window.openAggregatorCandidatePicker =
    openAggregatorCandidatePicker;
