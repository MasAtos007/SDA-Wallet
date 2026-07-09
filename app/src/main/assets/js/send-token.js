// =====================================
// SEND TOKEN MODULE v2
// sendTx() â†’ confirm modal dulu
// Tidak ada eksekusi langsung
// =====================================

if (!window.provider) console.warn("Provider belum siap");

// TX HISTORY STORAGE
window.getTxHistory = function () {
    try   { return JSON.parse(localStorage.getItem("txHistory")) || []; }
    catch { return []; }
};
window.saveTxHistory = function (data) {
    localStorage.setItem("txHistory", JSON.stringify(data));
};

// =====================================
// SEND TOKEN STATE
// =====================================
let SEND_TOKENS      = [];
let sendCurrentToken = null;


// =====================================
// LOAD TOKEN SELECT
// =====================================
function loadSendTokens() {

    const sel = document.getElementById("sendTokenSelect");
    if (!sel) return;

    SEND_TOKENS   = Array.isArray(window.TOKENS) ? window.TOKENS : [];
    sel.innerHTML = "";

    // Native SDA
    const nativeOpt        = document.createElement("option");
    nativeOpt.value        = "native";
    nativeOpt.textContent  = "SDA";
    nativeOpt.dataset.icon = "img/sda.png";
    sel.appendChild(nativeOpt);

    // ERC20
    SEND_TOKENS.forEach(t => {
        const opt        = document.createElement("option");
        opt.value        = t.address;
        opt.textContent  = t.symbol;
        opt.dataset.icon = t.logo || "img/sda.png";
        sel.appendChild(opt);
    });

    sel.value = window.selectedToken || "native";
    applySendTokenState();

    sel.onchange = function () {
        setGlobalToken?.(sel.value);
        applySendTokenState();
        updateSendBalance();
    };
}


// =====================================
// APPLY TOKEN UI STATE
// =====================================
function applySendTokenState() {

    const sel = document.getElementById("sendTokenSelect");
    if (!sel) return;

    const val = sel.value || "native";

    if (val !== "native") {
        const token = SEND_TOKENS.find(t => t.address === val);
        if (token) {
            sendCurrentToken = { ...token, type: "erc20" };

            const iconEl   = document.getElementById("sendTokenIcon");
            const iconSmEl = document.getElementById("sendTokenIconSm");
            const symbolEl = document.getElementById("sendTokenSymbol");

            if (iconEl)   iconEl.src        = token.logo || "img/sda.png";
            if (iconSmEl) iconSmEl.src       = token.logo || "img/sda.png";
            if (symbolEl) symbolEl.innerText = token.symbol;

            // Sync ke global
            window.selectedToken     = val;
            window.selectedTokenData = sendCurrentToken;
        }
    } else {
        sendCurrentToken = { symbol: "SDA", address: null, type: "native",
                             decimals: 18, logo: "img/sda.png" };

        const iconEl   = document.getElementById("sendTokenIcon");
        const iconSmEl = document.getElementById("sendTokenIconSm");
        const symbolEl = document.getElementById("sendTokenSymbol");

        if (iconEl)   iconEl.src        = "img/sda.png";
        if (iconSmEl) iconSmEl.src       = "img/sda.png";
        if (symbolEl) symbolEl.innerText = "SDA";

        window.selectedToken     = "native";
        window.selectedTokenData = sendCurrentToken;
    }
}


// =====================================
// UPDATE BALANCE DISPLAY
// =====================================
async function updateSendBalance() {

    const el = document.getElementById("sendBalance");
    if (!el) return;

    // Ambil address dari SESSION (sistem baru) atau getSelectedWallet (lama)
    const addr =
    getSelectedWallet?.()?.address ||
    SESSION?.address;
    if (!addr) { el.innerText = "0.00"; return; }

    const token = sendCurrentToken || { address: null, symbol: "SDA" };

    try {
        if (!token.address) {
            const b = await provider.getBalance(addr);
            el.innerText = parseFloat(ethers.utils.formatEther(b)).toFixed(4) + " SDA";
            return;
        }

        const abi = [
            "function balanceOf(address) view returns (uint256)",
            "function decimals() view returns (uint8)"
        ];
        const contract = new ethers.Contract(token.address, abi, provider);
        const [bal, dec] = await Promise.all([
            contract.balanceOf(addr),
            contract.decimals().catch(() => 18)
        ]);
        el.innerText = parseFloat(ethers.utils.formatUnits(bal, dec)).toFixed(4) +
            " " + token.symbol;

    } catch (e) {
        console.warn("Balance error:", e);
    }
}


// =====================================
// SEND TX â€” tampilkan confirm dulu
// TIDAK eksekusi langsung
// =====================================
async function sendTx() {

    const to     = document.getElementById("toSend")?.value?.trim();
    const amount = document.getElementById("amountSend")?.value?.trim();

    // Validasi input
    if (!to || !to.startsWith("0x") || to.length < 42) {
        showToast?.("Alamat tujuan tidak valid", "error");
        return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        showToast?.("Jumlah tidak valid", "error");
        return;
    }

    // Cek wallet
    const signer = SESSION?.unlocked && SESSION?.signer
        ? SESSION.signer
        : null;

    if (!signer) {
        showToast?.("Unlock wallet dulu", "error");
        showPINUnlockScreen?.();
        return;
    }

    // Token data
    const tokenData   = sendCurrentToken
        || window.selectedTokenData
        || { symbol: "SDA", type: "native", decimals: 18, logo: "img/sda.png" };

    const fromAddress =
    getSelectedWallet()?.address ||
    SESSION.address ||
    "";
    const wallets     = getWallets?.() || [];
    const fromName    = wallets.find(
        w => w.address?.toLowerCase() === fromAddress.toLowerCase()
    )?.name || "Account 1";

    // Buka confirm modal â€” eksekusi ada di executeSendTx()
    showSendConfirmModal({ to, amount, tokenData, fromAddress, fromName });
}


// =====================================
// SAVE TX HISTORY
// =====================================
async function saveTxToHistory(hash, amount, token, to, from) {

    try {
        const history = getTxHistory();

        history.unshift({
            hash,
            value:        parseFloat(amount),
            symbol:       token?.symbol       || "SDA",
            logo:         token?.logo         || "img/sda.png",
            tokenAddress: token?.address      || "native",
            type:         "SEND",
            to:           to   || "-",
            from:         from || "-",
            timestamp:    Math.floor(Date.now() / 1000),
            read:         false
        });

        if (history.length > 50) history.pop();

        saveTxHistory(history);
        renderTxHistory?.();
        updateBellBadge?.();

    } catch (e) {
        console.warn("History error:", e);
    }
}


// =====================================
// CLOSE MODAL
// =====================================
window.closeSendModal = function () {
    const modal = document.getElementById("sendModal");
    if (modal) modal.classList.remove("show");
};


// =====================================
// INIT
// =====================================
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        loadSendTokens();
        updateSendBalance();
        renderTxHistory?.();
        updateBellBadge?.();
    }, 300);
});