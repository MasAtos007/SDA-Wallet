// =============================
// RIWAYAT.JS â€“ TX HISTORY
// Blockscout API + LocalStorage
// =============================

const BLOCKSCOUT_API =
"https://corsproxy.io/?https://ledger.sidrachain.com/api/v2";

// =============================
// NORMALIZE TIMESTAMP
// =============================
function normalizeTimestamp(ts) {
    if (!ts) return 0;
    return ts > 1e12 ? Math.floor(ts / 1000) : ts;
}

// =============================
// FETCH TX FROM BLOCKSCOUT API
// =============================
async function fetchTxFromBlockscout(address) {
    if (!address) return [];
    try {
        const url = `${BLOCKSCOUT_API}/addresses/${address}/transactions`;
        const res = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: { "Accept": "application/json" }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log("[Blockscout] native tx sample:", data.items?.[0]);
        return data.items || [];
    } catch (err) {
        console.warn("[Blockscout] fetchTx error:", err.message);
        return null;
    }
}


// =============================
// FETCH SDA AMOUNT FROM TX
// =============================
async function fetchSdaAmountFromTx(hash) {
    try {
        const url = `${BLOCKSCOUT_API}/transactions/${hash}/token-transfers`;
        const res = await fetch(url, {
            signal: AbortSignal.timeout(8000),
            headers: { "Accept": "application/json" }
        });
        if (!res.ok) return 0;
        const data = await res.json();
        const BURN_ADDR = "0x0000000000000000000000000000000000000000";
        const wsdaBurn = (data.items || []).find(
            i => (i.token?.symbol || "").toUpperCase() === "WSDA" &&
                 (i.to?.hash || "").toLowerCase() === BURN_ADDR
        );
        if (!wsdaBurn) return 0;
        const decimals = parseInt(wsdaBurn.token?.decimals || "18");
        return Number(BigInt(wsdaBurn.total?.value || "0")) / Math.pow(10, decimals);
    } catch(e) {
        console.warn("[fetchSdaAmountFromTx] error:", e.message);
        return 0;
    }
}
// =============================
// FETCH TOKEN TRANSFERS
// =============================
async function fetchTokenTransfersFromBlockscout(address) {
    if (!address) return [];
    try {
        const url = `${BLOCKSCOUT_API}/addresses/${address}/token-transfers`;
        const res = await fetch(url, {
            signal: AbortSignal.timeout(10000),
            headers: { "Accept": "application/json" }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log("[Blockscout] token transfer sample:", data.items?.[0]);
        return data.items || [];
    } catch (err) {
        console.warn("[Blockscout] fetchTokenTransfers error:", err.message);
        return null;
    }
}

// =============================
// CEK APAKAH TOKEN ADALAH LP NFT
// UNI-V3-POS atau token tipe ERC-721/ERC-1155
// =============================
function isLpNft(token) {
    if (!token) return false;
    const sym  = (token.symbol  || "").toUpperCase();
    const name = (token.name    || "").toUpperCase();
    const type = (token.type    || "").toUpperCase();
    return (
        sym === "UNI-V3-POS" ||
        sym === "UNI-V3" ||
        name.includes("UNISWAP V3 POSITIONS") ||
        type === "ERC-721" ||
        type === "ERC-1155"
    );
}

// =============================
// BUILD TX INFO MAP
// Menghasilkan 2 map:
//   swapMap    â€“ hash swap
//   collectMap â€“ hash collect fee LP
// =============================
function buildSwapInfoMap(nativeItems, myAddress) {
    const ROUTER   = (window.CONFIG?.ROUTER   || "").toLowerCase();
    const POS_MGR  = "0x8b9bcc8c722778f30146e20e44e8d8e28add8df8"; // Uniswap V3 Positions NFT
    const swapMap    = new Map();
    const collectMap = new Map();

    // â”€â”€ Selector hex untuk method "collect" di Uniswap V3 Position Manager â”€â”€
    const COLLECT_SELECTORS = new Set(["collect", "0xfc6f7865"]);

    (nativeItems || []).forEach(tx => {
        const to     = (tx.to?.hash   || "").toLowerCase();
        const from   = (tx.from?.hash || "").toLowerCase();
        const method = (tx.method     || "").toLowerCase();
        const hash   = (tx.hash       || "").toLowerCase();

        // â”€â”€ Deteksi COLLECT FEE LP â”€â”€
        // Method "collect" (atau hex selector-nya) ke contract Position Manager
        const isCollect =
            COLLECT_SELECTORS.has(method) &&
            (to === POS_MGR || from === POS_MGR);

        if (isCollect) {
            collectMap.set(hash, { method: "collect" });
            return; // jangan masuk swapMap
        }

        // â”€â”€ Deteksi SWAP â”€â”€
        const isSwap =
            to === ROUTER ||
            from === ROUTER ||
            /swap/i.test(method) ||
            method === "multicall";

        if (!isSwap) return;
        
        

        let valueSDA = 0;
        try {
            const raw = tx.value ? BigInt(tx.value) : 0n;
            valueSDA = Number(raw) / 1e18;
        } catch(e) {}

        const txTypes = tx.transaction_types || [];
        const hasCoin = txTypes.includes("coin_transfer");

        swapMap.set(hash, {
            valueSDA,
            hasCoin,
            valueSDAStr: valueSDA > 0
                ? valueSDA.toFixed(6).replace(/\.?0+$/, "")
                : "0"
        });
    });

    // Simpan collectMap ke window supaya bisa diakses di processTokenTransfers
    window._collectMap = collectMap;

    return swapMap;
}

// =============================
// PROSES TOKEN TRANSFERS
// =============================
function processTokenTransfers(rawItems, swapInfoMap, myAddress) {
    const myAddr = myAddress?.toLowerCase();

    // Group berdasarkan tx hash
    const grouped = new Map();
    (rawItems || []).forEach(item => {
        const hash = (item.transaction_hash || "").toLowerCase();
        if (!hash) return;
        if (!grouped.has(hash)) grouped.set(hash, []);
        grouped.get(hash).push(item);
    });

    const result = [];

    grouped.forEach((items, hash) => {
        const nativeInfo   = swapInfoMap.get(hash);
        const isCollectFee = window._collectMap?.has(hash);

        // â”€â”€ COLLECT FEE LP â”€â”€
        if (isCollectFee) {
            const received = items.filter(
                i => !isLpNft(i.token) &&
                     (i.to?.hash || "").toLowerCase() === myAddr
            );

            if (received.length >= 1) {
                const base = received[0];
                const t0   = parseTokenTransferItem(received[0]);
                const t1   = parseTokenTransferItem(received[1] || null);

                result.push({
                    hash,
                    from:      (base.from?.hash || "").toLowerCase(),
                    to:        (base.to?.hash   || "").toLowerCase(),
                    type:      "COLLECT_FEE",
                    inSymbol:  t0?.symbol || "?",
                    inLogo:    resolveTokenLogo(t0?.symbol, t0?.logo),
                    outSymbol: t1?.symbol || "",
                    outLogo:   t1 ? resolveTokenLogo(t1.symbol, t1.logo) : "",
                    amountOut: t0?.value  || "0",
                    amount1:   t1?.value  || "0",
                    value:     t0?.value  || "0",
                    symbol:    t0?.symbol || "FEE",
                    logo:      resolveTokenLogo(t0?.symbol, t0?.logo),
                    blockNumber: "0x" + (base.block_number || 0).toString(16),
                    timestamp: base.timestamp
                        ? Math.floor(new Date(base.timestamp).getTime() / 1000)
                        : 0,
                    status: "success",
                    source: "blockscout",
                    read:   false
                });
            }
            return;
        }



        // â”€â”€ Filter: abaikan transaksi yang semua item-nya adalah LP NFT â”€â”€
        const allNft      = items.every(i => isLpNft(i.token));
        const hasNft      = items.some(i => isLpNft(i.token));
        const nonNftItems = items.filter(i => !isLpNft(i.token));

        // â”€â”€ LP NFT burn (remove liquidity): ada NFT + ada token ERC-20 â”€â”€
        if (hasNft && nonNftItems.length >= 1) {
            const base = nonNftItems[0];

            const received = nonNftItems.filter(
                i => (i.to?.hash || "").toLowerCase() === myAddr
            );

            if (received.length >= 1) {
                const t0 = parseTokenTransferItem(received[0]);
                const t1 = parseTokenTransferItem(received[1] || null);

                result.push({
                    hash,
                    from:        (base.from?.hash || "").toLowerCase(),
                    to:          (base.to?.hash   || "").toLowerCase(),
                    type:        "REMOVE_LP",
                    inSymbol:    t0?.symbol || "?",
                    inLogo:      resolveTokenLogo(t0?.symbol, t0?.logo),
                    outSymbol:   t1?.symbol || "",
                    outLogo:     t1 ? resolveTokenLogo(t1.symbol, t1.logo) : "",
                    amountOut:   t0?.value || "0",
                    amount1:     t1?.value || "0",
                    value:       t0?.value || "0",
                    symbol:      t0?.symbol || "LP",
                    logo:        resolveTokenLogo(t0?.symbol, t0?.logo),
                    blockNumber: "0x" + (base.block_number || 0).toString(16),
                    timestamp:   base.timestamp
                        ? Math.floor(new Date(base.timestamp).getTime() / 1000)
                        : 0,
                    status: "success",
                    source: "blockscout",
                    read:   false
                });
                return;
            }
        }

        // â”€â”€ Pure NFT transfer â†’ LP_NFT â”€â”€
        if (allNft) {
            const base  = items[0];
            const token = base.token || {};
            const to    = (base.to?.hash || "").toLowerCase();
            const from  = (base.from?.hash || "").toLowerCase();
            const type  = (to === myAddr && from !== myAddr) ? "RECEIVE" : "SEND";
            const tokenId = base.total?.token_id || base.token_id || "?";

            result.push({
                hash,
                from,
                to,
                type:    "LP_NFT",
                subType: type,
                value:   "0",
                symbol:  token.symbol || "UNI-V3-POS",
                tokenId: String(tokenId),
                logo:    "img/lp.png",
                blockNumber: "0x" + (base.block_number || 0).toString(16),
                timestamp: base.timestamp
                    ? Math.floor(new Date(base.timestamp).getTime() / 1000)
                    : 0,
                status: "success",
                source: "blockscout",
                read:   false
            });
            return;
        }

        // â”€â”€ Pakai nonNftItems untuk logika swap/send biasa â”€â”€
        const workItems = nonNftItems.length ? nonNftItems : items;

        const isSwap =
            swapInfoMap.has(hash) ||
            workItems.length >= 2;

        if (isSwap) {
            
            // Token MASUK ke wallet = output swap (yang user terima)
            const inItem = workItems.find(
                t => (t.to?.hash || "").toLowerCase() === myAddr
            );
            // Token KELUAR dari wallet = input swap (yang user kirim)
            const outItem = workItems.find(
                t => (t.from?.hash || "").toLowerCase() === myAddr
            );

            const base     = inItem || outItem || workItems[0];
            const inToken  = parseTokenTransferItem(inItem);
            const outToken = parseTokenTransferItem(outItem);

            // â”€â”€ Deteksi semua WSDA di tx ini â”€â”€
            const BURN_ADDR = "0x0000000000000000000000000000000000000000";

            // WSDA yang di-burn (to = 0x000...): ini nilai SDA yang diterima user
            const wsdaBurnItem = workItems.find(
                t => (t.token?.symbol || "").toUpperCase() === "WSDA" &&
                     (t.to?.hash || "").toLowerCase() === BURN_ADDR
            );
            // WSDA yang diterima user langsung
            const wsdaToUserItem = workItems.find(
                t => (t.token?.symbol || "").toUpperCase() === "WSDA" &&
                     (t.to?.hash || "").toLowerCase() === myAddr
            );
            // WSDA apapun di tx ini (fallback)
            const wsdaAnyItem = wsdaBurnItem || wsdaToUserItem || workItems.find(
                t => (t.token?.symbol || "").toUpperCase() === "WSDA"
            );

            const wsdaBurnParsed   = parseTokenTransferItem(wsdaBurnItem);
            const wsdaToUserParsed = parseTokenTransferItem(wsdaToUserItem);
            const wsdaAnyParsed    = parseTokenTransferItem(wsdaAnyItem);

            // inItem WSDA langsung ke wallet user
            const inIsWsda = inToken?.symbol?.toUpperCase() === "WSDA";

            // â”€â”€ TOKENâ†’SDA: ada outItem (token keluar dari user), tidak ada inItem ERC-20,
            //    dan ada WSDA di tx (burn atau ke user) â€” SDA native dikirim ke wallet
            const isSDAOutViaBurn =
                !inItem &&
                outItem;

            // â”€â”€ SDAâ†’TOKEN: ada inItem (token ERC-20 masuk ke user), tidak ada outItem ERC-20,
            //    bukan WSDA, dan tx ini adalah swap
            const isSDAIn =
                inItem &&
                !outItem &&
                !inIsWsda &&
                (
                    (nativeInfo && nativeInfo.valueSDA > 0) ||
                    swapInfoMap.has(hash)
                );

            // â”€â”€ TOKENâ†’SDA fallback (tanpa WSDA di token-transfers) â”€â”€
            const isSDAOut =
                !inItem &&
                outItem &&
                !inIsWsda &&
                !isSDAOutViaBurn;

            // â”€â”€ Tentukan outSymbol (yang dikirim user) â”€â”€
            let outSymbol, outLogo, amountIn;

            if (isSDAIn) {
                outSymbol = "SDA";
                outLogo   = "img/sda.png";
                amountIn  = nativeInfo?.valueSDA > 0
                    ? nativeInfo.valueSDAStr
                    : "?";
            } else {
                outSymbol = outToken?.symbol || "?";
                outLogo   = outToken?.symbol
                    ? resolveTokenLogo(outToken.symbol, outToken.logo)
                    : "img/default.png";
                amountIn  = outToken?.value || "0";
            }

            // â”€â”€ Tentukan inSymbol (yang diterima user) â”€â”€
            let inSymbol, inLogo, amountOut;

            if (isSDAOut || isSDAOutViaBurn || inIsWsda) {
                // TOKENâ†’SDA: user terima SDA native
                inSymbol = "SDA";
                inLogo   = "img/sda.png";

                // Prioritas nilai SDA yang diterima:
                // 1. WSDA burnt amount â€” paling akurat (ini persis SDA yang di-unwrap ke user)
                // 2. WSDA yang diterima user langsung
                // 3. WSDA apapun di tx
                // 4. native tx value
                // 5. "0"
                if (wsdaBurnParsed?.valueNum > 0) {
                    amountOut = wsdaBurnParsed.value;
                } else if (wsdaToUserParsed?.valueNum > 0) {
                    amountOut = wsdaToUserParsed.value;
                } else if (wsdaAnyParsed?.valueNum > 0) {
                    amountOut = wsdaAnyParsed.value;
                } else if (nativeInfo?.valueSDA > 0) {
                    amountOut = nativeInfo.valueSDAStr;
                } else {
                    amountOut = "0";
                }
            } else {
                inSymbol  = inToken?.symbol || "?";
                inLogo    = inToken?.symbol
                    ? resolveTokenLogo(inToken.symbol, inToken.logo)
                    : "img/default.png";
                amountOut = inToken?.value || "0";
            }

            // â”€â”€ Safeguard: kalau amountOut masih 0 tapi ada nativeInfo â”€â”€
            if ((amountOut === "0" || !amountOut) && nativeInfo?.valueSDA > 0) {
                amountOut = nativeInfo.valueSDAStr;
            }

            // â”€â”€ Safeguard logo â”€â”€
            if (!outLogo) outLogo = outSymbol === "SDA" ? "img/sda.png" : "img/default.png";
            if (!inLogo)  inLogo  = inSymbol  === "SDA" ? "img/sda.png" : "img/default.png";

            result.push({
                hash,
                from:      (base.from?.hash || "").toLowerCase(),
                to:        (base.to?.hash   || "").toLowerCase(),
                type:      "SWAP",
                inSymbol,
                inLogo,
                amountOut,
                outSymbol,
                outLogo,
                amountIn,
                value:     amountOut,
                symbol:    outSymbol + " > " + inSymbol,
                logo:      inLogo,
                blockNumber: "0x" + (base.block_number || 0).toString(16),
                timestamp: base.timestamp
                    ? Math.floor(new Date(base.timestamp).getTime() / 1000)
                    : 0,
                status: "success",
                source: "blockscout",
                read:   false
            });

        } else {
            // SEND atau RECEIVE biasa
            workItems.forEach(item => {
                const from   = (item.from?.hash || "").toLowerCase();
                const to     = (item.to?.hash   || "").toLowerCase();
                const parsed = parseTokenTransferItem(item);
                if (!parsed) return;

                const type = (to === myAddr && from !== myAddr) ? "RECEIVE" : "SEND";

                result.push({
                    hash,
                    from,
                    to,
                    type,
                    value:  parsed.value,
                    symbol: parsed.symbol,
                    logo:   resolveTokenLogo(parsed.symbol, parsed.logo),
                    blockNumber: "0x" + (item.block_number || 0).toString(16),
                    timestamp: item.timestamp
                        ? Math.floor(new Date(item.timestamp).getTime() / 1000)
                        : 0,
                    status: "success",
                    source: "blockscout",
                    read:   false
                });
            });
        }
    });

    return result;
}

// =============================
// HELPER: resolve logo token
// =============================
function resolveTokenLogo(symbol, blockscoutUrl) {
    if (!symbol) return "img/default.png";
    if (symbol === "SDA")  return "img/sda.png";
    if (symbol === "WSDA") return "img/sda.png";

    const found = (window.TOKENS || []).find(
        t => t.symbol?.toLowerCase() === symbol.toLowerCase()
    );
    if (found) {
        const raw = found.logo || found.icon || "";
        if (raw) return normalizeLogo(raw, "img/default.png");
    }

    if (blockscoutUrl && typeof blockscoutUrl === "string" &&
        blockscoutUrl.startsWith("http")) {
        return blockscoutUrl;
    }

    return "img/default.png";
}

// =============================
// HELPER: parse satu item token transfer
// =============================
function parseTokenTransferItem(item) {
    if (!item) return null;
    const token    = item.token || {};
    const decimals = parseInt(token.decimals || "18");
    const symbol   = token.symbol || "TOKEN";
    const logo     = token.icon_url || "";

    let valueNum = 0;
    try {
        const raw = item.total?.value ? BigInt(item.total.value) : 0n;
        valueNum = Number(raw) / Math.pow(10, decimals);
    } catch(e) {}

    const formatted = valueNum < 0.000001 && valueNum > 0
        ? valueNum.toExponential(2)
        : valueNum.toFixed(6).replace(/\.?0+$/, "") || "0";

    return { symbol, logo, value: formatted, valueNum };
}

// =============================
// MERGE & DEDUPLICATE TX LIST
// =============================
function mergeTxLists(remote, local) {
    const map = new Map();

    [...(local || []), ...(remote || [])].forEach(tx => {
        if (!tx?.hash) return;
        const key = tx.hash.toLowerCase();

        if (!map.has(key)) {
            map.set(key, tx);
        } else {
            const existing = map.get(key);
            if (existing.type === "SWAP" && tx.type !== "SWAP") return;
            if (existing.type === "ADD_LP") return;
            if (existing.type === "SWAP" && tx.type === "SWAP") {
                const existOk = existing.inSymbol && existing.inSymbol !== "?";
                const incomOk = tx.inSymbol && tx.inSymbol !== "?";
                if (existOk && !incomOk) return;
                if (incomOk && !existOk) { map.set(key, tx); return; }
                return;
            }
            map.set(key, { ...tx, ...existing });
        }
    });

    return Array.from(map.values())
        .sort((a, b) =>
            normalizeTimestamp(b.timestamp) - normalizeTimestamp(a.timestamp)
        );
}

// =============================
// LOAD TX HISTORY (MAIN)
// =============================
async function loadTxHistory(address) {
    const cached = getTxHistory();
    renderTxHistory();

    if (!address) return;

    showTxLoadingIndicator(true);

    try {
        const [nativeItems, tokenItems] = await Promise.all([
            fetchTxFromBlockscout(address),
            fetchTokenTransfersFromBlockscout(address)
        ]);

        const hasResult = nativeItems !== null || tokenItems !== null;

        if (hasResult) {
            const swapInfoMap = buildSwapInfoMap(nativeItems || [], address);
            
            // Untuk swap TOKEN→SDA, ambil nilai SDA dari internal tx
            const sdaSwapHashes = [...swapInfoMap.entries()]
                .filter(([h, v]) => v.valueSDA === 0)
                .map(([h]) => h);

            await Promise.all(sdaSwapHashes.map(async h => {
                const val = await fetchSdaAmountFromTx(h);
                if (val > 0) {
                    const info = swapInfoMap.get(h);
                    info.valueSDA = val;
                    info.valueSDAStr = val.toFixed(6).replace(/\.?0+$/, "");
                    swapInfoMap.set(h, info);
                }
            }));
            
            

            const remote = processTokenTransfers(
                tokenItems || [],
                swapInfoMap,
                address
            );

            const readMap = new Map(cached.map(t => [
                (t.hash || "").toLowerCase(), t.read
            ]));
            remote.forEach(tx => {
                const key = (tx.hash || "").toLowerCase();
                if (readMap.has(key)) tx.read = readMap.get(key);
            });

            const merged = mergeTxLists(remote, cached);
            saveTxHistory(merged);
            renderTxHistory();
            updateBellBadge();

        } else {
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
    const block         = parseInt(tx.blockNumber || "0x0", 16) || 0;
    const confirmations = tx.latestBlock ? (tx.latestBlock - block) : 0;
    const isSwap        = tx.type === "SWAP";
    const isLpNftTx     = tx.type === "LP_NFT";
    const isRemoveLp    = tx.type === "REMOVE_LP";

    let symbolLine, valueLine;

    if (isLpNftTx) {
        symbolLine = `LP Position NFT`;
        valueLine  = `Token ID: ${tx.tokenId || "?"}`;
    } else if (isRemoveLp) {
        symbolLine = `${tx.inSymbol || "?"} + ${tx.outSymbol || "?"}`;
        valueLine  = `${tx.amountOut || 0} ${tx.inSymbol || ""} + ${tx.amount1 || 0} ${tx.outSymbol || ""}`;
    } else if (isSwap) {
        symbolLine = `${tx.outSymbol || "?"} > ${tx.inSymbol || "?"}`;
        valueLine  = `${tx.amountIn || 0} ${tx.outSymbol || ""} â†’ ${tx.amountOut || 0} ${tx.inSymbol || ""}`;
    } else {
        symbolLine = tx.symbol || "SDA";
        valueLine  = `${tx.value} ${symbolLine}`;
    }

    const statusLabel = tx.status === "failed" ? "[FAILED]" : "[SUCCESS]";

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

        const isSwap       = tx.type === "SWAP";
        const isAddLP      = tx.type === "ADD_LP";
        const isRemoveLP   = tx.type === "REMOVE_LP";
        const isLpNftTx    = tx.type === "LP_NFT";
        const isCollectFee = tx.type === "COLLECT_FEE";

        // â”€â”€ Type display â”€â”€
        let type  = tx.type || "SEND";
        let color = "#ff4d4f";
        let icon  = "up";

        if (isCollectFee) {
            color = "#00d084";
            icon  = "down";
            type  = "COLLECT FEE";
        } else if (isLpNftTx) {
            color = "#888";
            icon  = "lp";
            type  = tx.subType === "RECEIVE" ? "LP RECEIVED" : "LP SENT";
        } else if (isRemoveLP) {
            color = "#f59e0b";
            icon  = "lp";
            type  = "REMOVE LP";
        } else if (isAddLP) {
            color = "#f59e0b";
            icon  = "lp";
        } else if (isSwap) {
            color = "#3b82f6";
            icon  = "swap";
        } else if (type === "RECEIVE") {
            color = "#00d084";
            icon  = "down";
        }

        // â”€â”€ Label simbol â”€â”€
        let symbolDisplay;
        if (isCollectFee) {
            symbolDisplay = tx.outSymbol
                ? `${tx.inSymbol || "?"} + ${tx.outSymbol}`
                : (tx.inSymbol || "FEE");
        } else if (isLpNftTx) {
            symbolDisplay = `LP NFT #${tx.tokenId || "?"}`;
        } else if (isRemoveLP) {
            symbolDisplay = `${tx.inSymbol || "?"} + ${tx.outSymbol || "?"}`;
        } else if (isSwap) {
            symbolDisplay = `${tx.outSymbol || "?"} > ${tx.inSymbol || "?"}`;
        } else if (isAddLP) {
            symbolDisplay = `${tx.inSymbol || ""} + ${tx.outSymbol || ""}`;
        } else {
            symbolDisplay = tx.symbol || "SDA";
        }

        // â”€â”€ Status badge â”€â”€
        const isFailed    = tx.status === "failed";
        const statusBadge = isFailed
            ? `<span style="font-size:9px;background:#ff4d4f22;color:#ff4d4f;
                            border-radius:4px;padding:1px 5px;margin-left:4px;">Failed</span>`
            : "";

        // â”€â”€ Nilai â”€â”€
        let valueFormatted;
        if (isCollectFee) {
            const v0  = Number(tx.amountOut || 0);
            const v1  = Number(tx.amount1   || 0);
            const fmt = n => n < 0.000001 && n > 0
                ? n.toExponential(2)
                : n.toFixed(6).replace(/\.?0+$/, "");
            valueFormatted = tx.outSymbol
                ? `${fmt(v0)} + ${fmt(v1)}`
                : fmt(v0);
        } else if (isLpNftTx) {
            valueFormatted = `#${tx.tokenId || "?"}`;
        } else if (isRemoveLP) {
            const v0  = Number(tx.amountOut || 0);
            const v1  = Number(tx.amount1   || 0);
            const fmt = n => n < 0.000001 && n > 0
                ? n.toExponential(2)
                : n.toFixed(6).replace(/\.?0+$/, "");
            valueFormatted = `${fmt(v0)} + ${fmt(v1)}`;
        } else if (isAddLP) {
            const v0  = Number(tx.amount0 || 0);
            const v1  = Number(tx.amount1 || 0);
            const fmt = n => n < 0.000001 && n > 0
                ? n.toExponential(2)
                : n.toFixed(6).replace(/\.?0+$/, "");
            valueFormatted = `${fmt(v0)} + ${fmt(v1)}`;
        } else if (isSwap) {
            const val = Number(tx.amountOut || tx.value || 0);
            valueFormatted = val === 0
                ? "0"
                : val < 0.000001
                    ? val.toExponential(2)
                    : val.toFixed(6).replace(/\.?0+$/, "");
        } else {
            const val = Number(tx.value || 0);
            valueFormatted = val === 0
                ? "0"
                : val < 0.000001
                    ? val.toExponential(2)
                    : val.toFixed(6).replace(/\.?0+$/, "");
        }

        // â”€â”€ Alamat pendek â”€â”€
        const targetAddr = type === "SEND" ? tx.to : tx.from;
        const shortAddr  = (isSwap || isAddLP || isRemoveLP || isCollectFee)
            ? "Liquidity Pool"
            : isLpNftTx
                ? (tx.subType === "RECEIVE"
                    ? (tx.from?.slice(0,6) + "..." + tx.from?.slice(-4))
                    : (tx.to?.slice(0,6)   + "..." + tx.to?.slice(-4)))
            : targetAddr
                ? targetAddr.slice(0, 6) + "..." + targetAddr.slice(-4)
                : "-";

        // â”€â”€ Icon â”€â”€
        const iconHTML = {
            up:   '<i class="fa-solid fa-arrow-up"></i>',
            down: '<i class="fa-solid fa-arrow-down"></i>',
            swap: '<i class="fa-solid fa-right-left"></i>',
            lp:   '<i class="fa-solid fa-droplet"></i>'
        }[icon];

        // â”€â”€ Logo â”€â”€
        const logo       = resolveTokenLogo(tx.symbol, tx.logo);
        const outLogoSrc = tx.outLogo
            ? normalizeLogo(tx.outLogo, "img/sda.png")
            : resolveTokenLogo(tx.outSymbol, null);
        const inLogoSrc  = tx.inLogo
            ? normalizeLogo(tx.inLogo, "img/default.png")
            : resolveTokenLogo(tx.inSymbol, null);

        const lpNftLogoHTML = `
            <div style="width:34px;height:34px;border-radius:50%;
                        background:#1a1a2e;display:flex;align-items:center;
                        justify-content:center;font-size:14px;">
                <i class="fa-solid fa-droplet" style="color:#888;"></i>
            </div>`;

        const logoHTML = isLpNftTx
            ? lpNftLogoHTML
            : (isSwap || isAddLP || isRemoveLP || isCollectFee)
                ? `<div style="position:relative;width:46px;height:34px;flex-shrink:0;">
                    <img src="${outLogoSrc}"
                         onerror="this.src='img/default.png'"
                         style="width:24px;height:24px;border-radius:50%;position:absolute;
                                left:0;top:5px;background:#111;padding:3px;z-index:1;object-fit:contain;">
                    <img src="${inLogoSrc}"
                         onerror="this.src='img/default.png'"
                         style="width:24px;height:24px;border-radius:50%;position:absolute;
                                right:0;top:5px;background:#111;padding:3px;
                                border:2px solid #0b0f17;z-index:2;object-fit:contain;">
                   </div>`
                : `<img src="${logo}"
                        onerror="this.src='img/default.png'"
                        style="width:34px;height:34px;border-radius:50%;
                               background:#111;padding:5px;object-fit:contain;">`;

        // â”€â”€ Source badge â”€â”€
        const sourceBadge = tx.source === "blockscout"
            ? `<span style="font-size:9px;color:#3b82f6;opacity:0.6;">live</span>`
            : "";

        // â”€â”€ Tanda +/- â”€â”€
        const signPrefix = isSwap || isAddLP || isRemoveLP || isLpNftTx || isCollectFee
            ? ""
            : type === "RECEIVE" ? "+" : "-";

        // â”€â”€ Warna nilai â”€â”€
        const valueColor = isLpNftTx
            ? "#888"
            : isFailed
                ? "#888"
                : color;

        const el     = document.createElement("div");
        el.className = "asset-item";
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
        <div style="font-size:13px;font-weight:600;color:${valueColor};">
            ${signPrefix}${valueFormatted}
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
// CLICK HANDLER â€“ copy & ledger
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