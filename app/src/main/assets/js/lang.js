let LANG = {};
let CURRENT_LANG = localStorage.getItem("lang") || "id";
window.CURRENT_LANG = CURRENT_LANG;

// ==========================
// LOAD JSON
// ==========================
async function loadLang(){
    try{
        let raw;
        if (window.AndroidWallet && typeof window.AndroidWallet.readAsset === "function") {
            const text = window.AndroidWallet.readAsset("data/lang.json");
            if (!text) throw new Error("lang.json kosong");
            raw = JSON.parse(text);
        } else {
            const res = await fetch("data/lang.json");
            raw = await res.json();
        }
        LANG = raw;
        window.LANG = LANG; //  tambahkan ini

        // pastikan DOM siap
        if(document.readyState === "loading"){
            document.addEventListener("DOMContentLoaded", applyLang);
        } else {
            applyLang();
        }

    }catch(e){
        console.error("Lang load error:", e);
    }
}

// ==========================
// APPLY LANGUAGE
// ==========================
function updateLangBtn() {
    const flag = document.getElementById("langBtnFlag");
    const text = document.getElementById("langBtnText");
    if (!flag || !text) return;

    if (CURRENT_LANG === "en") {
        flag.src = "https://flagcdn.com/w20/us.png";
        text.textContent = "English";
    } else if (CURRENT_LANG === "ar") {
        flag.src = "https://flagcdn.com/w20/sa.png";
        text.textContent = "";
    } else {
        flag.src = "https://flagcdn.com/w20/id.png";
        text.textContent = "Indonesia";
    }
}

function applyLang(){

    const langData = LANG[CURRENT_LANG];
    if(!langData) return;

    // ======================
    // TEXT
    // ======================
    document.querySelectorAll("[data-lang]").forEach(el => {

        if (el.id === "activeWalletName") return;

        const key = el.dataset.lang;

        if(langData[key]){

            // 🔥 FIX: jangan overwrite icon di dalam element
            if(el.children.length > 0){
                // cari text node saja
                el.childNodes.forEach(node => {
                    if(node.nodeType === 3){ // TEXT_NODE
                        node.textContent = langData[key];
                    }
                });
            }else{
                el.textContent = langData[key];
            }

        }

    });

    // ======================
    // PLACEHOLDER
    // ======================
    document.querySelectorAll("[data-lang-placeholder]").forEach(el => {

        const key = el.dataset.langPlaceholder;

        if(langData[key]){
            el.placeholder = langData[key];
        }

    });

    updateLangBtn();
}

// ==========================
// SET LANGUAGE
// ==========================
function setLanguage(lang){

    CURRENT_LANG = lang;
    window.CURRENT_LANG = lang;
    localStorage.setItem("lang", lang);
    updateLangBtn();

    applyLang();

    // ==========================
    // RE-RENDER UI DINAMIS
    // ==========================
    renderAssets?.();
    renderTokenTab?.();
    renderLP?.();

    // apply lagi setelah render
    setTimeout(() => {
    applyLang();

    // Re-apply elemen swap yang di-set via JS
    if (!window.swapState?.receiveToken) {
        const receiveSymEl = document.getElementById("receiveTokenSymbol");
        if (receiveSymEl) receiveSymEl.innerText = LANG[lang]?.["swap_select_token"] || "Select Token";
        const rateEl = document.getElementById("swapRate");
        if (rateEl) rateEl.innerText = LANG[lang]?.["swap_select_dest"] || "Select destination token";
    }

    // Re-apply tombol Best Price (di-inject oleh aggregator-engine.js)
    const aggBtn = document.getElementById("aggToggleBtn");
    if (aggBtn) {
        const isOpen = aggBtn.innerHTML.includes("chevron-up");
        aggBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass-dollar"></i> ${LANG[lang]?.["swap_best_price"] || "Best Price"}
            <i class="fa-solid fa-chevron-${isOpen ? 'up' : 'down'}" style="font-size:10px;margin-left:4px;"></i>`;
    }

    // Re-apply slippage tolerance
    const slippageEl = document.querySelector(".slippage div[data-lang='swap_slippage_tolerance']");
    if (slippageEl) slippageEl.textContent = LANG[lang]?.["swap_slippage_tolerance"] || "Slippage tolerance";

}, 200);

    updateActiveWalletName?.();

    // ==========================
    // ACTIVE MENU
    // ==========================
    document.querySelectorAll(".lang-item").forEach(el => {
        el.classList.remove("active");
    });

    const activeItem = document.querySelector(`[data-lang-select="${lang}"]`);
    if(activeItem){
        activeItem.classList.add("active");
    }

    // ==========================
    // TOAST
    // ==========================
    showToast(
        lang === "id"
        ? "Bahasa diubah"
        : "Language changed"
    );

    // ==========================
    // TUTUP MENU
    // ==========================
    const menu = document.getElementById("menuDropdown");
    if(menu){
        menu.style.display = "none";
    }
    
    // Re-render welcome screen kalau sedang terbuka
    const overlay = document.getElementById("onboardingOverlay");
    if (overlay && overlay.style.display === "block") {
        const s = window._onboardState?.screen;
        if (s === "WELCOME" && typeof showWelcomeScreen === "function") setTimeout(showWelcomeScreen, 150);
        else if (s === "IMPORT_CHOICE" && typeof showImportChoiceScreen === "function") showImportChoiceScreen();
        else if (s === "IMPORT_PHRASE" && typeof showImportPhraseScreen === "function") showImportPhraseScreen();
        else if (s === "IMPORT_PK" && typeof showImportPKScreen === "function") showImportPKScreen();
        else if (s === "SET_PIN" && typeof showSetPINScreen === "function") showSetPINScreen();
        else if (s === "SUCCESS" && typeof showSuccessScreen === "function") showSuccessScreen();
    }
}