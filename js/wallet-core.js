// =====================================
// WALLET CORE â€” PK Global System
// State machine:
// EMPTY â†’ ACTIVE_NO_PIN â†’ ACTIVE_PINSET â†’ LOCKED
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
    "https://node.sidrachain.com"
);


// =====================================
// STATE HELPER
// =====================================
function getPKState() {
    const s = window.WALLET_SESSION;
    if (!s.pkWallet)  return "EMPTY";
    if (s.pkLocked)   return "LOCKED";
    if (s.pinCreated) return "ACTIVE_PINSET";
    return "ACTIVE_NO_PIN";
}


// =====================================
// INIT
// =====================================
document.addEventListener("DOMContentLoaded", () => {
    restorePK();
    setTimeout(renderPKModal, 80);
    updatePKStatusBar();
});


// =====================================
// UNLOCK â€” import PK dari input
// =====================================
function unlockPK() {
    const pk = document.getElementById("globalPKInput")?.value?.trim();
    if (!pk) return showToast?.("Private key kosong", "error");

    try {
        const wallet = new ethers.Wallet(pk, window.pkProvider);

        window.WALLET_SESSION.pkWallet      = wallet;
        window.WALLET_SESSION.activeAddress = wallet.address;
        window.WALLET_SESSION.mode          = "pk";

        localStorage.removeItem("PK_DELETED");

        if (!window.__PK_RESTORING) {
            syncPKToWalletSystem(pk, wallet.address);
        }

        savePKSession();
        renderPKModal();
        updatePKStatusBar();
        showToast?.("Wallet imported", "success");

    } catch {
        showToast?.("Private Key tidak valid", "error");
    }
}


// =====================================
// LOCK â€” set pin dulu kalau belum ada
// =====================================
function lockPK() {
    const s = window.WALLET_SESSION;
    if (!s.pkWallet) return;

    if (!s.pinCreated) {
        renderPKModal("SET_PIN_BEFORE_LOCK");
        return;
    }

    s.pkLocked = true;
    savePKSession();
    renderPKModal();
    updatePKStatusBar();
    showToast?.("Wallet locked", "success");
}


// =====================================
// UNLOCK WITH PIN
// =====================================
async function unlockWithPIN() {
    const pin = document.getElementById("pinUnlockInput")?.value?.trim();
    if (!pin) return showToast?.("Masukkan PIN", "error");

    const hash = await hashPIN(pin);
    if (hash !== window.WALLET_SESSION.pinHash) {
        return showToast?.("PIN salah", "error");
    }

    window.WALLET_SESSION.pkLocked = false;
    savePKSession();
    renderPKModal();
    updatePKStatusBar();
    showToast?.("Wallet unlocked", "success");
}


// =====================================
// SET PIN + LANGSUNG LOCK
// =====================================
async function confirmSetPIN() {
    const pin1 = document.getElementById("pinNewInput")?.value?.trim();
    const pin2 = document.getElementById("pinConfirmInput")?.value?.trim();

    if (!pin1 || pin1.length < 4) return showToast?.("PIN minimal 4 karakter", "error");
    if (pin1 !== pin2)            return showToast?.("PIN tidak cocok", "error");

    window.WALLET_SESSION.pinHash    = await hashPIN(pin1);
    window.WALLET_SESSION.pinCreated = true;
    window.WALLET_SESSION.pkLocked   = true;

    savePKSession();
    renderPKModal();
    updatePKStatusBar();
    showToast?.("PIN disimpan, wallet terkunci", "success");
}


// =====================================
// CHANGE PIN
// =====================================
async function changePIN() {
    const oldPin  = document.getElementById("pinOldInput")?.value?.trim();
    const newPin1 = document.getElementById("pinNewInput")?.value?.trim();
    const newPin2 = document.getElementById("pinConfirmInput")?.value?.trim();

    if (!oldPin) return showToast?.("Masukkan PIN lama", "error");

    const oldHash = await hashPIN(oldPin);
    if (oldHash !== window.WALLET_SESSION.pinHash) {
        return showToast?.("PIN lama salah", "error");
    }

    if (!newPin1 || newPin1.length < 4) return showToast?.("PIN baru minimal 4 karakter", "error");
    if (newPin1 !== newPin2)            return showToast?.("PIN baru tidak cocok", "error");

    window.WALLET_SESSION.pinHash = await hashPIN(newPin1);

    savePKSession();
    renderPKModal();
    showToast?.("PIN berhasil diubah", "success");
}


// =====================================
// RESET WALLET
// =====================================
function resetPKWallet() {
    showConfirm?.(
        "PERINGATAN: Semua wallet PK akan dihapus permanen. Pastikan kamu sudah backup private key. Lanjutkan?",
        () => {
            _removePKFromWalletList();
            resetPKState();
            localStorage.setItem("PK_DELETED", "1");

            renderWallets?.();
            renderSavedAddresses?.();
            updateActiveWalletName?.();
            loadBalance?.();

            renderPKModal();
            updatePKStatusBar();
            showToast?.("Wallet PK dihapus", "success");
        }
    );
}


// =====================================
// DELETE PK WALLET
// FIX: hapus juga dari wallet list + select
// =====================================
function deletePKWallet() {
    showConfirm?.("Hapus wallet PK ini?", () => {
        _removePKFromWalletList();
        resetPKState();
        localStorage.setItem("PK_DELETED", "1");

        renderWallets?.();
        renderSavedAddresses?.();
        updateActiveWalletName?.();
        loadBalance?.();

        renderPKModal();
        updatePKStatusBar();
        showToast?.("PK wallet dihapus", "success");
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

    // kalau wallet yang dihapus sedang dipilih, pindah ke index 0
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

    localStorage.removeItem("PK_SESSION");
    localStorage.removeItem(window.PK_STORAGE_KEY);

    updatePKStatusBar();
}


// =====================================
// RENDER MODAL â€” sesuai state
// =====================================
function renderPKModal(forceView) {
    const body = document.getElementById("pkModalBody");
    if (!body) return;

    const state = forceView || getPKState();
    const s     = window.WALLET_SESSION;

    const shortAddr = s.activeAddress
        ? s.activeAddress.slice(0, 8) + "..." + s.activeAddress.slice(-6)
        : "";

    // tabs hanya tampil saat aktif dan tidak locked
    const tabs = document.getElementById("pkModeTabs");
    if (tabs) {
        tabs.style.display =
            (state === "ACTIVE_NO_PIN" || state === "ACTIVE_PINSET")
                ? "flex" : "none";
    }

    // ambil mode dari tab aktif
    const modeEl      = document.getElementById("pkModeLabel");
    const currentMode = modeEl?.dataset.mode || "pk";

    body.innerHTML = _buildModalHTML(state, currentMode, shortAddr);
    _updateModeTab(currentMode);
}


// =====================================
// BUILD HTML PER STATE
// =====================================
function _buildModalHTML(state, mode, shortAddr) {

    // EMPTY
    if (state === "EMPTY") {
        return `
            <div class="pk-section">
                <div class="pk-hint">
                    <i class="fa-solid fa-circle-info"></i>
                    Belum ada wallet aktif. Import private key untuk mulai bertransaksi.
                </div>
                <div class="pk-input-wrap">
                    <i class="fa-solid fa-key"></i>
                    <input id="globalPKInput" type="password" placeholder="Paste Private Key...">
                </div>
                <button class="pk-btn-primary" onclick="unlockPK()">
                    <i class="fa-solid fa-file-import"></i> Import Private Key
                </button>
            </div>`;
    }

    // LOCKED
    if (state === "LOCKED") {
        return `
            <div class="pk-section">
                <div class="pk-status-badge locked">
                    <i class="fa-solid fa-lock"></i>
                    Wallet Terkunci
                    <span class="pk-addr">${shortAddr}</span>
                </div>
                <div class="pk-input-wrap">
                    <i class="fa-solid fa-shield-halved"></i>
                    <input id="pinUnlockInput" type="password" placeholder="Masukkan PIN...">
                </div>
                <button class="pk-btn-primary" onclick="unlockWithPIN()">
                    <i class="fa-solid fa-lock-open"></i> Unlock Wallet
                </button>
                <button class="pk-btn-danger mt8" onclick="resetPKWallet()">
                    <i class="fa-solid fa-rotate-left"></i> Lupa PIN? Reset Wallet
                </button>
            </div>`;
    }

    // SET PIN SEBELUM LOCK
    if (state === "SET_PIN_BEFORE_LOCK") {
        return `
            <div class="pk-section">
                <div class="pk-hint">
                    <i class="fa-solid fa-circle-info"></i>
                    Buat PIN untuk mengunci wallet. PIN dibutuhkan setiap kali unlock.
                </div>
                <div class="pk-input-wrap">
                    <i class="fa-solid fa-lock"></i>
                    <input id="pinNewInput" type="password" placeholder="PIN baru (min 4 karakter)">
                </div>
                <div class="pk-input-wrap">
                    <i class="fa-solid fa-lock"></i>
                    <input id="pinConfirmInput" type="password" placeholder="Konfirmasi PIN">
                </div>
                <button class="pk-btn-primary" onclick="confirmSetPIN()">
                    <i class="fa-solid fa-lock"></i> Simpan PIN & Kunci Wallet
                </button>
                <button class="pk-btn-ghost mt8" onclick="renderPKModal()">
                    Batal
                </button>
            </div>`;
    }

    // ACTIVE â€” sesuai tab
    if (mode === "phrase") return _buildPhraseView(shortAddr);
    return _buildPKView(shortAddr);
}


// TAB: PRIVATE KEY
function _buildPKView(shortAddr) {
    const hasPIN = window.WALLET_SESSION.pinCreated;
    return `
        <div class="pk-section">
            <div class="pk-status-badge active">
                <i class="fa-solid fa-lock-open"></i>
                Wallet Aktif
                <span class="pk-addr">${shortAddr}</span>
            </div>
            <button class="pk-btn-lock" onclick="lockPK()">
                <i class="fa-solid fa-lock"></i>
                ${hasPIN ? "Kunci Wallet" : "Kunci Wallet (buat PIN dulu)"}
            </button>
            <button class="pk-btn-danger mt8" onclick="deletePKWallet()">
                <i class="fa-solid fa-trash"></i> Hapus Wallet PK
            </button>
        </div>`;
}


// TAB: PIN MANAGER
function _buildPhraseView(shortAddr) {
    const hasPIN = window.WALLET_SESSION.pinCreated;

    if (!hasPIN) {
        return `
            <div class="pk-section">
                <div class="pk-hint">
                    <i class="fa-solid fa-circle-info"></i>
                    Buat PIN untuk keamanan wallet saat dikunci.
                </div>
                <div class="pk-input-wrap">
                    <i class="fa-solid fa-lock"></i>
                    <input id="pinNewInput" type="password" placeholder="PIN baru (min 4 karakter)">
                </div>
                <div class="pk-input-wrap">
                    <i class="fa-solid fa-lock"></i>
                    <input id="pinConfirmInput" type="password" placeholder="Konfirmasi PIN">
                </div>
                <button class="pk-btn-primary" onclick="confirmSetPIN()">
                    <i class="fa-solid fa-shield-halved"></i> Simpan PIN
                </button>
            </div>`;
    }

    return `
        <div class="pk-section">
            <div class="pk-hint success">
                <i class="fa-solid fa-shield-halved"></i>
                PIN aktif. Gunakan menu ini untuk mengubah PIN.
            </div>
            <div class="pk-input-wrap">
                <i class="fa-solid fa-key"></i>
                <input id="pinOldInput" type="password" placeholder="PIN lama">
            </div>
            <div class="pk-input-wrap">
                <i class="fa-solid fa-lock"></i>
                <input id="pinNewInput" type="password" placeholder="PIN baru (min 4 karakter)">
            </div>
            <div class="pk-input-wrap">
                <i class="fa-solid fa-lock"></i>
                <input id="pinConfirmInput" type="password" placeholder="Konfirmasi PIN baru">
            </div>
            <button class="pk-btn-primary" onclick="changePIN()">
                <i class="fa-solid fa-rotate"></i> Ubah PIN
            </button>
            <button class="pk-btn-danger mt8" onclick="resetPKWallet()">
                <i class="fa-solid fa-rotate-left"></i> Lupa PIN? Reset Wallet
            </button>
        </div>`;
}


// =====================================
// MODE TAB SWITCH
// FIX: selalu kembali ke mode pk saat modal dibuka
// =====================================
function setPKMode(mode) {
    const label = document.getElementById("pkModeLabel");
    if (label) label.dataset.mode = mode;
    _updateModeTab(mode);
    renderPKModal();
}

function _updateModeTab(mode) {
    document.querySelectorAll(".pk-tab").forEach(t => t.classList.remove("active"));
    document.querySelector(`.pk-tab[data-mode="${mode}"]`)?.classList.add("active");
}


// =====================================
// STATUS BAR
// FIX: klik ikon gembok = buka modal saja
// tidak langsung lock/unlock dari header
// =====================================
function updatePKStatusBar() {
    const bar = document.getElementById("pkStatusBar");
    if (!bar) return;

    const s    = window.WALLET_SESSION;
    const text = bar.querySelector(".pk-text");
    const dot  = bar.querySelector(".pk-dot");

    if (!s.pkWallet) {
        bar.style.display = "none";
        return;
    }

    bar.style.display = "flex";

    // klik selalu buka modal â€” aksi lock/unlock ada di dalam modal
    bar.onclick = openPKModal;

    if (s.pkLocked) {
        if (text) text.innerHTML =
            '<i class="fa-solid fa-lock" style="margin-right:5px;"></i>Locked - Tap to Open';
        if (dot)  dot.style.background = "#ff3b3b";
        bar.style.background           = "#3a1a1a";
        return;
    }

    if (text) text.innerHTML =
        '<i class="fa-solid fa-lock-open" style="margin-right:5px;"></i>Active - Tap to Manage';
    if (dot)  dot.style.background = "#00ff88";
    bar.style.background           = "#1a1a1a";
}

function updatePKUI() { updatePKStatusBar(); }


// =====================================
// MODAL OPEN / CLOSE
// FIX: selalu reset ke mode pk saat buka
// =====================================
function openPKModal() {
    const modal = document.getElementById("pkGlobalModal");
    if (!modal) return;

    // reset ke tab PK setiap buka
    const label = document.getElementById("pkModeLabel");
    if (label) label.dataset.mode = "pk";

    modal.style.display = "flex";
    renderPKModal();
}

function closePKModal() {
    const modal = document.getElementById("pkGlobalModal");
    if (modal) modal.style.display = "none";
}


// =====================================
// REQUIRE PK â€” guard eksekusi transaksi
// =====================================
function requirePK() {
    const s = window.WALLET_SESSION;

    if (!s.pkWallet) {
        openPKModal();
        throw new Error("PK required");
    }
    if (s.pkLocked) {
        openPKModal();
        throw new Error("PK locked");
    }
    return s.pkWallet;
}


// =====================================
// SEND TX
// =====================================
async function sendWithPK(to, amount, tokenAddress = null) {
    const wallet = requirePK();

    try {
        if (!tokenAddress) {
            const tx = await wallet.sendTransaction({
                to,
                value: ethers.utils.parseEther(amount)
            });
            showToast?.("TX sent: " + tx.hash, "success");
            return tx;
        }

        const abi      = ["function transfer(address to, uint256 amount) returns (bool)"];
        const contract = new ethers.Contract(tokenAddress, abi, wallet);
        const tx       = await contract.transfer(to, ethers.utils.parseUnits(amount, 18));

        showToast?.("TX sent: " + tx.hash, "success");
        return tx;

    } catch (err) {
        console.error(err);
        showToast?.("Transaction failed", "error");
    }
}


// =====================================
// GET BALANCE
// =====================================
async function getPKBalance(tokenAddress = null) {
    const wallet = getActiveWallet();
    if (!wallet) return null;

    try {
        if (!tokenAddress) {
            const bal = await window.pkProvider.getBalance(wallet.address);
            return ethers.utils.formatEther(bal);
        }

        const abi      = [
            "function balanceOf(address) view returns (uint256)",
            "function decimals() view returns (uint8)"
        ];
        const contract = new ethers.Contract(tokenAddress, abi, window.pkProvider);
        const [bal, dec] = await Promise.all([
            contract.balanceOf(wallet.address),
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
    return window.WALLET_SESSION.pkWallet;
}

function setPKState(wallet, pk) {
    window.WALLET_SESSION.pkWallet      = wallet;
    window.WALLET_SESSION.mode          = "pk";
    window.WALLET_SESSION.activeAddress = wallet.address;
    localStorage.setItem(window.PK_STORAGE_KEY, pk);
}


// =====================================
// SESSION SAVE / LOAD
// =====================================
function savePKSession() {
    localStorage.setItem("PK_SESSION", JSON.stringify({
        pk:         window.WALLET_SESSION.pkWallet?.privateKey || null,
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
// =====================================
function restorePK() {
    if (localStorage.getItem("PK_DELETED") === "1") return;

    const data = loadPKSession();
    if (!data?.pk) return;

    try {
        const wallet = new ethers.Wallet(data.pk, window.pkProvider);

        window.WALLET_SESSION.pkWallet      = wallet;
        window.WALLET_SESSION.activeAddress = wallet.address;
        window.WALLET_SESSION.pkLocked      = data.locked     === true;
        window.WALLET_SESSION.pinCreated    = data.pinCreated || false;
        window.WALLET_SESSION.pinHash       = data.pinHash    || null;

        window.__PK_RESTORING = true;
        syncPKToWalletSystem(data.pk, wallet.address);
        window.__PK_RESTORING = false;

        updatePKStatusBar();

    } catch {
        console.warn("PK restore failed");
    }
}


// =====================================
// SYNC PK KE WALLET LIST + SET ACTIVE
// =====================================
function syncPKToWalletSystem(pk, address) {
    let wallets = getWallets?.() || [];
    const addr  = address.toLowerCase();
    const idx   = wallets.findIndex(w => w.address?.toLowerCase() === addr);

    if (idx === -1) {
        wallets.push({ address, name: "Main Wallet (PK)", type: "pk", privateKey: pk });
    } else {
        wallets[idx] = { ...wallets[idx], type: "pk", privateKey: pk };
    }

    setWallets?.(wallets);
    window.WALLET_SESSION.activeAddress = address;

    const newIndex = wallets.findIndex(w => w.address.toLowerCase() === addr);
    const select   = document.getElementById("walletSelect");

    if (select && newIndex !== -1) {
        select.value = String(newIndex);
        localStorage.setItem("selectedWalletIndex", String(newIndex));
        select.dispatchEvent(new Event("change"));
    }

    renderWallets?.();
    renderSavedAddresses?.();
    updateActiveWalletName?.();
    loadBalance?.();
}


// =====================================
// PIN HASH (SHA-256)
// =====================================
async function hashPIN(pin) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}