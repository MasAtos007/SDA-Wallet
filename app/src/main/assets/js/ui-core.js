// =====================================
// UI CORE — Global Elements & Systems
// =====================================

window.balanceEl        = document.getElementById("balance");
window.selectEl         = document.getElementById("walletSelect");
window.addressInput     = document.getElementById("address");
window.saveBtn          = document.querySelector("button[onclick='saveWallet()']");
window.tokenLogoBalance  = document.getElementById("tokenLogoBalance");
window.tokenLogoDropdown = document.getElementById("tokenLogoDropdown");

window.selectedToken     = "native";
window.selectedTokenData = {
    symbol:   "SDA",
    type:     "native",
    decimals: 18,
    logo:     "img/sda.png"
};


// =====================================
// TOAST
// =====================================
function showToast(msg, type = "success") {
    const t = document.getElementById("toast");
    if (!t) return;

    t.textContent = msg;
    t.classList.remove("show", "error");

    if (type === "error") t.classList.add("error");

    t.style.display = "block";

    setTimeout(() => t.classList.add("show"), 10);

    setTimeout(() => {
        t.classList.remove("show");
        setTimeout(() => { t.style.display = "none"; }, 300);
    }, 2000);
}

window.showToast = showToast;


// =====================================
// CONFIRM MODAL
// FIX: z-index selalu 10100 — di atas semua modal lain
// =====================================
let confirmCallback = null;

function showConfirm(message, onYes) {
    const modal = document.getElementById("confirmModal");
    const msg   = document.getElementById("confirmMessage");
    if (!modal || !msg) return;

    msg.textContent  = message || "Confirm?";
    confirmCallback  = typeof onYes === "function" ? onYes : null;

    // selalu tampil di atas modal lain (pkGlobalModal = 9999)
    modal.style.zIndex  = "10100";
    modal.style.display = "flex";
}

function confirmYes() {
    try {
        if (typeof confirmCallback === "function") confirmCallback();
    } catch (e) {
        console.error("Confirm callback error:", e);
    }
    closeConfirmModal();
}

function closeConfirmModal() {
    const modal = document.getElementById("confirmModal");
    if (modal) modal.style.display = "none";
    confirmCallback = null;
}

window.showConfirm      = showConfirm;
window.confirmYes       = confirmYes;
window.closeConfirmModal = closeConfirmModal;


// =====================================
// PROMPT MODAL
// =====================================
function showPrompt(message, defaultValue = "", callback) {
    const modal     = document.getElementById("promptModal");
    if (!modal) return;

    const input     = document.getElementById("promptInput");
    const msg       = document.getElementById("promptMessage");
    const okBtn     = document.getElementById("promptOk");
    const cancelBtn = document.getElementById("promptCancel");

    if (!input || !msg || !okBtn || !cancelBtn) return;

    msg.textContent = message || "";
    input.value     = defaultValue || "";

    // prompt juga di atas semua modal
    modal.style.zIndex  = "10100";
    modal.style.display = "flex";

    okBtn.onclick = () => {
        modal.style.display = "none";
        if (typeof callback === "function") callback(input.value);
    };

    cancelBtn.onclick = () => {
        modal.style.display = "none";
    };
}


// =====================================
// SET GLOBAL TOKEN
// =====================================
function setGlobalToken(val) {

    window.selectedToken = val || "native";
    localStorage.setItem("selectedToken", window.selectedToken);

    let logo = "img/sda.png";

    if (val === "native" || !val) {
        window.selectedTokenData = {
            symbol:   "SDA",
            type:     "native",
            decimals: 18,
            logo:     "img/sda.png"
        };
    } else {
        const token = (window.TOKENS || []).find(t => t.address === val);
        if (token) {
            logo = token.logo || "img/default.png";
            window.selectedTokenData = {
                ...token,
                type:     "erc20",
                decimals: token.decimals || 18
            };
        }
    }

    // sync dropdown
    const mainSelect = document.getElementById("tokenSelect");
    const sendSelect = document.getElementById("sendTokenSelect");
    if (mainSelect) mainSelect.value = val;
    if (sendSelect) sendSelect.value = val;

    // sync icon
    if (window.tokenLogoBalance)  window.tokenLogoBalance.src  = logo;
    if (window.tokenLogoDropdown) window.tokenLogoDropdown.src = logo;

    // sync modul lain
    syncSendTokenUI?.();
    applySendTokenState?.();
    loadBalance?.();
    updateSendBalance?.();
    renderAssets?.();
}

// =====================================
// OPEN EXPLORER — selalu pakai built-in browser
// Fallback ke window.open kalau AndroidWallet tidak tersedia (development)
// =====================================
// openExplorer didefinisikan di explorer-patch.js — tidak perlu duplikat di sini