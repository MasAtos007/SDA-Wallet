// ==========================
// SAFE GLOBAL CHECK
// ==========================
const _ethers = window.ethers;
const provider = window.provider;


// ==========================
// AUTO REFRESH CHECK
// ==========================
function autoRefreshIfNeeded() {

    const wallet = getSelectedWallet();
    if (!wallet) return;

    const address = wallet.address;

    const hasSDA = localStorage.getItem(address + "_native");

    const tokens = (window.customTokens || []).slice(0, 10);

    const missingToken = tokens.some(token => {
        const key = address + "_" + token.address;
        return !localStorage.getItem(key);
    });

    if (!hasSDA || missingToken) {
        refreshAll();
    }
}


// ==========================
// LOAD BALANCE UI (FIX MISSING FUNCTION)
// ==========================
function loadBalance() {

    const wallet = getSelectedWallet();
    if (!wallet) return;

    const addr = wallet.address;

    let key;
    let symbol = "SDA";

    // ==========================
    // TOKEN SWITCH
    // ==========================
    if (!window.selectedToken || window.selectedToken === "native") {
        key = addr + "_native";
        symbol = "SDA";
    } else {
        key = addr + "_" + window.selectedToken;

        const token = (window.TOKENS || []).find(
            t => t.address === window.selectedToken
        );

        if (token) symbol = token.symbol;
    }

    const bal = localStorage.getItem(key) || ("0.00 " + symbol);

    // ==========================
    // MAIN BALANCE
    // ==========================
    const el = document.getElementById("balance");
    if (el) el.textContent = bal;

    // ==========================
    // SEND BALANCE (🔥 SYNC)
    // ==========================
    if (typeof updateSendBalance === "function") {
        updateSendBalance();
    }
}


function updateSendBalance() {

    const wallet = getSelectedWallet();
    if (!wallet) return;

    const addr = wallet.address;

    let key;
    let symbol = "SDA";

    if (!window.selectedToken || window.selectedToken === "native") {
        key = addr + "_native";
        symbol = "SDA";
    } else {
        key = addr + "_" + window.selectedToken;

        const token = (window.TOKENS || []).find(
            t => t.address === window.selectedToken
        );

        if (token) symbol = token.symbol;
    }

    const bal = localStorage.getItem(key) || ("0.00 " + symbol);

    const sendEl = document.querySelector(".send-balance");
    if (sendEl) {
        sendEl.textContent = bal;
    }
}

// ==========================
// UPDATE ADDRESS UI (FIX MISSING)
// ==========================
function updateAddressUI() {

    const wallet = getSelectedWallet();
    const el = document.getElementById("showAddress");

    if (!el) return;

    el.textContent = wallet ? wallet.address : "-";
}


// ==========================
// MAIN REFRESH BALANCE
// ==========================
async function refreshAll() {

    if (!_ethers || !provider) {
        console.error("ethers/provider belum siap");
        return;
    }

    const wallet = getSelectedWallet();
    if (!wallet) return;

    const currentAddress = wallet.address;

    if (typeof showToast === "function") {
        showToast("Refreshing...");
    }

    // =================================================
    // TOKEN SELECT STATE
    // =================================================
    const selected = window.selectedToken || "native";

    // =================================================
    // SDA BALANCE / TOKEN BALANCE (FIXED LOGIC)
    // =================================================
    try {

        if (selected === "native") {

            const bal = await provider.getBalance(currentAddress);

            const result =
                parseFloat(
                    _ethers.utils.formatEther(bal)
                ).toFixed(4) + " SDA";

            localStorage.setItem(currentAddress + "_native", result);

        } else {

            const token = (window.TOKENS || []).find(
                t => t.address === selected
            );

            if (!token) throw new Error("Token not found");

            const abi = [
                "function balanceOf(address) view returns (uint256)",
                "function decimals() view returns (uint8)"
            ];

            const contract = new _ethers.Contract(
                token.address,
                abi,
                provider
            );

            const [bal, decimalsRaw] = await Promise.all([
                contract.balanceOf(currentAddress),
                contract.decimals().catch(() => 18)
            ]);

            const value =
                parseFloat(
                    _ethers.utils.formatUnits(bal, decimalsRaw)
                ).toFixed(4);

            const final = value + " " + token.symbol;

            localStorage.setItem(
                currentAddress + "_" + token.address,
                final
            );
        }

    } catch (e) {
        console.warn("Balance error:", e);
    }


    // =================================================
    // TOKEN LIST UPDATE (tetap jalan semua token untuk assets tab)
    // =================================================
    const list = (window.customTokens || []).slice(0, 10);

    await Promise.all(list.map(async (token) => {

        try {

            const abi = [
                "function balanceOf(address) view returns (uint256)",
                "function decimals() view returns (uint8)"
            ];

            const contract = new _ethers.Contract(
                token.address,
                abi,
                provider
            );

            const [bal, decimalsRaw] = await Promise.all([
                contract.balanceOf(currentAddress),
                contract.decimals().catch(() => 18)
            ]);

            const value =
                parseFloat(
                    _ethers.utils.formatUnits(bal, decimalsRaw)
                ).toFixed(4);

            const final = value + " " + token.symbol;

            localStorage.setItem(
                currentAddress + "_" + token.address,
                final
            );

        } catch (e) {
            console.warn("Token error:", token.symbol);

            const cacheKey = currentAddress + "_" + token.address;

            if (!localStorage.getItem(cacheKey)) {
                localStorage.setItem(cacheKey, "0.00 " + token.symbol);
            }
        }

    }));


    // =================================================
    // SAFETY CHECK
    // =================================================
    const latestWallet = getSelectedWallet();

    if (!latestWallet || latestWallet.address !== currentAddress) {
        return;
    }


    // =================================================
    // UI UPDATE (FIXED FLOW)
    // =================================================
    if (typeof loadBalance === "function") {
        loadBalance();
    }

    if (typeof renderAssets === "function") {
        renderAssets();
    }

    if (typeof updateAddressUI === "function") {
        updateAddressUI();
    }

    if (typeof showToast === "function") {
    showToast(
        LANG?.[CURRENT_LANG]?.refresh_done || "Refresh selesai"
    );
}
}