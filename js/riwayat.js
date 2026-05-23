// =============================
// RIWAYAT.JS â€” TX HISTORY
// Blockscout API + LocalStorage
// =============================

const BLOCKSCOUT_API = "https://ledger.chainora.io/api/v2";

// =============================
// NORMALIZE TIMESTAMP
// Blockscout = detik, lokal (Date.now) = milidetik
// =============================
function normalizeTimestamp(ts) {
    if (!ts) return 0;
    // Jika > 1e12 = milidetik, konversi ke detik
    return ts > 1e12 ? Math.floor(ts / 1000) : ts;
}

// =============================
// FETCH TX FROM BLOCKSCOUT API
// =============================
async function fetchTxFromBlockscout(address, page = 1) {
    if (!address) return [];

    try {
        const url = `${BLOCKSCOUT_API}/addresses/${address}/transactions`;
        const res  = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'Accept': 'application/json' } });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const items = data.items || [];

        return items.map(tx => mapBlockscoutTx(tx, address)).filter(Boolean);

    } catch (err) {
        console.warn("[Blockscout] fetchTx error:", err.message);
        return null; // null = API gagal, fallback ke cache
    }
}


// =============================
// FETCH TOKEN TRANSFERS
// =============================
async function fetchTokenTransfersFromBlockscout(address, page = 1) {
    if (!address) return [];

    try {
        const url = `${BLOCKSCOUT_API}/addresses/${address}/token-transfers`;
        const res  = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { 'Accept': 'application/json' } });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        const items = data.items || [];

        return items.map(tx => mapBlockscoutTokenTransfer(tx, address));

    } catch (err) {
        console.warn("[Blockscout] fetchTokenTransfers error:", err.message);
        return null;
    }
}


// =============================
// MAP BLOCKSCOUT TX â†’ FORMAT LOKAL
// =============================
function mapBlockscoutTx(tx, myAddress) {
    const myAddr = myAddress?.toLowerCase();
    const from   = tx.from?.hash?.toLowerCase() || "";
    const to     = tx.to?.hash?.toLowerCase()   || "";

    let valueEth = 0;
    try {
        const valueRaw = tx.value ? BigInt(tx.value) : 0n;
        valueEth = Number(valueRaw) / 1e18;
    } catch(e) { valueEth = 0; }

    const block = tx.block_number || 0;
    const ts = tx.timestamp
        ? Math.floor(new Date(tx.timestamp).getTime() / 1000)
        : 0;

    const method  = (tx.method || "").toLowerCase();
    const txTypes = tx.transaction_types || [];

    let type = "SEND";
    if (to === myAddr && from !== myAddr) type = "RECEIVE";
    if (/swap/i.test(method)) type = "SWAP";

    const isTokenOnly = txTypes.includes("token_transfer") && !txTypes.includes("coin_transfer");

    const toName = tx.to?.name || "";

    // Kalau token transfer â€” baca nilai dari decoded_input
    let symbol = "SDA";
    let logo   = "img/sda.png";
    let displayValue = valueEth;

    if (isTokenOnly || (method === "transfer" && valueEth === 0)) {
        const params = tx.decoded_input?.parameters || [];
        const amountParam = params.find(p => p.name === "_value" || p.name === "amount" || p.name === "_amount");
        if (amountParam) {
            try {
                displayValue = Number(BigInt(amountParam.value)) / 1e18;
            } catch(e) { displayValue = 0; }
        }
        symbol = toName || "TOKEN";
        logo   = "img/default.png";
    }

    // Skip kalau pure token-only (sudah di fetchTokenTransfers) DAN tidak punya coin_transfer
    if (isTokenOnly) return null;

    return {
        hash:        tx.hash     || "",
        from:        from,
        to:          to,
        toName:      toName,
        value:       displayValue.toFixed(6).replace(/\.?0+$/, "") || "0",
        symbol:      symbol,
        logo:        logo,
        type:        type,
        blockNumber: "0x" + block.toString(16),
        timestamp:   ts,
        status:      tx.status === "ok" ? "success" : "failed",
        source:      "blockscout",
        read:        false
    };
}


// =============================
// MAP BLOCKSCOUT TOKEN TRANSFER â†’ FORMAT LOKAL
// =============================
function mapBlockscoutTokenTransfer(tx, myAddress) {
    const myAddr  = myAddress?.toLowerCase();
    const from    = tx.from?.hash?.toLowerCase() || "";
    const to      = tx.to?.hash?.toLowerCase()   || "";
    const ROUTER  = (window.CONFIG?.ROUTER || "").toLowerCase();
    const FACTORY = (window.CONFIG?.FACTORY || "").toLowerCase();

    const token    = tx.token || {};
    const decimals = parseInt(token.decimals || "18");
    const symbol   = token.symbol || "TOKEN";
    const name     = token.name   || symbol;
    const logo     = token.icon_url || "img/default.png";

    let valueNum = 0;
    try {
        const totalRaw = tx.total?.value ? BigInt(tx.total.value) : 0n;
        valueNum = Number(totalRaw) / Math.pow(10, decimals);
    } catch(e) {}

    const ts = tx.timestamp
        ? Math.floor(new Date(tx.timestamp).getTime() / 1000)
        : 0;

    const block = tx.block_number || 0;
    const hash  = tx.transaction_hash || "";

    // Deteksi SWAP: from/to adalah ROUTER atau FACTORY
    const isSwap = from === ROUTER || to === ROUTER ||
                   from === FACTORY || to === FACTORY;

    let type = "SEND";
    if (to === myAddr && from !== myAddr) type = "RECEIVE";
    if (isSwap) type = "SWAP";

    return {
        hash:      hash,
        from:      from,
        to:        to,
        value:     valueNum.toFixed(6).replace(/\.?0+$/, "") || "0",
        symbol:    symbol,
        name:      name,
        logo:      logo,
        type:      type,
        blockNumber: "0x" + block.toString(16),
        timestamp: ts,
        status:    "success",
        source:    "blockscout",
        read:      false
    };
}


// =============================
// GROUP SWAP â€” 1 tx hash bisa punya 2 token transfer
// Jadikan 1 entry SWAP dengan inSymbol/outSymbol
// =============================
function groupSwapTokenTransfers(list, myAddress) {
    const myAddr = myAddress?.toLowerCase();
    const swapMap = new Map();
    const nonSwap = [];

    list.forEach(tx => {
        if (tx.type !== "SWAP") { nonSwap.push(tx); return; }

        if (!swapMap.has(tx.hash)) {
            swapMap.set(tx.hash, []);
        }
        swapMap.get(tx.hash).push(tx);
    });

    const swaps = [];
    swapMap.forEach((transfers, hash) => {
        // token keluar = from myAddr, token masuk = to myAddr
        const outTx = transfers.find(t => t.from === myAddr);
        const inTx  = transfers.find(t => t.to   === myAddr);

        const base = transfers[0];
        swaps.push({
            ...base,
            type:      "SWAP",
            hash:      hash,
            inSymbol:  inTx?.symbol  || outTx?.symbol || "?",
            outSymbol: outTx?.symbol || inTx?.symbol  || "?",
            inLogo:    inTx?.logo    || "img/default.png",
            outLogo:   outTx?.logo   || "img/default.png",
            amountIn:  outTx?.value  || "0",
            amountOut: inTx?.value   || "0",
            value:     inTx?.value   || "0",
            symbol:    (outTx?.symbol || "?") + " â†’ " + (inTx?.symbol || "?"),
        });
    });

    return [...nonSwap, ...swaps];
}

// =============================
// MERGE & DEDUPLICATE TX LIST
// =============================
function mergeTxLists(remote, local, myAddress) {
    // Group swap dulu dari remote
    const grouped = groupSwapTokenTransfers(remote || [], myAddress);

    const map = new Map();

    // Prioritas: local (SWAP/LP lokal lebih detail)
    [...(local || []), ...grouped].forEach(tx => {
        if (!tx?.hash) return;
        if (!map.has(tx.hash)) {
            map.set(tx.hash, tx);
        } else {
            const existing = map.get(tx.hash);
            if (existing.type === "SWAP" || existing.type === "ADD_LP") return;
            map.set(tx.hash, { ...tx, ...existing });
        }
    });

    return Array.from(map.values())
        .sort((a, b) => normalizeTimestamp(b.timestamp) - normalizeTimestamp(a.timestamp));
}


// =============================
// LOAD TX HISTORY (MAIN)
// Coba Blockscout, fallback cache
// =============================
async function loadTxHistory(address) {
    const cached = getTxHistory();

    // Update UI langsung dengan cache
    renderTxHistory();

    if (!address) return;

    showTxLoadingIndicator(true);

    try {
        // Fetch paralel: native tx + token transfers
        const [nativeTxs, tokenTxs] = await Promise.all([
            fetchTxFromBlockscout(address),
            fetchTokenTransfersFromBlockscout(address)
        ]);

        const hasResult = nativeTxs !== null || tokenTxs !== null;

        if (hasResult) {
            const remote = [
                ...(nativeTxs  || []),
                ...(tokenTxs   || [])
            ];

            // Pertahankan status read dari cache
            const readMap = new Map(cached.map(t => [t.hash, t.read]));
            remote.forEach(tx => {
                if (readMap.has(tx.hash)) tx.read = readMap.get(tx.hash);
            });

            const merged = mergeTxLists(remote, cached, address);
            saveTxHistory(merged);
            renderTxHistory();
            updateBellBadge();

        } else {
            // API gagal total â€” tetap pakai cache
            console.warn("[riwayat] API gagal, pakai cache lokal");
        }

    } catch (err) {
        console.error("[riwayat] loadTxHistory error:", err);
    } finally {
        showTxLoadingIndicator(false);
    }
}


// =============================
// LOADING INDICATOR
// =============================
function showTxLoadingIndicator(show) {
    const list = getEl("txHistoryList");
    if (!list) return;

    let indicator = list.querySelector(".tx-loading");

    if (show) {
        if (!indicator) {
            indicator = document.createElement("div");
            indicator.className = "tx-loading";
            indicator.innerHTML = `
                <div style="text-align:center;padding:12px;color:#888;font-size:12px;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="margin-right:6px;"></i>
                    Memuat transaksi terbaru...
                </div>`;
            list.prepend(indicator);
        }
    } else {
        indicator?.remove();
    }
}


// =============================
// SAVE TX HISTORY
// =============================
function saveTxHistory(list) {
    try {
        // Simpan max 200 tx terbaru
        const trimmed = (list || []).slice(0, 200);
        localStorage.setItem("txHistory", JSON.stringify(trimmed));
    } catch (err) {
        console.warn("[riwayat] saveTxHistory error:", err);
    }
}


// =============================
// TX DETAIL MODAL
// =============================
function showTxDetail(tx) {
    const block        = parseInt(tx.blockNumber || "0x0", 16) || 0;
    const confirmations = tx.latestBlock ? (tx.latestBlock - block) : 0;
    const isSwap       = tx.type === "SWAP";

    const symbolLine = isSwap
        ? `${tx.inSymbol || "?"} â†’ ${tx.outSymbol || "?"}`
        : (tx.symbol || "SDA");

    const valueLine = isSwap
        ? `${tx.amountIn || 0} ${tx.inSymbol || ""} â†’ ${tx.amountOut || 0} ${tx.outSymbol || ""}`
        : `${tx.value} ${symbolLine}`;

    const statusLabel = tx.status === "failed"
        ? "âŒ Failed"
        : "âœ… Success";

    showConfirm(`
Hash: ${tx.hash}

Status: ${statusLabel}
Value: ${valueLine}
Token: ${symbolLine}

From: ${tx.from}
To:   ${tx.to}

Block: ${block}
Confirmations: ${confirmations}

Date: ${formatDate(normalizeTimestamp(tx.timestamp))}
    `);
}


// =============================
// BELL BADGE
// =============================
function updateBellBadge() {
    const badge = getEl("txBadge");
    if (!badge) return;

    const list   = getTxHistory();
    const unread = list.filter(t => !t.read).length;

    if (unread > 0) {
        badge.style.display = "inline-block";
        badge.innerText     = unread;
    } else {
        badge.style.display = "none";
    }
}


function formatAddress(addr) {
    if (!addr) return "-";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
}


// =============================
// TX HISTORY GETTER (SAFE)
// =============================
function getTxHistory() {
    try   { return JSON.parse(localStorage.getItem("txHistory")) || []; }
    catch { return []; }
}


// =============================
// LOGO PATH NORMALISER
// =============================
function normalizeLogo(raw, fallback) {
    if (!raw || typeof raw !== "string" || raw.trim() === "") {
        return fallback || "img/sda.png";
    }
    if (raw.startsWith("img/")) return raw;
    if (raw.startsWith("http"))  return raw;
    if (!raw.includes("/"))      return "img/" + raw;
    return raw;
}


// =============================
// TX HISTORY RENDER
// =============================
function renderTxHistory() {
    const list = getEl("txHistoryList");
    if (!list) return;

    const history = getTxHistory();
    const wallet  = getSelectedWallet?.();
    const myAddr  = wallet?.address?.toLowerCase();

    if (history.length === 0) {
        list.innerHTML = `
        <div style="text-align:center;color:#888;padding:30px;">
            <div style="font-size:14px;">No Transactions</div>
            <div style="font-size:11px;margin-top:6px;">Your activity will appear here</div>
        </div>`;
        return;
    }

    list.innerHTML = "";

    history.forEach(tx => {
        if (!tx) return;

        const isSwap  = tx.type === "SWAP";
        const isAddLP = tx.type === "ADD_LP";

        const inSym  = tx.inSymbol  || "SDA";
        const outSym = tx.outSymbol || "TOKEN";

        const symbolDisplay = isSwap
            ? `${inSym} > ${outSym}`
            : isAddLP
                ? `${inSym} + ${outSym}`
                : (tx.symbol || "SDA");

        const logo = normalizeLogo(tx.logo, "img/sda.png");

        const from = tx.from?.toLowerCase();
        const to   = tx.to?.toLowerCase();

        let type  = "SEND";
        let color = "#ff4d4f";
        let icon  = "up";

        const ROUTER_ADDR = (window.CONFIG?.ROUTER || "").toLowerCase();

        // Deteksi swap dari Blockscout yang lolos sebagai SEND
        const isRouterTx = to === ROUTER_ADDR;

        if (isAddLP) {
            type  = "ADD LP";
            color = "#f59e0b";
            icon  = "lp";
        } else if (isSwap || isRouterTx) {
            type  = "SWAP";
            color = "#3b82f6";
            icon  = "swap";
        } else if (myAddr && to === myAddr) {
            type  = "RECEIVE";
            color = "#00d084";
            icon  = "down";
        }

        // Status badge (failed tx)
        const isFailed    = tx.status === "failed";
        const statusBadge = isFailed
            ? `<span style="font-size:9px;background:#ff4d4f22;color:#ff4d4f;
                            border-radius:4px;padding:1px 5px;margin-left:4px;">Failed</span>`
            : "";

        // Value display
        let valueFormatted;

        if (isAddLP) {
            const v0  = Number(tx.amount0 || 0);
            const v1  = Number(tx.amount1 || 0);
            const fmt = n => n < 0.000001 && n > 0
                ? n.toExponential(2)
                : n.toFixed(6).replace(/\.?0+$/, "");
            valueFormatted = `${fmt(v0)} + ${fmt(v1)}`;
        } else {
            const value = isSwap
                ? Number(tx.amountOut || 0)
                : Number(tx.value     || 0);

            if (value === 0)              valueFormatted = "0";
            else if (value < 0.000001)    valueFormatted = value.toExponential(2);
            else                          valueFormatted = value.toFixed(6).replace(/\.?0+$/, "");
        }

        const targetAddr = type === "SEND" ? tx.to : tx.from;
        const shortAddr  = (isAddLP || isSwap)
            ? "Liquidity Pool"
            : targetAddr
                ? targetAddr.slice(0, 6) + "..." + targetAddr.slice(-4)
                : "-";

        const iconHTML = {
            up:   '<i class="fa-solid fa-arrow-up"></i>',
            down: '<i class="fa-solid fa-arrow-down"></i>',
            swap: '<i class="fa-solid fa-right-left"></i>',
            lp:   '<i class="fa-solid fa-droplet"></i>'
        }[icon];

        // Ambil logo dari tx, atau fallback ke window.TOKENS by symbol
        function logoBySymbol(sym, fallback) {
            if (!sym) return fallback;
            if (sym === "SDA") return "img/sda.png";
            const found = (window.TOKENS || []).find(
                t => t.symbol?.toLowerCase() === sym.toLowerCase()
            );
            return found?.logo || fallback;
        }

        const inLogo  = normalizeLogo(tx.inLogo  || logoBySymbol(tx.inSymbol,  "img/sda.png"),  "img/sda.png");
        const outLogo = normalizeLogo(tx.outLogo || logoBySymbol(tx.outSymbol, "img/default.png"), "img/default.png");

        // Untuk router tx yang baru dideteksi, pakai logo token dari tx itu sendiri
        const displayInLogo  = isRouterTx ? normalizeLogo(tx.logo, "img/sda.png") : inLogo;
        const displayOutLogo = isRouterTx ? "img/sda.png" : outLogo;

        const logoHTML = (isSwap || isAddLP)
            ? `<div style="position:relative;width:46px;height:34px;flex-shrink:0;">
                <img src="${displayInLogo}"
                     onerror="this.src='img/default.png'"
                     style="width:24px;height:24px;border-radius:50%;position:absolute;
                            left:0;top:5px;background:#111;padding:3px;z-index:1;object-fit:contain;">
                <img src="${displayOutLogo}"
                     onerror="this.src='img/default.png'"
                     style="width:24px;height:24px;border-radius:50%;position:absolute;
                            right:0;top:5px;background:#111;padding:3px;
                            border:2px solid #0b0f17;z-index:2;object-fit:contain;">
               </div>`
            : `<img src="${logo}"
                    onerror="this.src='img/default.png'"
                    style="width:34px;height:34px;border-radius:50%;
                           background:#111;padding:5px;object-fit:contain;">`;

        // Source badge (blockscout vs lokal)
        const sourceBadge = tx.source === "blockscout"
            ? `<span style="font-size:9px;color:#3b82f6;opacity:0.6;">live</span>`
            : "";

        const el       = document.createElement("div");
        el.className   = "asset-item";
        el.style.opacity = isFailed ? "0.6" : "1";

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
            <div style="font-size:13px;font-weight:600;">
                ${type}${statusBadge}
            </div>
            <div style="font-size:11px;color:#888;">${shortAddr}</div>
            <div style="font-size:10px;color:#666;">
                ${formatDate(normalizeTimestamp(tx.timestamp))} ${sourceBadge}
            </div>
        </div>
    </div>

    <div style="text-align:right;">
        <div style="font-size:13px;font-weight:600;color:${isFailed ? "#888" : color};">
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

        el.onclick = e => {
            if (e.target.closest(".copy-btn")) return;
            if (e.target.closest(".open-tx"))  return;
            showTxDetail(tx);
        };

        list.appendChild(el);
    });
}


let activeModal = null;


// =============================
// OPEN HISTORY MODAL
// =============================
function openTxHistory() {
    const wallet = getSelectedWallet?.();

    // Tandai semua sebagai read
    const list = getTxHistory();
    list.forEach(t => t.read = true);
    saveTxHistory(list);

    updateBellBadge();

    const modal = getEl("txModal");
    if (!modal) return;

    modal.classList.add("show");
    modal.style.display = "flex";
    activeModal = modal;

    history.pushState({ modal: "txModal" }, "");

    // Render cache dulu, lalu fetch Blockscout
    renderTxHistory();

    if (wallet?.address) {
        loadTxHistory(wallet.address);
    }
}


// =============================
// CLEAR TX HISTORY
// =============================
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
function closeTxModal() {
    const modal = getEl("txModal");
    if (!modal) return;

    modal.classList.remove("show");
    modal.style.display = "none";
    activeModal = null;
}


// =============================
// BACK BUTTON HANDLER
// =============================
window.addEventListener("popstate", () => {
    if (activeModal) {
        activeModal.classList.remove("show");
        activeModal.style.display = "none";
        activeModal = null;
    }
});


// =============================
// CLICK HANDLER â€” copy & ledger
// =============================
document.addEventListener("click", async e => {

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