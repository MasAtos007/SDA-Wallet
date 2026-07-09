// =============================
// RIWAYAT.JS - TX HISTORY
// Blockscout API (no localStorage)
// =============================

const BLOCKSCOUT_API =
"https://ledger.sidrachain.com/api/v2";

// =============================
// IN-MEMORY TX HISTORY CACHE
// (Tidak lagi disimpan ke localStorage.
//  Riwayat selalu diambil fresh dari API
//  setiap kali modal dibuka / wallet aktif berubah.
//  Ini juga menghilangkan bug arah swap kebalik
//  yang terjadi karena data lama di localStorage
//  "memenangkan" data baru dari API saat merge.)
// =============================
let _txHistoryCache = [];

function _getReadHashesKey(address) {
    return "txReadHashes_" + (address || "").toLowerCase();
}

function _loadReadHashes(address) {
    try {
        const raw = localStorage.getItem(_getReadHashesKey(address));
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
}

function _saveReadHashes(address, hashSet) {
    try {
        // Batasi maksimal 200 hash — buang yang paling lama (awal array)
        let arr = [...hashSet];
        if (arr.length > 200) arr = arr.slice(arr.length - 200);
        localStorage.setItem(_getReadHashesKey(address), JSON.stringify(arr));
    } catch {}
}

// =============================
// CACHE PERMANEN: nilai SDA per tx hash
// Tx yang sudah confirmed TIDAK PERNAH berubah nilainya,
// jadi aman disimpan selamanya — ini yang paling hemat fetch,
// terutama saat modal riwayat dibuka berkali-kali.
// =============================
const SDA_AMOUNT_CACHE_KEY = "sdaAmountCache_v1";

function _loadSdaAmountCache() {
    try {
        const raw = localStorage.getItem(SDA_AMOUNT_CACHE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function _saveSdaAmountCache(cacheObj) {
    try {
        const keys = Object.keys(cacheObj);
        if (keys.length > 500) {
            const trimmed = {};
            keys.slice(keys.length - 500).forEach(k => { trimmed[k] = cacheObj[k]; });
            localStorage.setItem(SDA_AMOUNT_CACHE_KEY, JSON.stringify(trimmed));
        } else {
            localStorage.setItem(SDA_AMOUNT_CACHE_KEY, JSON.stringify(cacheObj));
        }
    } catch {}
}

let _sdaAmountCache = _loadSdaAmountCache();



// =============================
// NORMALIZE TIMESTAMP
// =============================
function normalizeTimestamp(ts) {
    if (!ts) return 0;
    return ts > 1e12 ? Math.floor(ts / 1000) : ts;
}

// =============================
// FETCH TX FROM BLOCKSCOUT API (with pagination)
// =============================
async function fetchTxFromBlockscout(address, maxPages = 1) {
    if (!address) return [];
    try {
        let items = [];
        let url = `${BLOCKSCOUT_API}/addresses/${address}/transactions`;
        let page = 0;

        while (url && page < maxPages) {
            const res = await fetch(url, {
                signal: AbortSignal.timeout(10000),
                headers: { "Accept": "application/json" }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            items = items.concat(data.items || []);
            page++;

            if (data.next_page_params) {
                const params = new URLSearchParams(data.next_page_params).toString();
                url = `${BLOCKSCOUT_API}/addresses/${address}/transactions?${params}`;
            } else {
                url = null;
            }
        }

        console.log("[Blockscout] native tx total:", items.length, "pages:", page);
        return items;
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
// FETCH TOKEN TRANSFERS (with pagination)
// =============================
async function fetchTokenTransfersFromBlockscout(address, maxPages = 1) {
    if (!address) return [];
    try {
        let items = [];
        let url = `${BLOCKSCOUT_API}/addresses/${address}/token-transfers`;
        let page = 0;

        while (url && page < maxPages) {
            const res = await fetch(url, {
                signal: AbortSignal.timeout(10000),
                headers: { "Accept": "application/json" }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            items = items.concat(data.items || []);
            page++;

            if (data.next_page_params) {
                const params = new URLSearchParams(data.next_page_params).toString();
                url = `${BLOCKSCOUT_API}/addresses/${address}/token-transfers?${params}`;
            } else {
                url = null;
            }
        }

        console.log("[Blockscout] token transfer total:", items.length, "pages:", page);
        return items;
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
//   swapMap    - hash swap
//   collectMap - hash collect fee LP
// =============================
function buildSwapInfoMap(nativeItems, myAddress) {
    const ROUTER   = (window.CONFIG?.ROUTER   || "").toLowerCase();
    const POS_MGR  = "0x8b9bcc8c722778f30146e20e44e8d8e28add8df8"; // Uniswap V3 Positions NFT
    const swapMap    = new Map();
    const collectMap = new Map();

    // -- Selector hex untuk method "collect" di Uniswap V3 Position Manager --
    const COLLECT_SELECTORS = new Set(["collect", "0xfc6f7865"]);

    (nativeItems || []).forEach(tx => {
        const to     = (tx.to?.hash   || "").toLowerCase();
        const from   = (tx.from?.hash || "").toLowerCase();
        const method = (tx.method     || "").toLowerCase();
        const hash   = (tx.hash       || "").toLowerCase();

        // -- Deteksi COLLECT FEE LP --
        // Method "collect" (atau hex selector-nya) ke contract Position Manager
        const isCollect =
            COLLECT_SELECTORS.has(method) &&
            (to === POS_MGR || from === POS_MGR);

        if (isCollect) {
            collectMap.set(hash, { method: "collect" });
            return; // jangan masuk swapMap
        }

        // -- Deteksi SWAP --
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

        // -- COLLECT FEE LP --
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



        // -- Filter: abaikan transaksi yang semua item-nya adalah LP NFT --
        const allNft      = items.every(i => isLpNft(i.token));
        const hasNft      = items.some(i => isLpNft(i.token));
        const nonNftItems = items.filter(i => !isLpNft(i.token));

// — LP NFT mint (add liquidity) ATAU burn (remove liquidity) —
        if (hasNft && nonNftItems.length >= 1) {
            const nftItem    = items.find(i => isLpNft(i.token));
            const nftToUser  = (nftItem?.to?.hash   || "").toLowerCase() === myAddr;
            const nftFromUser= (nftItem?.from?.hash || "").toLowerCase() === myAddr;

            // ===== ADD LIQUIDITY (mint): NFT MASUK ke user, token KELUAR dari user =====
            if (nftToUser) {
                const sent = nonNftItems.filter(
                    i => (i.from?.hash || "").toLowerCase() === myAddr
                );

                if (sent.length >= 1) {
                    const base = sent[0];
                    const t0 = parseTokenTransferItem(sent[0]);
                    let t1 = parseTokenTransferItem(sent[1] || null);

                    // Token kedua mungkin SDA native (bukan WSDA token-transfer)
                    if (!t1 && nativeInfo?.valueSDA > 0) {
                        t1 = { symbol: "SDA", logo: "img/sda.png", value: nativeInfo.valueSDAStr, valueNum: nativeInfo.valueSDA };
                    }

                    result.push({
                        hash,
                        from:        (base.from?.hash || "").toLowerCase(),
                        to:          (base.to?.hash   || "").toLowerCase(),
                        type:        "ADD_LP",
                        inSymbol:    t0?.symbol || "?",
                        inLogo:      resolveTokenLogo(t0?.symbol, t0?.logo),
                        outSymbol:   t1?.symbol || "",
                        outLogo:     t1 ? resolveTokenLogo(t1.symbol, t1.logo) : "",
                        amount0:     t0?.value || "0",
                        amount1:     t1?.value || "0",
                        value:       t0?.value || "0",
                        symbol:      t0?.symbol || "LP",
                        logo:        resolveTokenLogo(t0?.symbol, t0?.logo),
                        tokenId:     String(nftItem?.total?.token_id || nftItem?.token_id || "?"),
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

            // ===== REMOVE LIQUIDITY (burn): NFT KELUAR dari user, token MASUK ke user =====
            if (nftFromUser) {
                const base = nonNftItems[0];

                const received = nonNftItems.filter(
                    i => (i.to?.hash || "").toLowerCase() === myAddr
                );

                if (received.length >= 1) {
                    const t0 = parseTokenTransferItem(received[0]);
                    let t1 = parseTokenTransferItem(received[1] || null);

                    if (!t1) {
                        const BURN_ADDR = "0x0000000000000000000000000000000000000000";
                        const wsdaBurnItem = nonNftItems.find(
                            i => (i.token?.symbol || "").toUpperCase() === "WSDA" &&
                                 (i.to?.hash || "").toLowerCase() === BURN_ADDR
                        );
                        const wsdaParsed = parseTokenTransferItem(wsdaBurnItem);

                        if (wsdaParsed?.valueNum > 0) {
                            t1 = { symbol: "SDA", logo: "img/sda.png", value: wsdaParsed.value, valueNum: wsdaParsed.valueNum };
                        } else if (nativeInfo?.valueSDA > 0) {
                            t1 = { symbol: "SDA", logo: "img/sda.png", value: nativeInfo.valueSDAStr, valueNum: nativeInfo.valueSDA };
                        }
                    }

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
        }

        // -- Pure NFT transfer -> LP_NFT --
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

        // -- Pakai nonNftItems untuk logika swap/send biasa --
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

            // -- Deteksi semua WSDA di tx ini --
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

            // -- TOKEN->SDA: ada outItem (token keluar dari user), tidak ada inItem ERC-20,
            //    dan ada WSDA di tx (burn atau ke user) - SDA native dikirim ke wallet
            const isSDAOutViaBurn =
                !inItem &&
                outItem;

            // -- SDA->TOKEN: ada inItem (token ERC-20 masuk ke user), tidak ada outItem ERC-20,
            //    bukan WSDA, dan tx ini adalah swap
            const isSDAIn =
                inItem &&
                !outItem &&
                !inIsWsda &&
                (
                    (nativeInfo && nativeInfo.valueSDA > 0) ||
                    swapInfoMap.has(hash)
                );

            // -- TOKEN->SDA fallback (tanpa WSDA di token-transfers) --
            const isSDAOut =
                !inItem &&
                outItem &&
                !inIsWsda &&
                !isSDAOutViaBurn;

            // -- Tentukan outSymbol (yang dikirim user) --
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

            // -- Tentukan inSymbol (yang diterima user) --
            let inSymbol, inLogo, amountOut;

            if (isSDAOut || isSDAOutViaBurn || inIsWsda) {
                // TOKEN->SDA: user terima SDA native
                inSymbol = "SDA";
                inLogo   = "img/sda.png";

                // Prioritas nilai SDA yang diterima:
                // 1. WSDA burnt amount - paling akurat (ini persis SDA yang di-unwrap ke user)
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

            // -- Safeguard: kalau amountOut masih 0 tapi ada nativeInfo --
            if ((amountOut === "0" || !amountOut) && nativeInfo?.valueSDA > 0) {
                amountOut = nativeInfo.valueSDAStr;
            }

            // -- Safeguard logo --
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
// PROSES NATIVE SDA TX (SEND/RECEIVE SDA)
// =============================
function processNativeSdaTx(nativeItems, swapInfoMap, myAddress) {
    const myAddr = myAddress?.toLowerCase();
    const result = [];

    (nativeItems || []).forEach(tx => {
        const hash = (tx.hash || "").toLowerCase();
        if (!hash) return;

        // Lewati swap, collect fee, dll
        if (swapInfoMap.has(hash)) return;
        if (window._collectMap?.has(hash)) return;

        const from  = (tx.from?.hash || "").toLowerCase();
        const to    = (tx.to?.hash   || "").toLowerCase();

        // Harus ada nilai SDA (value > 0)
        let valueSDA = 0;
        try {
            valueSDA = Number(BigInt(tx.value || "0")) / 1e18;
        } catch(e) {}

        if (valueSDA <= 0) return;

        // Lewati transaksi ke/dari contract (swap, dll)
        // Hanya ambil jika from atau to adalah wallet user
        const isSend    = from === myAddr;
        const isReceive = to   === myAddr && from !== myAddr;
        if (!isSend && !isReceive) return;

        const type = isSend ? "SEND" : "RECEIVE";

        const formatted = valueSDA < 0.000001
            ? valueSDA.toExponential(2)
            : valueSDA.toFixed(6).replace(/\.?0+$/, "");

        result.push({
            hash,
            from,
            to,
            type,
            value:       formatted,
            symbol:      "SDA",
            logo:        "img/sda.png",
            blockNumber: "0x" + (tx.block_number || 0).toString(16),
            timestamp:   tx.timestamp
                ? Math.floor(new Date(tx.timestamp).getTime() / 1000)
                : 0,
            status: tx.status === "ok" ? "success" : (tx.status || "success"),
            source: "blockscout",
            read:   false
        });
    });

    return result;
}

// =============================
// DEDUPLIKASI HASIL API (per hash)
// Tanpa pernah mencampur dengan data lama/local -
// hanya merapikan kemungkinan hash ganda di dalam
// hasil fetch yang sama (mis. native tx & token
// transfer untuk tx multicall yang sama).
// =============================
function dedupeTxList(list) {
    const map = new Map();

    (list || []).forEach(tx => {
        if (!tx?.hash) return;
        const key = tx.hash.toLowerCase();

        if (!map.has(key)) {
            map.set(key, tx);
            return;
        }

        const existing = map.get(key);
        const priority = t => (
            t.type === "SWAP" ||
            t.type === "COLLECT_FEE" ||
            t.type === "REMOVE_LP" ||
            t.type === "LP_NFT"
        ) ? 1 : 0;

        if (priority(tx) > priority(existing)) map.set(key, tx);
    });

    return Array.from(map.values());
}

// =============================
// LOAD TX HISTORY (MAIN)
// Selalu fresh dari API. Tidak ada lagi
// load/merge dengan localStorage.
// =============================
let _lastTxFetch = {}; // address -> timestamp fetch terakhir
const TX_FETCH_MIN_INTERVAL = 15_000; // jangan fetch ulang riwayat < 15 detik

async function loadTxHistory(address, maxPages = 1) {
    // Render apa yang sudah ada di memori (sesi ini) sambil menunggu fetch terbaru
    renderTxHistory();

    if (!address) return;

    // Kalau baru saja fetch dan ini bukan "muat lebih" (maxPages tetap 1),
    // pakai cache yang sudah ada, jangan fetch Blockscout lagi.
    const now  = Date.now();
    const last = _lastTxFetch[address] || 0;
    if (maxPages === 1 && (now - last) < TX_FETCH_MIN_INTERVAL && _txHistoryCache.length > 0) {
        return;
    }
    _lastTxFetch[address] = now;

    showTxLoadingIndicator(true);

    try {
        const [nativeItems, tokenItems] = await Promise.all([
            fetchTxFromBlockscout(address, maxPages),
            fetchTokenTransfersFromBlockscout(address, maxPages)
        ]);

        const hasResult = nativeItems !== null || tokenItems !== null;

        if (hasResult) {
            const swapInfoMap = buildSwapInfoMap(nativeItems || [], address);

            // -- OPTIMASI 1: pakai cache permanen dulu, tanpa fetch sama sekali --
            swapInfoMap.forEach((info, h) => {
                if (info.valueSDA === 0 && _sdaAmountCache[h] > 0) {
                    info.valueSDA = _sdaAmountCache[h];
                    info.valueSDAStr = _sdaAmountCache[h].toFixed(6).replace(/\.?0+$/, "");
                    swapInfoMap.set(h, info);
                }
            });

            // -- OPTIMASI 2: batasi hanya kandidat yang kemungkinan tampil
            //    (final list cuma slice(0,20), jadi tidak perlu proses semua
            //    swap di halaman yang di-fetch, bisa 50+) --
            const DISPLAY_LIMIT_BUFFER = 25;
            const recentNativeHashes = new Set(
                [...(nativeItems || [])]
                    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
                    .slice(0, DISPLAY_LIMIT_BUFFER)
                    .map(tx => (tx.hash || "").toLowerCase())
            );

            // Untuk swap TOKEN->SDA yang masih 0 dan belum ada di cache, ambil nilai SDA dari internal tx
            const sdaSwapHashes = [...swapInfoMap.entries()]
                .filter(([h, v]) => v.valueSDA === 0 && recentNativeHashes.has(h) && !_sdaAmountCache[h])
                .map(([h]) => h);

            if (sdaSwapHashes.length) {
                await Promise.all(sdaSwapHashes.map(async h => {
                    const val = await fetchSdaAmountFromTx(h);
                    if (val > 0) {
                        const info = swapInfoMap.get(h);
                        info.valueSDA = val;
                        info.valueSDAStr = val.toFixed(6).replace(/\.?0+$/, "");
                        swapInfoMap.set(h, info);

                        _sdaAmountCache[h] = val;
                    }
                }));
                _saveSdaAmountCache(_sdaAmountCache);
            }

            const remote = processTokenTransfers(
                tokenItems || [],
                swapInfoMap,
                address
            );

            // Tambahkan transaksi native SDA (SEND/RECEIVE SDA murni)
            const nativeSdaTx = processNativeSdaTx(nativeItems || [], swapInfoMap, address);
            remote.push(...nativeSdaTx);

            // Status "read" persisten per wallet (localStorage), bukan cuma sesi ini
            const readHashes = _loadReadHashes(address);
            remote.forEach(tx => {
                const key = (tx.hash || "").toLowerCase();
                tx.read = readHashes.has(key);
            });

            const deduped = dedupeTxList(remote)
                .sort((a, b) =>
                    normalizeTimestamp(b.timestamp) - normalizeTimestamp(a.timestamp)
                )
                .slice(0, 20);

            saveTxHistory(deduped);
            renderTxHistory();
            updateBellBadge();

            // Tampilkan tombol "Muat lebih" kalau kemungkinan masih ada halaman berikutnya
            _renderLoadMoreBtn(address, maxPages);

        } else {
            console.warn("[riwayat] API gagal memuat transaksi");
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
                    ${t("tx_loading") || "Memuat transaksi terbaru..."}
                </div>`;
            list.prepend(indicator);
        }
    } else {
        indicator?.remove();
    }
}

// =============================
// SAVE TX HISTORY (IN-MEMORY ONLY)
// =============================
function saveTxHistory(list) {
    _txHistoryCache = (list || []).slice(0, 500);
}

// =============================
// TX DETAIL MODAL (PREMIUM)
// =============================
window._txdHash = "";

function showTxDetail(tx) {
    const block         = parseInt(tx.blockNumber || "0x0", 16) || 0;
    const confirmations = tx.latestBlock ? (tx.latestBlock - block) : 0;
    const isSwap        = tx.type === "SWAP";
    const isLpNftTx     = tx.type === "LP_NFT";
    const isRemoveLp    = tx.type === "REMOVE_LP";
    const isCollect     = tx.type === "COLLECT_FEE";
    const isFailed      = tx.status === "failed";

    window._txdHash = tx.hash || "";

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    // Icon & warna header
    const iconWrap = document.getElementById("txdIconWrap");
    if (iconWrap) {
        if (isFailed) {
            iconWrap.style.background = "linear-gradient(135deg,#ff4d4f,#ff7875)";
            iconWrap.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        } else if (isSwap || isRemoveLp || isCollect || tx.type === "ADD_LP") {
            // Sembunyikan iconWrap untuk swap, add LP & collect fee — pair row sudah tampil di atas
            iconWrap.style.display = (isSwap || tx.type === "ADD_LP" || isCollect) ? "none" : "block";

            if (!isSwap && tx.type !== "ADD_LP" && !isCollect) {
                const out = tx.outLogo ? normalizeLogo(tx.outLogo, "img/default.png") : resolveTokenLogo(tx.outSymbol, null);
                const inn = tx.inLogo  ? normalizeLogo(tx.inLogo,  "img/default.png") : resolveTokenLogo(tx.inSymbol,  null);
                const safeOut = out && out.trim() ? out : "img/default.png";
                const safeIn  = inn && inn.trim() ? inn : "img/default.png";

                iconWrap.style.background = "transparent";
                iconWrap.style.border = "none";
                iconWrap.innerHTML = `
                    <div style="position:relative;width:68px;height:50px;">
                        <img src="${safeOut}" onerror="this.onerror=null;this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;position:absolute;
                                    left:0;top:6px;background:#111;padding:4px;z-index:1;
                                    object-fit:contain;border:2px solid #0a1628;">
                        <img src="${safeIn}" onerror="this.onerror=null;this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;position:absolute;
                                    right:0;top:6px;background:#111;padding:4px;z-index:2;
                                    object-fit:contain;border:2px solid #0a1628;">
                    </div>`;
            }
        } else if (tx.type === "RECEIVE") {
            iconWrap.style.background = "linear-gradient(135deg,#00cc66,#00e87a)";
            iconWrap.style.border = "";
            iconWrap.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        } else {
            iconWrap.style.background = "linear-gradient(135deg,#ff7a00,#ffaa00)";
            iconWrap.style.border = "";
            iconWrap.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        }
    }

    // Label
    const labelMap = {
        SEND:        t("tx_label_send")    || "Transaksi Terkirim",
        RECEIVE:     t("tx_label_receive") || "Transaksi Diterima",
        SWAP:        t("tx_label_swap")    || "Swap Berhasil",
        ADD_LP:      t("tx_label_addlp")   || "Tambah Likuiditas",
        REMOVE_LP:   t("tx_label_removelp")|| "Hapus Likuiditas",
        COLLECT_FEE: t("tx_label_collect") || "Klaim Fee LP",
        LP_NFT:      t("tx_label_lpnft")   || "LP NFT"
    };
    set("txdLabel", isFailed ? (t("tx_label_failed") || "Transaksi Gagal") : (labelMap[tx.type] || tx.type));

    // Pair row untuk SWAP
    const pairRow  = document.getElementById("txdPairRow");
    const amountEl = document.getElementById("txdAmount");

    const isAddLpDisplay = tx.type === "ADD_LP";
    const isCollectDisplay = isCollect;

    if ((isSwap || isAddLpDisplay || isCollectDisplay) && pairRow) {
        pairRow.style.display = "flex";
        if (amountEl) amountEl.style.display = "none";

        const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        const setImg = (id, src) => { const e = document.getElementById(id); if (e) e.src = src || "img/default.png"; };

        // Ganti ikon panah jadi "+" khusus untuk ADD_LP
        const arrowIcon = pairRow.querySelector(".swm-pair-arrow i");
        if (arrowIcon) {
            if (isAddLpDisplay || isCollectDisplay) {
                arrowIcon.className = "fa-solid fa-plus";
            } else {
                arrowIcon.className = "fa-solid fa-arrow-right";
            }
        }

        if (isAddLpDisplay) {
            setEl("txdOutAmount", tx.amount0   || "?");
            setEl("txdOutSymbol", tx.inSymbol  || "?");
            setImg("txdOutIcon",  tx.inLogo    ? normalizeLogo(tx.inLogo, "img/default.png") : resolveTokenLogo(tx.inSymbol, null));

            setEl("txdInAmount",  tx.amount1   || "?");
            setEl("txdInSymbol",  tx.outSymbol || "?");
            setImg("txdInIcon",   tx.outLogo   ? normalizeLogo(tx.outLogo, "img/default.png") : resolveTokenLogo(tx.outSymbol, null));
        } else if (isCollectDisplay) {
            setEl("txdOutAmount", tx.amountOut || "?");
            setEl("txdOutSymbol", tx.inSymbol  || "?");
            setImg("txdOutIcon",  tx.inLogo    ? normalizeLogo(tx.inLogo, "img/default.png") : resolveTokenLogo(tx.inSymbol, null));

            setEl("txdInAmount",  tx.amount1   || "?");
            setEl("txdInSymbol",  tx.outSymbol || "?");
            setImg("txdInIcon",   tx.outLogo   ? normalizeLogo(tx.outLogo, "img/default.png") : resolveTokenLogo(tx.outSymbol, null));
        } else {
            setEl("txdOutAmount", tx.amountIn  || "?");
            setEl("txdOutSymbol", tx.outSymbol || "?");
            setImg("txdOutIcon",  tx.outLogo   ? normalizeLogo(tx.outLogo, "img/default.png") : resolveTokenLogo(tx.outSymbol, null));

            setEl("txdInAmount",  tx.amountOut || "?");
            setEl("txdInSymbol",  tx.inSymbol  || "?");
            setImg("txdInIcon",   tx.inLogo    ? normalizeLogo(tx.inLogo, "img/default.png") : resolveTokenLogo(tx.inSymbol, null));
        }

    } else {
        if (pairRow)  pairRow.style.display  = "none";
        if (amountEl) amountEl.style.display = "";

    if (amountEl) {
        if (isSwap) {
            amountEl.innerHTML = `${tx.amountIn || "?"} <span style="color:#667788;font-size:14px;">${tx.outSymbol || ""}</span> <i class="fa-solid fa-arrow-right" style="font-size:12px;color:#667788;"></i> ${tx.amountOut || "?"} <span style="color:#c77dff;">${tx.inSymbol || ""}</span>`;
        } else if (isLpNftTx) {
            amountEl.textContent = "LP NFT #" + (tx.tokenId || "?");
        } else if (isRemoveLp || isCollect) {
            const v0 = Number(tx.amountOut || 0);
            const v1 = Number(tx.amount1   || 0);
            const fmt = n => n < 0.000001 && n > 0
                ? n.toExponential(2)
                : n.toFixed(6).replace(/\.?0+$/, "");
            const sym1 = tx.outSymbol || "?";
            amountEl.innerHTML = `${fmt(v0)} <span style="color:#ffaa44;">${tx.inSymbol || "?"}</span> <span style="color:#667788;font-size:18px;"> + </span> ${fmt(v1)} <span style="color:#c77dff;">${sym1}</span>`;
        } else {
            amountEl.innerHTML = `${tx.value || "0"} <span id="txdSymbolSpan">${tx.symbol || "SDA"}</span>`;
        }
    }
    } // tutup else non-swap

    // From / To - sembunyikan untuk SWAP/LP karena from/to bukan alamat pihak ketiga
    const fromRow = document.getElementById("txdFromRow");
    const toRow   = document.getElementById("txdToRow");

    if (isSwap || tx.type === "ADD_LP" || isRemoveLp || isCollect) {
        if (fromRow) fromRow.style.display = "none";
        if (toRow)   toRow.style.display   = "none";
    } else {
        const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
        const fromIsZero = (tx.from || "").toLowerCase() === ZERO_ADDR;
        const toIsZero   = (tx.to   || "").toLowerCase() === ZERO_ADDR;

        if (fromIsZero) {
            if (fromRow) fromRow.style.display = "none";
        } else {
            if (fromRow) fromRow.style.display = "";
            set("txdFrom", tx.from ? tx.from.slice(0,10) + "..." + tx.from.slice(-8) : "-");
        }

        if (toIsZero) {
            if (toRow) toRow.style.display = "none";
        } else {
            if (toRow) toRow.style.display = "";
            set("txdTo", tx.to ? tx.to.slice(0,10) + "..." + tx.to.slice(-8) : "-");
        }
    }

    // Hash
    set("txdHash", tx.hash ? tx.hash.slice(0,14) + "..." + tx.hash.slice(-6) : "-");

    // Tipe
    set("txdType", tx.type || "-");

    // Block
    set("txdBlock", block ? "#" + block.toLocaleString() : "-");

    // Konfirmasi
    const confirmEl = document.getElementById("txdConfirm");
    if (confirmEl) confirmEl.innerHTML = confirmations > 0
        ? confirmations + " " + (t("tx_confirmations") || "konfirmasi")
        : (t("tx_confirmed") || "Dikonfirmasi") + " &#10003;";

    // Waktu
    set("txdTime", formatDate(normalizeTimestamp(tx.timestamp)));

    // Status
    const statusEl = document.getElementById("txdStatus");
    if (statusEl) {
        if (isFailed) {
            statusEl.innerHTML = `<span style="color:#ff4d4f;">&#10007; ${t("tx_failed") || "Gagal"}</span>`;
        } else {
            statusEl.innerHTML = `<span style="color:#00cc66;">&#10003; ${t("tx_success") || "Sukses"}</span>`;
        }
    }

    // Tampilkan modal
    const modal = document.getElementById("txDetailModal");
    if (modal) {
        modal.classList.add("show");
        document.body.style.overflow = "hidden";
    }
}

function closeTxDetail() {
    const modal = document.getElementById("txDetailModal");
    if (modal) modal.classList.remove("show");
    document.body.style.overflow = "";
    window._txdHash = "";
}

function txdCopyHash() {
    const hash = window._txdHash;
    if (!hash) return;
    const icon = document.getElementById("txdCopyIcon");
    const doCopy = () => {
        if (icon) { icon.className = "fa-solid fa-check"; icon.style.color = "#00c97b"; }
        setTimeout(() => {
            if (icon) { icon.className = "fa-regular fa-copy"; icon.style.color = "#667788"; }
        }, 2000);
        showToast?.("Hash tersalin", "success");
    };
    if (window.AndroidWallet?.copyToClipboard) {
        window.AndroidWallet.copyToClipboard(hash); doCopy();
    } else {
        navigator.clipboard?.writeText(hash).then(doCopy).catch(() => {});
    }
}

function txdOpenExplorer() {
    const hash = window._txdHash;
    if (!hash) return;
    openExplorer("https://ledger.sidrachain.com/tx/" + hash);
}

// =============================
// BELL BADGE -> DIPINDAH KE BOTTOM NAV "RIWAYAT"
// =============================
function updateBellBadge() {
    const list   = getTxHistory();
    const unread = list.filter(t => !t.read).length;

    const badge = getOrCreateHistoryNavBadge();
    if (!badge) return;

    if (unread > 0) {
        badge.style.display = "flex";
        badge.innerText     = unread > 99 ? "99+" : String(unread);
    } else {
        badge.style.display = "none";
    }
}

// =============================
// AMBIL (ATAU BUAT) BADGE DI ITEM "RIWAYAT" BOTTOM NAV
// Memakai class .nav-badge yang sudah ada di bottom-nav.css
// =============================
function getOrCreateHistoryNavBadge() {
    const navItem =
        document.getElementById("navHistory") ||
        document.querySelector('[data-nav="navHistory"]');

    if (!navItem) return null;

    let badge = navItem.querySelector(".nav-badge");
    if (!badge) {
        const iconWrap = navItem.querySelector(".nav-icon-wrap") || navItem;
        badge = document.createElement("span");
        badge.className = "nav-badge";
        badge.style.display = "none";
        iconWrap.appendChild(badge);
    }
    return badge;
}

function formatAddress(addr) {
    if (!addr) return "-";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// =============================
// TX HISTORY GETTER (IN-MEMORY)
// =============================
function getTxHistory() {
    return _txHistoryCache;
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
// TX HISTORY RENDER - REDESIGN
// =============================
window._txFilter = window._txFilter || "ALL";

function renderTxHistory() {
    const list = getEl("txHistoryList");
    if (!list) return;

    let history = getTxHistory();
    const wallet = getSelectedWallet?.();
    const myAddr = wallet?.address?.toLowerCase();

    if (window._txFilter !== "ALL") {
        history = history.filter(tx => tx.type === window._txFilter);
    }

    if (history.length === 0) {
        list.innerHTML = `
        <div style="text-align:center;color:#555;padding:40px 20px;">
            <i class="fa-solid fa-clock-rotate-left" style="font-size:32px;margin-bottom:12px;display:block;opacity:0.3;"></i>
            <div style="font-size:14px;color:#888;">${t("tx_empty") || "Belum ada transaksi"}</div>
            <div style="font-size:11px;margin-top:6px;color:#555;">${t("tx_empty_sub") || "Aktivitas kamu akan muncul di sini"}</div>
        </div>`;
        return;
    }

    list.innerHTML = "";
    list.style.paddingBottom = "80px";

    history.forEach(tx => {
        if (!tx) return;

        const isSwap       = tx.type === "SWAP";
        const isAddLP      = tx.type === "ADD_LP";
        const isRemoveLP   = tx.type === "REMOVE_LP";
        const isLpNftTx    = tx.type === "LP_NFT";
        const isCollectFee = tx.type === "COLLECT_FEE";
        const isFailed     = tx.status === "failed";

        // -- Type & color --
        let type  = tx.type || "SEND";
        let color = "#ff4d4f";
        let icon  = "up";

        if (isCollectFee)           { color = "#00d084"; icon = "down"; type = "Collect Fee"; }
        else if (isLpNftTx)         { color = "#888";    icon = "lp";   type = tx.subType === "RECEIVE" ? "LP Received" : "LP Sent"; }
        else if (isRemoveLP)        { color = "#f59e0b"; icon = "lp";   type = "Remove LP"; }
        else if (isAddLP)           { color = "#f59e0b"; icon = "lp";   type = "Add LP"; }
        else if (isSwap)            { color = "#3b82f6"; icon = "swap"; type = "Swap"; }
        else if (type === "RECEIVE") { color = "#00d084"; icon = "down"; type = "Receive"; }
        else if (type === "SEND")    { type = "Send"; }

        // -- Simbol --
        let symbolDisplay;
        if (isCollectFee)    symbolDisplay = tx.outSymbol ? `${tx.inSymbol||"?"} + ${tx.outSymbol}` : (tx.inSymbol||"FEE");
        else if (isLpNftTx)  symbolDisplay = `LP NFT #${tx.tokenId||"?"}`;
        else if (isRemoveLP) symbolDisplay = `${tx.inSymbol||"?"} + ${tx.outSymbol||"?"}`;
        else if (isSwap)     symbolDisplay = `${tx.outSymbol||"?"} > ${tx.inSymbol||"?"}`;
        else if (isAddLP)    symbolDisplay = `${tx.inSymbol||""} + ${tx.outSymbol||""}`;
        else                 symbolDisplay = tx.symbol || "SDA";

        // -- Nilai --
        const fmt = n => (!n || n === 0) ? "0" : (n < 0.000001 ? Number(n).toExponential(2) : Number(n).toFixed(6).replace(/\.?0+$/, ""));
        let valueFormatted;
        if (isCollectFee)    valueFormatted = tx.outSymbol ? `${fmt(tx.amountOut)} + ${fmt(tx.amount1)}` : fmt(tx.amountOut);
        else if (isLpNftTx)  valueFormatted = `#${tx.tokenId||"?"}`;
        else if (isRemoveLP) valueFormatted = `${fmt(tx.amountOut)} + ${fmt(tx.amount1)}`;
        else if (isAddLP)    valueFormatted = `${fmt(tx.amount0)} + ${fmt(tx.amount1)}`;
        else if (isSwap)     valueFormatted = fmt(tx.amountOut || tx.value);
        else                 valueFormatted = fmt(tx.value);

        const signPrefix = (isSwap||isAddLP||isRemoveLP||isLpNftTx||isCollectFee) ? "" : type === "Receive" ? "+" : "-";
        const valueColor = isFailed ? "#555" : isLpNftTx ? "#888" : color;

        // -- Alamat pendek --
        const targetAddr = type === "Send" ? tx.to : tx.from;
        const shortAddr  = (isSwap||isAddLP||isRemoveLP||isCollectFee)
            ? "Liquidity Pool"
            : isLpNftTx
                ? (tx.subType === "RECEIVE" ? (tx.from?.slice(0,6)+"..."+tx.from?.slice(-4)) : (tx.to?.slice(0,6)+"..."+tx.to?.slice(-4)))
                : targetAddr ? targetAddr.slice(0,6)+"..."+targetAddr.slice(-4) : "-";

        // -- Icon badge --
        const iconHTML = {
            up:   '<i class="fa-solid fa-arrow-up"></i>',
            down: '<i class="fa-solid fa-arrow-down"></i>',
            swap: '<i class="fa-solid fa-right-left"></i>',
            lp:   '<i class="fa-solid fa-droplet"></i>'
        }[icon];

        // -- Logo --
        const logo        = resolveTokenLogo(tx.symbol, tx.logo);
        const safeOutLogo = (tx.outLogo ? normalizeLogo(tx.outLogo,"img/sda.png") : resolveTokenLogo(tx.outSymbol,null)) || "img/default.png";
        const safeInLogo  = (tx.inLogo  ? normalizeLogo(tx.inLogo,"img/default.png") : resolveTokenLogo(tx.inSymbol,null)) || "img/default.png";

        const logoHTML = isLpNftTx
            ? `<div style="width:38px;height:38px;border-radius:50%;background:#1a1a2e;display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-droplet" style="color:#888;font-size:16px;"></i></div>`
            : (isSwap||isAddLP||isRemoveLP||isCollectFee)
                ? `<div style="position:relative;width:42px;height:38px;flex-shrink:0;">
                    <img src="${safeOutLogo}" onerror="this.src='img/default.png'" style="width:26px;height:26px;border-radius:50%;position:absolute;left:0;top:6px;background:#111;padding:2px;z-index:1;object-fit:contain;border:1.5px solid #1a1a1a;">
                    <img src="${safeInLogo}"  onerror="this.src='img/default.png'" style="width:26px;height:26px;border-radius:50%;position:absolute;right:0;top:6px;background:#111;padding:2px;z-index:2;object-fit:contain;border:2px solid #0b0f17;">
                   </div>`
                : `<img src="${logo}" onerror="this.src='img/default.png'" style="width:38px;height:38px;border-radius:50%;background:#111;padding:4px;object-fit:contain;flex-shrink:0;">`;

        const sourceBadge = tx.source === "blockscout"
            ? `<span style="font-size:9px;color:#3b82f6;opacity:0.5;margin-left:3px;">live</span>`
            : "";

        const el = document.createElement("div");
        el.className = "asset-item";
        el.style.cssText = `opacity:${isFailed?"0.5":"1"};padding:12px;border-bottom:1px solid #1a1a1a;cursor:pointer;`;

        el.innerHTML = `
<div style="display:flex;align-items:center;gap:10px;">

    <div style="position:relative;flex-shrink:0;">
        ${logoHTML}
        <div style="position:absolute;bottom:-2px;right:-2px;width:16px;height:16px;font-size:8px;background:${color};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:5;border:1.5px solid #0b0f17;">
            ${iconHTML}
        </div>
    </div>

    <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:600;color:#fff;display:flex;align-items:center;gap:4px;">
            ${type}${isFailed ? `<span style="font-size:9px;background:#ff4d4f22;color:#ff4d4f;border-radius:4px;padding:1px 5px;">${t("tx_failed") || "Gagal"}</span>` : ""}
        </div>
        <div style="font-size:11px;color:#666;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${shortAddr}</div>
        <div style="font-size:10px;color:#444;margin-top:1px;">${formatDate(normalizeTimestamp(tx.timestamp))}${sourceBadge}</div>
    </div>

    <div style="flex-shrink:0;text-align:right;min-width:90px;">
        <div style="font-size:13px;font-weight:700;color:${valueColor};white-space:nowrap;">${signPrefix}${valueFormatted}</div>
        <div style="font-size:10px;color:#666;margin-top:1px;white-space:nowrap;">${symbolDisplay}</div>
        <div style="margin-top:5px;display:flex;gap:5px;justify-content:flex-end;">
            <button class="copy-btn" data-copy="${tx.hash||""}" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;font-size:11px;border-radius:6px;background:#1a1a1a;border:1px solid #2a2a2a;color:#666;">
                <i class="fa-regular fa-copy"></i>
            </button>
            <button class="open-tx" data-hash="${tx.hash||""}" style="width:26px;height:26px;padding:0;display:flex;align-items:center;justify-content:center;font-size:11px;border-radius:6px;background:#1a1a1a;border:1px solid #2a2a2a;color:#666;">
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

// =============================
// TOMBOL MUAT LEBIH
// =============================
function _renderLoadMoreBtn(address, currentPages) {
    const list = getEl("txHistoryList");
    if (!list) return;

    // Hapus tombol lama kalau ada
    list.querySelector(".tx-load-more")?.remove();

    const btn = document.createElement("div");
    btn.className = "tx-load-more";
    btn.style.cssText = "text-align:center;padding:12px;margin-bottom:20px;";
    btn.innerHTML = `
        <button style="padding:8px 20px;background:#1a1a1a;border:1px solid #333;
            border-radius:10px;color:#888;font-size:12px;cursor:pointer;">
            <i class="fa-solid fa-rotate-down"></i> ${t("tx_load_more") || "Muat lebih banyak"}
        </button>`;

    btn.querySelector("button").onclick = () => {
        btn.remove();
        loadTxHistory(address, currentPages + 3);
    };

    list.appendChild(btn);
}

let activeModal = null;

// =============================
// OPEN HISTORY MODAL
// =============================
function openTxHistory() {
    const wallet = getSelectedWallet?.();

    const list = getTxHistory();
    const readHashes = _loadReadHashes(wallet?.address);
    list.forEach(t => {
        t.read = true;
        if (t.hash) readHashes.add(t.hash.toLowerCase());
    });
    if (wallet?.address) _saveReadHashes(wallet.address, readHashes);
    updateBellBadge();

    const modal = getEl("txModal");
    if (!modal) return;

    modal.classList.add("show");
    setBottomNavActive?.("navHistory");
    modal.style.display = "flex";
    activeModal = modal;

    // Sembunyikan nav bar biar tidak menimpa modal
    document.querySelector(".bottom-nav")?.classList.add("modal-open");

    renderTxHistory();

    if (wallet?.address) {
        loadTxHistory(wallet.address);
    }
}

// =============================
// CLEAR TX HISTORY
// =============================
function clearTxHistory() {
    if (!confirm(t("tx_clear_confirm") || "Hapus semua riwayat transaksi?")) return;

    const wallet = getSelectedWallet?.();
    _txHistoryCache = [];
    if (wallet?.address) localStorage.removeItem(_getReadHashesKey(wallet.address));
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
    setBottomNavActive?.("navHome");
    modal.style.display = "none";
    activeModal = null;

    // Tampilkan lagi nav bar
    document.querySelector(".bottom-nav")?.classList.remove("modal-open");
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
// FILTER TAB HANDLER (filter dari cache, tanpa fetch ulang)
// =============================
document.addEventListener("click", e => {
    const tab = e.target.closest(".tx-filter-tab");
    if (!tab) return;

    document.querySelectorAll(".tx-filter-tab").forEach(t => {
        t.classList.remove("active");
        t.style.background = "#1a1a1a";
        t.style.borderColor = "#2a2a2a";
        t.style.color = "#888";
    });

    tab.classList.add("active");
    tab.style.background = "#ff7a00";
    tab.style.borderColor = "#ff7a00";
    tab.style.color = "#fff";

    window._txFilter = tab.dataset.filter || "ALL";
    renderTxHistory();
});

// =============================
// CLICK HANDLER - copy & ledger
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
        openExplorer("https://ledger.sidrachain.com/tx/" + hash);
    }
});