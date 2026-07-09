// Tidak mengubah logic balance.js — hanya membaca hasil akhirnya

let _balanceHidden = false;

function toggleBalanceVisibility(){
    const el = document.getElementById("balance");
    const icon = document.getElementById("balanceEyeToggle");
    if(!el) return;
    _balanceHidden = !_balanceHidden;
    if(_balanceHidden){
        el.dataset.realText = el.dataset.realText || el.textContent;
        el.textContent = "•••••• " + (el.textContent.split(" ").pop() || "");
        icon.classList.remove("fa-eye"); icon.classList.add("fa-eye-slash");
    } else {
        el.textContent = el.dataset.realText || el.textContent;
        icon.classList.remove("fa-eye-slash"); icon.classList.add("fa-eye");
    }
}

// Simpan history balance utk chart (tidak perlu API tambahan)
function recordBalanceHistory(){
    const el = document.getElementById("balance");
    if(!el) return;
    const num = parseFloat((el.dataset.realText || el.textContent).replace(/[^\d.]/g,""));
    if(isNaN(num)) return;

    const wallet = getSelectedWallet?.();
    if(!wallet) return;

    const key = "balhist_" + wallet.address + "_" + (window.selectedToken || "native");
    let hist = JSON.parse(localStorage.getItem(key) || "[]");
    hist.push(num);
    if(hist.length > 30) hist.shift();
    localStorage.setItem(key, JSON.stringify(hist));

    drawSparkline(hist);
    renderUSD(num);
}

function drawSparkline(hist){
    const svg = document.getElementById("balanceSparkline");
    const badge = document.getElementById("balanceChangeBadge");
    const badgeVal = document.getElementById("balanceChangeValue");
    if(!svg || hist.length < 2){ if(badge) badge.style.display="none"; return; }

    const min = Math.min(...hist), max = Math.max(...hist);
    const range = (max - min) || 1;
    const w = 300, h = 60, step = w / (hist.length - 1);

    const points = hist.map((v,i) => {
        const x = i * step;
        const y = h - ((v - min) / range) * h;
        return `${x},${y}`;
    }).join(" ");

    const change = ((hist[hist.length-1] - hist[0]) / (hist[0] || 1)) * 100;
    const up = change >= 0;
    const color = up ? "#27d36a" : "#ff5c5c";

    svg.innerHTML = `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

    if(badge){
        badge.style.display = "flex";
        badge.classList.toggle("down", !up);
        badge.querySelector("i").className = up ? "fa-solid fa-arrow-up" : "fa-solid fa-arrow-down";
        badgeVal.textContent = Math.abs(change).toFixed(2) + "%";
    }
}

// USD opsional: hanya tampil kalau ada PRICE_ENGINE / harga token (sudah dipakai swap-engine.js)
function renderUSD(amount){
    const el = document.getElementById("balanceUSD");
    if(!el) return;
    try{
        if(typeof PRICE_ENGINE !== "undefined" && PRICE_ENGINE.getUsdPrice){
            const symbol = (window.selectedToken === "native" || !window.selectedToken) ? "SDA" : window.selectedToken;
            const price = PRICE_ENGINE.getUsdPrice(symbol);
            if(price){
                el.textContent = "≈ $" + (amount * price).toFixed(2) + " USD";
                return;
            }
        }
    }catch(e){}

    // FALLBACK: pakai harga hardcode dari balance.js (TOKEN_PRICE_USD)
    try{
        if(typeof formatUSD === "function"){
            const symbol = (window.selectedToken === "native" || !window.selectedToken) ? "SDA" : window.selectedToken;
            formatUSD(amount, symbol).then(text => { el.textContent = text; });
            return;
        }
    }catch(e){}

    el.textContent = "";
}

// Observer ringan: jalan setiap kali #balance berubah, tanpa sentuh balance.js
const _balanceObserver = new MutationObserver(() => recordBalanceHistory());
document.addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("balance");
    if(el) _balanceObserver.observe(el, { childList:true, characterData:true, subtree:true });
});