// =====================================
// GAS-FORMAT.JS — konversi gas unit → nominal SDA (hanya tampilan)
// Muat setelah config.js dan sebelum modul lain.
// =====================================
(function () {

    // Perkiraan pemakaian gas NORMAL (bukan gasLimit). Kalibrasi dari gasUsed di resi.
    const TYPICAL = {
        send_native: 21000,
        send_erc20:  65000,
        swap:        125000,   // resi nyata: ~124.000 gas (0.000188 SDA @1.5 gwei)
        lp_add:      500000
    };

    // Batas atas = gasLimit di engine (jaga tetap sinkron)
    const LIMITS = {
        swap:   1200000,   // swap-engine.js
        lp_add: 1500000    // lp-engine.js
    };

    const PRICE_TTL_MS = 15000;
    let _cache = { price: null, ts: 0 };
    let _seq   = 0;

    function _sym() {
        return window.CONFIG?.NATIVE_SYMBOL || "SDA";
    }

    // Fallback bila RPC lambat/gagal. Atur di CONFIG.DEFAULT_GAS_PRICE_GWEI
    function _fallbackPrice() {
        const gwei = window.CONFIG?.DEFAULT_GAS_PRICE_GWEI ?? 1;
        return ethers.utils.parseUnits(String(gwei), "gwei");
    }

    // Gas price EFEKTIF dari RPC aktif (cache 15 detik, timeout 4 detik).
    // Harga yang benar-benar dibayar tx type-2 = baseFee + priorityFee.
    // eth_gasPrice di jaringan ini lebih tinggi (~2x) dari harga bayar sebenarnya,
    // jadi hanya dipakai sebagai cadangan.
    async function getGasPrice() {
        const now = Date.now();
        if (_cache.price && now - _cache.ts < PRICE_TTL_MS) return _cache.price;

        try {
            const fd = await Promise.race([
                window.provider.getFeeData(),
                new Promise((_, rej) => setTimeout(() => rej(new Error("feeData timeout")), 4000))
            ]);
            const p = (fd?.lastBaseFeePerGas && fd?.maxPriorityFeePerGas)
                ? fd.lastBaseFeePerGas.add(fd.maxPriorityFeePerGas)
                : fd?.gasPrice;
            if (p && p.gt(0)) {
                _cache = { price: p, ts: now };
                return p;
            }
        } catch (e) {
            console.warn("[GAS] getGasPrice gagal, pakai default:", e.message || e);
        }
        return _fallbackPrice();
    }

    // formatGasToSDA(gasUnits, gasPrice) → "~0.00025 SDA"
    function formatGasToSDA(gasUnits, gasPrice, opts = {}) {
        const units = ethers.BigNumber.from(gasUnits);
        const price = ethers.BigNumber.from(gasPrice || _fallbackPrice());
        const fee   = parseFloat(ethers.utils.formatEther(units.mul(price)));

        let txt;
        if (!fee)              txt = "0";
        else if (fee < 1e-6)   txt = "<0.000001";
        else if (fee < 0.001)  txt = fee.toPrecision(2);   // 0.000189 → 0.00019
        else                   txt = fee.toFixed(4);

        return (opts.approx === false ? "" : "~") + txt + " " + _sym();
    }

    // Render async ke elemen (anti-race: hanya hasil terbaru yang dipakai)
    // units: angka/BigNumber, atau fungsi (boleh async) yang mengembalikannya
    async function renderInto(el, units) {
        if (!el) return;
        const mySeq = ++_seq;
        el.dataset.gasSeq = String(mySeq);
        el.textContent = "…";

        try {
            const [price, u] = await Promise.all([
                getGasPrice(),
                Promise.resolve(typeof units === "function" ? units() : units)
            ]);
            if (el.dataset.gasSeq !== String(mySeq)) return;
            el.textContent = formatGasToSDA(u, price);
        } catch (e) {
            console.warn("[GAS] render gagal:", e);
            if (el.dataset.gasSeq === String(mySeq)) el.textContent = "—";
        }
    }

    // Estimasi gas Send (estimateGas + buffer 20%, fallback ke nilai tipikal)
    async function estimateSendUnits({ to, amount, tokenData, fromAddress }) {
        const native = !tokenData?.address || tokenData.address === "native" || tokenData.type === "native";
        const fallback = native ? TYPICAL.send_native : TYPICAL.send_erc20;

        try {
            let tx;
            if (native) {
                tx = { from: fromAddress, to, value: ethers.utils.parseEther(String(amount)) };
            } else {
                const c = new ethers.Contract(tokenData.address, [
                    "function transfer(address,uint256) returns (bool)",
                    "function decimals() view returns (uint8)"
                ], window.provider);
                const dec = await c.decimals().catch(() => tokenData.decimals || 18);
                tx = await c.populateTransaction.transfer(
                    to, ethers.utils.parseUnits(String(amount), dec), { from: fromAddress }
                );
            }
            // Tanpa buffer: estimateGas untuk transfer sudah akurat, ini hanya tampilan
            return await window.provider.estimateGas(tx);
        } catch (e) {
            return fallback;
        }
    }

    // ---- Kalibrasi dari resi nyata ----
    // estimateGas = gas yang dibutuhkan agar tx berhasil (sebelum refund),
    // gasUsed di resi = gas terpakai (setelah refund). Rasio keduanya dipelajari
    // per jenis transaksi dan dipakai untuk preview berikutnya.
    const CALIB_KEY = "gasCalib_v1";

    function _loadCalib() {
        try { return JSON.parse(localStorage.getItem(CALIB_KEY)) || {}; }
        catch { return {}; }
    }
    function _saveCalib(o) {
        try { localStorage.setItem(CALIB_KEY, JSON.stringify(o)); } catch {}
    }

    // Panggil setelah tx sukses: key = jenis tx, gasUsed dari receipt, estimatedUnits dari preview (boleh null)
    function recordActual(key, gasUsed, estimatedUnits) {
        try {
            const used = ethers.BigNumber.from(gasUsed).toNumber();
            if (!used) return;
            const ema  = (old, v) => old ? old * 0.5 + v * 0.5 : v;
            const c    = _loadCalib();
            const prev = c[key] || {};
            c[key] = { used: Math.round(ema(prev.used, used)), ratio: prev.ratio };

            if (estimatedUnits) {
                const est = ethers.BigNumber.from(estimatedUnits).toNumber();
                if (est > 0) {
                    const r = Math.min(1.5, Math.max(0.3, used / est));
                    c[key].ratio = +ema(prev.ratio, r).toFixed(4);
                }
            }
            _saveCalib(c);
        } catch (e) { /* kalibrasi tidak boleh mengganggu transaksi */ }
    }

    // Kembalikan unit gas untuk ditampilkan.
    function calibrate(key, estimatedUnits, fallbackUnits) {
        const c = _loadCalib()[key];
        if (estimatedUnits) {
            const est = ethers.BigNumber.from(estimatedUnits);
            return c?.ratio ? est.mul(Math.round(c.ratio * 1000)).div(1000) : est;
        }
        if (c?.used) return c.used;
        return fallbackUnits;
    }

    window.GAS_UTIL = {
        TYPICAL, LIMITS,
        getGasPrice, formatGasToSDA, renderInto, estimateSendUnits,
        recordActual, calibrate
    };
    window.formatGasToSDA = formatGasToSDA;
})();
