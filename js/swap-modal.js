// =====================================
// SWAP MODAL
// =====================================

const WSDA_ADDR = "0xE4095a910209D7BE03B55D02F40d4554B1666182";

const SWAP_TOKEN_ALIAS = { WSDA: "SDA" };

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
        const tokens = window.TOKENS || [];
        swapState.payToken     = "native";
        const first            = tokens.find(t => t.symbol !== "WSDA");
        swapState.receiveToken = first?.address || "native";
        updateUI();
    }


    // =====================================
    // UPDATE UI
    // =====================================
    async function updateUI() {
        const pay  = getTokenData(swapState.payToken);
        const recv = getTokenData(swapState.receiveToken);

        if (paySymbol)     paySymbol.innerText     = pay.symbol;
        if (receiveSymbol) receiveSymbol.innerText = recv.symbol;
        if (payIcon)       payIcon.src             = pay.logo;
        if (receiveIcon)   receiveIcon.src         = recv.logo;

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

        const val   = parseFloat(payInput?.value);
        const outEl = document.getElementById("receiveAmount");
        if (!outEl) return;

        if (isNaN(val) || val <= 0) { outEl.value = "0.0"; return; }

        try {
            const estimated = await PRICE_ENGINE.getAmountOut(
                swapState.payToken,
                swapState.receiveToken,
                val
            );
            const realistic = getRealisticOut(val, estimated);
            outEl.value = realistic > 0 ? realistic.toFixed(6) : "0.0";
        } catch {
            outEl.value = "0.0";
        }
    }


    // =====================================
    // ESTIMATE PAY (reverse)
    // =====================================
    async function updatePayEstimate() {
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
    closeBtn?.addEventListener("click", () => modal?.classList.remove("show"));

    modal?.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("show");
    });


    // =====================================
    // SWITCH TOKENS
    // =====================================
    switchBtn?.addEventListener("click", () => {
        const oldPay     = payInput?.value;
        const oldReceive = receiveInput?.value;

        [swapState.payToken, swapState.receiveToken] =
            [swapState.receiveToken, swapState.payToken];

        if (payInput)     payInput.value     = oldReceive || "";
        if (receiveInput) receiveInput.value = oldPay     || "";

        activeInput = "pay";
        updateUI();
        setTimeout(updateReceiveEstimate, 100);
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
        });
    }

    initTokens();
});


// =====================================
// SWAP BUTTON (dari confirm modal)
// =====================================
document.getElementById("swapButton")?.addEventListener("click", () => {
    SWAP_ENGINE.swapExactInput();
});


// =====================================
// TOKEN BALANCE HELPER
// =====================================
async function getTokenBalance(address, tokenAddr) {
    try {
        const isNativeAddr =
            !tokenAddr ||
            tokenAddr === "native" ||
            tokenAddr === WSDA_ADDR;

        if (isNativeAddr) {
            const bal = await provider.getBalance(address);
            return ethers.utils.formatEther(bal);
        }

        const abi = [
            "function balanceOf(address) view returns (uint256)",
            "function decimals() view returns (uint8)"
        ];
        const contract = new ethers.Contract(tokenAddr, abi, provider);
        const [bal, dec] = await Promise.all([
            contract.balanceOf(address),
            contract.decimals().catch(() => 18)
        ]);

        return ethers.utils.formatUnits(bal, dec);

    } catch (e) {
        console.warn("getTokenBalance error:", e);
        return "0";
    }
}


document.getElementById("swapButton")?.addEventListener("click", () => {
    SWAP_ENGINE.swapExactInput();
});

// =========================
// FIX: SWAP MODAL REFRESH
// =========================
window.refreshSwapModal = async function () {
    try {
        if (typeof updateUI === "function") {
            await updateUI();
        }

        if (typeof refreshWalletBalance === "function") {
            await refreshWalletBalance();
        }

        if (typeof updatePayBalance === "function") {
            await updatePayBalance();
        }

        if (typeof updateReceiveBalance === "function") {
            await updateReceiveBalance();
        }

        if (typeof updateRate === "function") {
            await updateRate();
        }

    } catch (e) {
        console.warn("[SWAP refresh error]", e);
    }
};