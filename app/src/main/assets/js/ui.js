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
// STATE FILTER/SORT ASSET TAB
// ==========================
let assetShowHidden    = false;
let assetSortByBalance = false;

function toggleAssetShowHidden() {
    assetShowHidden = !assetShowHidden;
    renderAssets();
}

function toggleAssetSortByBalance() {
    assetSortByBalance = !assetSortByBalance;
    renderAssets();
}

// ==========================
// COPY TOKEN ADDRESS (tap nama token di asset card)
// ==========================
// isWSDA: WSDA adalah pengecualian — alamat kontraknya memang alamat
// yang benar untuk dikirimi SDA kalau user mau wrap manual, jadi
// pesannya dibuat netral, bukan pesan larangan seperti token lain.
function copyTokenAddress(address, isWSDA) {
    if (!address) return;

    const shortAddr = address.slice(0, 8) + "..." + address.slice(-6);
    // Keterangan: untuk token biasa ini alamat SMART CONTRACT, BUKAN
    // alamat wallet, jadi user diberi peringatan. Untuk WSDA, alamat
    // ini justru valid untuk menerima SDA (wrap manual), jadi pesannya
    // netral. Diambil dari lang.json supaya konsisten dengan bahasa
    // yang dipilih user (id/en/ar).
    const warning = isWSDA
        ? t("wsda_contract_note")
        : t("contract_address_warning_short");
    const msg = (t("address_copied") || "Address copied") + ": " + shortAddr + "\n" + warning;

    const doCopy = () => showToast?.(msg, "success");

    if (window.AndroidWallet?.copyToClipboard) {
        window.AndroidWallet.copyToClipboard(address);
        doCopy();
    } else if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(address).then(doCopy).catch(() => {
            showToast?.(t("copy_failed") || "Gagal menyalin", "error");
        });
    }
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

    // ==========================
    // TOMBOL DETEKSI SALDO (manual, tidak auto fetch)
    // ==========================
    let html = `
        <div style="display:flex;gap:8px;margin-bottom:8px;">
            <button onclick="toggleAssetShowHidden()"
                style="flex:1;padding:8px;background:${assetShowHidden ? '#ff7a00' : '#1a1a1a'};
                       border:1px solid #333;border-radius:10px;color:#fff;font-size:12px;cursor:pointer;">
                ${assetShowHidden ? (t("asset_hide_zero") || "Hide zero balance") : (t("asset_show_all") || "Show all")}
            </button>
            <button onclick="toggleAssetSortByBalance()"
                style="flex:1;padding:8px;background:${assetSortByBalance ? '#ff7a00' : '#1a1a1a'};
                       border:1px solid #333;border-radius:10px;color:#fff;font-size:12px;cursor:pointer;">
                ${assetSortByBalance ? (t("asset_sort_balance") || "Sort: Highest balance") : (t("asset_sort_default") || "Sort: Default")}
            </button>
        </div>
        <button id="detectBalanceBtn" onclick="detectHiddenBalances()"
            style="width:100%;padding:10px;margin-bottom:10px;
                   background:#1a1a1a;border:1px solid #333;border-radius:10px;
                   color:#ff7a00;font-size:13px;font-weight:600;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;gap:8px;">
            <i class="fa-solid fa-magnifying-glass-dollar"></i>
            <span id="detectBalanceBtnText">${t("detect_balance_btn") || "Deteksi Saldo"}</span>
        </button>
        <div id="assetListInner"></div>
    `;

    container.innerHTML = html;

    const listEl = document.getElementById("assetListInner");
    let listHtml = "";

    // ==========================
    // SDA (NATIVE) -> selalu tampil, walau 0
    // ==========================
    const sdaCache = localStorage.getItem(wallet.address + "_native") || "0.00 SDA";

    listHtml += `
        <div class="asset-card">
            <div class="asset-card-top">
                <div class="asset-card-info">
                    <img class="asset-icon" src="img/sda.png"
                         onerror="this.src='img/default.png'">
                    <div>
                        <div class="asset-name">Sidra Digital Asset</div>
                        <div class="asset-subtitle">${t("native_token") || "Native Token"}</div>
                    </div>
                </div>
                <div class="asset-amount">
                    <span class="asset-amount-value">${sdaCache.replace(" SDA", "")}</span>
                    <span class="asset-amount-symbol">SDA</span>
                </div>
            </div>
            <div class="asset-card-bottom">
                <div class="asset-usd">
                    <span id="assetUsdSda"><span class="asset-skeleton" style="width:50px;"></span></span>
                    <svg class="asset-sparkline" width="70" height="24" viewBox="0 0 70 24" fill="none">
                        <polyline points="0,18 8,14 16,17 24,10 32,13 40,6 48,9 56,4 64,8 70,3"
                                  stroke="#ff8a1f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <button onclick="openSwapModalForSell('native')" class="btn-jual">
                    ${t("sell_btn") || "Jual"}
                </button>
            </div>
        </div>
    `;

    // ==========================
    // ERC20 TOKENS
    // Hanya render customTokens (yang user tambahkan)
    // Token dengan saldo 0 disembunyikan
    // ==========================
    let tokens = getCustomTokens().map(normalizeToken);

    if (assetSortByBalance) {
        tokens = tokens.slice().sort((a, b) => {
            const balA = parseFloat(localStorage.getItem(wallet.address + "_" + a.address)) || 0;
            const balB = parseFloat(localStorage.getItem(wallet.address + "_" + b.address)) || 0;
            return balB - balA;
        });
    }

    const visibleTokens = [];

    tokens.forEach(token => {

        const cacheKey = wallet.address + "_" + token.address;
        const cached   = localStorage.getItem(cacheKey) || ("0.00 " + token.symbol);
        const amount   = parseFloat(cached) || 0;

        // Sembunyikan token saldo 0 — KECUALI token yang user tambah
        // sendiri, ATAU kalau toggle "tampilkan semua" aktif.
        if (amount <= 0 && !token.userAdded && !assetShowHidden) return;

        visibleTokens.push(token);

        const isWSDA = token.symbol === "WSDA";
        const logo   = token.logo || token.icon || "img/default.png";

        // Baris kecil per-token ini adalah SATU-SATUNYA pengingat alamat
        // kontrak (Opsi A: banner besar di tab Token dihapus, cukup
        // pengingat kontekstual persis di titik yang relevan). Untuk
        // WSDA pesannya netral karena alamat kontraknya memang valid
        // untuk menerima SDA (wrap manual).
        listHtml += `
            <div class="asset-card">
                <div class="asset-card-top">
                    <div class="asset-card-info" onclick="copyTokenAddress('${token.address}', ${isWSDA})" style="cursor:pointer;">
                        <img class="asset-icon" src="${logo}"
                             onerror="this.src='img/default.png'">
                        <div>
                            <div class="asset-name">
                                ${token.name || token.symbol}
                                <i class="fa-regular fa-copy" style="font-size:11px;color:#666;margin-left:6px;"></i>
                            </div>
                            <div class="asset-subtitle">
                                ${t("erc20_token") || "ERC-20 Token"}
                                <span style="margin-left:6px;padding:1px 6px;border-radius:6px;font-size:10px;
                                    background:${token.userAdded ? 'rgba(43,124,255,0.15)' : 'rgba(255,138,31,0.15)'};
                                    color:${token.userAdded ? '#5b9bff' : '#ff8a1f'};">
                                    ${token.userAdded ? (t("badge_manual") || "Manual") : (t("badge_auto") || "Auto")}
                                </span>
                            </div>
                            <div class="asset-contract-warning"
                                 style="font-size:10px;color:${isWSDA ? '#5b9bff' : '#8a8a8a'};margin-top:2px;line-height:1.3;">
                                <i class="fa-solid ${isWSDA ? 'fa-circle-info' : 'fa-triangle-exclamation'}"
                                   style="color:${isWSDA ? '#5b9bff' : '#ff7a00'};margin-right:4px;"></i>
                                ${isWSDA ? t("wsda_contract_note") : t("contract_address_warning_short")}
                            </div>
                        </div>
                    </div>
                    <div class="asset-amount">
                        <span class="asset-amount-value">${cached.replace(" " + token.symbol, "")}</span>
                        <span class="asset-amount-symbol">${token.symbol}</span>
                    </div>
                </div>
                <div class="asset-card-bottom">
                    <div class="asset-usd">
                        <span id="assetUsd_${token.address}"><span class="asset-skeleton" style="width:50px;"></span></span>
                    </div>
                    <div class="asset-actions">
                        ${!isWSDA ? `
                            <button onclick="openSwapModalForSell('${token.address}')" class="btn-jual">
                                ${t("sell_btn") || "Jual"}
                            </button>
                        ` : ""}
                        ${isWSDA ? `
                            <button onclick="UNWRAP_ENGINE.unwrapAll()" class="btn-unwrap">
                                Unwrap
                            </button>
                        ` : ""}
                        <button onclick="removeToken('${token.address}')" class="remove-token-btn">
                            <i class="fa-solid fa-minus"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    });

    if (listEl) listEl.innerHTML = listHtml;

     // ==========================
    // USD CONVERSION — SEKALI BATCH untuk semua token visible,
    // BUKAN formatUSD per token satu-satu (itu yang bikin tiap
    // token nembak rpcBatch sendiri-sendiri, jadi ratusan call).
    // ==========================
    if (typeof formatUSD === "function") {

        const sdaAmount = parseFloat(sdaCache) || 0;
        formatUSD(sdaAmount, "SDA").then(text => {
            const el = document.getElementById("assetUsdSda");
            if (el) el.textContent = text;
        });

        if (visibleTokens.length && typeof batchGetTokenUsdPrices === "function") {
            batchGetTokenUsdPrices(visibleTokens).then(priceMap => {
                visibleTokens.forEach(token => {
                    const cacheKey = wallet.address + "_" + token.address;
                    const cached   = localStorage.getItem(cacheKey) || ("0.00 " + token.symbol);
                    const amount   = parseFloat(cached) || 0;
                    const price    = priceMap[token.symbol] || 0;
                    const usd      = amount * price;

                    const el = document.getElementById("assetUsd_" + token.address);
                    if (el) {
                        el.textContent = "~ $" + usd.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }) + " USD";
                    }
                });
            }).catch(e => {
                console.warn("[renderAssets] batchGetTokenUsdPrices gagal:", e);
            });
        }
    }
}

// ==========================
// DETEKSI SALDO TERSEMBUNYI
// Hanya jalan saat tombol diklik (bukan auto).
// Scan token yang BELUM ditambahkan saja,
// pakai Promise.all supaya satu batch paralel.
// ==========================
async function detectHiddenBalances() {

    const wallet = getSelectedWallet?.();
    if (!wallet) return;

    const btn     = document.getElementById("detectBalanceBtn");
    const btnText = document.getElementById("detectBalanceBtnText");

    if (btn) btn.disabled = true;
    if (btnText) btnText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + (t("detect_balance_scanning") || "Memindai saldo...");

    try {

        const custom     = getCustomTokens();
        const addedAddr  = new Set(custom.map(x => x.address.toLowerCase()));

        const emptyCacheKey = "emptyScanned_" + wallet.address;
        const EMPTY_TTL = 24 * 60 * 60 * 1000; // 24 jam
        const _now = Date.now();
        const emptyRaw = JSON.parse(localStorage.getItem(emptyCacheKey) || "[]")
            .map(x => typeof x === "string" ? { address: x, ts: 0 } : x); // migrasi format lama
        const emptyScanned = new Set(
            emptyRaw.filter(e => _now - e.ts < EMPTY_TTL).map(e => e.address)
        );

        const candidates = (DEFAULT_TOKENS || []).filter(
            x => x.address !== "native"
              && !addedAddr.has(x.address.toLowerCase())
              && !emptyScanned.has(x.address.toLowerCase())
        );

        if (!candidates.length) {
            showToast?.(t("detect_balance_none") || "Tidak ada token baru untuk dipindai", "info");
            return;
        }

        const balances = await batchGetTokenBalancesChunked(candidates, wallet.address, 15, 600);

        const results = candidates.map(token => {
            const r = balances[token.address];
            if (!r) return { token, value: 0 };

            const value = parseFloat(
                ethers.utils.formatUnits(r.balance, r.decimals)
            );
            return { token, value };
        });

        const found = results.filter(r => r.value > 0);
        const empty = results.filter(r => r.value <= 0).map(r => r.token.address.toLowerCase());

        const stillValid = emptyRaw.filter(e => _now - e.ts < EMPTY_TTL && !empty.includes(e.address));
        const updatedEmpty = [
            ...stillValid,
            ...empty.map(addr => ({ address: addr, ts: _now }))
        ];
        localStorage.setItem(emptyCacheKey, JSON.stringify(updatedEmpty));

        if (!found.length) {
            showToast?.(t("detect_balance_empty") || "Tidak ditemukan saldo tambahan", "info");
            return;
        }

        let custom2 = getCustomTokens();
        let addedCount = 0;

        found.forEach(({ token, value }) => {
            if (custom2.length >= (window.MAX_CUSTOM_TOKENS ?? Infinity)) return;

            const exists = custom2.some(
                x => x.address.toLowerCase() === token.address.toLowerCase()
            );
            if (exists) return;

            // TIDAK diberi userAdded -> akan otomatis kena filter
            // sembunyikan-jika-0 di renderAssets() kalau saldonya balik nol
            custom2.push({ ...token, manual: true });
            localStorage.setItem(
                wallet.address + "_" + token.address,
                value.toFixed(4) + " " + token.symbol
            );
            addedCount++;
        });

        saveCustomTokens(custom2);
        rebuildTokens();

        showToast?.(
            addedCount + " " + (t("detect_balance_found") || "token dengan saldo ditemukan"),
            "success"
        );

        renderAssets?.();
        renderTokenTab?.();
        renderTokenSelect?.();

    } catch (e) {
        console.error("[detectHiddenBalances]", e);
        showToast?.(t("detect_balance_error") || "Gagal memindai saldo", "error");
    } finally {
        const btn2     = document.getElementById("detectBalanceBtn");
        const btnText2 = document.getElementById("detectBalanceBtnText");
        if (btn2) btn2.disabled = false;
        if (btnText2) btnText2.textContent = t("detect_balance_btn") || "Deteksi Saldo";
    }
}


// ==========================
// TOKEN TAB
// ==========================
function renderTokenTab() {

    syncTokenState?.();

    const container = document.getElementById("tab-tokens");
    if (!container) return;

    // Opsi A: banner besar (5 baris, muncul permanen tiap buka tab Token)
    // DIHAPUS. Redundan dengan baris peringatan kecil yang sudah ada di
    // tiap baris token di bawah — itu sudah cukup jadi pengingat
    // kontekstual tepat di titik yang relevan (saat user mau tap copy).
    let html = `
        <div style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:6px;width:100%;
                    position:sticky;top:0;z-index:5;background:#0f0f0f;padding:8px 0 0 0;">
            <input type="text" id="searchToken" class="sidra-token-search-v2"
                   placeholder="${t("search_token") || 'Search token...'}"
                   style="width:100%;min-width:0;box-sizing:border-box;
                          padding:10px 12px;background:#1a1a1a;border:1px solid #333;
                          border-radius:10px;color:#fff;font-size:13px;">
            <button onclick="resetAllTokens()"
                style="padding:0 14px;background:#3a1a1a;border:1px solid #5c2323;
                       border-radius:10px;color:#ff5c5c;font-size:13px;white-space:nowrap;cursor:pointer;">
                <i class="fa-solid fa-trash"></i> ${t("reset_token_btn") || "Reset"}
            </button>
        </div>
    `;

    const addedAddresses = new Set(
        getCustomTokens().map(t => t.address.toLowerCase())
    );

    DEFAULT_TOKENS.forEach(token => {

        if (token.symbol === "SDA") return;

        const isAdded   = addedAddresses.has(token.address.toLowerCase());
        const tokenData = encodeURIComponent(JSON.stringify(token));
        const logo      = token.logo || token.icon || "img/default.png";
        const isWSDA    = token.symbol === "WSDA";

        const shortTokenAddr = token.address.slice(0, 8) + "..." + token.address.slice(-6);

        html += `
            <div class="asset-item token-row"
                 data-symbol="${token.symbol.toLowerCase()}">

                <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
                    <img src="${logo}"
                         onerror="this.src='img/default.png'"
                         style="width:28px;height:28px;border-radius:50%;object-fit:contain;flex-shrink:0;">
                    <div style="min-width:0;">
                        <b>${token.name || token.symbol}</b><br>
                        <small style="color:#888;">${token.symbol}</small><br>
                        <small onclick="event.stopPropagation();copyTokenAddress('${token.address}', ${isWSDA})"
                               style="color:#5b9bff;cursor:pointer;font-family:monospace;font-size:10.5px;">
                            ${shortTokenAddr} <i class="fa-regular fa-copy" style="font-size:9px;"></i>
                        </small><br>
                        <small style="color:${isWSDA ? '#5b9bff' : '#8a8a8a'};font-size:9.5px;">
                            <i class="fa-solid ${isWSDA ? 'fa-circle-info' : 'fa-triangle-exclamation'}"
                               style="color:${isWSDA ? '#5b9bff' : '#ff7a00'};"></i>
                            ${isWSDA ? t("wsda_contract_note") : t("contract_address_warning_short")}
                        </small>
                    </div>
                </div>

                ${isAdded
                    ? `<button class="remove-token-btn"
                               onclick="removeToken('${token.address}')"
                               title="${t('remove') || 'Remove'}">
                           <i class="fa-solid fa-minus"></i>
                       </button>`
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
               <b>${t("lp_position") || "LP Position"}</b><br>
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
