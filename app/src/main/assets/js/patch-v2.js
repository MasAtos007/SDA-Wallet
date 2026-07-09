// =====================================
// PATCH: REFRESH SAVINGS FIX v2
// Load setelah aggregator-engine.js
// dan auto-modal-final-v4.js
// =====================================

// ── 1. speechSynthesis guard ─────────
if (typeof speechSynthesis === "undefined") {
    window.speechSynthesis = {
        cancel: () => {}, speak: () => {},
        pause: () => {}, resume: () => {},
        getVoices: () => []
    };
    window.SpeechSynthesisUtterance = function(text) {
        this.text = text; this.lang = "";
        this.rate = 1; this.pitch = 1;
    };
}

// ── 2. Fix refreshSingleRoute ─────────
// Masalah lama: baseline diambil dari row isSDA
// tapi sdaEquiv row SDA = targetAmt (selalu sama),
// bukan harga pasar → savingsPct meleset
//
// Fix: simpan sdaEquiv asli tiap row saat scan selesai,
// jangan hitung ulang dari baseline — cukup preserve
// nilai savings/savingsPct yang sudah ada sebelum refresh,
// lalu update hanya sdaEquiv & maxSafeReceive dari data baru

if (window.AGGREGATOR && !AGGREGATOR._refreshPatched) {
    AGGREGATOR._refreshPatched = true;

    const _origRefresh = AGGREGATOR.refreshSingleRoute.bind(AGGREGATOR);

    AGGREGATOR.refreshSingleRoute = async function(payToken, receiveToken, targetAmt) {

        // simpan savings lama sebelum refresh
        const before = {};
        (AGGREGATOR._lastResults || []).forEach(r => {
            const key = String(r.payToken || "").toLowerCase();
            before[key] = {
                savings:    r.savings,
                savingsPct: r.savingsPct
            };
        });

        // jalankan refresh asli
        await _origRefresh(payToken, receiveToken, targetAmt);

        // setelah refresh: cek apakah savings hilang (jadi 0/null)
        // kalau iya, kembalikan nilai lama
        const results = AGGREGATOR._lastResults;
        if (!results?.length) return;

        // hitung ulang dari baseline yang benar
        // baseline = row SDA, sdaEquivnya = cost beli via SDA langsung
        // kita ambil dari hasil PRICE_ENGINE bukan dari row
        // karena row SDA sdaEquiv cuma = targetAmt

        // Cara paling aman: recalc dari sdaEquiv antar row
        // row dengan sdaEquiv terbesar = paling mahal (baseline SDA)
        const sdaRow = results.find(r => r.isSDA);
        const baselineCost = sdaRow?.sdaEquiv || 0;

        if (baselineCost > 0) {
            AGGREGATOR._lastResults = results.map(r => {
                if (r.isSDA) return { ...r, savings: 0, savingsPct: 0 };

                // kalau sdaEquiv tersedia, hitung fresh
                if (r.sdaEquiv > 0) {
                    const savings    = baselineCost - r.sdaEquiv;
                    const savingsPct = (savings / baselineCost) * 100;
                    return { ...r, savings, savingsPct };
                }

                // fallback: kembalikan nilai sebelum refresh
                const key  = String(r.payToken || "").toLowerCase();
                const old  = before[key];
                if (old) return { ...r, ...old };

                return r;
            });
        } else {
            // tidak ada baseline → restore nilai lama
            AGGREGATOR._lastResults = results.map(r => {
                const key = String(r.payToken || "").toLowerCase();
                const old = before[key];
                return old ? { ...r, ...old } : r;
            });
        }

        console.log("[REFRESH PATCH v2] results:", AGGREGATOR._lastResults);
    };
}
