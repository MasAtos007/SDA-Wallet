// =====================================
// FACTORY ENGINE â€” Cache + Multicall
// Drastically reduces RPC calls
// ~140 calls/scan â†’ <20 calls/scan
// =====================================

const FEES = [500, 3000, 10000];

function _WSDA()    { return window.CONFIG?.WSDA; }
function _FACTORY() { return window.CONFIG?.FACTORY; }

const FACTORY_ABI = [
    "function getPool(address,address,uint24) view returns (address)"
];
const POOL_ABI = [
    "function slot0() view returns (uint160 sqrtPriceX96,int24,uint16,uint16,uint16,uint8,bool)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function liquidity() view returns (uint128)"
];
const MULTICALL_ABI = [
    "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])"
];

// =====================================
// CACHE LAYERS
// =====================================
const _poolAddrCache = new Map();  // "tA_tB_fee" â†’ poolAddr | null
const _poolDataCache = new Map();  // poolAddr    â†’ { token0, token1, slot0, liquidity, ts }
const _priceCache    = new Map();  // "tIn_tOut"  â†’ { price, ts }
const _liqCache      = new Map();  // "tIn_tOut"  â†’ { data, ts }

const POOL_ADDR_TTL  = 0;          // pool address tidak pernah berubah â†’ cache selamanya
const POOL_DATA_TTL  = 8_000;      // slot0 + liquidity: 8 detik
const PRICE_TTL      = 8_000;
const LIQ_TTL        = 12_000;

// =====================================
// HELPERS
// =====================================
function isNative(t) { return !t || t === "native"; }
function normalize(t) { return isNative(t) ? _WSDA() : t; }

function sqrtToPrice(sqrt) {
    try {
        const s     = BigInt(sqrt.toString());
        const ratio = Number((s * s * 10n ** 18n) / 2n ** 192n) / 1e18;
        return isFinite(ratio) && ratio > 0 ? ratio : 0;
    } catch { return 0; }
}

// =====================================
// MULTICALL HELPER
// Jalankan banyak call dalam 1 RPC request
// =====================================
async function _multicall(calls) {
    const addr = window.CONFIG?.MULTICALL;
    if (!addr) {
        // Tidak ada multicall â€” fallback ke Promise.all biasa
        return null;
    }
    try {
        const mc  = new ethers.Contract(addr, MULTICALL_ABI, provider);
        const res = await mc.aggregate3(calls);
        return res;
    } catch (e) {
        console.warn("[FACTORY] Multicall fail:", e.message);
        return null;
    }
}

// =====================================
// GET POOL ADDRESS (dengan cache)
// =====================================
async function _getPoolAddr(tokenA, tokenB, fee) {
    const key = `${tokenA}_${tokenB}_${fee}`.toLowerCase();
    if (_poolAddrCache.has(key)) return _poolAddrCache.get(key);

    try {
        const factory = new ethers.Contract(_FACTORY(), FACTORY_ABI, provider);
        const pool    = await factory.getPool(tokenA, tokenB, fee);
        const result  = (!pool || pool === ethers.constants.AddressZero) ? null : pool;
        _poolAddrCache.set(key, result);
        return result;
    } catch { return null; }
}

// =====================================
// GET ALL 3 POOL ADDRESSES â€” 1 multicall
// =====================================
async function _getPoolAddrsMulticall(tokenA, tokenB) {
    // Cek cache dulu â€” kalau semua sudah ada, skip RPC
    const keys    = FEES.map(f => `${tokenA}_${tokenB}_${f}`.toLowerCase());
    const allHit  = keys.every(k => _poolAddrCache.has(k));
    if (allHit) {
        return FEES.map((f, i) => ({
            fee:      f,
            poolAddr: _poolAddrCache.get(keys[i])
        })).filter(x => x.poolAddr);
    }

    const iFactory = new ethers.utils.Interface(FACTORY_ABI);

    // Hanya fetch yang belum di-cache
    const toFetch = FEES.filter((f, i) => !_poolAddrCache.has(keys[i]));

    const calls = toFetch.map(fee => ({
        target:      _FACTORY(),
        allowFailure: true,
        callData:    iFactory.encodeFunctionData("getPool", [tokenA, tokenB, fee])
    }));

    const results = await _multicall(calls);

    if (results) {
        toFetch.forEach((fee, i) => {
            const key = `${tokenA}_${tokenB}_${fee}`.toLowerCase();
            try {
                if (!results[i].success) { _poolAddrCache.set(key, null); return; }
                const [addr] = iFactory.decodeFunctionResult("getPool", results[i].returnData);
                const pool   = (!addr || addr === ethers.constants.AddressZero) ? null : addr;
                _poolAddrCache.set(key, pool);
            } catch { _poolAddrCache.set(key, null); }
        });
    } else {
        // Fallback: fetch satu per satu
        for (const fee of toFetch) {
            await _getPoolAddr(tokenA, tokenB, fee);
        }
    }

    return FEES.map((f, i) => ({
        fee:      f,
        poolAddr: _poolAddrCache.get(keys[i])
    })).filter(x => x.poolAddr);
}

// =====================================
// GET BEST POOL â€” multicall untuk semua pool sekaligus
// =====================================
async function getBestPool(tokenA, tokenB) {
    const A = normalize(tokenA);
    const B = normalize(tokenB);

    // Step 1: Semua pool address dalam 1 multicall (atau cache)
    const validPools = await _getPoolAddrsMulticall(A, B);
    if (!validPools.length) return null;

    const iPool = new ethers.utils.Interface(POOL_ABI);
    const now   = Date.now();

    // Pisahkan: mana yang sudah di-cache, mana yang perlu fetch
    const needFetch = validPools.filter(p => {
        const c = _poolDataCache.get(p.poolAddr);
        return !c || now - c.ts > POOL_DATA_TTL;
    });

    // Step 2: Fetch token0/token1/slot0/liquidity semua pool yang stale â€” 1 multicall
    if (needFetch.length) {
        const calls = needFetch.flatMap(({ poolAddr }) => [
            { target: poolAddr, allowFailure: true, callData: iPool.encodeFunctionData("token0") },
            { target: poolAddr, allowFailure: true, callData: iPool.encodeFunctionData("token1") },
            { target: poolAddr, allowFailure: true, callData: iPool.encodeFunctionData("slot0") },
            { target: poolAddr, allowFailure: true, callData: iPool.encodeFunctionData("liquidity") }
        ]);

        const results = await _multicall(calls);

        if (results) {
            needFetch.forEach(({ poolAddr }, pi) => {
                try {
                    const base      = pi * 4;
                    const [token0]  = iPool.decodeFunctionResult("token0",    results[base].returnData);
                    const [token1]  = iPool.decodeFunctionResult("token1",    results[base + 1].returnData);
                    const slot0     = iPool.decodeFunctionResult("slot0",     results[base + 2].returnData);
                    const [liq]     = iPool.decodeFunctionResult("liquidity", results[base + 3].returnData);
                    _poolDataCache.set(poolAddr, { token0, token1, slot0: { sqrtPriceX96: slot0[0] }, liquidity: liq, ts: now });
                } catch {}
            });
        } else {
            // Fallback: fetch satu per satu
            for (const { poolAddr } of needFetch) {
                try {
                    const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);
                    const [token0, token1, slot0, liquidity] = await Promise.all([
                        pool.token0(), pool.token1(), pool.slot0(), pool.liquidity()
                    ]);
                    _poolDataCache.set(poolAddr, { token0, token1, slot0, liquidity, ts: now });
                } catch {}
            }
        }
    }

    // Step 3: Pilih pool dengan liquidity tertinggi dari cache
    let best = null;
    for (const { fee, poolAddr } of validPools) {
        const data = _poolDataCache.get(poolAddr);
        if (!data) continue;
        try {
            if (!data.liquidity || data.liquidity.eq(0)) continue;
            const liq = Number(data.liquidity.toString());
            if (!best || liq > best.liquidity) {
                best = { fee, poolAddr, token0: data.token0, token1: data.token1, slot0: data.slot0, liquidity: liq };
            }
        } catch {}
    }
    return best;
}

// =====================================
// DIRECT PRICE
// =====================================
async function getDirectPrice(tokenIn, tokenOut) {
    const A    = normalize(tokenIn);
    const B    = normalize(tokenOut);
    const best = await getBestPool(A, B);
    if (!best) return 0;

    let price = sqrtToPrice(best.slot0.sqrtPriceX96);
    if (price <= 0) return 0;
    if (A.toLowerCase() === best.token1.toLowerCase()) price = 1 / price;
    return price * (1 - best.fee / 1_000_000);
}

// =====================================
// SMART PRICE â€” direct atau multihop via WSDA
// =====================================
async function getPrice(tokenIn, tokenOut) {
    if (isNative(tokenIn) && isNative(tokenOut)) return 1;

    const key    = `${String(tokenIn).toLowerCase()}_${String(tokenOut).toLowerCase()}`;
    const cached = _priceCache.get(key);
    if (cached && Date.now() - cached.ts < PRICE_TTL) return cached.price;

    let price = await getDirectPrice(tokenIn, tokenOut);

    if (!price) {
        // Multihop: coba via WSDA â€” kedua leg bisa paralel karena getBestPool sudah di-cache
        const wsda = _WSDA();
        if (wsda) {
            const [leg1, leg2] = await Promise.all([
                getDirectPrice(tokenIn, wsda),
                getDirectPrice(wsda, tokenOut)
            ]);
            if (leg1 > 0 && leg2 > 0) price = leg1 * leg2;
        }
    }

    if (price > 0) _priceCache.set(key, { price, ts: Date.now() });
    return price;
}

// =====================================
// AMOUNT OUT
// =====================================
async function getAmountOut(tokenIn, tokenOut, amountIn) {
    const price = await getPrice(tokenIn, tokenOut);
    if (!price || price <= 0) return 0;
    const out = Number(amountIn) * price;
    return isFinite(out) && out > 0 ? out : 0;
}

// =====================================
// GET POOL LIQUIDITY
// =====================================
async function getPoolLiquidity(tokenIn, tokenOut) {
    const key    = `liq_${String(tokenIn).toLowerCase()}_${String(tokenOut).toLowerCase()}`;
    const cached = _liqCache.get(key);
    if (cached && Date.now() - cached.ts < LIQ_TTL) return cached.data;

    try {
        const A    = normalize(tokenIn);
        const B    = normalize(tokenOut);
        const best = await getBestPool(A, B); // sudah pakai multicall + cache
        if (!best) return null;

        // slot0 + liquidity sudah di-cache oleh getBestPool â€” tidak perlu RPC lagi
        const data = _poolDataCache.get(best.poolAddr);
        if (!data) return null;

        const sqrtPrice = Number(data.slot0.sqrtPriceX96) / (2 ** 96);
        const L         = Number(data.liquidity.toString());
        if (!L || !sqrtPrice) return null;

        const reserve0      = L / sqrtPrice;
        const reserve1      = L * sqrtPrice;
        const isInput0      = A.toLowerCase() === best.token0.toLowerCase();
        const inputReserve  = isInput0 ? reserve0 : reserve1;
        const outputReserve = isInput0 ? reserve1 : reserve0;
        const MAX_IMPACT    = 0.10;

        const result = {
            poolAddr:     best.poolAddr,
            liquidity:    L,
            token0:       best.token0,
            token1:       best.token1,
            reserve0,
            reserve1,
            inputReserve,
            maxSwapIn:    inputReserve  * MAX_IMPACT,
            maxSwapOut:   outputReserve * MAX_IMPACT,
            fee:          best.fee
        };

        _liqCache.set(key, { data: result, ts: Date.now() });
        return result;

    } catch (e) {
        console.warn("[FACTORY] getPoolLiquidity error:", e);
        return null;
    }
}

// =====================================
// CACHE STATS (debug)
// =====================================
function _cacheStats() {
    console.table({
        poolAddr:  _poolAddrCache.size,
        poolData:  _poolDataCache.size,
        price:     _priceCache.size,
        liquidity: _liqCache.size
    });
}

// =====================================
// EXPORT
// =====================================
window.PRICE_ENGINE = {
    getPrice,
    getAmountOut,
    getPoolLiquidity,
    getBestPool,
    _cacheStats,
    _clearCache: () => {
        _poolAddrCache.clear();
        _poolDataCache.clear();
        _priceCache.clear();
        _liqCache.clear();
        console.log("[FACTORY] Cache cleared");
    }
};