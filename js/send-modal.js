// =============================
// SEND MODAL CONTROLLER CLEAN
// =============================

// =============================
// SAFE ELEMENT GETTER
// =============================
function getEl(id){
    return document.getElementById(id);
}

// =============================
// INIT MODAL (AFTER DOM READY)
// =============================
document.addEventListener("DOMContentLoaded", () => {

    const sendModal   = getEl("sendModal");
    const openSendBtn = getEl("openSendBtn");
    const closeSendBtn= getEl("closeSendModal");

    // =============================
    // OPEN MODAL
    // =============================
    if (openSendBtn && sendModal) {
    openSendBtn.addEventListener("click", () => {

    sendModal.style.display = "flex";

    syncSendTokenUI?.();
    updateSendBalance?.();

    // 🔥 INIT DROPDOWN ADDRESS
    renderSavedAddresses?.();

    try {

        const toInput = document.getElementById("toSend");

        const wallets = JSON.parse(localStorage.getItem("wallets") || "[]");

        if (wallets.length > 0 && toInput) {
            toInput.value = wallets[0].address;
        }

    } catch (e) {
        console.warn("Auto fill address gagal:", e);
    }

});
}

    // =============================
    // CLOSE MODAL
    // =============================
    if (closeSendBtn && sendModal) {
        closeSendBtn.addEventListener("click", () => {
            sendModal.style.display = "none";
        });
    }

    // =============================
    // CLICK OUTSIDE CLOSE
    // =============================
    if (sendModal) {
        sendModal.addEventListener("click", (e) => {
            if (e.target === sendModal) {
                sendModal.style.display = "none";
            }
        });
    }

});


// ==========================
// SYNC TOKEN KE SEND MODAL
// ==========================
function syncSendTokenUI(){

    const val = window.selectedToken || "native";

    let logo = "img/sda.png";
    let symbol = "SDA";

    // ==========================
    // SYNC TOKEN DATA (FIX PENTING)
    // ==========================
    if (val === "native") {

        window.selectedTokenData = {
            symbol: "SDA",
            type: "native",
            decimals: 18,
            logo: "img/sda.png"
        };

    } else {

        const token = (TOKENS || []).find(t => t.address === val);

        if (token) {

            logo = token.logo || "img/default.png";
            symbol = token.symbol;

            window.selectedTokenData = {
                ...token,
                type: "erc20",
                decimals: token.decimals || 18
            };
        }
    }

    const iconEl = document.getElementById("sendTokenIcon");
    const symbolEl = document.getElementById("sendTokenSymbol");
    const selectSend = document.getElementById("sendTokenSelect");

    if (iconEl) iconEl.src = logo;
    if (symbolEl) symbolEl.innerText = symbol;

    // ⛔ INI YANG SEBELUMNYA KURANG
    if (selectSend) {
        selectSend.value = val;
    }
}

function setSendToken(tokenAddress){

    // ==========================
    // SET GLOBAL (INI KUNCI)
    // ==========================
    window.selectedToken = tokenAddress || "native";
    localStorage.setItem("selectedToken", window.selectedToken);

    // ==========================
    // UPDATE DATA
    // ==========================
    if (window.selectedToken === "native") {

        window.selectedTokenData = {
            symbol: "SDA",
            type: "native",
            decimals: 18,
            logo: "img/sda.png"
        };

    } else {

        const token = (window.TOKENS || []).find(
            t => t.address === window.selectedToken
        );

        if (token) {
            window.selectedTokenData = {
                ...token,
                type: "erc20",
                decimals: token.decimals || 18
            };
        }
    }

    // ==========================
    // 🔥 SYNC SEMUA UI
    // ==========================
    syncSendTokenUI?.();
    loadBalance?.();
    updateSendBalance?.();
    renderAssets?.();
}
// ==========================
// TOKEN SELECTOR FIX
// ==========================
function openTokenSelector(){

    const select = getEl("tokenSelect");
    if (!select) return;

    // buka dropdown asli
    select.focus();
    select.click?.();

    // 🔥 PAKSA SYNC SETELAH USER PILIH
    select.onchange = function(e){

        const val = e.target.value;

        window.selectedToken = val;

        // 🔥 update semua UI
        syncSendTokenUI?.();
        loadBalance?.();
        updateSendBalance?.();
    };
}

// ==========================
// 🔥 FORCE UPDATE HOME UI
// ==========================
const token = window.selectedTokenData;

if (token) {

    const symbolEl = document.getElementById("tokenSymbol");
    if (symbolEl) {
        symbolEl.innerText = token.symbol;
    }

    // kalau ada text di balance (kadang beda element)
    const balanceEl = document.getElementById("balance");
    if (balanceEl && balanceEl.innerText) {
        // replace symbol aja biar cepat
        const parts = balanceEl.innerText.split(" ");
        if (parts.length > 1) {
            balanceEl.innerText = parts[0] + " " + token.symbol;
        }
    }
}