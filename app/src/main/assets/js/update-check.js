// =====================================
// UPDATE CHECK MODULE (v3, multi-bahasa)
// - Cek otomatis saat app dibuka (maks 1x / 6 jam)
// - Cek manual dari tombol di modal Bagikan Wallet (abaikan throttle & "Nanti")
// Hanya aktif di dalam APK (butuh AndroidWallet.getAppVersion).
// Teks: LANG[CURRENT_LANG] (data/lang.json) -> bawaan di file ini -> English.
// =====================================
(function () {
    "use strict";

    const REPO         = "MasAtos007/SDA-Wallet";
    const API_URL      = "https://api.github.com/repos/" + REPO + "/releases/latest";
    // Tombol "Perbarui" langsung mengunduh APK (hardcode, bukan dari API)
    const DOWNLOAD_URL = "https://github.com/" + REPO + "/releases/latest/download/app-release.apk";
    const CHECK_EVERY  = 6 * 60 * 60 * 1000;   // limit GitHub API 60/jam/IP
    const K_LAST_CHECK = "updateLastCheck";
    const K_KNOWN      = "updateKnownLatest";
    const K_DISMISSED  = "updateDismissedVersion";

    // Cadangan kalau key belum ada di lang.json
    const BUILTIN = {
        en: { update_title: "Update Available",
              update_desc: "SDA Wallet v{version} is now available. Update to get the latest features and fixes.",
              update_btn_now: "Update Now", update_btn_later: "Later",
              update_check_btn: "Check for Updates", update_checking: "Checking...",
              update_latest: "You're on the latest version (v{version})",
              update_check_failed: "Couldn't check for updates. Please check your internet connection.",
              update_only_app: "Update check is only available in the app",
              update_current_version: "Installed version: v{version}" },
        id: { update_title: "Pembaruan Tersedia",
              update_desc: "SDA Wallet v{version} sudah tersedia. Perbarui untuk mendapatkan fitur dan perbaikan terbaru.",
              update_btn_now: "Perbarui Sekarang", update_btn_later: "Nanti",
              update_check_btn: "Cek Pembaruan", update_checking: "Memeriksa...",
              update_latest: "Kamu sudah memakai versi terbaru (v{version})",
              update_check_failed: "Gagal memeriksa pembaruan. Periksa koneksi internet kamu.",
              update_only_app: "Cek pembaruan hanya tersedia di aplikasi",
              update_current_version: "Versi terpasang: v{version}" },
        ar: { update_title: "تحديث متاح",
              update_desc: "الإصدار {version} من SDA Wallet متاح الآن. قم بالتحديث للحصول على أحدث الميزات والإصلاحات.",
              update_btn_now: "حدّث الآن", update_btn_later: "لاحقًا",
              update_check_btn: "التحقق من التحديثات", update_checking: "جارٍ التحقق...",
              update_latest: "أنت تستخدم أحدث إصدار (v{version})",
              update_check_failed: "تعذّر التحقق من التحديثات. يرجى التحقق من اتصالك بالإنترنت.",
              update_only_app: "التحقق من التحديثات متاح فقط داخل التطبيق",
              update_current_version: "الإصدار المثبّت: v{version}" },
        vi: { update_title: "Có bản cập nhật",
              update_desc: "SDA Wallet v{version} đã có. Hãy cập nhật để nhận các tính năng và bản sửa lỗi mới nhất.",
              update_btn_now: "Cập nhật ngay", update_btn_later: "Để sau",
              update_check_btn: "Kiểm tra cập nhật", update_checking: "Đang kiểm tra...",
              update_latest: "Bạn đang dùng phiên bản mới nhất (v{version})",
              update_check_failed: "Không thể kiểm tra cập nhật. Vui lòng kiểm tra kết nối mạng.",
              update_only_app: "Chỉ có thể kiểm tra cập nhật trong ứng dụng",
              update_current_version: "Phiên bản đã cài: v{version}" }
    };

    function lsGet(k)    { try { return localStorage.getItem(k); } catch { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

    function curLang() { return window.CURRENT_LANG || "id"; }

    function txt(key, vars) {
        const code = curLang();
        let s = (window.LANG && window.LANG[code] && window.LANG[code][key])
            || (BUILTIN[code] && BUILTIN[code][key])
            || BUILTIN.en[key]
            || key;
        if (vars) Object.keys(vars).forEach(k => { s = s.split("{" + k + "}").join(vars[k]); });
        return s;
    }

    function toast(msg, type) {
        try { window.showToast?.(msg, type || "info"); } catch {}
    }

    // "v1.2.3" / "155" -> "1.2.3" / "155"
    function normVer(s) {
        const m = String(s || "").match(/\d+(?:\.\d+)*/);
        return m ? m[0] : "";
    }

    // >0 kalau a lebih baru dari b
    function cmpVer(a, b) {
        const pa = normVer(a).split(".").map(Number);
        const pb = normVer(b).split(".").map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const d = (pa[i] || 0) - (pb[i] || 0);
            if (d) return d;
        }
        return 0;
    }

    function currentVersion() {
        if (!window.AndroidWallet?.getAppVersion) return "";
        try { return normVer(window.AndroidWallet.getAppVersion()); } catch { return ""; }
    }

    function openDownload() {
        if (window.AndroidWallet?.openExternal) window.AndroidWallet.openExternal(DOWNLOAD_URL);
        else window.open(DOWNLOAD_URL, "_blank");
    }

    // Ambil versi terbaru dari GitHub. Throw kalau gagal.
    async function fetchLatest() {
        const ctrl  = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        try {
            const res = await fetch(API_URL, {
                headers: { "Accept": "application/vnd.github+json" },
                cache: "no-store",
                signal: ctrl.signal
            });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data   = await res.json();
            const latest = normVer(data.tag_name);
            if (!latest) throw new Error("tag kosong");
            lsSet(K_LAST_CHECK, String(Date.now()));
            lsSet(K_KNOWN, latest);
            return latest;
        } finally {
            clearTimeout(timer);
        }
    }

    // ---------------------------------
    // POPUP
    // ---------------------------------
    function showUpdateModal(latestVer) {

        if (document.getElementById("updateModal")) return;

        const modal = document.createElement("div");
        modal.id  = "updateModal";
        modal.dir = curLang() === "ar" ? "rtl" : "ltr";
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
        modal.querySelector("#updateTitle").textContent    = txt("update_title");
        modal.querySelector("#updateText").textContent     = txt("update_desc", { version: latestVer });
        modal.querySelector("#updateNowBtn").textContent   = txt("update_btn_now");
        modal.querySelector("#updateLaterBtn").textContent = txt("update_btn_later");

        modal.querySelector("#updateNowBtn").onclick = () => {
            openDownload();
            modal.remove();
        };
        modal.querySelector("#updateLaterBtn").onclick = () => {
            lsSet(K_DISMISSED, latestVer);   // cek otomatis tidak mengganggu lagi untuk versi ini
            modal.remove();
        };
    }

    function shouldShow(latest, current) {
        return cmpVer(latest, current) > 0 && lsGet(K_DISMISSED) !== latest;
    }

    // ---------------------------------
    // CEK OTOMATIS (saat app dibuka)
    // ---------------------------------
    async function checkForUpdate(force) {

        const current = currentVersion();
        if (!current) return;   // bukan di APK

        const last = parseInt(lsGet(K_LAST_CHECK) || "0", 10);
        if (!force && Date.now() - last < CHECK_EVERY) {
            // Belum waktunya cek ulang, tapi update yang sudah diketahui & belum di-dismiss tetap ditampilkan
            const known = normVer(lsGet(K_KNOWN));
            if (known && shouldShow(known, current)) showUpdateModal(known);
            return;
        }

        try {
            const latest = await fetchLatest();
            if (shouldShow(latest, current)) showUpdateModal(latest);
        } catch (e) {
            console.warn("Update check gagal:", e?.message || e);   // diam-diam
        }
    }

    // ---------------------------------
    // CEK MANUAL (tombol di modal Bagikan)
    // Selalu cek ke GitHub, abaikan throttle & "Nanti", dan beri umpan balik.
    // ---------------------------------
    let manualBusy = false;

    function setManualBtn(busy) {
        const btn  = document.getElementById("updateCheckBtn");
        const span = document.getElementById("updateCheckBtnText");
        if (btn)  { btn.disabled = busy; btn.style.opacity = busy ? "0.6" : ""; }
        if (span) span.textContent = busy ? txt("update_checking") : txt("update_check_btn");
    }

    async function checkUpdateManual() {
        if (manualBusy) return;

        const current = currentVersion();
        if (!current) {
            toast(txt("update_only_app"), "info");
            return;
        }

        manualBusy = true;
        setManualBtn(true);

        try {
            const latest = await fetchLatest();

            if (cmpVer(latest, current) > 0) {
                lsSet(K_DISMISSED, "");                 // user minta cek -> tampilkan lagi
                window.closeShareAppModal?.();
                showUpdateModal(latest);
            } else {
                toast(txt("update_latest", { version: current }), "success");
            }
        } catch (e) {
            console.warn("Cek update manual gagal:", e?.message || e);
            toast(txt("update_check_failed"), "error");
        } finally {
            manualBusy = false;
            setManualBtn(false);
        }
    }

    // Isi teks "Versi terpasang: vXXX" di modal Bagikan
    function refreshUpdateInfo() {
        const el = document.getElementById("shareAppVersionInfo");
        if (!el) return;
        const current = currentVersion();
        el.textContent = current ? txt("update_current_version", { version: current }) : "";
        setManualBtn(manualBusy);
    }

    window.checkForUpdate     = checkForUpdate;
    window.checkUpdateManual  = checkUpdateManual;
    window.refreshUpdateInfo  = refreshUpdateInfo;

    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => checkForUpdate(false), 3000);
    });

})();
