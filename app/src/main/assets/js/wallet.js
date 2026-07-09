// =====================================
// WALLET.JS  -  UI, save, select, modal
// PATCHED:
// [FIX-A]  renameWallet / saveWalletName: blok wallet type "pk"
//          dari dropdown  -  hanya bisa rename lewat manage wallet
// [FIX-B]  deleteWallet: blok wallet type "pk" dari dropdown
// [FIX-C]  walletSelect onChange: kalau pilih wallet type "pk",
//          sync ke SESSION (switchSessionAccount) agar aktif wallet
//          di manage wallet ikut pindah
// [SEC-1]  saveWallet: TIDAK LAGI menyimpan privateKey ke wallet object
// [SEC-2]  saveWallet upgrade watchâ†’pk: strip privateKey
// =====================================

// ==========================
// ELEMENT SAFE INIT
// ==========================
const balanceEl    = document.getElementById("balance");
const addressInput = document.getElementById("address");
const saveBtn      = document.querySelector("button[onclick='saveWallet()']");

if (saveBtn)      saveBtn.disabled = true;
if (addressInput) addressInput.addEventListener("input", validateInput);


// ==========================
// SAVE WALLET
// ==========================
function saveWallet() {

    let addr = addressInput?.value?.trim().toLowerCase();

    const isPKWallet =
        SESSION.unlocked &&
        !!SESSION.signer &&
        SESSION.address?.toLowerCase() === addr;
    const nameInput = document.getElementById("walletName");
    const name      = nameInput?.value?.trim();

    if (!addr) {
        return showToast(LANG?.[CURRENT_LANG]?.enter_address || "Enter address");
    }

    if (!addr.startsWith("0x") || addr.length < 42) {
        return showToast(
            LANG?.[CURRENT_LANG]?.invalid_address || "Format address tidak valid",
            "error"
        );
    }

    const wallets = getWallets();
    const exist   = wallets.find(w => w.address.toLowerCase() === addr);

    if (exist) {
        if (exist.type === "pk" && isPKWallet) {
            return showToast(
                LANG?.[CURRENT_LANG]?.wallet_exists || "Wallet PK sudah ada",
                "error"
            );
        }

        if (exist.type === "watch" && isPKWallet) {
            // Upgrade watch â†’ pk
            exist.type = "pk";
            // [SEC-2] Tidak menyimpan privateKey
            if (exist.privateKey) delete exist.privateKey; // bersihkan sisa lama
            if (name) exist.name = name;

            setWallets(wallets);
            renderWallets();

            const index = wallets.findIndex(w => w.address.toLowerCase() === addr);
            _selectWallet(index);

            updateActiveWalletName();
            updateAddressUI?.();
            renderAssets();
            loadBalance();

            if (addressInput) addressInput.value = "";
            if (nameInput)    nameInput.value    = "";
            validateInput();

            showToast("Wallet di-upgrade ke PK", "success");
            return;
        }

        if (!isPKWallet) {
            return showToast(
                LANG?.[CURRENT_LANG]?.wallet_exists || "Wallet sudah tersimpan",
                "error"
            );
        }
    }

    // [SEC-1] Buat wallet baru TANPA privateKey
    // PK hanya ada di vault terenkripsi
    const newWallet = {
        address: addr,
        name:    name || "Wallet",
        type:    isPKWallet ? "pk" : "watch"
        // TIDAK ADA privateKey â€” dihapus dari sini
    };

    wallets.push(newWallet);
    setWallets(wallets);
    renderWallets();

    const newIndex = wallets.length - 1;
    _selectWallet(newIndex);

    updateActiveWalletName();
    updateAddressUI?.();
    renderAssets();
    loadBalance();

    if (addressInput) addressInput.value = "";
    if (nameInput)    nameInput.value    = "";
    validateInput();

    showToast(LANG?.[CURRENT_LANG]?.wallet_saved || "Wallet berhasil disimpan", "success");

    setTimeout(() => autoRefreshIfNeeded?.(), 150);

    addressInput?.classList.remove("blink");
    saveBtn?.classList.remove("blink");
}


// ==========================
// PILIH WALLET + SIMPAN KE STORAGE
// [FIX-C] Kalau wallet type "pk", sync SESSION ke account yg sesuai
//         Pakai window._isSwitchingAccount untuk cegah loop
// ==========================
function _selectWallet(index) {
    const wallets = getWallets();
    if (!wallets[index]) return;

    localStorage.setItem("selectedWalletIndex", String(index));

    const select = document.getElementById("walletSelect");
    if (select) {
        select.value = String(index);
        select.dispatchEvent(new Event("change"));
    }

    // [FIX-C] Sync SESSION kalau PK  -  cegah loop dengan flag
    const w = wallets[index];
    if (w?.type === "pk" && SESSION?.accounts?.length && !window._isSwitchingAccount) {
        const sessionIdx = SESSION.accounts.findIndex(
            a => a.address?.toLowerCase() === w.address?.toLowerCase()
        );
        if (sessionIdx !== -1 && sessionIdx !== SESSION.accountIndex) {
            switchSessionAccount(sessionIdx).then(() => {
                const overlay = document.getElementById("onboardingOverlay");
                if (overlay && overlay.style.display !== "none") {
                    showWalletManageScreen?.();
                }
            }).catch(() => {});
        }
    }

    localStorage.removeItem("txHistory");
    renderTxHistory?.();
    updateBellBadge?.();

    setTimeout(() => {
        if (typeof refreshAll === "function") refreshAll();
    }, 150);
}


// ==========================
// GET SELECTED WALLET (SAFE)
// Baca dari wallets list â€” tidak expose privateKey
// ==========================
function getSelectedWallet() {

    const wallets = getWallets();
    if (!wallets?.length) return null;

    let index = parseInt(
        typeof selectEl !== "undefined" && selectEl ? selectEl.value : NaN
    );

    if (isNaN(index) || !wallets[index]) {
        index = parseInt(localStorage.getItem("selectedWalletIndex") || "0");
    }

    if (isNaN(index) || !wallets[index]) index = 0;

    const w = wallets[index];
    if (!w) return null;

    // Kembalikan object tanpa privateKey â€” PK hanya via requireSigner()
    const { privateKey: _removed, ...safeWallet } = w;
    return safeWallet;
}


// ==========================
// RESTORE WALLET TERAKHIR SAAT BUKA APP
// ==========================
function restoreLastSelectedWallet() {

    const wallets = getWallets();
    if (!wallets?.length) return;

    const saved = parseInt(localStorage.getItem("selectedWalletIndex") || "0");
    const index = isNaN(saved) || !wallets[saved] ? 0 : saved;

    const select = document.getElementById("walletSelect");
    if (select) {
        select.value = String(index);
        // Tetap dispatch supaya index tersimpan & UI dropdown sinkron —
        // tapi listener "change" di atas sudah di-guard, jadi tidak akan
        // fetch RPC/Blockscout kalau SESSION belum unlocked.
        select.dispatchEvent(new Event("change"));
    }

    updateActiveWalletName();
    // loadBalance() aman — cuma baca dari localStorage cache, tidak fetch RPC
    loadBalance?.();
    syncWalletPickerDisplay?.();

    }

document.addEventListener("DOMContentLoaded", () => {

    const select =
        document.getElementById("walletSelect");

    if (!select) return;

    select.addEventListener("change", async () => {

        const wallets =
            getWallets?.() || [];

        const wallet =
            wallets[parseInt(select.value)];

        if (!wallet) return;

        localStorage.setItem(
            "selectedWalletIndex",
            select.value
        );

        if (
            wallet.type === "pk" &&
            SESSION?.unlocked
        ) {

            const sessionIndex =
                SESSION.accounts.findIndex(
                    a =>
                        a.address?.toLowerCase() ===
                        wallet.address?.toLowerCase()
                );

            if (sessionIndex !== -1) {

                await switchSessionAccount(
                    sessionIndex
                );

            }
        }

        // JANGAN fetch on-chain / Blockscout kalau app belum di-unlock
        // (PIN belum dimasukkan). Kalau masih locked, tunda — nanti
        // dipicu ulang lewat event "sidra:unlocked" setelah PIN sukses.
        if (!SESSION?.unlocked) {
            window._pendingWalletFetch = wallet.address;
            return;
        }

        refreshAll?.();

        if (typeof loadTxHistory === "function" && wallet?.address) {
            loadTxHistory(wallet.address);
        }

    });

    // Begitu PIN berhasil di-unlock (event ini dipanggil dari
    // ui-onboarding.js setelah unlock sukses), baru jalankan fetch
    // yang tadi ditunda.
    document.addEventListener("sidra:unlocked", () => {
        refreshAll?.();

        const wallet = getSelectedWallet?.();
        if (typeof loadTxHistory === "function" && wallet?.address) {
            loadTxHistory(wallet.address);
        }

        window._pendingWalletFetch = null;
    });

});
// ==========================
// [FIX-A] RENAME WALLET
// ==========================
function renameWallet() {

    const wallets = getWallets();
    const index   = selectEl?.value;

    if (!wallets[index]) {
        return showToast(
            LANG?.[CURRENT_LANG]?.select_wallet_error || "Pilih wallet dulu",
            "error"
        );
    }

    if (wallets[index].type === "pk") {
        return showToast(
            "Wallet ini hanya bisa diubah nama dari menu Manage Wallet (ikon gembok)",
            "error"
        );
    }

    showPrompt(
        LANG?.[CURRENT_LANG]?.enter_new_name || "Nama baru:",
        wallets[index].name,
        function (newName) {
            if (!newName?.trim()) return;

            wallets[index].name = newName.trim();
            setWallets(wallets);
            renderWallets();
            updateActiveWalletName?.();

            showToast(
                LANG?.[CURRENT_LANG]?.wallet_renamed || "Nama wallet diubah",
                "success"
            );
        }
    );
}


// ==========================
// [FIX-A] SAVE NAME (dari modal edit dropdown)
// ==========================
function saveWalletName() {

    const wallets = getWallets();
    const index   = selectEl?.value;
    const newName = document.getElementById("editWalletName")?.value?.trim();

    if (!wallets[index]) {
        return showToast(
            LANG?.[CURRENT_LANG]?.select_wallet_error || "Pilih wallet dulu",
            "error"
        );
    }

    if (wallets[index].type === "pk") {
        closeWalletSetting?.();
        return showToast(
            "Wallet ini hanya bisa diubah nama dari menu Manage Wallet (ikon gembok)",
            "error"
        );
    }

    if (!newName) {
        return showToast(
            LANG?.[CURRENT_LANG]?.wallet_name_empty || "Nama tidak boleh kosong",
            "error"
        );
    }

    wallets[index].name = newName;
    setWallets(wallets);
    renderWallets();
    updateActiveWalletName?.();
    closeWalletSetting?.();

    showToast(LANG?.[CURRENT_LANG]?.wallet_saved_name || "Nama disimpan", "success");
}


// ==========================
// [FIX-B] DELETE WALLET
// ==========================
function deleteWallet() {

    const wallets = getWallets();
    const index   = parseInt(selectEl?.value);

    if (!wallets[index]) {
        return showToast(
            LANG?.[CURRENT_LANG]?.select_wallet_error || "Pilih wallet dulu",
            "error"
        );
    }

    const deleted = wallets[index];

    if (deleted?.type === "pk") {
        return showToast(
            "Wallet ini hanya bisa dihapus dari menu Manage Wallet (ikon gembok)",
            "error"
        );
    }

    if (
        deleted?.type === "main" ||
        deleted?.name === "Main Wallet" ||
        deleted?.name === "Account 1"
    ) {
        return showToast(
            "Wallet utama hanya bisa dihapus dari menu keamanan (ikon gembok)",
            "error"
        );
    }

    showConfirm(
        LANG?.[CURRENT_LANG]?.delete_wallet_confirm || "Hapus wallet ini?",
        function () {

            wallets.splice(index, 1);
            setWallets(wallets);
            renderWallets();

            closeWalletSetting?.();
            closeQRModal?.();
            closeReceiveModal?.();

            if (wallets.length > 0) {
                const newIndex = Math.max(0, index - 1);
                _selectWallet(newIndex);

                updateActiveWalletName?.();
                updateAddressUI?.();
                renderAssets?.();
                loadBalance?.();

                setTimeout(() => autoRefreshIfNeeded?.(), 150);
            }

            showToast(
                LANG?.[CURRENT_LANG]?.wallet_deleted || "Wallet dihapus",
                "success"
            );
        }
    );
}


// ==========================
// WALLET SETTING MODAL
// ==========================
function openWalletSetting() {

    const wallet = getSelectedWallet();
    if (!wallet) return showToast("Pilih wallet dulu");

    if (wallet.type === "pk") {
        document.getElementById("editWalletName").value    = wallet.name;
        document.getElementById("editWalletName").readOnly = true;
        document.getElementById("editWalletName").style.opacity = "0.5";

        const hint = document.getElementById("walletSettingHint");
        if (hint) {
            hint.textContent   = "Wallet ini dikelola lewat menu Manage Wallet (ikon gembok)";
            hint.style.display = "block";
        }
    } else {
        document.getElementById("editWalletName").value    = wallet.name;
        document.getElementById("editWalletName").readOnly = false;
        document.getElementById("editWalletName").style.opacity = "1";

        const hint = document.getElementById("walletSettingHint");
        if (hint) hint.style.display = "none";
    }

    document.getElementById("walletModal").style.display = "flex";
}

function closeWalletSetting() {
    const input = document.getElementById("editWalletName");
    if (input) {
        input.readOnly = false;
        input.style.opacity = "1";
    }
    document.getElementById("walletModal").style.display = "none";
}


// ==========================
// ACTIVE WALLET NAME UI
// ==========================
function updateActiveWalletName() {

    const el     = document.getElementById("activeWalletName");
    const wallet = getSelectedWallet();

    if (!el) return;

    el.textContent = wallet
        ? wallet.name
        : (LANG?.[CURRENT_LANG]?.no_wallet || "No Wallet Selected");
}


// ==========================
// SHORT ADDRESS HELPER
// ==========================
function shortAddress(addr) {
    return addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "-";
}


// ==========================
// QR MODAL
// ==========================
function openQRModal() {

    const wallet = getSelectedWallet();
    if (!wallet) return showToast("Pilih wallet dulu");

    const modal = document.getElementById("qrModal");
    modal.classList.add("show");

    document.getElementById("qrModalImg").src =
        "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" +
        encodeURIComponent(wallet.address);

    document.getElementById("qrModalAddress").textContent = wallet.address;
}

function closeQRModal() {
    document.getElementById("qrModal")?.classList.remove("show");
}


// ==========================
// COPY ADDRESS
// ==========================
function copyAddress() {

    const wallet = getSelectedWallet();
    if (!wallet) return showToast("Pilih wallet dulu");

    navigator.clipboard.writeText(wallet.address)
        .then(()  => showToast("Copied"))
        .catch(() => showToast("Gagal copy", "error"));
}


// ==========================
// RECEIVE MODAL
// ==========================
function showReceive() {

    const wallet = getSelectedWallet();
    if (!wallet) return showToast("Pilih wallet dulu");

    const modal       = document.getElementById("receiveModal");
    const amountInput = document.getElementById("receiveAmountQR");
    const qr          = document.getElementById("receiveQR");
    const linkEl      = document.getElementById("receiveLink");

    modal.style.display = "flex";

    document.getElementById("receiveAddress").textContent = wallet.address;

    amountInput.value = "";
    linkEl.value      = "";
    document.getElementById("receiveResult").style.display = "none";

    qr.src = "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" +
        encodeURIComponent(wallet.address);

    amountInput.oninput = function () {

        const amount  = amountInput.value.trim();
        const baseUrl = "https://www.sidrachain.com/wallets/send";
        const params  = new URLSearchParams({ to: wallet.address, currency: "SDA" });

        if (amount && Number(amount) > 0) params.append("amount", amount);

        const link   = baseUrl + "?" + params.toString();
        linkEl.value = link;

        document.getElementById("receiveResult").style.display = "block";

        qr.src = "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" +
            encodeURIComponent(link);
    };
}

function closeReceiveModal() {
    document.getElementById("receiveModal").style.display = "none";
}


// ==========================
// SET SELECTED WALLET (external helper)
// ==========================
function setSelectedWallet(address) {

    const wallets = getWallets?.() || [];
    const index   = wallets.findIndex(
        w => w.address.toLowerCase() === address.toLowerCase()
    );

    if (index !== -1) _selectWallet(index);
}


// ==========================
// RENDER SAVED ADDRESSES (dropdown send)
// ==========================
function renderSavedAddresses() {

    const sel = document.getElementById("savedAddressSelect");
    if (!sel) return;

    const wallets = getWallets?.() || [];
    const active  = getSelectedWallet?.();

    if (!wallets.length) {
        sel.innerHTML = `<option value="">No saved address</option>`;
        return;
    }

    sel.innerHTML = `<option value="">Pilih address</option>`;

    wallets.forEach((w, i) => {

        const opt      = document.createElement("option");
        const icon     = w.type === "pk" ? "[PK]" : "[W]";
        const short    = w.address.slice(0, 6) + "..." + w.address.slice(-4);
        const isActive = active?.address?.toLowerCase() === w.address.toLowerCase();

        opt.value       = w.address;
        opt.textContent = `${icon} ${w.name || "Wallet " + (i + 1)} - ${short}${isActive ? " (Active)" : ""}`;
        // Tidak auto-select wallet aktif — biarkan netral ("Pilih address")
        // sampai user benar-benar memilih dari picker

        sel.appendChild(opt);
    });

    sel.onchange = () => {
        const input = document.getElementById("toSend");
        if (input && sel.value) input.value = sel.value;

        loadBalance?.();
        updateSendBalance?.(sel.value);
        renderAssets?.();
        syncSavedAddressDisplay?.();
    };

    syncSavedAddressDisplay?.();
}


// ==========================
// RENDER WALLETS (dropdown walletSelect)
// ==========================
function renderWallets() {

    const select = document.getElementById("walletSelect");
    if (!select) return;

    const wallets = getWallets?.() || [];
    const saved   = parseInt(localStorage.getItem("selectedWalletIndex") || "0");

    select.innerHTML = "";

    if (!wallets.length) {
        const opt    = document.createElement("option");
        opt.value    = "";
        opt.textContent = "No wallet";
        select.appendChild(opt);
        return;
    }

    wallets.forEach((w, i) => {
        const opt   = document.createElement("option");
        opt.value   = String(i);

        const badge = w.type === "pk" ? " " : " [W]";
        opt.textContent = (w.name || "Wallet " + (i + 1)) + badge;

        if (i === saved) opt.selected = true;
        select.appendChild(opt);
    });
}


// ==========================
// VALIDATION ADDRESS INPUT
// ==========================
function isValidAddress(addr) {
    return addr?.startsWith("0x") && addr.length >= 42;
}

function validateInput() {

    const addr  = addressInput?.value?.trim();
    const valid = isValidAddress(addr);

    if (!saveBtn) return;

    saveBtn.disabled = !valid;

    if (valid) {
        addressInput?.classList.remove("blink");
        saveBtn.classList.add("blink");
    } else {
        saveBtn.classList.remove("blink");
        addressInput?.classList.add("blink");
    }
}


// ==========================
// GUIDE BLINK
// ==========================
function startGuide() {
    addressInput?.classList.add("blink");
    saveBtn?.classList.remove("blink");
}


// ==========================
// INIT  -  restore wallet terakhir
// ==========================
document.addEventListener("DOMContentLoaded", () => {
    restoreLastSelectedWallet();
});