// =====================================
// TOKENS.JS â€” Token Manager + State
// Gabungan tokenManager.js + tokens.js
// =====================================

// =====================================
// GLOBAL TOKEN STATE
// =====================================
window.selectedToken     = localStorage.getItem("selectedToken") || "native";
window.selectedTokenData = null;
window.TOKENS            = [];

let DEFAULT_TOKENS = [];
let customTokens   = JSON.parse(localStorage.getItem("customTokens") || "[]");


// =====================================
// NORMALIZER â€” satu sumber kebenaran
// =====================================
function normalizeToken(t) {
    return {
        symbol:   t.symbol,
        name:     t.name     || t.symbol,
        address:  t.address,
        logo:     t.logo     || ("img/" + (t.icon || "default.png")),
        decimals: t.decimals || 18,
        type:     t.type     || "erc20",
        isNative: t.address  === "native"
    };
}


// =====================================
// STORAGE HELPERS
// =====================================
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
    customTokens  = getCustomTokens();
    window.TOKENS = [
        ...DEFAULT_TOKENS,
        ...customTokens.map(normalizeToken)
    ];
}


// =====================================
// LOAD TOKENS.JSON
// =====================================
async function loadDefaultTokens() {
    try {
        const res  = await fetch("./data/tokens.json");
        const raw  = await res.json();
        DEFAULT_TOKENS = raw.map(normalizeToken);
        rebuildTokens();
    } catch (e) {
        console.error("Failed to load tokens.json", e);
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

// alias â€” dipanggil di ui.js dan app.js
function syncCustomTokens() { rebuildTokens(); }
function syncTokenState()   { rebuildTokens(); }


// =====================================
// SET GLOBAL TOKEN â€” satu-satunya pintu
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
    if (logoBalance)  logoBalance.src  = logo;
    if (logoDropdown) logoDropdown.src = logo;

    // Sync semua modul
    syncSendTokenUI?.();
    applySendTokenState?.();
    loadBalance?.();
    updateSendBalance?.();
    renderAssets?.();
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
            <img src="${t.logo || 'img/default.png'}"
                 onerror="this.src='img/default.png'"
                 style="width:28px;height:28px;border-radius:50%;object-fit:contain;">
            <div>
                <b>${t.symbol}</b><br>
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

// Intercept native dropdown â€” pakai popup
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

    if (custom.length >= 33) {
        return showToast("Max 33 token", "error");
    }

    const exist = custom.find(
        t => t.address.toLowerCase() === token.address.toLowerCase()
    );
    if (exist) return showToast("Sudah ditambahkan", "error");

    custom.push(token);
    saveCustomTokens(custom);
    rebuildTokens();

    showToast("Token ditambahkan", "success");

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
function addToken(symbol, address) {

    symbol  = symbol.trim().toUpperCase();
    address = address.trim();

    if (!ethers.utils.isAddress(address)) {
        return showToast("Invalid contract address", "error");
    }

    const exists = getAllTokens().find(
        t => t.address.toLowerCase() === address.toLowerCase()
    );
    if (exists) return showToast("Token already added", "error");

    const newToken = normalizeToken({ symbol, address });

    customTokens.push(newToken);
    saveCustomTokens(customTokens);
    rebuildTokens();
    renderTokenList?.();
}


// =====================================
// REMOVE TOKEN
// =====================================
function removeToken(address) {

    customTokens = customTokens.filter(
        t => t.address.toLowerCase() !== address.toLowerCase()
    );
    saveCustomTokens(customTokens);
    rebuildTokens();

    renderAssets?.();
    renderTokenTab?.();
    renderTokenSelect?.();
    renderTokenList?.();
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

            <h3>Pilih Kandidat Aggregator</h3>

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

        showToast?.(
            "Aggregator candidates updated",
            "success"
        );

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
// EXPOSE â€” kompatibilitas modul lain
// =====================================
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