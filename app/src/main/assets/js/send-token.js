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
// MODAL: SALDO TIDAK CUKUP
// Auto-generate elemen modal kalau belum ada di DOM,
// jadi tidak perlu edit index.html
// =====================================
function showInsufficientBalanceModal(available, symbol) {

    const lang = (window.LANG && window.LANG[window.CURRENT_LANG]) || {};
    const isRTL = window.CURRENT_LANG === "ar";

    const titleText = lang.insufficient_balance_title || "Saldo Tidak Mencukupi";
    const btnText   = lang.insufficient_balance_btn   || "Mengerti";
    const descTpl   = lang.insufficient_balance_desc  ||
        "Saldo kamu saat ini {available} {symbol}, tidak cukup untuk mengirim jumlah yang dimasukkan.";

    let modal = document.getElementById("insufficientBalanceModal");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "insufficientBalanceModal";
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.6);
        `;

        modal.innerHTML = `
            <div style="
                background:#14141c; color:#fff; width:88%; max-width:360px;
                border-radius:16px; padding:22px 20px; text-align:center;
                border:1px solid #ff444440;
            ">
                <div style="font-size:36px; margin-bottom:10px;">
                    <i class="fa-solid fa-triangle-exclamation" style="color:#ff4444;"></i>
                </div>
                <div id="insufficientBalanceTitle" style="font-size:17px; font-weight:600; margin-bottom:8px;">
                </div>
                <div id="insufficientBalanceText" style="font-size:14px; color:#aaa; margin-bottom:20px; line-height:1.5;">
                </div>
                <button id="insufficientBalanceCloseBtn" style="
                    width:100%; padding:12px; border:none; border-radius:12px;
                    background:#ff4444; color:#fff; font-size:15px; font-weight:600;
                "></button>
            </div>
        `;

        document.body.appendChild(modal);

        modal.addEventListener("click", (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    modal.dir = isRTL ? "rtl" : "ltr";

    const titleEl = document.getElementById("insufficientBalanceTitle");
    if (titleEl) titleEl.textContent = titleText;

    const textEl = document.getElementById("insufficientBalanceText");
    if (textEl) {
        textEl.textContent = descTpl
            .replace("{available}", available.toFixed(6))
            .replace("{symbol}", symbol);
    }

    const closeBtn = document.getElementById("insufficientBalanceCloseBtn");
    if (closeBtn) {
        closeBtn.textContent = btnText;
        closeBtn.onclick = () => { modal.style.display = "none"; };
    }

    modal.style.display = "flex";
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

    // Cek saldo cukup (ambil saldo real-time, bukan cache)
    const addrForBalance =
        getSelectedWallet?.()?.address ||
        SESSION?.address;

    const checkToken = sendCurrentToken || window.selectedTokenData || { type: "native" };
    const isNativeCheck = !checkToken?.address || checkToken?.type === "native";

    try {
        let availableNum = 0;

        if (isNativeCheck) {
            const bal = await provider.getBalance(addrForBalance);
            availableNum = parseFloat(ethers.utils.formatEther(bal));
        } else {
            const abi = [
                "function balanceOf(address) view returns (uint256)",
                "function decimals() view returns (uint8)"
            ];
            const contract = new ethers.Contract(checkToken.address, abi, provider);
            const [bal, dec] = await Promise.all([
                contract.balanceOf(addrForBalance),
                contract.decimals().catch(() => checkToken.decimals || 18)
            ]);
            availableNum = parseFloat(ethers.utils.formatUnits(bal, dec));
        }

        if (Number(amount) > availableNum) {
            showInsufficientBalanceModal(availableNum, checkToken?.symbol || "SDA");
            return;
        }
    } catch (e) {
        console.error(e);
        showToast?.("Gagal cek saldo, coba lagi", "error");
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