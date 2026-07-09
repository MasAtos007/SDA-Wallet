// =====================================
// UNWRAP ENGINE + UNWRAP MODALS (PROCESS, CONFIRM, INFO & SUCCESS)
// File: js/unwrap-engine.js
// Cukup include file ini setelah wallet-core.js / config.js.
// Tidak perlu edit index.html â€” HTML modal & CSS di-inject otomatis.
// Semua teks pakai sistem LANG (window.LANG[CURRENT_LANG]) dengan
// fallback default kalau key belum ada / lang.json belum di-update.
// =====================================

(function () {

    // ==========================
    // LANG HELPER (fallback aman kalau LANG belum siap)
    // ==========================
    function _t(key, fallback) {
        try {
            const lang = window.CURRENT_LANG || "id";
            return (window.LANG?.[lang]?.[key]) || fallback;
        } catch { return fallback; }
    }

    // Titik-tengah aman lintas-encoding (jangan taruh karakter "Â·" literal
    // di source â€” kalau file ke-save bukan UTF-8 murni, karakter itu bisa
    // corrupt jadi "Ã‚Â·"). \u00B7 selalu aman apa pun encoding file JS-nya.
    const MIDDOT = "\u00B7";

    // ==========================
    // INJECT CSS (sekali saja)
    // ==========================
    function injectStyle() {
        if (document.getElementById("unwrapModalStyle")) return;

        const style = document.createElement("style");
        style.id = "unwrapModalStyle";
        style.textContent = `
        .unwrap-modal-overlay {
            position: fixed; inset: 0; z-index: 99999;
            background: rgba(0,0,0,0.78);
            backdrop-filter: blur(4px);
            display: none; align-items: center; justify-content: center;
            padding: 20px; box-sizing: border-box;
        }
        .unwrap-modal-overlay.show { display: flex; }

        .unwrap-modal-box {
            width: 100%; max-width: 340px;
            background: #161616;
            border: 1px solid #2a2a2a;
            border-radius: 20px;
            padding: 28px 22px 22px;
            text-align: center;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            animation: uwmPop .25s ease;
        }
        @keyframes uwmPop {
            from { transform: scale(.92); opacity: 0; }
            to   { transform: scale(1);   opacity: 1; }
        }

        /* ---------- PROCESSING ---------- */
        .uwp-icon-row {
            display: flex; align-items: center; justify-content: center;
            gap: 14px; margin-bottom: 18px;
        }
        .uwp-token-icon {
            width: 52px; height: 52px; border-radius: 50%;
            background: #1f1f1f; border: 1px solid #333;
            display: flex; align-items: center; justify-content: center;
            overflow: hidden;
        }
        .uwp-token-icon img { width: 30px; height: 30px; object-fit: contain; }
        .uwp-spin-ring {
            width: 28px; height: 28px;
            border: 3px solid #2a2a2a;
            border-top-color: #ff8a1f;
            border-radius: 50%;
            animation: uwpSpin 0.85s linear infinite;
        }
        @keyframes uwpSpin { to { transform: rotate(360deg); } }

        .uwp-title { color:#fff; font-size:16px; font-weight:700; margin-bottom:6px; }
        .uwp-subtitle { color:#888; font-size:12.5px; margin-bottom:20px; line-height:1.4; white-space:pre-line; }

        .uwp-steps { text-align:left; display:flex; flex-direction:column; gap:12px; margin-bottom:4px; }
        .uwp-step {
            display:flex; align-items:center; gap:10px;
            font-size:13px; color:#666; transition: color .25s;
        }
        .uwp-step .uwp-dot {
            width:20px; height:20px; border-radius:50%;
            border:2px solid #333; flex-shrink:0;
            display:flex; align-items:center; justify-content:center;
            font-size:10px; color:transparent; transition: all .25s;
        }
        .uwp-step.active { color:#fff; }
        .uwp-step.active .uwp-dot {
            border-color:#ff8a1f;
            box-shadow: 0 0 0 3px rgba(255,138,31,0.15);
        }
        .uwp-step.active .uwp-dot::after {
            content:''; width:8px; height:8px; border-radius:50%;
            background:#ff8a1f; animation: uwpPulse 1s ease-in-out infinite;
        }
        .uwp-step.done { color:#8fd694; }
        .uwp-step.done .uwp-dot {
            border-color:#3fae55; background:#3fae55; color:#0f0f0f;
        }
        .uwp-step.done .uwp-dot::after { content:''; }
        @keyframes uwpPulse { 0%,100%{opacity:1} 50%{opacity:.3} }

        /* ---------- SUCCESS ---------- */
        .uwm-check-wrap {
            width:64px; height:64px; margin:0 auto 16px;
            border-radius:50%; background: rgba(63,174,85,0.12);
            display:flex; align-items:center; justify-content:center;
            animation: uwmCheckPop .35s ease;
        }
        @keyframes uwmCheckPop {
            0% { transform: scale(0); }
            60% { transform: scale(1.15); }
            100% { transform: scale(1); }
        }
        .uwm-check-wrap i { color:#3fae55; font-size:30px; }

        .uwm-title { color:#fff; font-size:17px; font-weight:700; margin-bottom:4px; }
        .uwm-sub { color:#888; font-size:12.5px; margin-bottom:18px; }

        .uwm-amount-row {
            display:flex; align-items:center; justify-content:center;
            gap:10px; background:#1a1a1a; border:1px solid #292929;
            border-radius:14px; padding:14px 10px; margin-bottom:14px;
        }
        .uwm-amount-col { display:flex; flex-direction:column; align-items:center; gap:6px; flex:1; }
        .uwm-amount-col img { width:30px; height:30px; border-radius:50%; object-fit:contain; }
        .uwm-amount-col span.amt { color:#fff; font-size:14px; font-weight:700; }
        .uwm-amount-col span.sym { color:#888; font-size:11px; }
        .uwm-arrow { color:#ff8a1f; font-size:15px; }

        .uwm-details { text-align:left; display:flex; flex-direction:column; gap:9px; margin-bottom:18px; }
        .uwm-row { display:flex; justify-content:space-between; align-items:center; font-size:12.5px; }
        .uwm-row .label { color:#777; }
        .uwm-row .value { color:#ddd; font-family:monospace; font-size:12px; }
        .uwm-row .value.copy { color:#5b9bff; cursor:pointer; }

        .uwm-actions { display:flex; gap:10px; }
        .uwm-btn {
            flex:1; padding:12px; border-radius:12px; font-size:13px; font-weight:600;
            cursor:pointer; border:1px solid #333; background:#1f1f1f; color:#ccc;
        }
        .uwm-btn.primary { background:#ff7a00; border-color:#ff7a00; color:#141414; }

        /* ---------- ERROR / INFO ---------- */
        .uwp-error-wrap {
            width:64px; height:64px; margin:0 auto 16px;
            border-radius:50%; background: rgba(255,76,76,0.12);
            display:flex; align-items:center; justify-content:center;
        }
        .uwp-error-wrap i { color:#ff5c5c; font-size:28px; }
        `;
        document.head.appendChild(style);
    }

    // ==========================
    // INJECT HTML (sekali saja) â€” teks statis diisi lewat applyStaticLang()
    // supaya bisa ikut LANG aktif tiap kali modal dibuka
    // ==========================
    function injectMarkup() {
        if (document.getElementById("unwrapProcessModal")) return;

        const wrap = document.createElement("div");
        wrap.innerHTML = `
        <div id="unwrapProcessModal" class="unwrap-modal-overlay">
            <div class="unwrap-modal-box" id="uwpBox">
                <div class="uwp-icon-row">
                    <div class="uwp-token-icon"><img src="img/wsda.png" onerror="this.src='img/default.png'"></div>
                    <div class="uwp-spin-ring"></div>
                    <div class="uwp-token-icon"><img src="img/sda.png" onerror="this.src='img/default.png'"></div>
                </div>
                <div class="uwp-title" id="uwpTitle"></div>
                <div class="uwp-subtitle" id="uwpSubtitle"></div>
                <div class="uwp-steps" id="uwpSteps">
                    <div class="uwp-step" data-step="1"><div class="uwp-dot"></div><span id="uwpStepText1"></span></div>
                    <div class="uwp-step" data-step="2"><div class="uwp-dot"></div><span id="uwpStepText2"></span></div>
                    <div class="uwp-step" data-step="3"><div class="uwp-dot"></div><span id="uwpStepText3"></span></div>
                </div>
            </div>
        </div>

        <div id="unwrapSuccessModal" class="unwrap-modal-overlay">
            <div class="unwrap-modal-box">
                <div class="uwm-check-wrap"><i class="fa-solid fa-check"></i></div>
                <div class="uwm-title" id="uwmTitle"></div>
                <div class="uwm-sub" id="uwmSub"></div>

                <div class="uwm-amount-row">
                    <div class="uwm-amount-col">
                        <img src="img/wsda.png" onerror="this.src='img/default.png'">
                        <span class="amt" id="uwmFromAmount">0.00</span>
                        <span class="sym">WSDA</span>
                    </div>
                    <div class="uwm-arrow"><i class="fa-solid fa-arrow-right-long"></i></div>
                    <div class="uwm-amount-col">
                        <img src="img/sda.png" onerror="this.src='img/default.png'">
                        <span class="amt" id="uwmToAmount">0.00</span>
                        <span class="sym">SDA</span>
                    </div>
                </div>

                <div class="uwm-details">
                    <div class="uwm-row"><span class="label" id="uwmLabelHash"></span><span class="value copy" id="uwmHash" onclick="UNWRAP_MODAL.copyHash()">-</span></div>
                    <div class="uwm-row"><span class="label" id="uwmLabelBlock"></span><span class="value" id="uwmBlock">-</span></div>
                    <div class="uwm-row"><span class="label" id="uwmLabelGas"></span><span class="value" id="uwmGas">-</span></div>
                    <div class="uwm-row"><span class="label" id="uwmLabelTime"></span><span class="value" id="uwmTime">-</span></div>
                </div>

                <div class="uwm-actions">
                    <button class="uwm-btn" id="uwmCloseBtn" onclick="UNWRAP_MODAL.closeSuccess()"></button>
                    <button class="uwm-btn primary" id="uwmExplorerBtn" onclick="UNWRAP_MODAL.openExplorer()"></button>
                </div>
            </div>
        </div>

        <div id="unwrapConfirmModal" class="unwrap-modal-overlay">
            <div class="unwrap-modal-box">
                <div class="uwp-icon-row">
                    <div class="uwp-token-icon"><img src="img/wsda.png" onerror="this.src='img/default.png'"></div>
                    <div class="uwm-arrow"><i class="fa-solid fa-arrow-right-long"></i></div>
                    <div class="uwp-token-icon"><img src="img/sda.png" onerror="this.src='img/default.png'"></div>
                </div>
                <div class="uwp-title" id="uwcTitle"></div>
                <div class="uwp-subtitle" id="uwcMessage"></div>
                <div class="uwm-actions">
                    <button class="uwm-btn" id="uwcCancelBtn"></button>
                    <button class="uwm-btn primary" id="uwcOkBtn"></button>
                </div>
            </div>
        </div>

        <div id="unwrapInfoModal" class="unwrap-modal-overlay">
            <div class="unwrap-modal-box">
                <div class="uwp-error-wrap" id="uwiIconWrap"><i class="fa-solid fa-triangle-exclamation"></i></div>
                <div class="uwp-title" id="uwiTitle"></div>
                <div class="uwp-subtitle" id="uwiMessage"></div>
                <div class="uwm-actions">
                    <button class="uwm-btn primary" style="width:100%;" id="uwiOkBtn"></button>
                </div>
            </div>
        </div>
        `;
        document.body.appendChild(wrap);
    }

    // Set ulang semua teks statis (label, tombol) sesuai LANG aktif.
    // Dipanggil setiap kali modal manapun mau ditampilkan, supaya kalau
    // user ganti bahasa di tengah sesi, modal berikutnya ikut update.
    function applyStaticLang() {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        set("uwpTitle",     _t("unwrap_processing_title", "Memproses Unwrap"));
        set("uwpSubtitle",  _t("unwrap_processing_sub", "Mengubah WSDA menjadi SDA native. Mohon tunggu, jangan tutup halaman ini."));
        set("uwpStepText1", _t("unwrap_step_confirm", "Konfirmasi di wallet"));
        set("uwpStepText2", _t("unwrap_step_send", "Mengirim transaksi unwrap"));
        set("uwpStepText3", _t("unwrap_step_wait", "Menunggu konfirmasi blockchain"));

        set("uwmTitle", _t("unwrap_success_title", "Unwrap Berhasil!"));
        set("uwmSub",   _t("unwrap_success_sub", "WSDA kamu sudah dikonversi menjadi SDA native"));
        set("uwmLabelHash",  _t("unwrap_tx_hash", "Tx Hash"));
        set("uwmLabelBlock", _t("unwrap_block", "Block"));
        set("uwmLabelGas",   _t("unwrap_gas_fee", "Gas Fee"));
        set("uwmLabelTime",  _t("unwrap_time", "Waktu"));
        set("uwmCloseBtn",     _t("tx_close", "Tutup"));
        set("uwmExplorerBtn",  _t("tx_explorer", "Lihat di Explorer"));

        set("uwcCancelBtn", _t("swap_cancel_btn", "Batal"));
        set("uwcOkBtn",     _t("unwrap_confirm_btn", "Lanjutkan"));

        set("uwiOkBtn", _t("tx_close", "Oke"));
    }

    function ensureUI() {
        injectStyle();
        injectMarkup();
        applyStaticLang();
    }

    // ==========================
    // MODAL CONTROLLER (exposed as window.UNWRAP_MODAL)
    // ==========================
    let _uwmHash = "";
    let _uwmExplorerUrl = "";

    const UNWRAP_MODAL = {

        // Modal konfirmasi sebelum eksekusi â€” return Promise<boolean>
        confirm({ title, message } = {}) {
            ensureUI();

            const modal = document.getElementById("unwrapConfirmModal");
            const okBtn = document.getElementById("uwcOkBtn");
            const cnBtn = document.getElementById("uwcCancelBtn");

            document.getElementById("uwcTitle").textContent   = title   || _t("unwrap_confirm_title", "Konfirmasi Unwrap");
            document.getElementById("uwcMessage").textContent = message || _t("unwrap_confirm_default", "Yakin ingin melanjutkan?");

            modal.classList.add("show");

            return new Promise((resolve) => {
                const cleanup = (result) => {
                    modal.classList.remove("show");
                    okBtn.removeEventListener("click", onOk);
                    cnBtn.removeEventListener("click", onCancel);
                    resolve(result);
                };
                const onOk     = () => cleanup(true);
                const onCancel = () => cleanup(false);

                okBtn.addEventListener("click", onOk);
                cnBtn.addEventListener("click", onCancel);
            });
        },

        // Modal info/error satu tombol â€” pengganti alert()
        info(message, { title, isError = true } = {}) {
            ensureUI();

            const modal    = document.getElementById("unwrapInfoModal");
            const okBtn    = document.getElementById("uwiOkBtn");
            const iconWrap = document.getElementById("uwiIconWrap");

            document.getElementById("uwiTitle").textContent   = title || (isError ? _t("error", "Gagal") : _t("success", "Info"));
            document.getElementById("uwiMessage").textContent = message || "";
            okBtn.textContent = _t("tx_close", "Oke");

            iconWrap.style.background = isError ? "rgba(255,76,76,0.12)" : "rgba(255,138,31,0.12)";
            iconWrap.innerHTML = isError
                ? '<i class="fa-solid fa-triangle-exclamation" style="color:#ff5c5c;"></i>'
                : '<i class="fa-solid fa-circle-info" style="color:#ff8a1f;"></i>';

            modal.classList.add("show");

            return new Promise((resolve) => {
                const onOk = () => {
                    modal.classList.remove("show");
                    okBtn.removeEventListener("click", onOk);
                    resolve(true);
                };
                okBtn.addEventListener("click", onOk);
            });
        },

        showProcessing() {
            ensureUI();
            document.getElementById("unwrapProcessModal")?.classList.add("show");
            this.setStep(1);
        },

        setStep(stepNum) {
            document.querySelectorAll("#uwpSteps .uwp-step").forEach(el => {
                const n = parseInt(el.dataset.step, 10);
                el.classList.remove("active", "done");
                if (n < stepNum) el.classList.add("done");
                if (n === stepNum) el.classList.add("active");
            });
        },

        showErrorState(message) {
            ensureUI();
            const box = document.getElementById("uwpBox");
            if (!box) return;
            box.innerHTML = `
                <div class="uwp-error-wrap"><i class="fa-solid fa-xmark"></i></div>
                <div class="uwp-title">${_t("unwrap_failed_title", "Unwrap Gagal")}</div>
                <div class="uwp-subtitle">${message || _t("unwrap_failed_default", "Transaksi tidak berhasil diproses. Silakan coba lagi.")}</div>
                <div class="uwm-actions" style="margin-top:6px;">
                    <button class="uwm-btn primary" style="width:100%;" onclick="UNWRAP_MODAL.closeProcessing()">${_t("tx_close", "Tutup")}</button>
                </div>
            `;
        },

        closeProcessing() {
            document.getElementById("unwrapProcessModal")?.classList.remove("show");
        },

        showSuccess({ amountIn, amountOut, hash, receipt, explorerUrl }) {
            ensureUI();

            _uwmHash = hash || "";
            _uwmExplorerUrl = (explorerUrl || "https://ledger.sidrachain.com/tx/") + hash;

            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

            set("uwmFromAmount", Number(amountIn  || 0).toLocaleString(undefined, { maximumFractionDigits: 6 }));
            set("uwmToAmount",   Number(amountOut || amountIn || 0).toLocaleString(undefined, { maximumFractionDigits: 6 }));

            const dash = "-";
            const shortHash = hash ? (hash.slice(0, 10) + "..." + hash.slice(-8)) : dash;
            set("uwmHash", shortHash);
            set("uwmBlock", receipt?.blockNumber ?? dash);

            try {
                const gasUsed  = receipt?.gasUsed;
                const gasPrice = receipt?.effectiveGasPrice;
                if (gasUsed && gasPrice && window.ethers) {
                    const fee = parseFloat(ethers.utils.formatEther(gasUsed.mul(gasPrice)));
                    set("uwmGas", fee.toFixed(6) + " SDA");
                } else {
                    set("uwmGas", dash);
                }
            } catch { set("uwmGas", dash); }

            const now = new Date();
            const currentLang = window.CURRENT_LANG || "id";
            const locale = currentLang === "en" ? "en-US" : currentLang === "ar" ? "ar-SA" : "id-ID";
            set("uwmTime", now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                + " " + MIDDOT + " " + now.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }));

            this.closeProcessing();
            document.getElementById("unwrapSuccessModal")?.classList.add("show");
        },

        closeSuccess() {
            document.getElementById("unwrapSuccessModal")?.classList.remove("show");
        },

        copyHash() {
            if (!_uwmHash) return;
            navigator.clipboard?.writeText(_uwmHash)
                .then(() => window.showToast?.(_t("copied", "Copied"), "success"))
                .catch(() => window.showToast?.(_t("copy_failed", "Gagal menyalin"), "error"));
        },

        openExplorer() {
            if (!_uwmExplorerUrl) return;
            if (typeof window.openExplorer === "function") window.openExplorer(_uwmExplorerUrl);
            else window.open(_uwmExplorerUrl, "_blank");
        }
    };

    window.UNWRAP_MODAL = UNWRAP_MODAL;

    // Tutup modal saat klik backdrop (khusus success â€” processing/confirm
    // tidak boleh ditutup manual lewat backdrop)
    document.addEventListener("click", (e) => {
        if (e.target.id === "unwrapSuccessModal") UNWRAP_MODAL.closeSuccess();
    });

    // ==========================
    // UNWRAP ENGINE (FINAL, terhubung ke modal + LANG)
    // ==========================
    window.UNWRAP_ENGINE = {

        getWallet() {
            // Legacy fallback (kalau ada flow lama yang masih set window.pkWallet)
            if (window.pkWallet) return window.pkWallet;

            // Signer utama project ini: SESSION.signer (wallet-session.js).
            // requireSigner() otomatis munculkan layar PIN kalau terkunci,
            // dan throw Error("Wallet terkunci...") â€” kita tangkap di sini.
            try {
                if (typeof requireSigner === "function") return requireSigner();
            } catch {
                return null;
            }

            return (typeof SESSION !== "undefined" ? SESSION?.signer : null) || null;
        },

        getAddress() {
            if (window.pkWallet) return window.pkWallet.address;
            return (typeof SESSION !== "undefined" ? SESSION?.address : null) || null;
        },

        async unwrapAll() {

            const wallet  = this.getWallet();
            const address = this.getAddress();

            if (!wallet || !address) {
                // Kalau vault ada tapi SESSION belum unlocked, requireSigner()
                // di getWallet() sudah otomatis munculkan layar PIN â€” cukup
                // beri info ringan, tidak perlu dump debug lagi.
                const isLockedCase = (typeof vault !== "undefined" && vault.exists?.())
                    && (typeof SESSION !== "undefined" && !SESSION.unlocked);

                if (isLockedCase) {
                    await UNWRAP_MODAL.info(
                        _t("unwrap_locked_desc", "Wallet kamu terkunci. Masukkan PIN untuk melanjutkan unwrap."),
                        { title: _t("unwrap_locked_title", "Wallet Terkunci"), isError: false }
                    );
                    return;
                }

                const dbg =
                    "SESSION.unlocked: " + (typeof SESSION !== "undefined" ? SESSION.unlocked : "n/a") + "\n" +
                    "SESSION.address: "  + (typeof SESSION !== "undefined" ? SESSION.address  : "n/a") + "\n" +
                    "pkWallet: "         + (window.pkWallet ? "ADA" : "kosong");

                console.warn("DEBUG UNWRAP\n" + dbg);
                await UNWRAP_MODAL.info(
                    _t("no_wallet", "Wallet tidak ditemukan.") + "\n\n" + dbg,
                    { title: _t("no_wallet", "Wallet Not Found") }
                );
                return;
            }

            const WSDA = window.CONFIG?.WSDA;
            if (!WSDA) {
                await UNWRAP_MODAL.info(
                    _t("unwrap_config_missing", "Alamat kontrak WSDA belum diset di CONFIG."),
                    { title: _t("error", "Konfigurasi Belum Lengkap") }
                );
                return;
            }

            try {
                const abi = [
                    "function balanceOf(address) view returns (uint256)",
                    "function withdraw(uint256)"
                ];

                const contract = new ethers.Contract(WSDA, abi, wallet);

                // Cek saldo dulu SEBELUM tampil modal konfirmasi
                const bal = await contract.balanceOf(address);

                if (!bal || bal.toString() === "0") {
                    await UNWRAP_MODAL.info(
                        _t("unwrap_empty_desc", "Saldo WSDA kamu 0, tidak ada yang bisa di-unwrap."),
                        { title: _t("unwrap_empty_title", "Saldo Kosong"), isError: false }
                    );
                    return;
                }

                const amountHuman = parseFloat(ethers.utils.formatEther(bal));

                const confirmTemplate = _t(
                    "unwrap_confirm_message",
                    "Unwrap {amount} WSDA menjadi SDA native? Aksi ini akan memicu transaksi on-chain."
                );
                const confirmMessage = confirmTemplate.replace("{amount}", amountHuman.toFixed(6));

                const confirmed = await UNWRAP_MODAL.confirm({
                    title:   _t("unwrap_confirm_title", "Konfirmasi Unwrap"),
                    message: confirmMessage
                });
                if (!confirmed) return;

                UNWRAP_MODAL.showProcessing();
                UNWRAP_MODAL.setStep(1);

                UNWRAP_MODAL.setStep(2);
                const tx = await contract.withdraw(bal);

                UNWRAP_MODAL.setStep(3);
                const receipt = await tx.wait();

                UNWRAP_MODAL.showSuccess({
                    amountIn:  amountHuman,
                    amountOut: amountHuman,
                    hash:      tx.hash,
                    receipt,
                    explorerUrl: "https://ledger.sidrachain.com/tx/"
                });

                refreshAll?.();

            } catch (e) {
                console.error("[UNWRAP_ENGINE]", e);
                UNWRAP_MODAL.closeProcessing();
                const raw = e?.reason || e?.message || _t("unwrap_failed_default", "Transaksi ditolak atau gagal diproses.");
                const msg = raw.length > 120 ? _t("unwrap_failed_default", "Transaksi ditolak atau gagal diproses.") : raw;
                await UNWRAP_MODAL.info(msg, { title: _t("unwrap_failed_title", "Unwrap Gagal") });
            }
        }
    };

})();