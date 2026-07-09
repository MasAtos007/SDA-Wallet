// =====================================================
// CONFIRM MODALS JS
// Hanya handle: SWAP confirm
// Send confirm dihandle sepenuhnya oleh send-modal.js
// =====================================================

// =====================================================
// HELPER BUKA / TUTUP SWAP CONFIRM
// =====================================================
function _openSwapConfirm() {
    const el = document.getElementById("swapConfirmModal");
    if (!el) return;
    el.style.display = "flex";
    document.body.style.overflow = "hidden";
}

function _closeSwapConfirm() {
    const el = document.getElementById("swapConfirmModal");
    if (el) el.style.display = "none";
    document.body.style.overflow = "";
    window.swapConfirmState = null;
}

// Tutup saat klik backdrop
document.addEventListener("DOMContentLoaded", () => {

    const swapModal = document.getElementById("swapConfirmModal");
    if (swapModal) {
        swapModal.addEventListener("click", (e) => {
            if (e.target === swapModal || e.target.classList.contains("confirm-backdrop")) {
                _closeSwapConfirm();
            }
        });
    }

    // Cancel buttons
    ["btnCancelConfirm", "btnCancelConfirmSwap"].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener("click", _closeSwapConfirm);
    });
});


// =====================================================
// SWAP CONFIRM MODAL
// Dipanggil dari swap-engine.js → openSwapConfirm()
// =====================================================
function showSwapConfirmModal(inToken, outToken, amountIn, amountOut) {

    const set  = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setS = (id, val) => { const el = document.getElementById(id); if (el) el.src = val; };

    // Resolve logo
    const inLogo = typeof resolveLogoPath === "function"
        ? resolveLogoPath(inToken,  !inToken?.address)
        : (inToken?.logo  || "img/sda.png");
    const outLogo = typeof resolveLogoPath === "function"
        ? resolveLogoPath(outToken, !outToken?.address)
        : (outToken?.logo || "img/sda.png");

    setS("confirmSwapInIcon",  inLogo);
    setS("confirmSwapOutIcon", outLogo);

    set("confirmSwapInAmount",  Number(amountIn).toLocaleString(undefined,  { maximumFractionDigits: 6 }));
    set("confirmSwapOutAmount", Number(amountOut).toLocaleString(undefined, { maximumFractionDigits: 6 }));
    set("confirmSwapInSymbol",  inToken?.symbol  || "—");
set("confirmSwapOutSymbol", outToken?.symbol || "—");

    // Rate
    if (amountIn && amountOut && Number(amountIn) > 0) {
        const rate = Number(amountOut) / Number(amountIn);
        set("confirmSwapRate", `1 ${inToken?.symbol} ≈ ${rate.toFixed(6)} ${outToken?.symbol}`);
    }

    // Slippage
    set("confirmSwapSlippage", (window.CONFIG?.SLIPPAGE_DEFAULT || 2) + "%");

    // Wire confirm button — clone agar tidak double-bind
    const oldBtn = document.getElementById("btnConfirmSwap");
    if (oldBtn) {
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        newBtn.addEventListener("click", async () => {
            _closeSwapConfirm();
            await SWAP_ENGINE?.swapExactInput?.();
        });
    }

    _openSwapConfirm();
}