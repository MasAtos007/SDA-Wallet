// =============================
// TX DETAIL MODAL
// =============================
function showTxDetail(tx){

    const block = parseInt(tx.blockNumber || "0x0", 16) || 0;
    const confirmations = tx.latestBlock ? (tx.latestBlock - block) : 0;

    const isSwap = tx.type === "SWAP";

    const symbolLine = isSwap
        ? `${tx.inSymbol || "?"} -> ${tx.outSymbol || "?"}`
        : (tx.symbol || "SDA");

    const valueLine = isSwap
        ? `${tx.amountIn || 0} ${tx.inSymbol || ""} -> ${tx.amountOut || 0} ${tx.outSymbol || ""}`
        : `${tx.value} ${symbolLine}`;

    showConfirm(`
Hash: ${tx.hash}

Value: ${valueLine}
Token: ${symbolLine}

From: ${tx.from}
To: ${tx.to}

Block: ${block}
Confirmations: ${confirmations}

Date: ${formatDate(tx.timestamp)}
    `);
}


// =============================
// BELL BADGE
// =============================
function updateBellBadge(){

    const badge = getEl("txBadge");
    if(!badge) return;

    const list = getTxHistory();
    const unread = list.filter(t => !t.read).length;

    if(unread > 0){
        badge.style.display = "inline-block";
        badge.innerText = unread;
    }else{
        badge.style.display = "none";
    }
}


function formatAddress(addr){
    if(!addr) return "-";
    return addr.slice(0,6) + "..." + addr.slice(-4);
}


// =============================
// TX HISTORY GETTER (SAFE)
// =============================
function getTxHistory(){
    try   { return JSON.parse(localStorage.getItem("txHistory")) || []; }
    catch { return []; }
}


// =============================
// LOGO PATH NORMALISER
// Pastikan path selalu "img/xxx.png"
// tanpa double prefix atau path kosong
// =============================
function normalizeLogo(raw, fallback) {

    if (!raw || typeof raw !== "string" || raw.trim() === "") {
        return fallback || "img/sda.png";
    }

    // Sudah lengkap dengan prefix img/
    if (raw.startsWith("img/")) return raw;

    // URL http / https â€” pakai langsung
    if (raw.startsWith("http")) return raw;

    // Hanya nama file â€” tambah prefix
    if (!raw.includes("/")) return "img/" + raw;

    // Path lain â€” pakai apa adanya
    return raw;
}


// =============================
// TX HISTORY RENDER
// =============================
function renderTxHistory(){

    const list = getEl("txHistoryList");
    if(!list) return;

    const history = getTxHistory();
    const wallet  = getSelectedWallet?.();
    const myAddr  = wallet?.address?.toLowerCase();

    if(history.length === 0){
        list.innerHTML = `
        <div style="text-align:center;color:#888;padding:30px;">
            <div style="font-size:14px;">No Transactions</div>
            <div style="font-size:11px;margin-top:6px;">Your activity will appear here</div>
        </div>`;
        return;
    }

    list.innerHTML = "";

    history.forEach(tx => {

        if(!tx) return;

        const isSwap  = tx.type === "SWAP";
        const isAddLP = tx.type === "ADD_LP";

        const inSym  = tx.inSymbol  || "SDA";
        const outSym = tx.outSymbol || "TOKEN";

        const symbolDisplay = (isSwap || isAddLP)
            ? `${inSym} + ${outSym}`
            : (tx.symbol || "SDA");

        const logo = normalizeLogo(tx.logo, "img/sda.png");

        const from = tx.from?.toLowerCase();
        const to   = tx.to?.toLowerCase();

        let type  = "SEND";
        let color = "#ff4d4f";
        let icon  = "up";

        if (isAddLP) {
            type  = "ADD LP";
            color = "#f59e0b";
            icon  = "lp";
        } else if (isSwap) {
            type  = "SWAP";
            color = "#3b82f6";
            icon  = "swap";
        } else if (myAddr && to === myAddr) {
            type  = "RECEIVE";
            color = "#00d084";
            icon  = "down";
        }

        // value display
        let value;
        if (isAddLP) {
            // tampilkan amount0 + amount1
            value = 0; // tidak pakai number tunggal
        } else if (isSwap) {
            value = Number(tx.amountOut || 0);
        } else {
            value = Number(tx.value || 0);
        }

        let valueFormatted;
        if (isAddLP) {
            const v0 = Number(tx.amount0 || 0);
            const v1 = Number(tx.amount1 || 0);
            const fmt = (n) => n < 0.000001 && n > 0
                ? n.toExponential(2)
                : n.toFixed(6).replace(/\.?0+$/, "");
            valueFormatted = `${fmt(v0)} + ${fmt(v1)}`;
        } else if (value === 0) {
            valueFormatted = "0";
        } else if (value < 0.000001) {
            valueFormatted = value.toExponential(2);
        } else {
            valueFormatted = value.toFixed(6).replace(/\.?0+$/, "");
        }

        const targetAddr = type === "SEND" ? tx.to : tx.from;
        const shortAddr  = (isAddLP || isSwap)
            ? "Liquidity Pool"
            : targetAddr
                ? targetAddr.slice(0,6) + "..." + targetAddr.slice(-4)
                : "-";

        // =============================
        // ICON TEXT (FA tidak bisa di innerHTML aman)
        // =============================
        const iconHTML = {
            up:   '<i class="fa-solid fa-arrow-up"></i>',
            down: '<i class="fa-solid fa-arrow-down"></i>',
            swap: '<i class="fa-solid fa-right-left"></i>',
            lp:   '<i class="fa-solid fa-droplet"></i>'
        }[icon];

        // =============================
        // DUAL LOGO FOR SWAP â€” FIX path
        // =============================
        const inLogo  = normalizeLogo(tx.inLogo,  "img/sda.png");
        const outLogo = normalizeLogo(tx.outLogo, "img/default.png");

        const logoHTML = (isSwap || isAddLP)
            ? `<div style="position:relative;width:46px;height:34px;flex-shrink:0;">
                <img src="${inLogo}"
                     onerror="this.src='img/default.png'"
                     style="width:24px;height:24px;border-radius:50%;position:absolute;
                            left:0;top:5px;background:#111;padding:3px;z-index:1;object-fit:contain;">
                <img src="${outLogo}"
                     onerror="this.src='img/default.png'"
                     style="width:24px;height:24px;border-radius:50%;position:absolute;
                            right:0;top:5px;background:#111;padding:3px;
                            border:2px solid #0b0f17;z-index:2;object-fit:contain;">
               </div>`
            : `<img src="${logo}"
                    onerror="this.src='img/default.png'"
                    style="width:34px;height:34px;border-radius:50%;
                           background:#111;padding:5px;object-fit:contain;">`;

        const el = document.createElement("div");
        el.className = "asset-item";

        el.innerHTML = `
<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">

    <div style="display:flex;align-items:center;gap:10px;">

        <div style="position:relative;">
            ${logoHTML}
            <div style="position:absolute;bottom:-2px;right:-2px;
                        width:16px;height:16px;font-size:9px;
                        background:${color};color:#fff;border-radius:50%;
                        display:flex;align-items:center;justify-content:center;z-index:5;">
                ${iconHTML}
            </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:3px;">
            <div style="font-size:13px;font-weight:600;">${type}</div>
            <div style="font-size:11px;color:#888;">${shortAddr}</div>
            <div style="font-size:10px;color:#666;">${formatDate(tx.timestamp)}</div>
        </div>
    </div>

    <div style="text-align:right;">

        <div style="font-size:13px;font-weight:600;color:${color};">
            ${type === "SEND" ? "-" : "+"}${valueFormatted}
        </div>

        <div style="font-size:11px;color:#aaa;margin-top:2px;">${symbolDisplay}</div>

        <div style="margin-top:6px;display:flex;gap:6px;justify-content:flex-end;">
            <button class="copy-btn" data-copy="${tx.hash || ""}"
                    style="font-size:10px;padding:3px 6px;">
                <i class="fa-regular fa-copy"></i>
            </button>
            <button class="open-tx" data-hash="${tx.hash || ""}"
                    style="font-size:10px;padding:3px 6px;">
                <i class="fa-solid fa-arrow-up-right-from-square"></i>
            </button>
        </div>
    </div>
</div>`;

        el.onclick = (e) => {
            if(e.target.closest(".copy-btn")) return;
            if(e.target.closest(".open-tx"))  return;
            showTxDetail(tx);
        };

        list.appendChild(el);
    });
}


let activeModal = null;


// =============================
// OPEN HISTORY MODAL
// =============================
function openTxHistory(){

    const list = getTxHistory();
    list.forEach(t => t.read = true);
    saveTxHistory?.(list);

    renderTxHistory();
    updateBellBadge();

    const modal = getEl("txModal");
    if(!modal) return;

    modal.classList.add("show");
    modal.style.display = "flex";

    activeModal = modal;

    history.pushState({ modal: "txModal" }, "");
}

function clearTxHistory() {
    if (!confirm("Hapus semua riwayat transaksi?")) return;

    localStorage.removeItem("txHistory");

    renderTxHistory();
    updateBellBadge();

    showToast?.("Riwayat dihapus", "success");
}
// =============================
// CLOSE HISTORY MODAL
// =============================
function closeTxModal(){

    const modal = getEl("txModal");
    if(!modal) return;

    modal.classList.remove("show");
    modal.style.display = "none";

    activeModal = null;
}


// =============================
// BACK BUTTON HANDLER
// =============================
window.addEventListener("popstate", () => {
    if(activeModal){
        activeModal.classList.remove("show");
        activeModal.style.display = "none";
        activeModal = null;
    }
});


// =============================
// CLICK HANDLER â€” copy & ledger
// =============================
document.addEventListener("click", async (e) => {

    const copyBtn = e.target.closest(".copy-btn");

    if (copyBtn) {
        const val = copyBtn.dataset.copy;
        if (!val) return showToast?.("Hash tidak tersedia", "error");

        try {
            await navigator.clipboard.writeText(val);
            showToast?.("Hash copied", "success");
        } catch {
            showToast?.("Gagal copy", "error");
        }
    }

    const txBtn = e.target.closest(".open-tx");

    if (txBtn) {
        const hash = txBtn.dataset.hash;
        if (!hash) return showToast?.("Hash tidak tersedia", "error");
        window.open("https://ledger.sidrachain.com/tx/" + hash, "_blank");
    }
});