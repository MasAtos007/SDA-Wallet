// =====================================
// WALLET-SESSION.JS  -  Session Manager
// v5 SECURITY PATCH:
// [SEC-1]  _sessionCache dipindah ke closure private
//          (tidak lagi di window â€” tidak bisa dibaca dApp/WebView)
// [SEC-2]  lockWallet: bersihkan SESSION.signer, address, unlocked
//          dan hapus juga sisa legacy (PK_SESSION, sda_pk_wallet)
// [SEC-3]  switchSessionAccount: ambil PK dari closure, bukan window
// [FIX-5]  switchSessionAccount: guard _sessionCache null
// [FIX-6]  unlockWallet: cache di closure private
// [FIX-7]  lockWallet: bersihkan cache
// [FIX-8]  cegah loop switch <-> dropdown
// [FIX-9]  _onSessionStart tidak dispatch change kalau sudah benar
// [FIX-10] SESSION.accounts: fallback aman kalau index/name undefined
// [FIX-11] refreshAll dipanggil setelah unlock agar saldo langsung fresh
// =====================================

// [SEC-1] Cache vault data di closure private â€” TIDAK di window
// Sehingga dApp/WebView tidak bisa akses via window._sessionCache
let _privateVaultCache = null;

const SESSION = {
    signer:       null,
    address:      null,
    accountIndex: 0,
    accounts:     [],
    hasMnemonic:  false,
    unlocked:     false,
    _timer:       null
};

const AUTO_LOCK_MINUTES = 10;
let _isSwitchingAccount = false;

// -------------------------------------
// UNLOCK
// -------------------------------------
async function unlockWallet(pin) {
    const data = await vault.unlockVault(pin);

    // [SEC-1] Simpan di closure private, TIDAK di window
    _privateVaultCache = data;

    // [FIX-10] Normalisasi accounts â€” handle vault lama yang mungkin
    // tidak punya field index, atau name yang tidak lengkap
    const normalized = (data.accounts || []).map((a, i) => ({
        index:      typeof a.index === "number" ? a.index : i,
        address:    a.address    || "",
        privateKey: a.privateKey || "",
        name:       a.name       || `Account ${i + 1}`,
        source:     a.source     || "unknown"
    }));

    _privateVaultCache.accounts = normalized;

    const idx     = SESSION.accountIndex;
    const account = normalized[idx] || normalized[0];
    if (!account?.privateKey) throw new Error("Data wallet tidak valid");

    const prov = window.provider ||
        new ethers.providers.JsonRpcProvider(window.RPC || "https://node.sidrachain.com/");

    SESSION.signer       = new ethers.Wallet(account.privateKey, prov);
    SESSION.address      = account.address;
    SESSION.accountIndex = account.index;

    // Simpan accounts tanpa privateKey ke SESSION (aman untuk UI)
    SESSION.accounts = normalized.map(a => ({
        index:   a.index,
        address: a.address,
        name:    a.name,
        source:  a.source
        // privateKey TIDAK disimpan di SESSION.accounts
    }));

    SESSION.hasMnemonic = data.hasMnemonic || !!data.mnemonic;
    SESSION.unlocked    = true;

    // [SEC-2] Bersihkan storage lama yang mungkin menyimpan PK plaintext
    _cleanLegacyStorage();

    _startAutoLock();
    _onSessionStart();

    // [FIX-11] Refresh saldo setelah unlock â€” delay agar UI render dulu
    setTimeout(() => {
        if (typeof refreshAll === "function") refreshAll();
    }, 500);

    return true;
}

window.unlockWallet = unlockWallet;

// -------------------------------------
// LOCK
// [SEC-2] Bersihkan semua: SESSION, closure cache, sisa legacy
// -------------------------------------
function lockWallet() {
    SESSION.signer       = null;
    SESSION.address      = null;
    SESSION.unlocked     = false;
    SESSION.accounts     = [];

    // [SEC-1] Bersihkan closure private cache
    _privateVaultCache   = null;

    // [SEC-2] Pastikan tidak ada sisa di window (defensif)
    if (typeof window !== "undefined") {
        delete window._sessionCache;
    }

    _clearAutoLock();
    _onSessionEnd();
}

window.lockWallet = lockWallet;

// -------------------------------------
// SWITCH ACCOUNT
// [FIX-8]  Flag _isSwitchingAccount cegah loop
// [SEC-3]  Ambil PK dari closure private, bukan window
// -------------------------------------
async function switchSessionAccount(index) {
    if (!SESSION.unlocked) {
        showToast?.("Unlock wallet dulu", "error");
        return;
    }

    // [SEC-3] Gunakan closure private, bukan window._sessionCache
    const cache = _privateVaultCache;
    if (!cache?.accounts) {
        showToast?.("Sesi berakhir, silakan unlock ulang", "error");
        showPINUnlockScreen?.();
        return;
    }

    const account = cache.accounts[index];
    if (!account?.address) {
        showToast?.("Account tidak ditemukan", "error");
        return;
    }

    const prov = window.provider ||
        new ethers.providers.JsonRpcProvider(window.RPC || "https://node.sidrachain.com/");

    // PK diambil dari closure private â€” tidak pernah lewat window
    SESSION.signer       = new ethers.Wallet(account.privateKey, prov);
    SESSION.address      = account.address;
    SESSION.accountIndex = index;

    if (!_isSwitchingAccount) {
        _isSwitchingAccount = true;

        const wallets   = getWallets?.() || [];
        const walletIdx = wallets.findIndex(
            w => w.address?.toLowerCase() === account.address.toLowerCase()
        );

        if (walletIdx !== -1) {
            localStorage.setItem("selectedWalletIndex", String(walletIdx));
            const sel = document.getElementById("walletSelect");
            if (sel && sel.value !== String(walletIdx)) {
                sel.value = String(walletIdx);
                sel.dispatchEvent(new Event("change"));
            }
        }

        _isSwitchingAccount = false;
    }

    updateActiveWalletName?.();
    updateAddressUI?.();
    loadBalance?.();
    renderSessionStatus?.();

    setTimeout(() => {
        if (typeof refreshAll === "function") refreshAll();
    }, 150);
}

window.switchSessionAccount = switchSessionAccount;
window._isSwitchingAccount  = false;

// -------------------------------------
// AUTO-LOCK TIMER
// -------------------------------------
function _startAutoLock() {
    _clearAutoLock();
    SESSION._timer = setTimeout(() => {
        lockWallet();
        showToast?.("Wallet otomatis terkunci", "info");
    }, AUTO_LOCK_MINUTES * 60 * 1000);
}

function _clearAutoLock() {
    if (SESSION._timer) { clearTimeout(SESSION._timer); SESSION._timer = null; }
}

function _resetAutoLock() {
    if (SESSION.unlocked) _startAutoLock();
}

document.addEventListener("touchstart", _resetAutoLock, { passive: true });
document.addEventListener("click",      _resetAutoLock);

// -------------------------------------
// REQUIRE SIGNER
// -------------------------------------
function requireSigner() {
    if (!SESSION.unlocked || !SESSION.signer) {
        if (typeof showPINUnlockScreen === "function") showPINUnlockScreen();
        else if (typeof openPKModal    === "function") openPKModal();
        throw new Error("Wallet terkunci. Masukkan PIN.");
    }
    return SESSION.signer;
}

// Alias backward-compat â€” requirePK dulu dipakai di wallet-core.js
function requirePK()         { return requireSigner(); }
function getSessionAddress() { return SESSION.address || null; }
function isWalletUnlocked()  { return SESSION.unlocked && !!SESSION.signer; }

// -------------------------------------
// CLEANUP LEGACY STORAGE
// [SEC-2] Hapus semua sisa PK plaintext dari versi lama
// Dipanggil saat unlock dan saat DOMContentLoaded
// -------------------------------------
function _cleanLegacyStorage() {
    // 1. Hapus key lama yang menyimpan PK langsung
    ["PK_SESSION", "sda_pk_wallet"].forEach(key => {
        if (localStorage.getItem(key)) {
            localStorage.removeItem(key);
            console.warn("[Security] Dihapus legacy key:", key);
        }
    });

    // 2. Bersihkan field privateKey dari wallet list kalau ada sisa lama
    try {
        // storage.js menyimpan wallets di key tertentu â€” cari key-nya
        const candidates = Object.keys(localStorage).filter(k =>
            k !== "selectedWalletIndex" &&
            k !== "sidra_vault_v1" &&
            k !== "PK_DELETED" &&
            k !== "sidra_lock_state"
        );

        for (const key of candidates) {
            const raw = localStorage.getItem(key);
            if (!raw || !raw.includes('"privateKey"')) continue;

            try {
                const parsed = JSON.parse(raw);
                if (!Array.isArray(parsed)) continue;

                let changed = false;
                parsed.forEach(w => {
                    if (w && typeof w === "object" && w.privateKey) {
                        delete w.privateKey;
                        changed = true;
                    }
                });

                if (changed) {
                    localStorage.setItem(key, JSON.stringify(parsed));
                    console.warn("[Security] Dibersihkan privateKey dari wallet list:", key);
                }
            } catch {
                // bukan JSON array â€” skip
            }
        }
    } catch (e) {
        console.warn("[Security] Gagal bersihkan wallet list:", e);
    }
}

// -------------------------------------
// SESSION HOOKS
// -------------------------------------
function _onSessionStart() {
    // Unlock berhasil: reset konteks PIN, tampilkan kembali bottom nav
    window._pinContext = null;
    setBottomNavHidden(false);
    setTimeout(() => {
        const dot = document.getElementById("navWalletDot");
        if (dot) {
            dot.style.display = "block";
            dot.style.background = "#00cc66";
        }
    }, 400);

    if (SESSION.address && !_isSwitchingAccount) {
        const wallets = getWallets?.() || [];
        const idx     = wallets.findIndex(
            w => w.address?.toLowerCase() === SESSION.address.toLowerCase()
        );
        if (idx !== -1) {
            localStorage.setItem("selectedWalletIndex", String(idx));
            const sel = document.getElementById("walletSelect");
            if (sel && sel.value !== String(idx)) {
                sel.value = String(idx);
                sel.dispatchEvent(new Event("change"));
            }
        }
    }

    updatePKStatusBar?.();
    updateActiveWalletName?.();
    updateAddressUI?.();
    loadBalance?.();
    renderSessionStatus?.();
}

function _onSessionEnd() {
    // Set konteks = lock, sembunyikan bottom nav
    window._pinContext = "lock";
    setBottomNavHidden(true);
    const dot = document.getElementById("navWalletDot");
    if (dot) dot.style.display = "none";

    updatePKStatusBar?.();
    renderSessionStatus?.();
    setTimeout(() => {
        if (vault.exists()) showPINUnlockScreen?.();
    }, 100);
}

// -------------------------------------
// RENDER STATUS BAR
// -------------------------------------
function renderSessionStatus() {
    const bar  = document.getElementById("pkStatusBar");
    const text = bar?.querySelector(".pk-text");
    const dot  = bar?.querySelector(".pk-dot");
    if (!bar) return;

    if (!vault.exists()) { bar.style.display = "none"; return; }

    bar.style.display = "flex";
    bar.onclick = () => {
        if (SESSION.unlocked) showWalletManageScreen?.();
        else                  showPINUnlockScreen?.();
    };

    if (!SESSION.unlocked) {
        if (text) text.innerHTML       = '<i class="fa-solid fa-lock" style="margin-right:5px;"></i>Terkunci';
        if (dot)  dot.style.background = "#ff3b3b";
        bar.style.background           = "#3a1a1a";
    } else {
        if (text) text.innerHTML       = '<i class="fa-solid fa-lock-open" style="margin-right:5px;"></i>Aktif';
        if (dot)  dot.style.background = "#00ff88";
        bar.style.background           = "#1a1a1a";
    }
}

// -------------------------------------
// BACKWARD COMPAT SHIM
// WALLET_SESSION dibaca oleh wallet-core.js dan kode lama
// Shim ini tidak expose privateKey
// -------------------------------------
Object.defineProperty(window, "WALLET_SESSION", {
    get() {
        return {
            pkWallet:      SESSION.signer,
            mode:          SESSION.unlocked ? "pk" : "watch",
            activeAddress: SESSION.address,
            pkLocked:      !SESSION.unlocked,
            pinCreated:    vault.exists()
        };
    },
    configurable: true
});

// -------------------------------------
// INIT
// -------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    // Bersihkan storage lama saat startup (sebelum apapun)
    _cleanLegacyStorage();
    renderSessionStatus();
});

// -------------------------------------
// PUBLIK API UNTUK UPDATE PRIVATE CACHE
// Dipanggil oleh ui-onboarding.js saat tambah account baru
// agar switchSessionAccount bisa langsung pakai signer tanpa re-unlock
// [SEC-1] Ini satu-satunya cara luar untuk insert ke _privateVaultCache
// -------------------------------------
function _addAccountToPrivateCache(accountData) {
    if (!_privateVaultCache) {
        // Cache belum ada (seharusnya tidak terjadi kalau wallet unlocked)
        console.warn("[wallet-session] _addAccountToPrivateCache: cache null, skip");
        return;
    }
    if (!accountData?.address || !accountData?.privateKey) {
        console.warn("[wallet-session] _addAccountToPrivateCache: data tidak lengkap");
        return;
    }

    _privateVaultCache.accounts = _privateVaultCache.accounts || [];

    // Cek duplikat
    const exists = _privateVaultCache.accounts.some(
        a => a.address?.toLowerCase() === accountData.address.toLowerCase()
    );
    if (!exists) {
        _privateVaultCache.accounts.push(accountData);
    }
}