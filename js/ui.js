// =====================================
// UI.JS
// =====================================

// ==========================
// HELPER LANG
// ==========================
function t(key) {
    try   { return LANG?.[CURRENT_LANG]?.[key] || key; }
    catch { return key; }
}


// ==========================
// ASSET RENDER
// ==========================
function renderAssets() {

    // rebuild dulu biar window.TOKENS selalu fresh
    syncCustomTokens?.();

    const container = document.getElementById("tab-assets");
    if (!container) return;

    const wallet = getSelectedWallet?.();

    if (!wallet) {
        container.innerHTML =
            `<div style="color:#888;text-align:center;">${t("no_wallet_text")}</div>`;
        return;
    }

    let html = "";

    // ==========================
    // SDA (NATIVE)
    // ==========================
    const sdaCache = localStorage.getItem(wallet.address + "_native") || "0.00 SDA";

    html += `
        <div class="asset-item">
            <div style="display:flex;align-items:center;gap:10px;">
                <img src="img/sda.png"
                     style="width:32px;height:32px;border-radius:50%;"
                     onerror="this.src='img/default.png'">
                <div>
                    <b>Sidra Digital Asset</b><br>
                    <small style="color:#888;">Native Token</small>
                </div>
            </div>
            <div>
                ${sdaCache.replace(" SDA", "")}
                <span style="color:#888;">SDA</span>
            </div>
        </div>
    `;

    // ==========================
    // ERC20 TOKENS
    // Hanya render customTokens (yang user tambahkan)
    // bukan semua DEFAULT_TOKENS
    // max 10 token untuk hindari limit RPC
    // ==========================
    const tokens = getCustomTokens().slice(0, 10).map(normalizeToken);

    tokens.forEach(token => {

        const cacheKey = wallet.address + "_" + token.address;
        const cached   = localStorage.getItem(cacheKey) || ("0.00 " + token.symbol);
        const isWSDA   = token.symbol === "WSDA";
        const logo     = token.logo || token.icon || "img/default.png";

        html += `
            <div class="asset-item">
                <div style="display:flex;align-items:center;gap:10px;">
                    <img src="${logo}"
                         onerror="this.src='img/default.png'"
                         style="width:32px;height:32px;border-radius:50%;object-fit:contain;">
                    <div>
                        <b>${token.name || token.symbol}</b><br>
                        <small style="color:#888;">ERC-20 Token</small>
                    </div>
                </div>

                <div style="display:flex;align-items:center;gap:6px;">
                    <div>
                        ${cached.replace(" " + token.symbol, "")}
                        <span style="color:#888;">${token.symbol}</span>
                    </div>

                    ${isWSDA ? `
                        <button onclick="UNWRAP_ENGINE.unwrapAll()"
                            style="margin-left:8px;padding:4px 8px;font-size:12px;
                                   background:#ffb020;border:none;border-radius:6px;">
                            Unwrap
                        </button>
                    ` : ""}

                    <button onclick="removeToken('${token.address}')"
                            class="remove-token-btn">
                        <i class="fa-solid fa-minus"></i>
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}


// ==========================
// TOKEN TAB
// ==========================
function renderTokenTab() {

    syncTokenState?.();

    const container = document.getElementById("tab-tokens");
    if (!container) return;

    let html = `
        <input type="text" id="searchToken"
               placeholder="${t("search_token") || 'Search token...'}"
               style="margin-bottom:10px;">
    `;

    const addedAddresses = new Set(
        getCustomTokens().map(t => t.address.toLowerCase())
    );

    DEFAULT_TOKENS.forEach(token => {

        if (token.symbol === "SDA") return;

        const isAdded   = addedAddresses.has(token.address.toLowerCase());
        const tokenData = encodeURIComponent(JSON.stringify(token));
        const logo      = token.logo || token.icon || "img/default.png";

        html += `
            <div class="asset-item token-row"
                 data-symbol="${token.symbol.toLowerCase()}">

                <div style="display:flex;align-items:center;gap:10px;">
                    <img src="${logo}"
                         onerror="this.src='img/default.png'"
                         style="width:28px;height:28px;border-radius:50%;object-fit:contain;">
                    <div>
                        <b>${token.name || token.symbol}</b><br>
                        <small style="color:#888;">${token.symbol}</small>
                    </div>
                </div>

                ${isAdded
                    ? `<span style="color:#888;">${t("added") || "Added"}</span>`
                    : `<button class="add-token-btn"
                               onclick='addTokenFromList(JSON.parse(decodeURIComponent("${tokenData}")))'>
                           <i class="fa-solid fa-plus"></i>
                       </button>`
                }
            </div>
        `;
    });

    container.innerHTML = html;
    initTokenSearch();
}


// ==========================
// SEARCH TOKEN
// ==========================
function initTokenSearch() {
    const input = document.getElementById("searchToken");
    if (!input) return;

    input.addEventListener("input", () => {
        const keyword = input.value.toLowerCase();
        document.querySelectorAll(".token-row").forEach(row => {
            row.style.display =
                row.dataset.symbol.includes(keyword) ? "flex" : "none";
        });
    });
}


// ==========================
// TAB SWITCH
// ==========================
function switchTab(tab) {

    document.querySelectorAll(".tab")
        .forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".tab-content")
        .forEach(el => el.classList.remove("active"));

    document.querySelector(`.tab[onclick="switchTab('${tab}')"]`)
        ?.classList.add("active");

    document.getElementById("tab-" + tab)?.classList.add("active");

    if (tab === "assets") renderAssets();
    if (tab === "tokens") renderTokenTab();
    if (tab === "lp")     renderLP?.();
}


// ==========================
// LP LIST UI
// ==========================
function renderLPList() {

    const container = document.getElementById("lpList");
    const list      = getLPs?.();

    if (!list || list.length === 0) {
        if (container) container.innerHTML =
            `<div style='text-align:center;color:#888;'>${t("no_lp") || "No LP added"}</div>`;
        return;
    }

    container.innerHTML = list.map(id => `
        <div class="asset-item">
            <div>
                <b>LP Position</b><br>
                <small style="color:#888;">NFT ID: #${id}</small>
            </div>
            <div>
                <button onclick="removeLP('${id}')" style="width:auto;">
                    ${t("remove") || "Remove"}
                </button>
            </div>
        </div>
    `).join("");
}


// ==========================
// TOGGLE ADDRESS
// ==========================
function toggleAddress(el) {
    el.classList.toggle("address-full");
}