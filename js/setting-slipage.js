// ==========================
// GLOBAL STATE (SAFE MERGE)
// ==========================
window.swapState = window.swapState || {};

swapState.slippage = parseFloat(localStorage.getItem("slippage") || "0.5");


// ==========================
// SET SLIPPAGE
// ==========================
function setSlippage(value){

    value = parseFloat(value);
    if(isNaN(value)) return;

    swapState.slippage = value;
    localStorage.setItem("slippage", value);

    // update input
    const input = document.getElementById("slippageInput");
    if(input) input.value = value;

    // update tombol aktif
    document.querySelectorAll("#slippageGroup button").forEach(btn => {
        btn.classList.toggle(
            "active",
            parseFloat(btn.dataset.value) === value
        );
    });

    // sync ke swap UI
    syncSlippageToSwap();
}


// ==========================
// SYNC KE SWAP MODAL
// ==========================
function syncSlippageToSwap(){

    const el = document.getElementById("swapSlippageDisplay");

    if(el){
        el.innerText = swapState.slippage + "%";
    }

    if(typeof updateRate === "function") updateRate();
    if(typeof updateReceiveEstimate === "function") updateReceiveEstimate();
}


// ==========================
// OPEN / CLOSE
// ==========================
function openSwapSettings(){
    document.getElementById("swapSettings")?.classList.add("show");
}

function closeSwapSettings(){
    document.getElementById("swapSettings")?.classList.remove("show");
}


// ==========================
// INIT (NO RETRY, NO DUPLICATE)
// ==========================
document.addEventListener("DOMContentLoaded", () => {

    const settingsModal = document.getElementById("swapSettings");
    const closeBtn = settingsModal?.querySelector(".close-settings");

    if(!settingsModal){
        console.error("❌ swapSettings tidak ditemukan (HARUS ADA DI HTML)");
        return;
    }

    console.log("✅ swapSettings READY");

    // ==========================
    // OUTSIDE CLICK
    // ==========================
    settingsModal.addEventListener("click", (e) => {
        if(e.target === settingsModal){
            closeSwapSettings();
        }
    });

    // ==========================
    // STOP CLICK DALAM BOX
    // ==========================
    settingsModal.querySelector(".settings-box")
    ?.addEventListener("click", (e) => {
        e.stopPropagation();
    });

    // ==========================
    // BUTTON PRESET
    // ==========================
    document.querySelectorAll("#slippageGroup button").forEach(btn => {
        btn.addEventListener("click", () => {
            setSlippage(btn.dataset.value);
        });
    });

    // ==========================
    // INPUT CUSTOM
    // ==========================
    document.getElementById("slippageInput")
    ?.addEventListener("input", (e) => {
        setSlippage(e.target.value);
    });

    // ==========================
    // CLOSE BUTTON
    // ==========================
    closeBtn?.addEventListener("click", closeSwapSettings);

    // ==========================
    // INIT VALUE
    // ==========================
    setSlippage(swapState.slippage);
});