// =====================================
// PERMISSION-MANAGER.JS
// Mengelola dApp permission (connect wallet)
// Persistent di localStorage
// =====================================
//
// STRUKTUR DATA:
// {
//   "https://www.sidrachain.com": {
//     origin:      "https://www.sidrachain.com",
//     name:        "SidraChain",
//     grantedAt:   1234567890,
//     accounts:    ["0x..."],
//     trusted:     true   // true = Sidra official, tidak perlu konfirmasi ulang
//   }
// }
// =====================================

(function () {
    "use strict";

    const PERM_STORAGE_KEY = "sidra_permissions_v1";

    // Origin resmi Sidra - auto-trusted (tidak perlu pop-up berulang)
    const SIDRA_TRUSTED_ORIGINS = [
        "https://www.sidrachain.com",
        "https://sidrachain.com",
        "https://dex.sidrachain.com",
        "https://app.sidrachain.com",
        "https://kycport.com"
    ];

    // ─────────────────────────────────────────
    // LOAD / SAVE
    // ─────────────────────────────────────────
    function _load() {
        try {
            return JSON.parse(localStorage.getItem(PERM_STORAGE_KEY)) || {};
        } catch {
            return {};
        }
    }

    function _save(data) {
        localStorage.setItem(PERM_STORAGE_KEY, JSON.stringify(data));
    }

    // ─────────────────────────────────────────
    // PUBLIC API
    // ─────────────────────────────────────────
    const permissionManager = {

        // Cek apakah origin sudah punya izin
        hasPermission(origin) {
            if (!origin || origin === "unknown") return false;
            const perms = _load();
            return !!perms[origin];
        },

        // Grant izin ke origin
        grantPermission(origin, siteName, accounts) {
            if (!origin) return;
            const perms = _load();
            perms[origin] = {
                origin,
                name:      siteName || _extractName(origin),
                grantedAt: Date.now(),
                accounts:  accounts || [],
                trusted:   SIDRA_TRUSTED_ORIGINS.includes(origin)
            };
            _save(perms);
        },

        // Cabut izin
        revokePermission(origin) {
            const perms = _load();
            delete perms[origin];
            _save(perms);
        },

        // Cabut semua
        revokeAll() {
            _save({});
        },

        // Ambil semua permission (untuk ditampilkan di settings)
        getAll() {
            return Object.values(_load());
        },

        // Cek apakah origin adalah Sidra trusted
        isTrusted(origin) {
            return SIDRA_TRUSTED_ORIGINS.includes(origin);
        },

        // Update accounts di permission (setelah switch account)
        updateAccounts(origin, accounts) {
            const perms = _load();
            if (perms[origin]) {
                perms[origin].accounts = accounts;
                _save(perms);
            }
        },

        // Ambil info site dari permission
        getSiteInfo(origin) {
            const perms = _load();
            return perms[origin] || null;
        }
    };

    // ─────────────────────────────────────────
    // HELPER
    // ─────────────────────────────────────────
    function _extractName(origin) {
        try {
            return new URL(origin).hostname.replace("www.", "");
        } catch {
            return origin;
        }
    }

    // ─────────────────────────────────────────
    // EXPOSE GLOBAL
    // ─────────────────────────────────────────
    window.permissionManager = permissionManager;

})();
