// ============================================================
//  PATCH: Auto Modal Sync Fix v3
//  Terapkan patch ini SETELAH js-aggregator.js dan auto-modal.js dimuat
//
//  Fix v1+v2:
//  1. openAutoSpendModal â€” validasi freshRow dari _lastResults
//  2. openAutoSpendModal â€” suspend watcher saat modal buka
//  3. openAutoSpendModal â€” threshold stale Â±20%
//  4. _closeAutoModal    â€” resume watcher saat modal tutup
//  5. _buildRow          â€” onclick Auto lookup live _lastResults
//  6. _startAuto         â€” re-validasi drift + invalidate _lastScanKey
//  7. post-swap rescan   â€” auto rescan 2 detik setelah swap selesai
//
//  Fix v3 (baru):
//  8. _recordMargin      â€” hanya rekam dari scan terbaru (_lastResults),
//                          bukan dari modal open
//  9. _getMarginTrend    â€” filter data lebih dari MAX_TREND_AGE_MS (10 menit)
//                          agar tren tidak dipengaruhi data lama
// 10. _adjustSpendByTrend â€” currentMargin selalu dari _lastResults live,
//                           bukan dari modal.__savingsPct yang bisa stale
// ============================================================

(function () {

    // â”€â”€ CONFIG TREND â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Data margin lebih tua dari ini diabaikan saat hitung tren
    const MAX_TREND_AGE_MS = 10 * 60 * 1000; // 10 menit

    // â”€â”€ TUNGGU AGGREGATOR + FUNGSI SIAP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function waitReady(fn, tries = 0) {
        if (
            window.AGGREGATOR &&
            typeof window.openAutoSpendModal  === "function" &&
            typeof window._recordMargin       === "function" &&
            typeof window._getMarginTrend     === "function" &&
            typeof window._adjustSpendByTrend === "function"
        ) {
            fn();
        } else if (tries < 60) {
            setTimeout(() => waitReady(fn, tries + 1), 150);
        } else {
            console.error("[PATCH v3] Fungsi tidak siap setelah 9 detik");
        }
    }

    waitReady(() => {

        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PATCH 1: _closeAutoModal â€” resume watcher
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const _origClose = window._closeAutoModal;

        window._closeAutoModal = function () {
            if (window.AGGREGATOR) {
                window.AGGREGATOR._suspendWatcher = false;
            }
            _origClose?.();
        };

        console.log("[PATCH v3] _closeAutoModal patched âœ“");


        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PATCH 2+3: openAutoSpendModal
        //   - suspend watcher
        //   - validasi freshRow dari _lastResults
        //   - threshold stale Â±20%
        //   - koreksi mode otomatis
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const _origOpen = window.openAutoSpendModal;

        window.openAutoSpendModal = async function (
            mode,
            payToken,
            receiveToken,
            maxAmount
        ) {
            if (window.AGGREGATOR) {
                window.AGGREGATOR._suspendWatcher = true;
            }

            const lastResults =
                window.AGGREGATOR?._lastResults ||
                window._lastResults ||
                [];

            const freshRow = lastResults.find(r =>
                String(r.payToken || "").toLowerCase() ===
                String(payToken  || "").toLowerCase()
            );

            // Guard: tidak ada data fresh
            if (!freshRow) {
                console.warn("[PATCH v3] freshRow tidak ditemukan untuk:", payToken);

                const guard = document.createElement("div");
                guard.id = "aggAutoModal";
                guard.innerHTML = `
                    <div class="agg-auto-backdrop" onclick="window._closeAutoModal();"></div>
                    <div class="agg-auto-box" style="
                        display:flex;flex-direction:column;
                        align-items:center;justify-content:center;
                        gap:12px;padding:24px;text-align:center;">
                        <div style="font-size:32px;">âš ï¸</div>
                        <div style="font-size:14px;font-weight:700;color:#ffcc00;">
                            Data Scan Belum Tersedia
                        </div>
                        <div style="font-size:12px;color:#555;line-height:1.6;">
                            Belum ada data untuk token ini.<br>
                            Tunggu scan selesai lalu buka Auto lagi.
                        </div>
                        <button onclick="window._closeAutoModal();"
                            style="width:100%;height:44px;border:1px solid #333;
                            border-radius:14px;background:#1a1a1a;color:#fff;
                            font-size:13px;font-weight:600;cursor:pointer;">
                            âœ• Tutup & Scan Ulang
                        </button>
                    </div>
                `;
                document.body.appendChild(guard);
                if (typeof acquireWakeLock === "function") await acquireWakeLock();
                window.AGGREGATOR?.setAutoRunning?.(false);
                window.AGGREGATOR?.unlockAutoButtons?.();
                return;
            }

            const freshSavingsPct = Number(
                freshRow.savingsPct ?? freshRow.marginPct ?? 0
            );
            const isModeReverse = mode === "reverse";

            // Stale threshold Â±20%
            const dataStale =
                (isModeReverse  && freshSavingsPct >  20) ||
                (!isModeReverse && freshSavingsPct < -20);

            if (dataStale) {
                console.warn("[PATCH v3] Data stale terdeteksi:", { mode, freshSavingsPct });
                if (window.AGGREGATOR) {
                    window.AGGREGATOR._lastScanKey = "stale_" + Date.now();
                }
            }

            // Override maxAmount dengan sdaEquiv fresh
            const freshMaxAmount =
                Number(freshRow.sdaEquiv || 0) > 0
                    ? freshRow.sdaEquiv
                    : maxAmount;

            // Koreksi mode berdasar savingsPct terbaru
            let freshMode = mode;
            if (!dataStale) {
                if (freshSavingsPct > 0 && mode === "reverse") {
                    console.log("[PATCH v3] Mode dikoreksi: reverse â†’ buy");
                    freshMode = "buy";
                } else if (freshSavingsPct <= 0 && mode === "buy") {
                    console.log("[PATCH v3] Mode dikoreksi: buy â†’ reverse");
                    freshMode = "reverse";
                }
            }

            console.log("[PATCH v3] openAutoSpendModal data fresh:", {
                mode: freshMode, payToken, receiveToken,
                savingsPct: freshSavingsPct,
                sdaEquiv: freshRow.sdaEquiv,
                maxSafeReceive: freshRow.maxSafeReceive,
                freshMaxAmount
            });

            return _origOpen.call(this, freshMode, payToken, receiveToken, freshMaxAmount);
        };

        console.log("[PATCH v3] openAutoSpendModal patched âœ“");


        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PATCH 5: Auto btn â€” event delegation capture phase
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        document.addEventListener("click", function (e) {

            const btn = e.target.closest(".agg-auto-btn");
            if (!btn) return;

            e.stopImmediatePropagation();

            if (window.AGGREGATOR?.isAutoRunning?.()) return;

            const onclickStr = btn.getAttribute("onclick") || "";

            const match = onclickStr.match(
                /openAutoSpendModal\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/
            );

            if (!match) {
                console.warn("[PATCH v3] Tidak bisa parse onclick:", onclickStr);
                return;
            }

            const [, , rawPayToken, rawReceiveToken] = match;

            const lastResults =
                window.AGGREGATOR?._lastResults ||
                window._lastResults ||
                [];

            const liveRow = lastResults.find(r =>
                String(r.payToken || "").toLowerCase() ===
                String(rawPayToken || "").toLowerCase()
            );

            if (!liveRow) {
                typeof showToast === "function" &&
                    showToast("Data belum ready â€” tunggu scan selesai", "error");
                return;
            }

            window.AGGREGATOR.setAutoRunning(true);
            window.AGGREGATOR.lockAutoButton(btn);

            window._activeAutoRoute = {
                intermediateToken: liveRow.payToken,
                finalToken:        rawReceiveToken,
                sdaMax:            liveRow.sdaEquiv || liveRow.maxSafeReceive || 0
            };

            window.ACTIVE_ROUTE = {
                payToken:       liveRow.payToken,
                receiveToken:   rawReceiveToken,
                rate:           liveRow.unitsNeeded > 0
                    ? liveRow.unitsNeeded / (liveRow.sdaEquiv || 1)
                    : 0,
                sdaEquiv:       Number(liveRow.sdaEquiv       || 0),
                unitsNeeded:    Number(liveRow.unitsNeeded    || 0),
                maxSafeReceive: Number(liveRow.maxSafeReceive || 0)
            };

            const liveSavingsPct = Number(liveRow.savingsPct ?? 0);
            const liveMode = liveSavingsPct > 0 ? "buy" : "reverse";

            console.log("[PATCH v3] Auto btn klik â€” data live:", {
                payToken: liveRow.payToken, savingsPct: liveSavingsPct,
                mode: liveMode, sdaEquiv: liveRow.sdaEquiv,
                maxSafeRecv: liveRow.maxSafeReceive
            });

            window.openAutoSpendModal(
                liveMode,
                liveRow.payToken,
                rawReceiveToken,
                liveRow.sdaEquiv || liveRow.maxSafeReceive || 0
            );

        }, true);

        console.log("[PATCH v3] Auto btn event delegation patched âœ“");


        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PATCH 6: _startAuto â€” re-validasi drift + invalidate cache
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const _origStart = window._startAuto;

        window._startAuto = function () {
            const modal = document.getElementById("aggAutoModal");
            if (!modal) return;

            const payToken = modal.__route?.intermediateToken;

            if (payToken) {
                const lastResults = window.AGGREGATOR?._lastResults || [];

                const currentRow = lastResults.find(r =>
                    String(r.payToken || "").toLowerCase() ===
                    String(payToken   || "").toLowerCase()
                );

                if (currentRow) {
                    const currentSavingsPct = Number(
                        currentRow.savingsPct ?? currentRow.marginPct ?? 0
                    );
                    const drift = Math.abs(currentSavingsPct - (modal.__savingsPct || 0));

                    if (drift > 3) {
                        console.warn("[PATCH v3] Margin drift sebelum eksekusi:", {
                            atModalOpen: modal.__savingsPct,
                            current: currentSavingsPct, drift
                        });
                        typeof showToast === "function" &&
                            showToast(`âš  Margin berubah ${drift.toFixed(1)}% â€” data diperbarui`, "warning");
                        modal.__savingsPct = currentSavingsPct;
                    }

                    const currentSdaEquiv = Number(currentRow.sdaEquiv || 0);
                    if (currentSdaEquiv > 0 &&
                        Math.abs(currentSdaEquiv - (modal.__sdaMax || 0)) > 0.1) {
                        modal.__sdaMax = currentSdaEquiv;
                    }
                }
            }

            if (window.AGGREGATOR) {
                window.AGGREGATOR._lastScanKey = "pre_swap_" + Date.now();
            }

            return _origStart?.call(this);
        };

        console.log("[PATCH v3] _startAuto patched âœ“");


        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PATCH 7: Post-swap auto rescan
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        function _triggerPostSwapRescan(source) {
            console.log(`[PATCH v3] Post-swap rescan (${source}) dalam 2 detik...`);
            setTimeout(() => {
                if (!window.AGGREGATOR) return;
                window.AGGREGATOR._lastScanKey = "post_swap_" + Date.now();
                if (window.AGGREGATOR._panelOpen) {
                    window.AGGREGATOR.triggerScan?.();
                }
            }, 2000);
        }

        function _wrapAutoRoute(methodName) {
            const orig = window.AGGREGATOR[methodName];
            if (typeof orig !== "function") {
                console.warn(`[PATCH v3] ${methodName} tidak ditemukan â€” skip`);
                return;
            }
            window.AGGREGATOR[methodName] = async function (...args) {
                try {
                    const result = await orig.apply(this, args);
                    _triggerPostSwapRescan(methodName);
                    return result;
                } catch (e) {
                    _triggerPostSwapRescan(methodName + "_failed");
                    throw e;
                }
            };
            console.log(`[PATCH v3] ${methodName} post-swap rescan patched âœ“`);
        }

        _wrapAutoRoute("autoRouteBuy");
        _wrapAutoRoute("autoRouteReverse");


        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PATCH 8: _recordMargin
        //
        // Masalah asal: modal memanggil _recordMargin saat
        // modal dibuka â€” artinya margin yang tersimpan bisa
        // dari savingsPct stale (bukan scan terbaru).
        //
        // Fix: override _recordMargin agar validasi bahwa
        // nilai yang direkam memang berasal dari _lastResults
        // scan terbaru untuk pairKey tersebut.
        // Kalau tidak cocok dengan scan terbaru (selisih > 5%),
        // nilai scan terbaru yang dipakai â€” bukan nilai dari modal.
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const _origRecordMargin = window._recordMargin;

        window._recordMargin = function (pairKey, margin) {

            if (!pairKey || !isFinite(margin)) {
                return _origRecordMargin?.(pairKey, margin);
            }

            // Cari payToken dari pairKey (format: "addr_addr")
            const payTokenAddr = pairKey.split("_")[0];

            const lastResults =
                window.AGGREGATOR?._lastResults ||
                window._lastResults ||
                [];

            const scanRow = lastResults.find(r =>
                String(r.payToken || "").toLowerCase() ===
                String(payTokenAddr || "").toLowerCase()
            );

            let marginToRecord = margin;

            if (scanRow) {
                const scanMargin = Number(
                    scanRow.savingsPct ?? scanRow.marginPct ?? margin
                );
                const diff = Math.abs(scanMargin - margin);

                if (diff > 5) {
                    // Margin yang dikirim berbeda jauh dari scan terbaru
                    // Gunakan nilai dari scan â€” lebih dipercaya
                    console.warn(
                        `[PATCH v3] _recordMargin: margin=${margin.toFixed(2)}% ` +
                        `berbeda jauh dari scan=${scanMargin.toFixed(2)}% ` +
                        `(diff=${diff.toFixed(2)}%) â€” pakai nilai scan`
                    );
                    marginToRecord = scanMargin;
                }
            } else {
                // Tidak ada data scan untuk pair ini â€” jangan rekam
                // agar history tidak tercemar data yang tidak bisa diverifikasi
                console.warn(
                    `[PATCH v3] _recordMargin: tidak ada scanRow untuk ${pairKey} â€” skip`
                );
                return;
            }

            return _origRecordMargin?.(pairKey, marginToRecord);
        };

        console.log("[PATCH v3] _recordMargin patched âœ“");


        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PATCH 9: _getMarginTrend
        //
        // Masalah asal: tren dihitung dari semua data history
        // termasuk yang sudah lama (jam lalu, hari lalu).
        // Data lama dengan tren turun akan terus mengurangi
        // spend meski kondisi pasar sudah berbeda.
        //
        // Fix: filter data lebih tua dari MAX_TREND_AGE_MS
        // sebelum regresi linear dijalankan.
        // Kalau data yang tersisa < 3, return null (tidak cukup data).
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const _origGetMarginTrend = window._getMarginTrend;

        window._getMarginTrend = function (pairKey) {

            const hist = window._marginHistory?.[pairKey];
            if (!hist || hist.length < 3) return null;

            const now = Date.now();

            // Filter: hanya pakai data dalam MAX_TREND_AGE_MS terakhir
            const fresh = hist.filter(p =>
                (now - (p.ts || 0)) <= MAX_TREND_AGE_MS
            );

            if (fresh.length < 3) {
                console.log(
                    `[PATCH v3] _getMarginTrend: ${pairKey} â€” ` +
                    `hanya ${fresh.length} data fresh (dari ${hist.length} total) â€” ` +
                    `tidak cukup untuk tren`
                );
                return null; // tidak cukup data fresh â†’ jangan penalti spend
            }

            // Swap _marginHistory sementara agar fungsi asli pakai data fresh saja
            const _origHist = window._marginHistory[pairKey];
            window._marginHistory[pairKey] = fresh;

            const result = _origGetMarginTrend?.(pairKey);

            // Kembalikan history asli
            window._marginHistory[pairKey] = _origHist;

            if (result) {
                console.log(
                    `[PATCH v3] _getMarginTrend: ${pairKey} â€” ` +
                    `pakai ${fresh.length} data fresh, ` +
                    `slope=${result.slope?.toFixed(3)}, ` +
                    `predicted=${result.predicted?.toFixed(2)}%`
                );
            }

            return result;
        };

        console.log("[PATCH v3] _getMarginTrend patched âœ“");


        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // PATCH 10: _adjustSpendByTrend
        //
        // Masalah asal: currentMargin dikirim dari
        // modal.__savingsPct yang bisa sudah stale saat
        // chip diklik atau saat START ditekan.
        //
        // Fix: override _adjustSpendByTrend agar selalu
        // mengambil currentMargin langsung dari _lastResults
        // untuk pairKey yang diberikan.
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const _origAdjustSpend = window._adjustSpendByTrend;

        window._adjustSpendByTrend = function (
            pairKey,
            rawSpend,
            currentMargin,
            isReverse
        ) {
            // Cari margin terkini dari scan terbaru
            const payTokenAddr = pairKey?.split("_")?.[0];

            if (payTokenAddr) {
                const lastResults =
                    window.AGGREGATOR?._lastResults ||
                    window._lastResults ||
                    [];

                const scanRow = lastResults.find(r =>
                    String(r.payToken || "").toLowerCase() ===
                    String(payTokenAddr || "").toLowerCase()
                );

                if (scanRow) {
                    const liveMargin = Number(
                        scanRow.savingsPct ?? scanRow.marginPct ?? currentMargin
                    );

                    const diff = Math.abs(liveMargin - currentMargin);

                    if (diff > 2) {
                        console.log(
                            `[PATCH v3] _adjustSpendByTrend: ` +
                            `margin override ${currentMargin.toFixed(2)}% â†’ ` +
                            `${liveMargin.toFixed(2)}% (dari scan terbaru, diff=${diff.toFixed(2)}%)`
                        );
                        currentMargin = liveMargin;
                    }
                }
            }

            return _origAdjustSpend?.(pairKey, rawSpend, currentMargin, isReverse);
        };

        console.log("[PATCH v3] _adjustSpendByTrend patched âœ“");


        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // BONUS: Rekam margin dari scan terbaru otomatis
        //
        // Setiap kali _lastResults diperbarui (setelah scan),
        // rekam margin semua row ke history secara otomatis.
        // Ini menggantikan peran _recordMargin yang dipanggil
        // dari modal (yang bisa stale).
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        const _origTriggerScan = window.AGGREGATOR.triggerScan;

        if (typeof _origTriggerScan === "function") {
            window.AGGREGATOR.triggerScan = async function (...args) {
                const result = await _origTriggerScan.apply(this, args);

                // Setelah scan selesai, rekam margin fresh dari semua hasil
                const lastResults =
                    window.AGGREGATOR?._lastResults || [];

                lastResults.forEach(row => {
                    if (
                        !row || row.isSDA ||
                        !row.payToken ||
                        !row.pairKey && !row.savingsPct
                    ) return;

                    const margin = Number(row.savingsPct ?? row.marginPct ?? null);
                    if (!isFinite(margin)) return;

                    // Bangun pairKey dari payToken (pairKey mungkin tidak ada di row)
                    const receiveToken =
                        window.swapState?.receiveToken || "";

                    const pk = row.pairKey ||
                        `${String(row.payToken).toLowerCase()}_${String(receiveToken).toLowerCase()}`;

                    if (!pk || pk === "_") return;

                    // Rekam langsung ke history tanpa lewat _recordMargin yang sudah di-patch
                    // (agar tidak double-check yang tidak perlu)
                    window._origRecordMarginDirect?.(pk, margin);
                });

                return result;
            };

            // Simpan referensi _recordMargin asli sebelum patch untuk dipakai di atas
            window._origRecordMarginDirect = _origRecordMargin;

            console.log("[PATCH v3] triggerScan post-scan margin recorder patched âœ“");
        }


        console.log("[PATCH v3] âœ… Semua patch berhasil diterapkan (v3)");

    }); // end waitReady

})();