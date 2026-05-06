// =====================================
// SEND TOKEN MODULE
// requirePK() dari wallet-core.js
// dipakai sebagai satu-satunya guard
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

    SEND_TOKENS   = Array.isArray(TOKENS) ? TOKENS : [];
    sel.innerHTML = "";

    // Native SDA
    const nativeOpt       = document.createElement("option");
    nativeOpt.value       = "native";
    nativeOpt.textContent = "SDA";
    nativeOpt.dataset.icon = "img/sda.png";
    sel.appendChild(nativeOpt);

    // ERC20
    SEND_TOKENS.forEach(t => {
        const opt       = document.createElement("option");
        opt.value       = t.address;
        opt.textContent = t.symbol;
        opt.dataset.icon = t.logo || "img/sda.png";
        sel.appendChild(opt);
    });

    sel.value = window.selectedToken || "native";
    applySendTokenState();

    sel.onchange = function () {
        setGlobalToken(sel.value);
        applySendTokenState();
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
            sendCurrentToken = token;
            const iconEl   = document.getElementById("sendTokenIcon");
            const symbolEl = document.getElementById("sendTokenSymbol");
            if (iconEl)   iconEl.src       = token.logo || "img/sda.png";
            if (symbolEl) symbolEl.innerText = token.symbol;
        }
    } else {
        sendCurrentToken = { symbol: "SDA", address: null };
        const iconEl   = document.getElementById("sendTokenIcon");
        const symbolEl = document.getElementById("sendTokenSymbol");
        if (iconEl)   iconEl.src        = "img/sda.png";
        if (symbolEl) symbolEl.innerText = "SDA";
    }
}


// =====================================
// UPDATE BALANCE DISPLAY
// =====================================
async function updateSendBalance() {

    const el = document.getElementById("sendBalance");
    if (!el || !sendCurrentToken) return;

    // Pakai wallet yang dipilih di dropdown — bukan PK session
    const addr = getSelectedWallet?.()?.address;

    if (!addr) { el.innerText = "0.00"; return; }

    try {
        if (!sendCurrentToken.address) {
            const b = await provider.getBalance(addr);
            el.innerText = parseFloat(ethers.utils.formatEther(b)).toFixed(4) + " SDA";
            return;
        }

        const abi = [
            "function balanceOf(address) view returns (uint256)",
            "function decimals() view returns (uint8)"
        ];
        const contract = new ethers.Contract(sendCurrentToken.address, abi, provider);
        const [bal, dec] = await Promise.all([
            contract.balanceOf(addr),
            contract.decimals().catch(() => 18)
        ]);
        el.innerText = parseFloat(ethers.utils.formatUnits(bal, dec)).toFixed(4) +
            " " + sendCurrentToken.symbol;

    } catch (e) {
        console.warn("Balance error:", e);
    }
}


// =====================================
// SEND TRANSACTION
// requirePK() = satu-satunya sumber wallet
// otomatis buka modal PK kalau locked/kosong
// =====================================
async function sendTx() {

    // ============================================================
    // GUARD — lempar error kalau PK tidak ada atau locked
    // ============================================================
    let activeWallet;
    try {
        activeWallet = requirePK();
    } catch {
        // requirePK sudah buka modal PK + showToast
        return;
    }

    const to     = document.getElementById("toSend")?.value?.trim();
    const amount = document.getElementById("amountSend")?.value?.trim();

    if (!to || !amount) {
        return showToast?.("Input belum lengkap", "error");
    }

    const token = window.selectedTokenData;
    if (!token) {
        return showToast?.("Token tidak valid", "error");
    }

    let tx;

    try {

        // ============================================================
        // NATIVE SDA
        // ============================================================
        if (token.type === "native") {
            tx = await activeWallet.sendTransaction({
                to,
                value: ethers.utils.parseEther(amount)
            });

        // ============================================================
        // ERC20 TOKEN
        // ============================================================
        } else {
            const abi = [
                "function transfer(address to, uint256 amount) returns (bool)",
                "function decimals() view returns (uint8)"
            ];
            const contract = new ethers.Contract(token.address, abi, activeWallet);

            let decimals = token.decimals || 18;
            try { decimals = await contract.decimals(); } catch {}

            tx = await contract.transfer(to, ethers.utils.parseUnits(amount, decimals));
        }

    } catch (e) {
        console.error("TX ERROR:", e);
        return showToast?.("Send gagal: " + (e?.reason || e?.message || "TX error"), "error");
    }

    // ============================================================
    // SUCCESS
    // ============================================================
    if (!tx?.hash) return showToast?.("TX tidak valid", "error");

    showToast?.("Transaksi berhasil", "success");

    await saveTxToHistory(tx.hash, amount, token);
    closeSendModal?.();

    setTimeout(() => refreshAll?.(), 500);
}


// =====================================
// SAVE TX HISTORY
// =====================================
async function saveTxToHistory(hash, amount, token) {

    try {
        let to   = "-";
        let from = "-";

        try {
            const txData = await provider.getTransaction(hash);
            if (txData) { to = txData.to || "-"; from = txData.from || "-"; }
        } catch {}

        const history = getTxHistory();

        history.unshift({
            hash,
            value:        parseFloat(amount),
            symbol:       token?.symbol       || "SDA",
            logo:         token?.logo         || "img/sda.png",
            tokenAddress: token?.address      || "native",
            to,
            from,
            timestamp:   Math.floor(Date.now() / 1000),
            blockNumber: "0x0",
            read:        false
        });

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
    if (modal) modal.style.display = "none";
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