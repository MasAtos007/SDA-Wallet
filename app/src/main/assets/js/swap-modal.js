// =====================================
// SWAP MODAL
// =====================================

const WSDA_ADDR = "0xE4095a910209D7BE03B55D02F40d4554B1666182";

const SWAP_TOKEN_ALIAS = { WSDA: "SDA" };

function _t(key, fallback) {
    try {
        const lang = window.CURRENT_LANG || "id";
        return (window.LANG?.[lang]?.[key]) || fallback;
    } catch { return fallback; }
}

function getSwapDisplaySymbol(symbol) {
    if (!symbol) return "???";
    return SWAP_TOKEN_ALIAS[symbol] || symbol;
}


// =====================================
// REALISTIC OUTPUT
// =====================================
function getRealisticOut(amount, estimated) {

    if (!estimated || estimated <= 0) return 0;

    let correction;
    if      (amount < 0.00001) correction = 1.043;
    else if (amount < 0.001)   correction = 1.040;
    else if (amount < 0.01)    correction = 1.037;
    else                       correction = 1.033;

    const result = estimated * correction * 0.96;

    return (!isFinite(result) || result <= 0) ? 0 : result;
}


// =====================================
// GLOBAL STATE
// =====================================
window.swapState = {
    payToken:     "native",
    receiveToken: null
};

window.swapConfirmState = null;

let activeInput = "pay";


// =====================================
// INIT
// =====================================
document.addEventListener("DOMContentLoaded", () => {

    const modal          = document.getElementById("swapModal");
    const openBtn        = document.getElementById("openSwapBtn");
    const closeBtn       = document.getElementById("closeSwapModal");
    const walletNameEl   = document.getElementById("swapWalletName");
    const walletBalanceEl = document.getElementById("swapWalletBalance");
    const paySymbol      = document.getElementById("payTokenSymbol");
    const receiveSymbol  = document.getElementById("receiveTokenSymbol");
    const payIcon        = document.getElementById("payTokenIcon");
    const receiveIcon    = document.getElementById("receiveTokenIcon");
    const payBalanceEl   = document.getElementById("payBalance");
    const receiveBalanceEl = document.getElementById("receiveBalance");
    const switchBtn      = document.getElementById("switchSwap");
    const payInput       = document.getElementById("payAmount");
    const receiveInput   = document.getElementById("receiveAmount");


    // =====================================
    // INPUT LISTENERS
    // =====================================
    payInput?.addEventListener("input", function () {
        activeInput  = "pay";
        this.value   = this.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
        this.scrollLeft = this.scrollWidth;
        updateReceiveEstimate();
        updateRate();
        validatePayAmount();
    });

    receiveInput?.addEventListener("input", function () {
        activeInput  = "receive";
        this.value   = this.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
        this.scrollLeft = this.scrollWidth;
        updatePayEstimate();
        updateRate();
    });


    // =====================================
    // TOKEN DATA HELPER (local)
    // =====================================
    function getTokenData(addr) {
        const isNativeAddr = !addr || addr === "native";
        if (isNativeAddr) return { symbol: "SDA", logo: "img/sda.png" };

        const t = (window.TOKENS || []).find(x => x.address === addr);
        return {
            symbol: getSwapDisplaySymbol(t?.symbol || "???"),
            logo:   t?.logo || "img/default.png"
        };
    }


    // =====================================
    // INIT TOKENS
    // =====================================
    function initTokens() {
        swapState.payToken     = "native";
        swapState.receiveToken = null; // netral — user harus pilih sendiri
        updateUI();
    }


    // =====================================
    // UPDATE UI
    // =====================================
    async function updateUI() {
        const pay = getTokenData(swapState.payToken);

        if (paySymbol) paySymbol.innerText = pay.symbol;
        if (payIcon)   payIcon.src         = pay.logo;

        const searchIcon = document.getElementById("receiveTokenSearchIcon");

        if (!swapState.receiveToken) {
            // NETRAL — belum ada token tujuan dipilih
            if (receiveSymbol) receiveSymbol.innerText  = _t("swap_select_token", "Select Token");
            if (receiveIcon)   receiveIcon.style.display = "none";
            if (searchIcon)    searchIcon.style.display  = "";
            if (receiveBalanceEl) receiveBalanceEl.innerText = "0.0000";

            const rateEl = document.getElementById("swapRate");
            if (rateEl) rateEl.innerText = _t("swap_select_dest", "Select destination token");

            await Promise.all([
                updatePayBalance(),
                refreshWalletBalance()
            ]);
            return;
        }

        const recv = getTokenData(swapState.receiveToken);
        if (receiveSymbol) receiveSymbol.innerText = recv.symbol;
        if (receiveIcon) {
            receiveIcon.style.display = "";
            receiveIcon.src           = recv.logo;
        }
        if (searchIcon) searchIcon.style.display = "none";

        await Promise.all([
            updatePayBalance(),
            updateReceiveBalance(),
            refreshWalletBalance(),
            updateRate()
        ]);

        setTimeout(updateReceiveEstimate, 50);
    }


    // =====================================
    // RATE
    // =====================================
    async function updateRate() {
        const rateEl   = document.getElementById("swapRate");
        if (!rateEl) return;

        if (!swapState.receiveToken) {
            rateEl.innerText = _t("swap_select_dest", "Select destination token");
            return;
        }

        // tampilkan loading dulu sebelum rate selesai dihitung
        rateEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${_t("swap_rate_loading", "Loading rate...")}`;

        const payData  = getTokenData(swapState.payToken);
        const recvData = getTokenData(swapState.receiveToken);

        try {
            const out = await PRICE_ENGINE.getAmountOut(
                swapState.payToken,
                swapState.receiveToken,
                1
            );

            rateEl.innerText = (!out || isNaN(out))
                ? "No pool"
                : `1 ${payData.symbol} = ${Number(out).toFixed(6)} ${recvData.symbol}`;

        } catch {
            rateEl.innerText = "No pool";
        }
    }


    // =====================================
    // ESTIMATE RECEIVE
    // =====================================
    async function updateReceiveEstimate() {
        if (activeInput !== "pay") return;
        if (!swapState.receiveToken) return; // belum pilih token tujuan

        const val    = parseFloat(payInput?.value);
        const outEl  = document.getElementById("receiveAmount");
        const warnEl = document.getElementById("receiveAmountWarning");
        if (!outEl) return;

        if (isNaN(val) || val <= 0) {
            outEl.value = "0.0";
            if (warnEl) warnEl.style.display = "none";
            if (receiveInput) receiveInput.style.borderColor = "";
            return;
        }

        try {
            // Pakai curve untuk estimasi yang lebih akurat di field You Receive
            // getAmountOutCurve memperhitungkan price impact (constant product)
            // fallback ke linear kalau curve gagal
            const estimated = await (
                PRICE_ENGINE.getAmountOutCurve?.(
                    swapState.payToken,
                    swapState.receiveToken,
                    val
                ) || PRICE_ENGINE.getAmountOut(
                    swapState.payToken,
                    swapState.receiveToken,
                    val
                )
            );
            const realistic = getRealisticOut(val, estimated);

            if (!realistic || realistic <= 0) {
                outEl.value = "0.0";
                if (warnEl) warnEl.style.display = "block";
                if (receiveInput) receiveInput.style.borderColor = "#ff4444";
                return;
            }

            outEl.value = realistic.toFixed(6);

            // Cek kedalaman likuiditas — harga valid bukan berarti pool sanggup
            await validateLiquidityDepth();

        } catch {
            outEl.value = "0.0";
            if (warnEl) warnEl.style.display = "block";
            if (receiveInput) receiveInput.style.borderColor = "#ff4444";
        }
    }


    // =====================================
    // ESTIMATE PAY (reverse)
    // =====================================
    async function updatePayEstimate() {
        if (!swapState.receiveToken) return; // belum pilih token tujuan
        const val = parseFloat(receiveInput?.value);
        if (!payInput) return;
        if (isNaN(val) || val <= 0) { payInput.value = ""; return; }

        try {
            const forwardPrice = await PRICE_ENGINE.getPrice(
                swapState.payToken,
                swapState.receiveToken
            );
            if (!forwardPrice || forwardPrice <= 0) { payInput.value = ""; return; }

            const estimatedPay = val / forwardPrice;
            const realistic    = getRealisticOut(estimatedPay, estimatedPay);
            payInput.value     = realistic > 0 ? realistic.toFixed(6) : "";
        } catch {
            payInput.value = "";
        }
    }


    // =====================================
    // WALLET BALANCE
    // =====================================
    async function refreshWalletBalance() {
        const w = getSelectedWallet?.();
        if (!w) return;
        const bal = await getTokenBalance(w.address, "native");
        if (walletBalanceEl) walletBalanceEl.innerText =
            `${parseFloat(bal).toFixed(4)} SDA`;
    }

    async function updatePayBalance() {
        try {
            const w = getSelectedWallet?.();
            if (!w) return;

            const bal  = await getTokenBalance(w.address, swapState.payToken);
            const data = getTokenData(swapState.payToken);
            const safe = isFinite(parseFloat(bal)) ? parseFloat(bal) : 0;

            if (payBalanceEl) {
                payBalanceEl.innerHTML =
                    `${safe.toFixed(4)} ${data.symbol} <span class="max" id="btnMax">MAX</span>`;

                document.getElementById("btnMax")?.addEventListener("click", () => {
                    if (payInput) payInput.value = safe.toFixed(6);
                    updateReceiveEstimate?.();
                });
            }
        } catch {
            if (payBalanceEl) payBalanceEl.innerHTML =
                `0.0000 <span class="max" id="btnMax">MAX</span>`;
        }
    }

    // =====================================
    // VALIDASI SALDO LIVE
    // =====================================
    async function validatePayAmount() {
        const val = parseFloat(payInput?.value);
        const warnEl = document.getElementById("payAmountWarning");

        if (isNaN(val) || val <= 0) {
            payInput.style.borderColor = "";
            if (warnEl) warnEl.style.display = "none";
            return true;
        }

        const w = getSelectedWallet?.();
        if (!w) return true;

        const bal = await getTokenBalance(w.address, swapState.payToken);
        const safeBal = parseFloat(bal) || 0;

        if (val > safeBal) {
            payInput.style.borderColor = "#ff4444";
            if (warnEl) {
                warnEl.textContent = _t("swap_insufficient", "Insufficient balance");
                warnEl.style.display = "block";
            }
            return false;
        }

        payInput.style.borderColor = "";
        if (warnEl) warnEl.style.display = "none";
        return true;
    }

    window.validatePayAmount = validatePayAmount;

    // =====================================
    // SHAKE ANIMATION — indikator visual saat diblok
    // =====================================
    function shakePayInput() {
        if (!payInput) return;

        payInput.animate(
            [
                { transform: "translateX(0)" },
                { transform: "translateX(-6px)" },
                { transform: "translateX(6px)" },
                { transform: "translateX(-4px)" },
                { transform: "translateX(4px)" },
                { transform: "translateX(0)" }
            ],
            { duration: 350, easing: "ease-in-out" }
        );

        payInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    window.shakePayInput = shakePayInput;

    // =====================================
    // VALIDASI KEDALAMAN LIKUIDITAS
    // getAmountOut() linear, tidak pernah balikin 0
    // walau amount jauh melebihi reserve pool.
    // Cek manual pakai maxSwapIn dari getPoolLiquidity()
    // =====================================
    // =====================================
    // HELPER — sama persis dengan formatTokenAmount
    // di aggregator-engine.js, supaya konsisten
    // =====================================
    function _decimalsOf(addr) {
        if (!addr || addr === "native") return 18;
        const t = (window.TOKENS || []).find(
            x => x.address?.toLowerCase() === addr.toLowerCase()
        );
        return t?.decimals || 18;
    }

    function _formatRaw(raw, decimals) {
        if (raw === null || raw === undefined) return null;
        const num = Number(raw) / (10 ** decimals);
        return isFinite(num) ? num : null;
    }

    async function validateLiquidityDepth() {
        const val    = parseFloat(payInput?.value);
        const warnEl = document.getElementById("receiveAmountWarning");

        function showWarn() {
            if (warnEl) warnEl.style.display = "block";
            if (receiveInput) receiveInput.style.borderColor = "#ff4444";
        }
        function clearWarn() {
            if (warnEl) warnEl.style.display = "none";
            if (receiveInput) receiveInput.style.borderColor = "";
        }

        if (isNaN(val) || val <= 0 || !swapState.receiveToken) {
            clearWarn();
            return true;
        }

        try {
            // 1. Coba pool langsung dulu
            const direct = await PRICE_ENGINE.getPoolLiquidity(
                swapState.payToken,
                swapState.receiveToken
            );

            if (direct) {
                // PENTING: maxSwapIn dari PRICE_ENGINE masih RAW (belum dibagi decimals)
                const maxInHuman = _formatRaw(direct.maxSwapIn, _decimalsOf(swapState.payToken));
                if (maxInHuman !== null && val > maxInHuman) { showWarn(); return false; }
                clearWarn();
                return true;
            }

            // 2. Tidak ada pool langsung — kemungkinan multihop via WSDA
            const wsdaAddr = window.CONFIG?.WSDA;
            if (!wsdaAddr) { clearWarn(); return true; }

            const legIn = await PRICE_ENGINE.getPoolLiquidity(
                swapState.payToken,
                wsdaAddr
            );

            if (legIn) {
                const maxInHuman = _formatRaw(legIn.maxSwapIn, _decimalsOf(swapState.payToken));
                if (maxInHuman !== null && val > maxInHuman) { showWarn(); return false; }
            }

            const legOut = await PRICE_ENGINE.getPoolLiquidity(
                wsdaAddr,
                swapState.receiveToken
            );

            if (legIn && legOut) {
                const priceInToHub = await PRICE_ENGINE.getPrice(swapState.payToken, wsdaAddr);
                if (priceInToHub > 0) {
                    const hubAmount   = val * priceInToHub; // estimasi jumlah WSDA, human unit
                    const maxHubHuman = _formatRaw(legOut.maxSwapIn, _decimalsOf(wsdaAddr));
                    if (maxHubHuman !== null && hubAmount > maxHubHuman) {
                        showWarn();
                        return false;
                    }
                }
            }

            clearWarn();
            return true;

        } catch {
            return true; // jangan blokir kalau cek gagal — guard eksekusi tetap jadi jaring terakhir
        }
    }

    window.validateLiquidityDepth = validateLiquidityDepth;

    async function updateReceiveBalance() {
        try {
            const w = getSelectedWallet?.();
            if (!w) return;

            const bal  = await getTokenBalance(w.address, swapState.receiveToken);
            const data = getTokenData(swapState.receiveToken);
            const safe = isFinite(parseFloat(bal)) ? parseFloat(bal) : 0;

            if (receiveBalanceEl) receiveBalanceEl.innerText =
                `${safe.toFixed(4)} ${data.symbol}`;
        } catch {
            if (receiveBalanceEl) receiveBalanceEl.innerText = "0.0000";
        }
    }


    // =====================================
    // OPEN MODAL â€” buka bebas, guard di eksekusi
    // =====================================
    openBtn?.addEventListener("click", async () => {

    setBottomNavActive?.("navSwap");

    modal?.classList.add("show");

    const w = getSelectedWallet?.();
        if (w) {
            if (walletNameEl) walletNameEl.innerText = w.name || "Wallet";
            const bal = await getTokenBalance(w.address, "native");
            if (walletBalanceEl) walletBalanceEl.innerText =
                `${parseFloat(bal).toFixed(4)} SDA`;
        }

        await updateUI();
        setTimeout(updateReceiveEstimate, 300);
    });


    // =====================================
    // CLOSE
    // =====================================
    closeBtn?.addEventListener("click", () => {

    modal?.classList.remove("show");
    setBottomNavActive?.("navHome");

});

modal?.addEventListener("click", (e) => {

    if (e.target === modal) {

        modal.classList.remove("show");
        setBottomNavActive?.("navHome");

    }

});


    // =====================================
    // SWITCH TOKENS
    // =====================================
    switchBtn?.addEventListener("click", () => {
        if (!swapState.receiveToken) {
            showToast?.(_t("swap_select_dest", "Select destination token first"), "error");
            return;
        }

        const oldPay     = payInput?.value;
        const oldReceive = receiveInput?.value;

        [swapState.payToken, swapState.receiveToken] =
            [swapState.receiveToken, swapState.payToken];

        if (payInput)     payInput.value     = oldReceive || "";
        if (receiveInput) receiveInput.value = oldPay     || "";

        activeInput = "pay";
        updateUI();
        setTimeout(updateReceiveEstimate, 100);
        window.AGGREGATOR_updateToggle?.();
    });


    // =====================================
    // MAX BUTTON
    // =====================================
    document.addEventListener("click", async (e) => {
        if (e.target.id === "btnMax") {
            const w = getSelectedWallet?.();
            if (!w) return;
            const bal = await getTokenBalance(w.address, swapState.payToken);
            if (payInput) payInput.value = parseFloat(bal).toFixed(6);
            updateReceiveEstimate();
        }
    });


    // =====================================
    // TOKEN SELECTOR DROPDOWN
    // =====================================
    document.getElementById("payToken")?.addEventListener("click", () => openSelector("pay"));
    document.getElementById("receiveToken")?.addEventListener("click", () => openSelector("receive"));

    function openSelector(type) {

        const tokens   = window.TOKENS || [];
        const itemsHTML = tokens
            .filter(t => t.symbol !== "WSDA" && t.address !== WSDA_ADDR)
            .map(t => `
                <div class="token-item"
                     data-type="${type}"
                     data-address="${t.address}"
                     data-symbol="${t.symbol.toLowerCase()}">
                    <img src="${t.logo || 'img/default.png'}"
                         onerror="this.src='img/default.png'"
                         style="width:28px;height:28px;border-radius:50%;object-fit:contain;">
                    <span>${getSwapDisplaySymbol(t.symbol)}</span>
                </div>
            `).join("");

        const box = document.createElement("div");
        box.id    = "tokenPopup";
        box.innerHTML = `
            <div class="popup-bg"></div>
            <div class="popup">
                <div class="token-search">
                    <input type="text" id="tokenSearchInput" placeholder="Search token...">
                </div>
                <div id="tokenList">${itemsHTML}</div>
            </div>
        `;

        document.body.appendChild(box);

        box.querySelector("#tokenSearchInput")?.addEventListener("input", (e) => {
            const kw = e.target.value.toLowerCase();
            box.querySelectorAll(".token-item").forEach(item => {
                item.style.display = item.dataset.symbol.includes(kw) ? "flex" : "none";
            });
        });

        box.addEventListener("click", (e) => {
            if (e.target.classList.contains("popup-bg")) { box.remove(); return; }

            const item = e.target.closest(".token-item");
            if (!item) return;

            let tokenAddress = item.dataset.address;
            const symbol     = item.dataset.symbol;

            if (symbol === "sda" || tokenAddress === "native") tokenAddress = "native";

            if (type === "pay")     swapState.payToken     = tokenAddress;
            else                    swapState.receiveToken = tokenAddress;

            updateUI();
            box.remove();

            // Update state tombol Best Price
            window.AGGREGATOR_updateToggle?.();
        });
    }

    // Ekspos ke global supaya bisa dipanggil dari luar (misal setelah swap sukses)
    window._swapModalUpdateUI             = updateUI;
    window._swapModalRefreshWalletBalance = refreshWalletBalance;
    window._swapModalUpdatePayBalance     = updatePayBalance;
    window._swapModalUpdateReceiveBalance = updateReceiveBalance;
    window._swapModalUpdateRate           = updateRate;

    initTokens();
});


// =====================================
// SWAP BUTTON (dari confirm modal)
// =====================================
document.getElementById("swapButton")?.addEventListener("click", () => {
    SWAP_ENGINE.swapExactInput();
});


// =====================================
// TOKEN BALANCE HELPER — dengan cache + skip RPC decimals()
// untuk token yang sudah dikenal (dari window.TOKENS)
// =====================================
const _balanceCache = new Map(); // "addr_token" -> { value, ts }
const BALANCE_CACHE_TTL = 4000;  // 4 detik — cukup untuk 1 sesi ngetik amount

async function getTokenBalance(address, tokenAddr) {

    const cacheKey = `${address}_${tokenAddr || "native"}`.toLowerCase();
    const cached   = _balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < BALANCE_CACHE_TTL) {
        return cached.value;
    }

    try {
        const isNativeAddr =
            !tokenAddr ||
            tokenAddr === "native" ||
            tokenAddr === WSDA_ADDR;

        let result;

        if (isNativeAddr) {
            const bal = await provider.getBalance(address);
            result = ethers.utils.formatEther(bal);
        } else {
            // Token sudah dikenal (ada di tokens.json / customTokens)?
            // Kalau ya, decimals-nya SUDAH ADA, tidak perlu RPC lagi
            const known = (window.TOKENS || []).find(
                t => t.address?.toLowerCase() === tokenAddr.toLowerCase()
            );

            if (known) {
                const abi = ["function balanceOf(address) view returns (uint256)"];
                const contract = new ethers.Contract(tokenAddr, abi, provider);
                const bal = await contract.balanceOf(address);
                result = ethers.utils.formatUnits(bal, known.decimals || 18);
            } else {
                const abi = [
                    "function balanceOf(address) view returns (uint256)",
                    "function decimals() view returns (uint8)"
                ];
                const contract = new ethers.Contract(tokenAddr, abi, provider);
                const [bal, dec] = await Promise.all([
                    contract.balanceOf(address),
                    contract.decimals().catch(() => 18)
                ]);
                result = ethers.utils.formatUnits(bal, dec);
            }
        }

        _balanceCache.set(cacheKey, { value: result, ts: Date.now() });
        return result;

    } catch (e) {
        console.warn("getTokenBalance error:", e);
        return "0";
    }
}

// Dipanggil setelah swap sukses supaya saldo baru tidak "ketutup" cache 4 detik
window._invalidateBalanceCache = function (address) {
    if (!address) { _balanceCache.clear(); return; }
    const prefix = address.toLowerCase() + "_";
    for (const key of _balanceCache.keys()) {
        if (key.startsWith(prefix)) _balanceCache.delete(key);
    }
};


document.getElementById("swapButton")?.addEventListener("click", () => {
    SWAP_ENGINE.swapExactInput();
});

// =========================
// FIX: SWAP MODAL REFRESH
// =========================
window.refreshSwapModal = async function () {
    try {
        if (typeof window._swapModalUpdateUI === "function") {
            await window._swapModalUpdateUI();
        }

        if (typeof window._swapModalRefreshWalletBalance === "function") {
            await window._swapModalRefreshWalletBalance();
        }

        if (typeof window._swapModalUpdatePayBalance === "function") {
            await window._swapModalUpdatePayBalance();
        }

        if (typeof window._swapModalUpdateReceiveBalance === "function") {
            await window._swapModalUpdateReceiveBalance();
        }

        if (typeof window._swapModalUpdateRate === "function") {
            await window._swapModalUpdateRate();
        }

    } catch (e) {
        console.warn("[SWAP refresh error]", e);
    }
};

// =====================================
// SWAP SUCCESS MODAL
// Dipanggil dari swap-engine.js setelah swapExactInput() berhasil
// HANYA untuk swap manual (_silent = false)
// =====================================

let _swmCurrentHash = "";
let _swmExplorerUrl = "";

// Helper: parse actual output amount dari receipt Transfer logs
function _parseActualAmountOut(receipt, tokenOut, isNativeOut) {
    try {
        if (!receipt?.logs?.length) return null;

        // ABI Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
        const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

        // Untuk output SDA native: router unwrap WSDA → Transfer ke address(0) (burn)
        // Untuk output ERC20: Transfer langsung ke wallet user
        const wallet = getSelectedWallet?.();
        const userAddr = (wallet?.address || SESSION?.address || "").toLowerCase();
        const wsda = (window.CONFIG?.WSDA || "").toLowerCase();

        let bestAmount = null;

        for (const log of receipt.logs) {
            if (!log.topics || log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;

            try {
                const from = "0x" + log.topics[1].slice(26).toLowerCase();
                const to   = "0x" + log.topics[2].slice(26).toLowerCase();
                const raw  = ethers.BigNumber.from(log.data);

                if (isNativeOut) {
                    // Cari burn WSDA (to = address(0)) — itu yang jadi SDA native
                    if (
                        to === "0x0000000000000000000000000000000000000000" &&
                        log.address?.toLowerCase() === wsda
                    ) {
                        bestAmount = parseFloat(ethers.utils.formatEther(raw));
                    }
                } else {
                    // Cari Transfer ke wallet user untuk token tujuan
                    const tokenAddr = (tokenOut?.address || "").toLowerCase();
                    if (
                        to === userAddr &&
                        log.address?.toLowerCase() === tokenAddr
                    ) {
                        const decimals = tokenOut?.decimals || 18;
                        bestAmount = parseFloat(ethers.utils.formatUnits(raw, decimals));
                    }
                }
            } catch (e) { /* skip log rusak */ }
        }

        return bestAmount;
    } catch (e) {
        console.warn("[SWM] parse amount error:", e);
        return null;
    }
}

function showSwapSuccessModal({
    hash, receipt,
    amountIn, amountOut,
    tokenIn, tokenOut,
    explorerUrl
}) {
    const isNativeIn  = !tokenIn?.address  || tokenIn?.type  === "native";
    const isNativeOut = !tokenOut?.address || tokenOut?.type === "native";

    // Coba dapat angka real dari receipt — lebih akurat dari estimasi field
    const realAmountOut = _parseActualAmountOut(receipt, tokenOut, isNativeOut);
    const finalAmountOut = realAmountOut ?? amountOut; // fallback ke estimasi kalau parse gagal

    _swmCurrentHash = hash || "";
    _swmExplorerUrl = (explorerUrl || "https://ledger.sidrachain.com/tx/") + hash;

    const fromSymbol = isNativeIn  ? "SDA" : (tokenIn?.symbol  || "?");
    const toSymbol   = isNativeOut ? "SDA" : (tokenOut?.symbol || "?");
    const fromLogo   = isNativeIn  ? "img/sda.png" : (tokenIn?.logo  || "img/default.png");
    const toLogo     = isNativeOut ? "img/sda.png" : (tokenOut?.logo || "img/default.png");

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };
    const setSrc = (id, src) => {
        const el = document.getElementById(id);
        if (el) el.src = src;
    };

    setSrc("swmFromIcon",   fromLogo);
    setSrc("swmToIcon",     toLogo);
    set("swmFromAmount",    Number(amountIn        || 0).toLocaleString(undefined, { maximumFractionDigits: 6 }));
    set("swmToAmount",      Number(finalAmountOut  || 0).toLocaleString(undefined, { maximumFractionDigits: 6 }));
    set("swmFromSymbol",    fromSymbol);
    set("swmToSymbol",      toSymbol);

    const rate = amountIn > 0 && finalAmountOut > 0
        ? `1 ${fromSymbol} ≈ ${(finalAmountOut / amountIn).toFixed(6)} ${toSymbol}`
        : "—";
    set("swmRate", rate);

    const shortHash = hash ? hash.slice(0, 10) + "..." + hash.slice(-8) : "—";
    set("swmHash",    shortHash);
    set("swmBlock",   receipt?.blockNumber   ?? "—");
    set("swmConfirm", receipt?.confirmations ?? (receipt?.status === 1 ? (_t("tx_confirmed","Confirmed") + " ✓") : "—"));

    // Gas fee
    try {
        const gasUsed  = receipt?.gasUsed;
        const gasPrice = receipt?.effectiveGasPrice;
        if (gasUsed && gasPrice) {
            const fee = parseFloat(ethers.utils.formatEther(gasUsed.mul(gasPrice)));
            set("swmGas", fee.toFixed(6) + " SDA");
        } else {
            set("swmGas", "—");
        }
    } catch (e) {
        set("swmGas", "—");
    }

    // Waktu
    const now = new Date();
    const _locale = window.CURRENT_LANG === "en" ? "en-US" : window.CURRENT_LANG === "ar" ? "ar-SA" : "id-ID";
set("swmTime", now.toLocaleTimeString(_locale, {
        hour: "2-digit", minute: "2-digit", second: "2-digit"
    }) + " · " + now.toLocaleDateString(_locale, {
        day: "2-digit", month: "short", year: "numeric"
    }));

    const modal = document.getElementById("swapSuccessModal");
    if (modal) {
        modal.classList.add("show");
        document.body.style.overflow = "hidden";
    }
}

function closeSwapSuccessModal() {
    const modal = document.getElementById("swapSuccessModal");
    if (modal) modal.classList.remove("show");
    document.body.style.overflow = "";
}

function swmCopyHash() {
    if (!_swmCurrentHash) return;
    navigator.clipboard?.writeText(_swmCurrentHash)
        .then(() => showToast?.(_t("copied", "Copied"), "success"))
.catch(() => showToast?.(_t("copy_failed", "Copy failed"), "error"));
}

function swmOpenExplorer() {
    if (!_swmExplorerUrl) return;
    openExplorer(_swmExplorerUrl);
}

// Tutup saat klik backdrop
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("swapSuccessModal")
        ?.addEventListener("click", (e) => {
            if (e.target.id === "swapSuccessModal") closeSwapSuccessModal();
        });
});

// =====================================
// BUKA SWAP MODAL DENGAN TOKEN PRE-FILLED
// Dipanggil dari tombol "Sell" di tab Assets
// tokenAddress: "native" untuk SDA, atau address ERC-20
// =====================================
window.openSwapModalForSell = async function (tokenAddress) {
    const modal           = document.getElementById("swapModal");
    const walletNameEl    = document.getElementById("swapWalletName");
    const walletBalanceEl = document.getElementById("swapWalletBalance");

    swapState.payToken     = tokenAddress || "native";
    swapState.receiveToken = null;

    setBottomNavActive?.("navSwap");
    modal?.classList.add("show");

    const w = getSelectedWallet?.();
    if (w) {
        if (walletNameEl) walletNameEl.innerText = w.name || "Wallet";
        const bal = await getTokenBalance(w.address, "native");
        if (walletBalanceEl) walletBalanceEl.innerText =
            `${parseFloat(bal).toFixed(4)} SDA`;
    }

    if (typeof window._swapModalUpdateUI === "function") {
        await window._swapModalUpdateUI();
    }

    setTimeout(() => window.AGGREGATOR_updateToggle?.(), 100);
};