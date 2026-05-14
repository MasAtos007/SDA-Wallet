// ============================================================
//  PATCH: Auto Modal Sync Fix v2
//  Terapkan patch ini SETELAH js-aggregator.js dan auto-modal.js dimuat
//
//  Fix yang dilakukan:
//  1. openAutoSpendModal â€” validasi freshRow dari _lastResults
//  2. openAutoSpendModal â€” suspend watcher saat modal buka
//  3. openAutoSpendModal â€” threshold stale Â±20% (lebih ketat dari Â±50%)
//  4. _closeAutoModal    â€” resume watcher saat modal tutup
//  5. _buildRow          â€” onclick Auto lookup live _lastResults
//  6. _startAuto         â€” re-validasi drift + invalidate _lastScanKey
//  7. post-swap rescan   â€” auto rescan 2 detik setelah swap selesai
// ============================================================

(function () {

    // â”€â”€ TUNGGU AGGREGATOR SIAP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function waitReady(fn, tries = 0) {
        if (
            window.AGGREGATOR &&
            typeof window.openAutoSpendModal === "function"
        ) {
            fn();
        } else if (tries < 40) {
            setTimeout(() => waitReady(fn, tries + 1), 150);
        } else {
            console.error("[PATCH] AGGREGATOR / openAutoSpendModal tidak siap");
        }
    }

    waitReady(() => {

        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // PATCH 1: _closeAutoModal â€” resume watcher
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const _origClose = window._closeAutoModal;

        window._closeAutoModal = function () {
            if (window.AGGREGATOR) {
                window.AGGREGATOR._suspendWatcher = false;
            }
            _origClose?.();
        };

        console.log("[PATCH] _closeAutoModal patched âœ“");


        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // PATCH 2 + 3: openAutoSpendModal
        //   - suspend watcher
        //   - validasi freshRow dari _lastResults
        //   - threshold stale Â±20%:
        //       mode=reverse + savingsPct > +20 = artefak post-swap
        //       mode=buy     + savingsPct < -20 = artefak post-swap
        //   - invalidate scan cache saat stale terdeteksi
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const _origOpen = window.openAutoSpendModal;

        window.openAutoSpendModal = async function (
            mode,
            payToken,
            receiveToken,
            maxAmount
        ) {
            // Suspend watcher supaya scan tidak override data modal
            if (window.AGGREGATOR) {
                window.AGGREGATOR._suspendWatcher = true;
            }

            // â”€â”€ Ambil data live dari _lastResults â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            const lastResults =
                window.AGGREGATOR?._lastResults ||
                window._lastResults ||
                [];

            const freshRow = lastResults.find(r =>
                String(r.payToken || "").toLowerCase() ===
                String(payToken  || "").toLowerCase()
            );

            // â”€â”€ Guard: tidak ada data fresh â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if (!freshRow) {
                console.warn("[PATCH] freshRow tidak ditemukan untuk:", payToken);

                const guard = document.createElement("div");
                guard.id = "aggAutoModal";
                guard.innerHTML = `
                    <div class="agg-auto-backdrop"
                        onclick="window._closeAutoModal();">
                    </div>
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

            // â”€â”€ Deteksi stale â€” threshold Â±20% â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            const freshSavingsPct = Number(
                freshRow.savingsPct ?? freshRow.marginPct ?? 0
            );
            const isModeReverse = mode === "reverse";
            const dataStale =
                (isModeReverse  && freshSavingsPct >  20) ||
                (!isModeReverse && freshSavingsPct < -20);

            if (dataStale) {
                console.warn("[PATCH] Data stale terdeteksi:", {
                    mode, freshSavingsPct
                });
                // Invalidate cache â†’ watcher trigger rescan otomatis
                if (window.AGGREGATOR) {
                    window.AGGREGATOR._lastScanKey = "stale_" + Date.now();
                }
                // Lanjut ke modal original â€” peringatan stale sudah ada di auto-modal.js
            }

            // â”€â”€ Override maxAmount dengan data fresh â”€â”€â”€â”€â”€â”€â”€â”€â”€
            const freshMaxAmount =
                Number(freshRow.sdaEquiv || 0) > 0
                    ? freshRow.sdaEquiv
                    : maxAmount;

            // â”€â”€ Koreksi mode berdasar savingsPct terbaru â”€â”€â”€â”€â”€
            let freshMode = mode;
            if (!dataStale) {
                if (freshSavingsPct > 0 && mode === "reverse") {
                    console.log("[PATCH] Mode dikoreksi: reverse â†’ buy");
                    freshMode = "buy";
                } else if (freshSavingsPct <= 0 && mode === "buy") {
                    console.log("[PATCH] Mode dikoreksi: buy â†’ reverse");
                    freshMode = "reverse";
                }
            }

            console.log("[PATCH] openAutoSpendModal data fresh:", {
                mode:           freshMode,
                payToken,
                receiveToken,
                savingsPct:     freshSavingsPct,
                sdaEquiv:       freshRow.sdaEquiv,
                maxSafeReceive: freshRow.maxSafeReceive,
                freshMaxAmount
            });

            return _origOpen.call(
                this,
                freshMode,
                payToken,
                receiveToken,
                freshMaxAmount
            );
        };

        console.log("[PATCH] openAutoSpendModal patched âœ“");


        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // PATCH 5: _buildRow â€” onclick Auto lookup live
        // Event delegation capture phase â€” intercept sebelum
        // inline onclick bawaan berjalan
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
                console.warn("[PATCH] Tidak bisa parse onclick:", onclickStr);
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

            // Mode dari savingsPct live â€” bukan dari render HTML lama
            const liveSavingsPct = Number(liveRow.savingsPct ?? 0);
            const liveMode = liveSavingsPct > 0 ? "buy" : "reverse";

            console.log("[PATCH] Auto btn klik â€” data live:", {
                payToken:    liveRow.payToken,
                savingsPct:  liveSavingsPct,
                mode:        liveMode,
                sdaEquiv:    liveRow.sdaEquiv,
                maxSafeRecv: liveRow.maxSafeReceive
            });

            window.openAutoSpendModal(
                liveMode,
                liveRow.payToken,
                rawReceiveToken,
                liveRow.sdaEquiv || liveRow.maxSafeReceive || 0
            );

        }, true); // capture phase

        console.log("[PATCH] Auto btn event delegation patched âœ“");


        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // PATCH 6: _startAuto
        //   - re-validasi drift margin sebelum eksekusi
        //   - invalidate _lastScanKey agar rescan berjalan
        //     segera setelah swap
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

                    const drift = Math.abs(
                        currentSavingsPct - (modal.__savingsPct || 0)
                    );

                    if (drift > 3) {
                        console.warn("[PATCH] Margin drift sebelum eksekusi:", {
                            atModalOpen: modal.__savingsPct,
                            current:     currentSavingsPct,
                            drift
                        });

                        typeof showToast === "function" &&
                            showToast(
                                `âš  Margin berubah ${drift.toFixed(1)}% â€” data diperbarui`,
                                "warning"
                            );

                        modal.__savingsPct = currentSavingsPct;
                    }

                    const currentSdaEquiv = Number(currentRow.sdaEquiv || 0);
                    if (
                        currentSdaEquiv > 0 &&
                        Math.abs(currentSdaEquiv - (modal.__sdaMax || 0)) > 0.1
                    ) {
                        modal.__sdaMax = currentSdaEquiv;
                    }
                }
            }

            // Invalidate cache sebelum swap â†’ paksa rescan setelah selesai
            if (window.AGGREGATOR) {
                window.AGGREGATOR._lastScanKey = "pre_swap_" + Date.now();
            }

            return _origStart?.call(this);
        };

        console.log("[PATCH] _startAuto patched âœ“");


        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // PATCH 7: Post-swap auto rescan
        // Wrap autoRouteBuy & autoRouteReverse
        // Setelah swap resolve/reject â†’ tunggu 2 detik â†’ rescan
        // Pool butuh waktu settle setelah transaksi masuk
        // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        function _triggerPostSwapRescan(source) {
            console.log(`[PATCH] Post-swap rescan dijadwalkan (${source}) dalam 2 detik...`);

            setTimeout(() => {
                if (!window.AGGREGATOR) return;

                // Invalidate cache
                window.AGGREGATOR._lastScanKey = "post_swap_" + Date.now();

                // Kalau panel terbuka langsung rescan,
                // kalau tidak cache sudah di-invalidate â†’ rescan saat panel dibuka
                if (window.AGGREGATOR._panelOpen) {
                    console.log("[PATCH] Panel terbuka â€” trigger rescan");
                    window.AGGREGATOR.triggerScan?.();
                } else {
                    console.log("[PATCH] Panel tertutup â€” rescan saat panel dibuka");
                }
            }, 2000);
        }

        function _wrapAutoRoute(methodName) {
            const orig = window.AGGREGATOR[methodName];
            if (typeof orig !== "function") {
                console.warn(`[PATCH] ${methodName} tidak ditemukan â€” skip wrap`);
                return;
            }

            window.AGGREGATOR[methodName] = async function (...args) {
                try {
                    const result = await orig.apply(this, args);
                    _triggerPostSwapRescan(methodName);
                    return result;
                } catch (e) {
                    // Tetap rescan meski swap gagal â€” pool mungkin berubah parsial
                    _triggerPostSwapRescan(methodName + "_failed");
                    throw e;
                }
            };

            console.log(`[PATCH] ${methodName} post-swap rescan patched âœ“`);
        }

        _wrapAutoRoute("autoRouteBuy");
        _wrapAutoRoute("autoRouteReverse");


        console.log("[PATCH v2] âœ… Semua patch berhasil diterapkan");

    }); // end waitReady

})();