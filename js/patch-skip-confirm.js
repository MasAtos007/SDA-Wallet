// =====================================
// PATCH: HAPUS confirm() LAMA
// Tempel SETELAH aggregator engine dimuat
// =====================================

// â”€â”€ autoRouteBuy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const _origBuy = AGGREGATOR.autoRouteBuy.bind(AGGREGATOR);
AGGREGATOR.autoRouteBuy = async function(intermediateToken, finalToken, spendSda) {

    // inject flag supaya confirm() di dalam dilewati
    window._skipAutoConfirm = true;
    try {
        return await _origBuy(intermediateToken, finalToken, spendSda);
    } finally {
        window._skipAutoConfirm = false;
    }
};

// â”€â”€ autoRouteReverse â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const _origReverse = AGGREGATOR.autoRouteReverse.bind(AGGREGATOR);
AGGREGATOR.autoRouteReverse = async function(intermediateToken, finalToken, targetOutInput) {
    window._skipAutoConfirm = true;
    try {
        return await _origReverse(intermediateToken, finalToken, targetOutInput);
    } finally {
        window._skipAutoConfirm = false;
    }
};

// â”€â”€ override window.confirm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// kalau _skipAutoConfirm aktif, langsung return true
const _nativeConfirm = window.confirm.bind(window);
window.confirm = function(msg) {
    if (window._skipAutoConfirm) {
        console.log("[AUTO] confirm() dilewati (modal sudah konfirmasi):", msg);
        return true;
    }
    return _nativeConfirm(msg);
};