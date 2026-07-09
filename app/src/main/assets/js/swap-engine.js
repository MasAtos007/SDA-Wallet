// ==========================
// SWAP ENGINE FINAL (SIDRA FIXED)
// FIX: getWallet() selalu ambil dari SESSION.signer
//      yang update saat switchSessionAccount()
// ==========================

window.SWAP_ENGINE = (function () {

    const ROUTER_ADDR = window.CONFIG?.ROUTER;
    const WSDA_ADDR   = window.CONFIG?.WSDA;

    const ROUTE_HUBS = [
        window.CONFIG?.WSDA,
        "0xb8d7fb85c4BF32f418715Dcb9eBF88107eE73CB7", // IFC
        "0xEEd87C64D1650A824F8589adcB76a13A692E2EA8"  // SGHC
    ];

    async function simulateRoute(tokenIn, tokenOut, amount) {
        let bestOut = 0, bestRoute = null;
        const routes = [
            [tokenIn, tokenOut],
            [tokenIn, ROUTE_HUBS[0], tokenOut],
            [tokenIn, ROUTE_HUBS[1], tokenOut],
            [tokenIn, ROUTE_HUBS[2], tokenOut]
        ];
        for (const route of routes) {
            let out = amount;
            for (let i = 0; i < route.length - 1; i++) {
                out = await PRICE_ENGINE.getAmountOut(route[i], route[i+1], out);
            }
            if (out > bestOut) { bestOut = out; bestRoute = route; }
        }
        return { route: bestRoute, output: bestOut };
    }

    let isLoading = false;

    // ==========================
    // ABI
    // ==========================
    const ROUTER_ABI = [
        "function multicall(bytes[] data) payable returns (bytes[] results)",
        "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",
        "function unwrapWETH9(uint256 amountMinimum, address recipient)"
    ];

    const ERC20_ABI = [
        "function approve(address spender,uint256 amount) returns (bool)",
        "function allowance(address owner,address spender) view returns (uint256)",
        "function decimals() view returns (uint8)"
    ];

    // ==========================
    // HELPERS
    // ==========================
    function isNative(token) {
        return !token || token === "native";
    }

    function toWSDA(token) {
        if (!token || token === "native") return WSDA_ADDR;
        return token;
    }

    // ==========================
    // GET WALLET — FIX UTAMA
    // Selalu ambil SESSION.signer (wallet aktif saat ini)
    // SESSION.signer diupdate oleh switchSessionAccount()
    // sehingga selalu sesuai wallet yang dipilih user
    // ==========================
    function getWallet() {
        // Prioritas 1: SESSION.signer dari wallet-session.js
        // Ini selalu wallet yang sedang aktif & unlocked
        if (typeof SESSION !== "undefined" && SESSION.unlocked && SESSION.signer) {
            return SESSION.signer;
        }

        // Prioritas 2: requireSigner() sebagai fallback + guard
        if (typeof requireSigner === "function") {
            try { return requireSigner(); } catch { /* akan throw di bawah */ }
        }

        return null;
    }

    // ==========================
    // ENCODER
    // ==========================
    function encodeSwap(router, params) {
        return router.interface.encodeFunctionData("exactInputSingle", [params]);
    }

    function encodeUnwrap(router, recipient) {
        return router.interface.encodeFunctionData("unwrapWETH9", [0, recipient]);
    }

    function log(msg) {
        console.log("[SWAP]", msg);
        const el = document.getElementById("swapRate");
        if (el) el.innerText = msg;
    }

    function setLoading(state) {
        const btn = document.getElementById("btnReviewSwap");
        if (!btn) return;
        btn.disabled = state;
        btn.innerHTML = state ? "Swapping..." : "Review Swap";
    }

    function showSwapLoading(text = "Preparing Swap...", percent = 20, tokenIn, tokenOut) {
        const overlay = document.getElementById("swapLoadingOverlay");
        const fill    = document.getElementById("swapProgressFill");
        const txt     = document.getElementById("swapLoadingText");

        if (overlay) overlay.style.display = "flex";
        if (fill)    fill.style.width = percent + "%";
        if (txt)     txt.innerText = text;

        const iconWrap = document.getElementById("swapLoadingTokens");
        if (!iconWrap) return;

        const _in  = tokenIn  || swapState?.payToken;
        const _out = tokenOut || swapState?.receiveToken;

        const inNative  = isNative(_in);
        const outNative = isNative(_out);
        const inData    = inNative  ? null : getTokenData(_in);
        const outData   = outNative ? null : getTokenData(_out);
        const inLogo    = resolveLogoPath(inData,  inNative);
        const outLogo   = resolveLogoPath(outData, outNative);
        const inSym     = inNative  ? "SDA" : (inData?.symbol  || "?");
        const outSym    = outNative ? "SDA" : (outData?.symbol || "?");

        iconWrap.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:10px;">
                <div style="text-align:center;">
                    <img src="${inLogo}" onerror="this.src='img/default.png'"
                         style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                    <div style="font-size:10px;color:#aaa;margin-top:3px;">${inSym}</div>
                </div>
                <div style="font-size:18px;animation:swapArrowPulse 1s infinite;">→</div>
                <div style="text-align:center;">
                    <img src="${outLogo}" onerror="this.src='img/default.png'"
                         style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                    <div style="font-size:10px;color:#aaa;margin-top:3px;">${outSym}</div>
                </div>
            </div>`;
    }

    function hideSwapLoading() {
        const overlay = document.getElementById("swapLoadingOverlay");
        if (overlay) overlay.style.display = "none";
    }

    // ==========================
    // OPEN SWAP CONFIRM
    // ==========================
    async function openSwapConfirm() {
        try {
            // Cek wallet sebelum preview
            const wallet = getWallet();
            if (!wallet) {
                showToast?.("Unlock wallet dulu", "error");
                showPINUnlockScreen?.();
                return;
            }

            const tokenIn  = swapState.payToken;
            const tokenOut = swapState.receiveToken;
            const amountUI = document.getElementById("payAmount")?.value;

            if (!tokenOut) {
                showToast?.("Pilih token tujuan dulu", "error");
                return;
            }

            if (!amountUI || Number(amountUI) <= 0) {
                showToast?.("Masukkan jumlah terlebih dahulu", "error");
                window.shakePayInput?.();
                return;
            }

            // GUARD — cek saldo & likuiditas sebelum lanjut ke confirm modal
            const reviewBtn = document.getElementById("btnReviewSwap");
            if (reviewBtn) reviewBtn.disabled = true; // cegah double-tap selama validasi

            const balanceOk = await window.validatePayAmount?.();
            if (balanceOk === false) {
                if (reviewBtn) reviewBtn.disabled = false;
                showToast?.("Saldo tidak cukup", "error");
                window.shakePayInput?.();
                return;
            }

            const estimated = await PRICE_ENGINE.getAmountOut(tokenIn, tokenOut, Number(amountUI));
            let realistic = getRealisticOut(Number(amountUI), estimated);

            if (!realistic || realistic <= 0) {
                if (reviewBtn) reviewBtn.disabled = false;
                showToast?.("Likuiditas tidak cukup untuk jumlah ini", "error");
                window.shakePayInput?.();
                return;
            }

            // ==========================
            // SIMULASI REAL (preview) — coba dapat angka SEBENARNYA sebelum
            // user lihat modal konfirmasi, bukan cuma estimasi curve.
            // Kalau gagal (mis. token belum pernah di-approve, allowance=0,
            // jadi transferFrom di dalam static call ikut revert), diam-diam
            // fallback ke angka curve seperti biasa — jangan blokir preview.
            // ==========================
            let simulatedParams = null; // dititipkan ke swapConfirmState buat dipakai ulang saat eksekusi

            try {
                const router     = new ethers.Contract(ROUTER_ADDR, ROUTER_ABI, wallet);
                const baseParams = await buildParams(wallet, tokenIn, tokenOut, amountUI);
                const simParams  = { ...baseParams, amountOutMinimum: 0 };
                const simValue   = isNative(tokenIn) ? simParams.amountIn : 0;
                const realOutBN  = await router.callStatic.exactInputSingle(simParams, { value: simValue });

                const outDecimals = await getDecimals(tokenOut);
                const realOutUI   = parseFloat(ethers.utils.formatUnits(realOutBN, outDecimals));

                if (realOutUI > 0) {
                    realistic = realOutUI; // pakai angka ASLI, bukan curve, buat ditampilkan & disimpan

                    // Siapkan params final (dengan amountOutMinimum dari hasil simulasi asli)
                    // supaya swapExactInput() bisa langsung pakai ini, tanpa callStatic lagi.
                    const slippageBps = Math.floor(getSlippage() * 100);
                    simulatedParams = {
                        ...baseParams,
                        amountOutMinimum: realOutBN.mul(10000 - slippageBps).div(10000)
                    };
                }
            } catch (simErr) {
                console.warn("[openSwapConfirm] simulasi preview gagal, pakai estimasi curve:", simErr.message || simErr);
            }

            // GUARD TAMBAHAN — cek kedalaman likuiditas pool sesungguhnya
            const depthOk = await window.validateLiquidityDepth?.();
            if (reviewBtn) reviewBtn.disabled = false;

            if (depthOk === false) {
                showToast?.("Jumlah melebihi kapasitas likuiditas pool", "error");
                window.shakePayInput?.();
                return;
            }

            const inData  = getTokenData(tokenIn);
            const outData = getTokenData(tokenOut);

            window.swapConfirmState = {
                tokenIn,
                tokenOut,
                amountUI,
                estimated: realistic,
                wallet: wallet.address,  // address wallet AKTIF saat confirm
                simParams: simulatedParams,          // hasil simulasi callStatic, siap dipakai ulang
                simTs: simulatedParams ? Date.now() : null
            };

            showSwapConfirmModal(inData, outData, amountUI, realistic);

        } catch (e) {
            console.error(e);
            showToast?.(e.message || "Preview failed", "error");
        }
    }

    // ==========================
    // SHOW SWAP CONFIRM MODAL
    // Delegasi ke confirm-modals.js kalau ada,
    // fallback ke modal inline
    // ==========================
    function showSwapConfirmModal(inToken, outToken, amountIn, amountOut) {

        // Pakai modal premium dari confirm-modals.js
        if (typeof window.showSwapConfirmModal === "function" &&
            window.showSwapConfirmModal !== showSwapConfirmModal) {
            window.showSwapConfirmModal(inToken, outToken, amountIn, amountOut);
            return;
        }

        // Fallback: modal inline sederhana
        let modal = document.getElementById("swapConfirmModal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "swapConfirmModal";
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="confirm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:20000;
                 display:flex;align-items:center;justify-content:center;">
                <div style="background:#151920;border:1px solid #252b38;border-radius:20px;
                            padding:24px 20px;width:90%;max-width:360px;">
                    <div style="font-size:17px;font-weight:700;color:#fff;margin-bottom:16px;">Confirm Swap</div>
                    <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #1e2330;">
                        <span style="color:#888;">From</span>
                        <b style="color:#fff;">${amountIn} ${inToken?.symbol || ""}</b>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:10px 0;margin-bottom:16px;">
                        <span style="color:#888;">To</span>
                        <b style="color:#00cc66;">${Number(amountOut).toFixed(6)} ${outToken?.symbol || ""}</b>
                    </div>
                    <button id="confirmSwapBtn" style="width:100%;padding:14px;border:none;border-radius:14px;
                            background:linear-gradient(135deg,#9b5cff,#6a3fd4);color:#fff;font-size:15px;
                            font-weight:700;cursor:pointer;margin-bottom:10px;">Confirm Swap</button>
                    <button id="cancelSwapBtn" style="width:100%;padding:12px;border:1px solid #252b38;
                            border-radius:14px;background:transparent;color:#666;font-size:14px;cursor:pointer;">
                            Cancel</button>
                </div>
            </div>`;

        modal.style.cssText = "position:fixed;inset:0;z-index:20000;display:flex;";

        modal.querySelector("#cancelSwapBtn").onclick = () => {
            modal.style.display = "none";
            window.swapConfirmState = null;
        };

        modal.querySelector("#confirmSwapBtn").onclick = async () => {
            modal.style.display = "none";
            await SWAP_ENGINE.swapExactInput();
            window.swapConfirmState = null;
        };
    }

    // ==========================
    // DECIMALS — cache permanen + pakai window.TOKENS dulu
    // (decimals token tidak pernah berubah, jadi aman dicache selamanya)
    // ==========================
    const _decimalsCache = new Map();

    async function getDecimals(token) {
        const addr = toWSDA(token);
        const key  = addr.toLowerCase();

        if (_decimalsCache.has(key)) return _decimalsCache.get(key);

        const known = (window.TOKENS || []).find(
            t => t.address?.toLowerCase() === key
        );
        if (known?.decimals) {
            _decimalsCache.set(key, known.decimals);
            return known.decimals;
        }

        try {
            const c   = new ethers.Contract(addr, ERC20_ABI, provider);
            const dec = await c.decimals();
            _decimalsCache.set(key, dec);
            return dec;
        } catch {
            _decimalsCache.set(key, 18);
            return 18;
        }
    }

    async function parseAmount(token, amount) {
        const dec = await getDecimals(token);
        return ethers.utils.parseUnits(amount.toString(), dec);
    }

    // ==========================
    // APPROVE
    // ==========================
    async function approveIfNeeded(token, amount, wallet) {
        if (isNative(token)) return;

        const contract  = new ethers.Contract(token, ERC20_ABI, wallet);
        const allowance = await contract.allowance(wallet.address, ROUTER_ADDR);
        if (allowance.gte(amount)) return;

        log("Approving token...");
        showSwapLoading("Approving Token...", 30);
        const tx = await contract.approve(ROUTER_ADDR, ethers.constants.MaxUint256);
        showSwapLoading("Waiting Approval...", 45);
        await tx.wait();
    }

    // ==========================
    // SLIPPAGE
    // ==========================
    function getSlippage() {
        const cfg = Number(window.CONFIG?.SLIPPAGE_DEFAULT);
        if (!cfg || cfg <= 0) return 2;
        return Math.min(Math.max(cfg, 1), 10);
    }

    // ==========================
    // BUILD PARAMS
    // ==========================
    async function buildParams(wallet, tokenIn, tokenOut, amountUI) {
        const amountNum = parseFloat(amountUI);
        if (!amountNum || amountNum <= 0) throw new Error("Invalid amount");

        const amountIn  = await parseAmount(tokenIn, amountNum);
        // FIX: pakai getAmountOutCurve (constant product, berbasis reserve pool asli)
        // bukan getAmountOut (linear) — linear overestimate output untuk amount besar
        // di pool yang tidak terlalu dalam, bikin amountOutMinimum kebesaran → revert.
        const estimated = await PRICE_ENGINE.getAmountOutCurve(tokenIn, tokenOut, amountNum);
        if (!estimated || estimated <= 0) throw new Error("No liquidity pool");

        // FIX: ambil fee dari pool yang SAMA dipakai untuk estimasi harga di atas.
        // getBestPool() sudah dipanggil (dan di-cache) lewat getAmountOut() barusan,
        // jadi panggilan ini TIDAK menambah RPC request baru — cuma baca dari cache.
        const _feeA = normalize(tokenIn);
        const _feeB = normalize(tokenOut);
        const bestPoolForFee = await PRICE_ENGINE.getBestPool(_feeA, _feeB);
        if (!bestPoolForFee) throw new Error("No pool found for this pair");

        // FIX: impactFactor dihitung dari RASIO amount terhadap reserve pool
        // sesungguhnya, bukan dari angka token mentah. Pool tipis + amount
        // "kecil secara angka" bisa tetap punya price impact besar, dan
        // sebaliknya — jadi patokan harus relatif ke ukuran pool.
        let impactFactor = 0.80; // default konservatif kalau data liquidity gak ada

        try {
            const liqData = await PRICE_ENGINE.getPoolLiquidity(tokenIn, tokenOut);
            if (liqData && liqData.inputReserve > 0) {
                const ratio = amountNum / liqData.inputReserve;
                impactFactor =
                    ratio < 0.0005 ? 0.98 :
                    ratio < 0.002  ? 0.95 :
                    ratio < 0.01   ? 0.90 :
                    ratio < 0.03   ? 0.80 :
                    ratio < 0.05   ? 0.65 :
                    ratio < 0.10   ? 0.50 : 0.35; // makin dekat batas MAX_IMPACT (10%), makin besar buffer-nya
            }
        } catch (e) {
            console.warn("[buildParams] gagal ambil liquidity utk impactFactor, pakai default", e);
        }

        const slippage = getSlippage() / 100;
        let minOut = estimated * impactFactor * (1 - slippage);

        if (!isFinite(minOut) || minOut <= 0) throw new Error("Invalid output calculation");
        if (minOut < 0.0000000001) minOut = estimated * 0.5;

        const amountOutMinimum = await parseAmount(tokenOut, minOut.toFixed(8));

        return {
            tokenIn:            toWSDA(tokenIn),
            tokenOut:           isNative(tokenOut) ? WSDA_ADDR : tokenOut,
            fee:                bestPoolForFee.fee,   // dinamis, sesuai pool yang benar-benar punya liquidity
            recipient:          isNative(tokenOut) ? ROUTER_ADDR : wallet.address,
            deadline:           Math.floor(Date.now() / 1000) + 300,
            amountIn,
            amountOutMinimum,
            sqrtPriceLimitX96:  0
        };
    }

    // ==========================
    // LOGO PATH HELPER
    // ==========================
    function resolveLogoPath(tokenData, isNativeToken) {
        if (isNativeToken) return "img/sda.png";
        if (!tokenData)    return "img/default.png";
        const raw = tokenData.logo || tokenData.icon || "";
        if (!raw)                return "img/default.png";
        if (raw.startsWith("img/")) return raw;
        if (!raw.includes("/"))     return "img/" + raw;
        return raw;
    }

    // ==========================
    // EXECUTE SWAP (dari auto-workflow)
    // ==========================
    async function executeSwap(tokenIn, tokenOut, amountUI) {
        const prevPay  = window.swapState.payToken;
        const prevRecv = window.swapState.receiveToken;
        try {
            window.swapState.payToken     = tokenIn;
            window.swapState.receiveToken = tokenOut;
            const payInput = document.getElementById("payAmount");
            if (payInput) payInput.value = Number(amountUI).toFixed(6);
            window.swapConfirmState = {
                tokenIn,
                tokenOut,
                amountUI: Number(amountUI).toFixed(6)
            };
            return await swapExactInput(true); // _silent = true — tidak tampilkan modal sukses
        } finally {
            window.swapState.payToken     = prevPay;
            window.swapState.receiveToken = prevRecv;
        }
    }

    // ==========================
    // MAIN SWAP
    // ==========================
    async function swapExactInput(_silent = false) {
        if (isLoading) return;

        try {
            // swapConfirmState boleh null kalau dipanggil dari executeSwap (auto-workflow)
            // yang set confirmState sendiri sebelum memanggil swapExactInput

            // Ambil signer AKTIF — bukan cache dari saat confirm
            const wallet = getWallet();
            if (!wallet) {
                showToast?.("Wallet terkunci. Unlock dulu.", "error");
                showPINUnlockScreen?.();
                throw new Error("Wallet locked");
            }

            // Validasi address wallet sesuai confirm
            if (window.swapConfirmState?.wallet &&
                wallet.address?.toLowerCase() !== window.swapConfirmState.wallet?.toLowerCase()) {
                throw new Error("Wallet berubah setelah konfirmasi. Ulangi swap.");
            }

            const tokenIn  = swapState.payToken;
            const tokenOut = swapState.receiveToken;
            const amountUI = document.getElementById("payAmount")?.value;

            if (!amountUI || Number(amountUI) <= 0) throw new Error("Invalid amount");

            if (window.swapConfirmState &&
                (window.swapConfirmState.amountUI !== amountUI ||
                 window.swapConfirmState.tokenIn  !== tokenIn  ||
                 window.swapConfirmState.tokenOut !== tokenOut)) {
                throw new Error("Swap data changed. Please reconfirm.");
            }

            isLoading = true;
            setLoading(true);
            showSwapLoading("Preparing Swap...", 15);

            const isNativeIn  = isNative(tokenIn);
            const isNativeOut = isNative(tokenOut);

            const router = new ethers.Contract(ROUTER_ADDR, ROUTER_ABI, wallet);
            const params = await buildParams(wallet, tokenIn, tokenOut, amountUI);

            log("Executing swap...");

            const calls = [];
            if (!isNativeIn) {
                await approveIfNeeded(params.tokenIn, params.amountIn, wallet);
            }

            // ==========================
            // REUSE SIMULASI DARI PREVIEW (openSwapConfirm) KALAU MASIH VALID
            // Kalau sesuai (token/amount/wallet sama & belum kadaluarsa),
            // langsung pakai amountOutMinimum yang sudah disimulasikan di
            // preview — total jadi 1x callStatic per proses swap, bukan 2x.
            // ==========================
            const SIM_REUSE_TTL = 20_000; // 20 detik — cukup untuk jeda tap Review -> tap Confirm
            const cs = window.swapConfirmState;
            const canReuse =
                cs?.simParams &&
                cs.simTs && (Date.now() - cs.simTs < SIM_REUSE_TTL) &&
                cs.tokenIn === tokenIn &&
                cs.tokenOut === tokenOut &&
                cs.amountUI === amountUI &&
                cs.wallet?.toLowerCase() === wallet.address?.toLowerCase();

            if (canReuse) {
                params.amountOutMinimum = cs.simParams.amountOutMinimum;
                console.log("[SWAP] Pakai ulang simulasi dari preview, minOut:", params.amountOutMinimum.toString());
            } else {
                // Fallback: simulasi preview gak ada / kadaluarsa / data berubah — simulasi ulang
                try {
                    const simParams  = { ...params, amountOutMinimum: 0 };
                    const simValue   = isNativeIn ? params.amountIn : 0;
                    const realOut    = await router.callStatic.exactInputSingle(simParams, { value: simValue });

                    const slippageBps       = Math.floor(getSlippage() * 100);
                    params.amountOutMinimum = realOut.mul(10000 - slippageBps).div(10000);

                    console.log("[SWAP] Simulasi ulang (fallback) sukses, minOut:", params.amountOutMinimum.toString());
                } catch (simErr) {
                    console.warn("[SWAP] Simulasi callStatic gagal, pakai estimasi fallback:", simErr.message || simErr);
                }
            }

            calls.push(encodeSwap(router, params));
            if (isNativeOut) {
                calls.push(encodeUnwrap(router, wallet.address));
            }

            showSwapLoading("Broadcasting Transaction...", 60);

            const tx = await router.multicall(calls, {
                value:    isNative(tokenIn) ? params.amountIn : 0,
                gasLimit: 1200000
            });

            log("TX: " + tx.hash);
            showSwapLoading("Waiting Confirmation...", 80);

            const receipt = await tx.wait();
            if (receipt.status !== 1) throw new Error("Swap failed");

            // SAVE HISTORY
            try {
                const history  = JSON.parse(localStorage.getItem("txHistory") || "[]");
                const amountIn = Number(amountUI) || 0;
                const receiveEl = document.getElementById("receiveAmount");
                const amountOut = Number(receiveEl?.value || 0) || amountIn;
                const inData    = isNativeIn  ? null : getTokenData(tokenIn);
                const outData   = isNativeOut ? null : getTokenData(tokenOut);

                history.unshift({
                    hash:         tx.hash,
                    from:         wallet.address,
                    to:           wallet.address,
                    value:        amountOut,
                    symbol:       isNativeOut ? "SDA" : (outData?.symbol || "UNKNOWN"),
                    logo:         resolveLogoPath(outData, isNativeOut),
                    tokenAddress: tokenOut,
                    type:         "SWAP",
                    amountIn,
                    amountOut,
                    inSymbol:     isNativeIn ? "SDA" : (inData?.symbol || "TOKEN"),
                    outSymbol:    isNativeOut ? "SDA" : (outData?.symbol || "UNKNOWN"),
                    inLogo:       resolveLogoPath(inData,  isNativeIn),
                    outLogo:      resolveLogoPath(outData, isNativeOut),
                    timestamp:    Date.now(),
                    status:       "success",
                    read:         false
                });

                if (history.length > 50) history.pop();
                localStorage.setItem("txHistory", JSON.stringify(history));
            } catch (e) { console.warn("history error", e); }

            renderTxHistory?.();
            updateBellBadge?.();
            log("Swap success");
            showSwapLoading("Finalizing...", 95);
            window._invalidateBalanceCache?.(wallet.address);
            refreshAll?.();
            window.refreshSwapModal?.();
            updateBellBadge?.();

            if (!_silent) {
                const inData  = isNativeIn
                    ? { symbol: "SDA", type: "native", decimals: 18, logo: "img/sda.png" }
                    : getTokenData(tokenIn);
                const outData = isNativeOut
                    ? { symbol: "SDA", type: "native", decimals: 18, logo: "img/sda.png" }
                    : getTokenData(tokenOut);

                // Estimasi amountOut dari receiveAmount field (sudah diisi saat preview)
                const amountOut = parseFloat(
                    document.getElementById("receiveAmount")?.value
                ) || 0;

                showSwapSuccessModal?.({
                    hash:       tx.hash,
                    receipt,
                    amountIn:   Number(amountUI),
                    amountOut,
                    tokenIn:    inData,
                    tokenOut:   outData,
                    explorerUrl: window.EXPLORER_TX_URL || window.EXPLORER_URL || "https://ledger.sidrachain.com/tx/"
                });
            } else {
                showToast?.("Swap success", "success");
            }

            return receipt;

        } catch (e) {
            console.error(e);
            log("Swap failed");
            showToast?.(e.message || "Swap failed", "error");
        } finally {
            setTimeout(() => hideSwapLoading(), 500);
            isLoading = false;
            setLoading(false);
        }
    }

    // ==========================
    // INIT
    // ==========================
    function init() {
        document.getElementById("btnReviewSwap")
            ?.addEventListener("click", () => SWAP_ENGINE.openSwapConfirm());
    }

    document.addEventListener("DOMContentLoaded", init);

    return { swapExactInput, openSwapConfirm, executeSwap };

})();