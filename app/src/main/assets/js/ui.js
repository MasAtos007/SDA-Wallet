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
// COPY TOKEN ADDRESS (tap nama token di tab Tokens)
// ==========================
// isWSDA: WSDA adalah pengecualian â€” alamat kontraknya memang alamat
// yang benar untuk dikirimi SDA kalau user mau wrap manual, jadi
// pesannya dibuat netral, bukan pesan larangan seperti token lain.
// Dipakai HANYA di tab Tokens sekarang â€” di tab Assets fitur copy +
// baris peringatan sudah dihapus supaya kartu tidak terlalu penuh
// dan tidak disangka alamat wallet oleh user.
function copyTokenAddress(address, isWSDA) {
    if (!address) return;

    const shortAddr = address.slice(0, 8) + "..." + address.slice(-6);
    // Toast dipendekin â€” cukup konfirmasi copy, tanpa embel-embel
    // peringatan kontrak. Peringatan itu sekarang cuma tampil di
    // tab Tokens (baris kecil di bawah tiap token), bukan lagi
    // di toast atau di tab Assets.
    const msg = (t("address_copied") || "Address copied") + ": " + shortAddr;

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
                        <div class="asset-name-row">
                            <div class="asset-name">Sidra Digital Asset</div>
                            <span class="token-badge-wrap">${tokenVerifyBadgeHTML("native")}</span>
                        </div>
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

        // Sembunyikan token saldo 0 â€” KECUALI token yang user tambah
        // sendiri, ATAU kalau toggle "tampilkan semua" aktif.
        if (amount <= 0 && !token.userAdded && !token.isSpamDetected && !assetShowHidden) return;

        visibleTokens.push(token);

        const isWSDA  = token.symbol === "WSDA";
        // Terdeteksi dari luar DAN tidak ada di tokens.json
        const flagged = token.isSpamDetected && !isVerifiedToken(token.address);

        // Kartu di tab Assets sengaja dibuat ringkas: TANPA tap-to-copy
        // dan TANPA baris peringatan kontrak. Ini supaya kartu tidak
        // terlalu padat info, dan menghindari risiko user tap-copy lalu
        // mengira itu alamat wallet. Peringatan + copy tetap ada di
        // tab Tokens, karena di situ konteksnya memang user mencari
        // alamat kontrak.
        listHtml += `
            <div class="asset-card">
                <div class="asset-card-top">
                    <div class="asset-card-info">
                        ${tokenLogoHTML(token, { cls: "asset-icon" })}
                        <div>
                            <div class="asset-name-row">
                                <div class="asset-name">${token.name || token.symbol}</div>
                                <span class="token-badge-wrap">${tokenVerifyBadgeHTML(token.address)}</span>
                            </div>
                            <div class="asset-subtitle">
                                ${t("erc20_token") || "ERC-20 Token"}
                                <span style="margin-left:6px;padding:1px 6px;border-radius:6px;font-size:10px;
                                    background:${flagged ? 'rgba(255,68,68,0.15)' : token.userAdded ? 'rgba(43,124,255,0.15)' : 'rgba(255,138,31,0.15)'};
                                    color:${flagged ? '#ff5c5c' : token.userAdded ? '#5b9bff' : '#ff8a1f'};">
                                    ${flagged ? _t("badge_detected", "Terdeteksi") : token.userAdded ? (t("badge_manual") || "Manual") : (t("badge_auto") || "Auto")}
                                </span>
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
    // USD CONVERSION â€” SEKALI BATCH untuk semua token visible,
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
                    const price    = token.isSpamDetected ? 0 : (Number(priceMap[token.symbol]) || 0);
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
// DETEKSI SALDO TERSEMBUNYI — Dynamic Token Discovery
// Hanya jalan saat tombol diklik (bukan auto).
//
// Sumber utama: token yang SEDANG DIPEGANG wallet (Blockscout
// /addresses/{addr}/tokens). Hasil dibagi dua:
//   - ada di tokens.json  -> masuk customTokens sebagai token biasa
//   - tidak ada di JSON   -> masuk customTokens dgn isSpamDetected:true
// Kalau Blockscout gagal: fallback scan RPC utk token JSON +
// riwayat token-transfers utk token luar.
// TIDAK ada batas jumlah (MAX_CUSTOM_TOKENS hanya utk tambah manual).
// ==========================
async function detectHiddenBalances() {

    const wallet = getSelectedWallet?.();
    if (!wallet) return;

    const btn     = document.getElementById("detectBalanceBtn");
    const btnText = document.getElementById("detectBalanceBtnText");

    if (btn) btn.disabled = true;
    if (btnText) btnText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + _t("detect_balance_detecting", "Mendeteksi...");

    try {

        const custom    = getCustomTokens();
        const customSet = new Set(custom.map(x => (x.address || "").toLowerCase()));

        // Token dari tokens.json (selain native), key = alamat lowercase
        const jsonMap = new Map(
            (DEFAULT_TOKENS || [])
                .filter(x => x.address && x.address !== "native")
                .map(x => [x.address.toLowerCase(), x])
        );

        const seen  = new Set();
        const found = [];   // { token, external, raw, decimals }

        const pushFound = (tk, raw) => {
            if (!tk || isLpNft(tk)) return;

            const addr = tk.address_hash || tk.address;     // v2 baru: address_hash
            if (!addr || !ethers.utils.isAddress(addr)) return;

            const key = addr.toLowerCase();
            if (customSet.has(key) || seen.has(key)) return;
            seen.add(key);

            const meta = jsonMap.get(key);
            found.push({
                key,
                json:     meta || null,
                external: tk,
                raw:      raw ?? null,
                decimals: parseInt(tk.decimals, 10)
            });
        };

        // ---------- Sumber utama: token yang dipegang ----------
        const holdings = await fetchTokenHoldingsFromBlockscout(wallet.address);

        if (holdings) {
            for (const item of holdings) {
                if (!item || !item.token) continue;
                // value "0" = sudah tidak dipegang
                if (item.value != null && /^0+$/.test(String(item.value))) continue;
                pushFound(item.token, item.value);
            }
        } else {
            // ---------- Fallback 1: scan RPC token JSON ----------
            const candidates = [...jsonMap.values()]
                .filter(x => !customSet.has(x.address.toLowerCase()));

            if (candidates.length) {
                try {
                    const balances = await batchGetTokenBalancesChunked(candidates, wallet.address, 15, 600);
                    candidates.forEach(tk => {
                        const r = balances[tk.address];
                        if (!r || !r.balance) return;
                        if (ethers.BigNumber.from(r.balance).gt(0)) {
                            pushFound({ address: tk.address, decimals: r.decimals }, String(r.balance));
                        }
                    });
                } catch (e) {
                    console.warn("[detect] scan RPC gagal:", e.message);
                }
            }

            // ---------- Fallback 2: token luar dari riwayat transfer ----------
            const transfers = await fetchTokenTransfersFromBlockscout(wallet.address, 3);
            if (transfers === null && !found.length) {
                showToast?.(t("detect_balance_error") || "Gagal memindai saldo", "error");
                return;
            }
            for (const item of (transfers || [])) pushFound(item && item.token, null);
        }

        if (!found.length) {
            showToast?.(t("detect_balance_none") || "Tidak ada token baru untuk dipindai", "info");
            return;
        }

        found.forEach(f => {

            let entry;

            if (f.json) {
                // Token resmi (ada di tokens.json) -> token biasa
                entry = normalizeToken({
                    ...f.json,
                    manual: false, isSpamDetected: false, userAdded: false
                });
            } else {
                const tk     = f.external;
                const symbol = sanitizeTokenText(tk.symbol, 12, "UNKNOWN");
                entry = normalizeToken({
                    symbol,
                    name:     sanitizeTokenText(tk.name, 32, symbol),
                    address:  ethers.utils.getAddress(f.key),
                    decimals: Number.isInteger(f.decimals) ? f.decimals : 18,
                    // Logo dari luar tidak dipakai; UI otomatis pakai avatar inisial
                    logo:     "img/default.png",
                    type:     "erc20",
                    manual:         false,
                    isSpamDetected: true,
                    userAdded:      false
                });
            }

            custom.push(entry);

            // Isi cache saldo dulu supaya langsung tampil sebelum refreshAll selesai
            if (f.raw != null) {
                try {
                    const v = parseFloat(ethers.utils.formatUnits(f.raw, entry.decimals)).toFixed(4);
                    localStorage.setItem(wallet.address + "_" + entry.address, v + " " + entry.symbol);
                } catch {}
            }
        });

        saveCustomTokens(custom);
        rebuildTokens();

        // Ambil saldo semua token (termasuk yang baru) lalu render ulang
        await refreshAll?.();
        renderAssets?.();
        renderTokenTab?.();
        renderTokenSelect?.();

        showToast?.(
            found.length + " " + (t("detect_balance_found") || "token dengan saldo ditemukan"),
            "success"
        );

    } catch (e) {
        console.error("[detectHiddenBalances]", e);
        showToast?.(t("detect_balance_error") || "Gagal memindai saldo", "error");
    } finally {
        // renderAssets() membuat ulang tombol, jadi ambil elemen terbaru
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
    // tiap baris token di bawah â€” itu sudah cukup jadi pengingat
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
        const isWSDA    = token.symbol === "WSDA";

        const shortTokenAddr = token.address.slice(0, 8) + "..." + token.address.slice(-6);

        html += `
            <div class="asset-item token-row"
                 data-symbol="${token.symbol.toLowerCase()}">

                <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
                    ${tokenLogoHTML(token, { size: 28, style: "flex-shrink:0;" })}
                    <div style="min-width:0;">
                        <div class="token-name-row">
                            <b class="token-name-text">${token.name || token.symbol}</b>
                            <span class="token-badge-wrap">${tokenVerifyBadgeHTML(token.address)}</span>
                        </div>
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