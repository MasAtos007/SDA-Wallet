// =====================================
// SWAP LIQUIDITY CHECK
// Patch untuk swap-engine.js &
// aggregator-engine.js
//
// Tambahkan file ini setelah factory-engine.js
// di urutan load script HTML
// =====================================


// =====================================
// CEK LIKUIDITAS SEBELUM SWAP
// Dipanggil di openSwapConfirm sebelum
// user konfirmasi
// =====================================
async function checkSwapLiquidity(tokenIn, tokenOut, amountIn) {

    try {
        const liq = await PRICE_ENGINE.getPoolLiquidity(tokenIn, tokenOut);

        if (!liq) return { ok: false, warning: "Pool tidak ditemukan" };

        const amount = parseFloat(amountIn);

        // Hitung price impact estimasi
        // impact = amountIn / inputReserve
        const impact = liq.inputReserve > 0
            ? (amount / liq.inputReserve) * 100
            : 100;

        const maxSafe = liq.maxSwapIn;

        if (amount > maxSafe) {
            return {
                ok:         false,
                warning:    `Likuiditas tipis`,
                maxSwapIn:  maxSafe,
                impact:     impact,
                liq
            };
        }

        if (impact > 5) {
            return {
                ok:        true,  // masih boleh tapi kasih warning
                warning:   `Price impact tinggi (~${impact.toFixed(1)}%)`,
                maxSwapIn: maxSafe,
                impact,
                liq
            };
        }

        return { ok: true, impact, maxSwapIn: maxSafe, liq };

    } catch (e) {
        console.warn("checkSwapLiquidity error:", e);
        return { ok: true }; // jangan block kalau cek gagal
    }
}


// =====================================
// PATCH openSwapConfirm
// Override fungsi dari swap-engine agar
// cek likuiditas sebelum buka confirm modal
// =====================================
const _origOpenSwapConfirm = window.SWAP_ENGINE?.openSwapConfirm;

if (window.SWAP_ENGINE) {

    window.SWAP_ENGINE.openSwapConfirm = async function() {

        const tokenIn  = window.swapState?.payToken;
        const tokenOut = window.swapState?.receiveToken;
        const amountUI = document.getElementById("payAmount")?.value;

        if (amountUI && Number(amountUI) > 0 && tokenIn && tokenOut) {

            const check = await checkSwapLiquidity(tokenIn, tokenOut, amountUI);

            if (!check.ok) {
                // Tampilkan warning + tanya apakah lanjut
                const inSym  = _swapSymOf(tokenIn);
                const maxFmt = check.maxSwapIn
                    ? check.maxSwapIn.toFixed(4)
                    : "N/A";

                const msg = `${check.warning}\n\nMax swap aman: ~${maxFmt} ${inSym}\nKamu input: ${amountUI} ${inSym}\n\nLanjutkan tetap berisiko gagal?`;

                showConfirm?.(msg, () => {
                    _origOpenSwapConfirm?.call(window.SWAP_ENGINE);
                });
                return;
            }

            // Kalau impact tinggi tapi masih ok, tambah info ke swap rate
            if (check.impact > 3) {
                _updateRateWithWarning(
                    tokenIn, tokenOut,
                    check.impact,
                    check.maxSwapIn
                );
            }
        }

        _origOpenSwapConfirm?.call(window.SWAP_ENGINE);
    };
}

function _swapSymOf(addr) {
    if (!addr || addr === "native") return "SDA";
    return (window.TOKENS || []).find(t => t.address?.toLowerCase() === addr.toLowerCase())?.symbol || "TOKEN";
}

function _updateRateWithWarning(tokenIn, tokenOut, impact, maxSwapIn) {
    const rateEl = document.getElementById("swapRate");
    if (!rateEl) return;

    const inSym  = _swapSymOf(tokenIn);
    const maxFmt = maxSwapIn ? maxSwapIn.toFixed(4) : "N/A";
    const color  = impact > 10 ? "#ff4d4f" : "#ffb020";

    // Tambahkan warning row ke info box yang sudah ada
    const existing = rateEl.innerHTML;
    if (!existing.includes("price-impact")) {
        rateEl.innerHTML = existing + `
            <div class="swap-rate-row" style="color:${color};">
                <span>
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    Price impact
                </span>
                <span>~${impact.toFixed(1)}%</span>
            </div>
            <div class="swap-rate-row" style="color:#888;" id="price-impact">
                <span>Max swap aman</span>
                <span>~${maxFmt} ${inSym}</span>
            </div>`;
    }
}


// =====================================
// AGGREGATOR: tambahkan info likuiditas
// ke setiap kandidat hasil scan
// =====================================
async function enrichWithLiquidity(results, receiveToken) {

    if (!results?.length) return results;

    const enriched = await Promise.all(results.map(async (r) => {
        try {
            const liq = await PRICE_ENGINE.getPoolLiquidity(r.payToken, receiveToken);
            if (!liq) return { ...r, maxSwapIn: null, liquidityWarn: false };

            return {
                ...r,
                maxSwapIn:    liq.maxSwapIn,
                liquidityWarn: r.unitsNeeded > liq.maxSwapIn
            };
        } catch {
            return { ...r, maxSwapIn: null, liquidityWarn: false };
        }
    }));

    return enriched;
}

// Expose untuk aggregator
window.LIQUIDITY_CHECK = {
    checkSwapLiquidity,
    enrichWithLiquidity
};