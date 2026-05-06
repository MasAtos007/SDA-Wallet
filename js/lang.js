let LANG = {};
let CURRENT_LANG = localStorage.getItem("lang") || "id";

// ==========================
// LOAD JSON
// ==========================
async function loadLang(){
    try{
        const res = await fetch("data/lang.json");
        LANG = await res.json();

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

}

// ==========================
// SET LANGUAGE
// ==========================
function setLanguage(lang){

    CURRENT_LANG = lang;
    localStorage.setItem("lang", lang);

    applyLang();

    // ==========================
    // RE-RENDER UI DINAMIS
    // ==========================
    renderAssets?.();
    renderTokenTab?.();
    renderLP?.();

    // 🔥 penting: apply lagi setelah render
    setTimeout(() => {
        applyLang();
    }, 50);

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
}