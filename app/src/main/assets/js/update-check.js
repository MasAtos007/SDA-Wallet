// =====================================
// UPDATE CHECK MODULE
// Cek release terbaru di GitHub, tampilkan popup kalau ada versi baru.
// Hanya aktif di dalam APK (butuh AndroidWallet.getAppVersion).
// =====================================
(function () {

    const REPO         = "MasAtos007/SDA-Wallet";
    const API_URL      = "https://api.github.com/repos/" + REPO + "/releases/latest";
    const RELEASE_URL  = "https://github.com/" + REPO + "/releases/latest";   // hardcode, bukan dari API
    const CHECK_EVERY  = 6 * 60 * 60 * 1000;   // maks 1x per 6 jam (limit GitHub API 60/jam/IP)
    const K_LAST_CHECK = "updateLastCheck";
    const K_DISMISSED  = "updateDismissedVersion";

    function lsGet(k)    { try { return localStorage.getItem(k); } catch { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

    function txt(key, fallback) {
        const lang = (window.LANG && window.LANG[window.CURRENT_LANG]) || {};
        return lang[key] || fallback;
    }

    function parseVer(s) {
        const m = String(s || "").match(/\d+/);
        return m ? parseInt(m[0], 10) : NaN;
    }

    function openRelease() {
        if (window.AndroidWallet?.openExternal) window.AndroidWallet.openExternal(RELEASE_URL);
        else window.open(RELEASE_URL, "_blank");
    }

    function showUpdateModal(latestVer) {

        if (document.getElementById("updateModal")) return;

        const modal = document.createElement("div");
        modal.id = "updateModal";
        modal.dir = window.CURRENT_LANG === "ar" ? "rtl" : "ltr";
        modal.style.cssText = `
            position: fixed; inset: 0; z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            background: rgba(0,0,0,0.6);
        `;

        modal.innerHTML = `
            <div style="background:#14141c; color:#fff; width:88%; max-width:360px;
                        border-radius:16px; padding:22px 20px; text-align:center;
                        border:1px solid #2a2a3a;">
                <div style="font-size:36px; margin-bottom:10px;">
                    <i class="fa-solid fa-circle-arrow-down" style="color:#f5a623;"></i>
                </div>
                <div id="updateTitle" style="font-size:17px; font-weight:600; margin-bottom:8px;"></div>
                <div id="updateText"  style="font-size:14px; color:#aaa; margin-bottom:20px; line-height:1.5;"></div>
                <button id="updateNowBtn" style="width:100%; padding:12px; border:none; border-radius:12px;
                        background:#f5a623; color:#000; font-size:15px; font-weight:600; margin-bottom:8px;"></button>
                <button id="updateLaterBtn" style="width:100%; padding:10px; border:none; border-radius:12px;
                        background:transparent; color:#888; font-size:14px;"></button>
            </div>
        `;

        document.body.appendChild(modal);

        // textContent (bukan innerHTML) untuk semua teks dinamis
        modal.querySelector("#updateTitle").textContent =
            txt("update_title", "Pembaruan Tersedia");
        modal.querySelector("#updateText").textContent =
            txt("update_desc", "SDA Wallet v{version} sudah tersedia. Perbarui untuk mendapatkan fitur dan perbaikan terbaru.")
                .replace("{version}", String(latestVer));
        modal.querySelector("#updateNowBtn").textContent   = txt("update_btn_now",   "Perbarui Sekarang");
        modal.querySelector("#updateLaterBtn").textContent = txt("update_btn_later", "Nanti");

        modal.querySelector("#updateNowBtn").onclick = () => {
            openRelease();
            modal.remove();
        };
        modal.querySelector("#updateLaterBtn").onclick = () => {
            lsSet(K_DISMISSED, String(latestVer));   // jangan ganggu lagi untuk versi ini
            modal.remove();
        };
    }

    async function checkForUpdate(force) {

        // Hanya di dalam APK
        if (!window.AndroidWallet?.getAppVersion) return;

        const current = parseVer(window.AndroidWallet.getAppVersion());
        if (isNaN(current)) return;

        const last = parseInt(lsGet(K_LAST_CHECK) || "0", 10);
        if (!force && Date.now() - last < CHECK_EVERY) {
            // Belum waktunya cek ulang, tapi kalau sudah pernah ketahuan ada update
            // yang belum di-dismiss, jangan dilewatkan
            const known = parseInt(lsGet("updateKnownLatest") || "0", 10);
            if (known > current && String(known) !== lsGet(K_DISMISSED)) showUpdateModal(known);
            return;
        }

        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);

        try {
            const res = await fetch(API_URL, {
                headers: { "Accept": "application/vnd.github+json" },
                signal: ctrl.signal
            });
            if (!res.ok) return;

            const data   = await res.json();
            const latest = parseVer(data.tag_name);
            if (isNaN(latest)) return;

            lsSet(K_LAST_CHECK, String(Date.now()));
            lsSet("updateKnownLatest", String(latest));

            if (latest > current && String(latest) !== lsGet(K_DISMISSED)) {
                showUpdateModal(latest);
            }
        } catch (e) {
            console.warn("Update check gagal:", e?.message || e);   // diam-diam, tidak ganggu user
        } finally {
            clearTimeout(timer);
        }
    }

    window.checkForUpdate = checkForUpdate;

    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => checkForUpdate(false), 3000);
    });

})();
