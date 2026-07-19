// =====================================
// WALLET CORE  -  PK Global System
// SECURITY PATCH + CLEANUP:
// - Modal HTML lama dihapus (pakai ui-onboarding.js)
// - Tombol gembok tetap ada â†’ openPKModal()
// - PIN logic dihandle ui-onboarding.js
// - [SEC-1] savePKSession: tidak simpan pk plaintext
// - [SEC-2] syncPKToWalletSystem: tidak simpan privateKey
// - [SEC-3] restorePK: hanya restore state UI
// =====================================

window.WALLET_SESSION = window.WALLET_SESSION || {
    pkWallet:      null,
    mode:          "watch",
    activeAddress: null,
    pkLocked:      false,
    pinHash:       null,
    pinCreated:    false
};

window.PK_STORAGE_KEY  = window.PK_STORAGE_KEY  || "sda_pk_wallet";
window.__PK_RESTORING  = window.__PK_RESTORING  || false;

window.pkProvider = window.pkProvider || new ethers.providers.JsonRpcProvider(
    window.RPC || "https://node.sidrachain.com"
);


// =====================================
// INIT
// =====================================
document.addEventListener("DOMContentLoaded", () => {
    restorePK();
    updatePKStatusBar();
});


// =====================================
// UNLOCK  -  import PK dari input (onboarding lama)
// =====================================
function unlockPK() {
    const pk = document.getElementById("globalPKInput")?.value?.trim();
    if (!pk) return showToast?.(LANG[CURRENT_LANG]?.err_pk_empty || "Private key kosong", "error");

    try {
        const wallet = new ethers.Wallet(pk, window.pkProvider);

        window.WALLET_SESSION.pkWallet      = wallet;
        window.WALLET_SESSION.activeAddress = wallet.address;
        window.WALLET_SESSION.mode          = "pk";

        if (typeof SESSION !== "undefined") {
            SESSION.signer   = wallet;
            SESSION.address  = wallet.address;
            SESSION.unlocked = true;
        }

        localStorage.removeItem("PK_DELETED");

        if (!window.__PK_RESTORING) {
            syncPKToWalletSystem(wallet.address);
        }

        savePKSession();
        updatePKStatusBar();
        showToast?.(LANG[CURRENT_LANG]?.toast_wallet_imported || "Wallet imported", "success");

    } catch {
        showToast?.(LANG[CURRENT_LANG]?.err_pk_invalid || "Private Key tidak valid", "error");
    }
}


// =====================================
// LOCK
// Dipanggil dari tombol "Kunci Wallet" di showWalletManageScreen
// =====================================
function lockPK() {
    const s = window.WALLET_SESSION;
    if (!s.pkWallet) return;

    s.pkLocked = true;

    if (typeof SESSION !== "undefined") {
        SESSION.signer   = null;
        SESSION.address  = null;
        SESSION.unlocked = false;
    }
    if (typeof window !== "undefined") delete window._sessionCache;

    savePKSession();
    updatePKStatusBar();
    showToast?.(LANG[CURRENT_LANG]?.toast_wallet_locked || "Wallet locked", "success");
}


// =====================================
// RESET WALLET
// =====================================
function resetPKWallet() {
    showConfirm?.(
        LANG[CURRENT_LANG]?.confirm_reset_pk_warning || "PERINGATAN: Semua wallet PK akan dihapus permanen. Pastikan kamu sudah backup private key. Lanjutkan?",
        () => {
            _removePKFromWalletList();
            resetPKState();
            localStorage.setItem("PK_DELETED", "1");

            // Hapus vault juga kalau ada
            if (typeof vault !== "undefined") vault.destroy?.();

            renderWallets?.();
            renderSavedAddresses?.();
            updateActiveWalletName?.();
            loadBalance?.();

            updatePKStatusBar();
            showToast?.(LANG[CURRENT_LANG]?.toast_pk_deleted || "Wallet PK dihapus", "success");

            // Kembali ke welcome screen
            showWelcomeScreen?.();
        }
    );
}


// =====================================
// DELETE PK WALLET
// =====================================
function deletePKWallet() {
    showConfirm?.(LANG[CURRENT_LANG]?.confirm_delete_pk || "Hapus wallet PK ini?", () => {
        _removePKFromWalletList();
        resetPKState();
        localStorage.setItem("PK_DELETED", "1");

        if (typeof vault !== "undefined") vault.destroy?.();

        renderWallets?.();
        renderSavedAddresses?.();
        updateActiveWalletName?.();
        loadBalance?.();

        updatePKStatusBar();
        showToast?.(LANG[CURRENT_LANG]?.toast_pk_deleted || "PK wallet dihapus", "success");
        showWelcomeScreen?.();
    });
}


// =====================================
// HAPUS PK DARI WALLET LIST (internal)
// =====================================
function _removePKFromWalletList() {
    const addr = window.WALLET_SESSION.activeAddress?.toLowerCase();
    if (!addr) return;

    let wallets = getWallets?.() || [];
    wallets     = wallets.filter(w => w.address?.toLowerCase() !== addr);
    setWallets?.(wallets);

    const select = document.getElementById("walletSelect");
    if (select) {
        select.value = "0";
        localStorage.setItem("selectedWalletIndex", "0");
        select.dispatchEvent(new Event("change"));
    }
}


// =====================================
// RESET STATE + STORAGE
// =====================================
function resetPKState() {
    window.WALLET_SESSION.pkWallet      = null;
    window.WALLET_SESSION.pkLocked      = false;
    window.WALLET_SESSION.pinHash       = null;
    window.WALLET_SESSION.pinCreated    = false;
    window.WALLET_SESSION.activeAddress = null;
    window.WALLET_SESSION.mode          = "watch";

    if (typeof SESSION !== "undefined") {
        SESSION.signer   = null;
        SESSION.address  = null;
        SESSION.unlocked = false;
    }

    localStorage.removeItem("PK_SESSION");
    localStorage.removeItem(window.PK_STORAGE_KEY);
    localStorage.removeItem("sidra_lock_state");

    updatePKStatusBar();
}


// =====================================
// STATUS BAR  -  tombol gembok di header
// Klik â†’ buka Wallet Manager atau PIN unlock
// =====================================
function updatePKStatusBar() {
    // Delegasi ke wallet-session.js kalau ada
    if (typeof renderSessionStatus === "function") {
        renderSessionStatus();
        return;
    }

    const bar = document.getElementById("pkStatusBar");
    if (!bar) return;

    const s    = window.WALLET_SESSION;
    const text = bar.querySelector(".pk-text");
    const dot  = bar.querySelector(".pk-dot");

    if (!s.pkWallet) { bar.style.display = "none"; return; }

    bar.style.display = "flex";
    bar.onclick = openPKModal;

    if (s.pkLocked) {
        if (text) text.innerHTML = '<i class="fa-solid fa-lock" style="margin-right:5px;"></i>Locked';
        if (dot)  dot.style.background = "#ff3b3b";
        bar.style.background           = "#3a1a1a";
        return;
    }

    if (text) text.innerHTML = '<i class="fa-solid fa-lock-open" style="margin-right:5px;"></i>' + (LANG[CURRENT_LANG]?.account_active_badge || 'Aktif');
    if (dot)  dot.style.background = "#00ff88";
    bar.style.background           = "#1a1a1a";
}

function updatePKUI() { updatePKStatusBar(); }


// =====================================
// OPEN PK MODAL
// Tombol gembok di header â†’ buka ui-onboarding screen
// =====================================
function openPKModal() {
    if (typeof SESSION !== "undefined" && SESSION.unlocked) {
        showWalletManageScreen?.();
        window.setBottomNavActive?.("navWallet");
    } else {
        showPINUnlockScreen?.();
    }
    window.syncNavDot?.();
}

function closePKModal() {
    // Tidak ada modal lama â€” tutup onboarding overlay kalau terbuka
    const overlay = document.getElementById("onboardingOverlay");
    if (overlay) overlay.style.display = "none";
}


// =====================================
// REQUIRE PK  -  guard transaksi
// =====================================
function requirePK() {
    // Cek SESSION baru (wallet-session.js) dulu
    if (typeof SESSION !== "undefined" && SESSION.unlocked && SESSION.signer) {
        return SESSION.signer;
    }

    // Fallback sistem lama
    const s = window.WALLET_SESSION;
    if (!s.pkWallet || s.pkWallet._locked) {
        openPKModal();
        throw new Error(LANG[CURRENT_LANG]?.err_wallet_not_imported || "Wallet belum diimport");
    }
    if (s.pkLocked) {
        openPKModal();
        throw new Error(LANG[CURRENT_LANG]?.err_wallet_locked_core || "Wallet terkunci");
    }
    return s.pkWallet;
}

function requireSigner() { return requirePK(); }


// =====================================
// SEND TX
// =====================================
async function sendWithPK(to, amount, tokenAddress = null) {
    const wallet = requirePK();

    try {
        const txSentPrefix = LANG[CURRENT_LANG]?.toast_tx_sent || "TX sent: ";
        if (!tokenAddress) {
            const tx = await wallet.sendTransaction({
                to,
                value: ethers.utils.parseEther(amount)
            });
            showToast?.(txSentPrefix + tx.hash, "success");
            return tx;
        }

        const abi      = ["function transfer(address to, uint256 amount) returns (bool)"];
        const contract = new ethers.Contract(tokenAddress, abi, wallet);
        const tx       = await contract.transfer(to, ethers.utils.parseUnits(amount, 18));

        showToast?.(txSentPrefix + tx.hash, "success");
        return tx;

    } catch (err) {
        console.error(err);
        showToast?.(LANG[CURRENT_LANG]?.err_tx_failed || "Transaction failed", "error");
    }
}


// =====================================
// GET BALANCE
// =====================================
async function getPKBalance(tokenAddress = null) {
    const address = (typeof SESSION !== "undefined" && SESSION.address)
        ? SESSION.address
        : window.WALLET_SESSION.activeAddress;

    if (!address) return null;

    try {
        if (!tokenAddress) {
            const bal = await window.pkProvider.getBalance(address);
            return ethers.utils.formatEther(bal);
        }

        const abi = [
            "function balanceOf(address) view returns (uint256)",
            "function decimals() view returns (uint8)"
        ];
        const contract = new ethers.Contract(tokenAddress, abi, window.pkProvider);
        const [bal, dec] = await Promise.all([
            contract.balanceOf(address),
            contract.decimals().catch(() => 18)
        ]);

        return ethers.utils.formatUnits(bal, dec);
    } catch (err) {
        console.warn("getPKBalance error:", err);
        return null;
    }
}


// =====================================
// GET / SET ACTIVE WALLET
// =====================================
function getActiveWallet() {
    if (typeof SESSION !== "undefined" && SESSION.signer) return SESSION.signer;
    return window.WALLET_SESSION.pkWallet;
}

function setPKState(wallet) {
    window.WALLET_SESSION.pkWallet      = wallet;
    window.WALLET_SESSION.mode          = "pk";
    window.WALLET_SESSION.activeAddress = wallet?.address || null;
}


// =====================================
// SESSION SAVE
// [SEC-1] TIDAK simpan pk plaintext
// =====================================
function savePKSession() {
    localStorage.setItem("PK_SESSION", JSON.stringify({
        // pk: DIHAPUS
        address:    window.WALLET_SESSION.activeAddress,
        locked:     window.WALLET_SESSION.pkLocked,
        pinHash:    window.WALLET_SESSION.pinHash,
        pinCreated: window.WALLET_SESSION.pinCreated
    }));
}

function loadPKSession() {
    try   { return JSON.parse(localStorage.getItem("PK_SESSION")); }
    catch { return null; }
}


// =====================================
// RESTORE
// [SEC-3] Hanya restore state UI, tidak restore PK
// =====================================
function restorePK() {
    if (localStorage.getItem("PK_DELETED") === "1") return;

    // Kalau vault baru ada, wallet-session.js yang handle
    if (typeof vault !== "undefined" && vault.exists()) return;

    const data = loadPKSession();
    if (!data || !data.address || !data.pinCreated) return;

    // Restore state UI agar status bar tampil benar
    window.WALLET_SESSION.activeAddress = data.address;
    window.WALLET_SESSION.pkLocked      = true;
    window.WALLET_SESSION.pinCreated    = data.pinCreated || false;
    window.WALLET_SESSION.pinHash       = data.pinHash    || null;
    window.WALLET_SESSION.mode          = "pk";

    // Dummy object agar status bar tahu ada wallet
    window.WALLET_SESSION.pkWallet = { address: data.address, _locked: true };

    updatePKStatusBar();
}


// =====================================
// SYNC PK KE WALLET LIST
// [SEC-2] Tidak simpan privateKey
// =====================================
function syncPKToWalletSystem(address) {
    let wallets = getWallets?.() || [];
    const addr  = address.toLowerCase();
    const idx   = wallets.findIndex(w => w.address?.toLowerCase() === addr);

    if (idx === -1) {
        wallets.push({ address, name: "Main Wallet (PK)", type: "pk" });
    } else {
        const existing = wallets[idx];
        delete existing.privateKey;
        wallets[idx] = { ...existing, type: "pk" };
    }

    setWallets?.(wallets);
    window.WALLET_SESSION.activeAddress = address;

    const newIndex = wallets.findIndex(w => w.address.toLowerCase() === addr);
    const select   = document.getElementById("walletSelect");

    if (select && newIndex !== -1) {
        select.value = String(newIndex);
        localStorage.setItem("selectedWalletIndex", String(newIndex));
        if (!window._isSwitchingAccount) {
            select.dispatchEvent(new Event("change"));
        }
    }

    renderWallets?.();
    renderSavedAddresses?.();
    updateActiveWalletName?.();
    loadBalance?.();
}


// =====================================
// PIN HASH (SHA-256)
// Masih dipakai oleh wallet-session.js migrasi lama
// =====================================
async function hashPIN(pin) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}