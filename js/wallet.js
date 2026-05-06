// =====================================
// WALLET.JS â€” UI, save, select, modal
// =====================================

// ==========================
// ELEMENT SAFE INIT
// ==========================
const balanceEl   = document.getElementById("balance");
const addressInput = document.getElementById("address");
const saveBtn     = document.querySelector("button[onclick='saveWallet()']");

// init validation state
if (saveBtn)      saveBtn.disabled = true;
if (addressInput) addressInput.addEventListener("input", validateInput);


// ==========================
// SAVE WALLET
// ==========================
function saveWallet() {

    const isPKWallet = !!window.WALLET_SESSION?.pkWallet;

    let addr = addressInput?.value?.trim().toLowerCase();
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

        // PK sudah ada â€” block
        if (exist.type === "pk" && isPKWallet) {
            return showToast(
                LANG?.[CURRENT_LANG]?.wallet_exists || "Wallet PK sudah ada",
                "error"
            );
        }

        // Upgrade watch -> PK
        if (exist.type === "watch" && isPKWallet) {
            exist.type       = "pk";
            exist.privateKey = window.WALLET_SESSION.pkWallet.privateKey;
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

        // watch + watch â€” block
        if (!isPKWallet) {
            return showToast(
                LANG?.[CURRENT_LANG]?.wallet_exists || "Wallet sudah tersimpan",
                "error"
            );
        }
    }

    // Buat wallet baru
    const newWallet = {
        address: addr,
        name:    name || "Wallet",
        type:    isPKWallet ? "pk" : "watch",
        ...(isPKWallet && { privateKey: window.WALLET_SESSION.pkWallet.privateKey })
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
// (helper internal)
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
}


// ==========================
// GET SELECTED WALLET (SAFE)
// Prioritas: dropdown -> localStorage -> 0
// ==========================
function getSelectedWallet() {

    const wallets = getWallets();
    if (!wallets?.length) return null;

    // Priority 1: dropdown
    let index = parseInt(
        typeof selectEl !== "undefined" && selectEl ? selectEl.value : NaN
    );

    // Priority 2: localStorage (wallet terakhir dipilih)
    if (isNaN(index) || !wallets[index]) {
        index = parseInt(localStorage.getItem("selectedWalletIndex") || "0");
    }

    // Fallback ke index 0
    if (isNaN(index) || !wallets[index]) index = 0;

    return wallets[index] || null;
}


// ==========================
// RESTORE WALLET TERAKHIR SAAT BUKA APP
// Dipanggil dari DOMContentLoaded
// ==========================
function restoreLastSelectedWallet() {

    const wallets = getWallets();
    if (!wallets?.length) return;

    const saved = parseInt(localStorage.getItem("selectedWalletIndex") || "0");
    const index = isNaN(saved) || !wallets[saved] ? 0 : saved;

    const select = document.getElementById("walletSelect");
    if (select) {
        select.value = String(index);
        // trigger change supaya semua modul (balance, assets, dll) ikut update
        select.dispatchEvent(new Event("change"));
    }

    updateActiveWalletName();
    loadBalance?.();
}


// ==========================
// RENAME WALLET
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
// SAVE NAME (dari modal edit)
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
// DELETE WALLET
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

    showConfirm(
        LANG?.[CURRENT_LANG]?.delete_wallet_confirm || "Hapus wallet ini?",
        function () {

            const deleted = wallets[index];

            // Kalau wallet PK, bersihkan state PK
            if (deleted?.type === "pk") {
                if (window.WALLET_SESSION) {
                    window.WALLET_SESSION.pkWallet = null;
                    window.WALLET_SESSION.mode     = "watch";
                }
                localStorage.removeItem(window.PK_STORAGE_KEY);

                const pkInput = document.getElementById("globalPKInput")
                    || document.getElementById("walletPK");
                if (pkInput) pkInput.value = "";

                updatePKUI?.();
            }

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

            } else {
                localStorage.removeItem("selectedWalletIndex");

                if (balanceEl) balanceEl.textContent = "0.00 SDA";

                const tabAssets = document.getElementById("tab-assets");
                if (tabAssets) {
                    tabAssets.innerHTML =
                        "<div style='text-align:center;color:#888;'>No wallet</div>";
                }

                const activeName = document.getElementById("activeWalletName");
                if (activeName) {
                    activeName.textContent =
                        LANG?.[CURRENT_LANG]?.no_wallet || "No Wallet Selected";
                }

                startGuide?.();
            }

            showToast(
                LANG?.[CURRENT_LANG]?.wallet_deleted || "Wallet dihapus",
                "success"
            );
        }
    );
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
// WALLET SETTING MODAL
// ==========================
function openWalletSetting() {

    const wallet = getSelectedWallet();
    if (!wallet) return showToast("Pilih wallet dulu");

    document.getElementById("editWalletName").value = wallet.name;
    document.getElementById("walletModal").style.display = "flex";
}

function closeWalletSetting() {
    document.getElementById("walletModal").style.display = "none";
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

    // reset
    amountInput.value = "";
    linkEl.value      = "";
    document.getElementById("receiveResult").style.display = "none";

    qr.src = "https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=" +
        encodeURIComponent(wallet.address);

    amountInput.oninput = function () {

        const amount   = amountInput.value.trim();
        const baseUrl  = "https://www.sidrachain.com/wallets/send";
        const params   = new URLSearchParams({ to: wallet.address, currency: "SDA" });

        if (amount && Number(amount) > 0) params.append("amount", amount);

        const link = baseUrl + "?" + params.toString();
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

    const sel    = document.getElementById("savedAddressSelect");
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
        if (isActive) opt.selected = true;

        sel.appendChild(opt);
    });

    sel.onchange = () => {
        const input = document.getElementById("toSend");
        if (input && sel.value) input.value = sel.value;

        loadBalance?.();
        updateSendBalance?.(sel.value);
        renderAssets?.();
    };
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
// GUIDE BLINK (state kosong)
// ==========================
function startGuide() {
    addressInput?.classList.add("blink");
    saveBtn?.classList.remove("blink");
}


// ==========================
// INIT â€” restore wallet terakhir
// ==========================
document.addEventListener("DOMContentLoaded", () => {
    restoreLastSelectedWallet();
});