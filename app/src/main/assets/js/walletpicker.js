// =====================================================
// WALLET PICKER (PREMIUM) v3 - CLEAN
// <select id="walletSelect"> disembunyikan via display:none,
// overlay premium menggantikan tampilannya, klik overlay
// langsung buka modal. Semua listener dikelola dengan flag
// supaya tidak pernah dobel/nyangkut.
// =====================================================

let _wpInitDone = false;

function initWalletPickerOverlay() {
    if (_wpInitDone) return;
    const nativeSelect = document.getElementById("walletSelect");
    if (!nativeSelect) return;

    const wrapper = nativeSelect.parentElement;
    if (!wrapper) return;

    nativeSelect.style.display = "none";
    wrapper.style.position = "relative";

    const overlay = document.createElement("div");
    overlay.id = "wpOverlayDisplay";
    overlay.className = "wp-overlay-display";
    overlay.innerHTML = `
        <span id="wpOverlayText">Pilih wallet</span>
        <i class="fa-solid fa-chevron-down"></i>
    `;
    wrapper.appendChild(overlay);

    overlay.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openWalletPicker();
    });

    nativeSelect.addEventListener("change", syncWalletPickerDisplay);

    _wpInitDone = true;
    syncWalletPickerDisplay();
}

document.addEventListener("DOMContentLoaded", () => {
    initWalletPickerOverlay();
    setTimeout(syncWalletPickerDisplay, 300);
});

// =====================================================
// SYNC TEKS OVERLAY SESUAI WALLET AKTIF
// =====================================================
function syncWalletPickerDisplay() {
    const textEl = document.getElementById("wpOverlayText");
    if (!textEl) return;

    const wallet = typeof getSelectedWallet === "function" ? getSelectedWallet() : null;
    textEl.textContent = wallet ? (wallet.name || "Wallet") : "Pilih wallet";
}

// =====================================================
// MODAL PICKER
// =====================================================
function openWalletPicker() {
    const modal = document.getElementById("walletPickerModal");
    if (!modal) return;

    renderWalletPickerList();
    modal.classList.add("show");
    document.body.style.overflow = "hidden";

    // Catatan: klik backdrop sekarang AKTIF, lihat listener
    // di bagian bawah file ini (dipasang sekali via DOMContentLoaded)
}

function closeWalletPicker() {
    const modal = document.getElementById("walletPickerModal");
    if (!modal) return;
    modal.classList.remove("show");
    document.body.style.overflow = "";
    closeWpItemMenu();
}

function renderWalletPickerList() {
    const list = document.getElementById("walletPickerList");
    if (!list) return;

    const wallets = getWallets?.() || [];
    const selected = typeof getSelectedWallet === "function" ? getSelectedWallet() : null;
    const activeAddress = (selected?.address || "").toLowerCase();

    if (wallets.length === 0) {
        list.innerHTML = `<div class="wp-empty">Belum ada wallet tersimpan</div>`;
        return;
    }

    list.innerHTML = "";

    wallets.forEach((w, index) => {
        const isFullAccess = w.type === "pk";
        const isActive     = (w.address || "").toLowerCase() === activeAddress;
        const initial       = (w.name || "W").trim().charAt(0).toUpperCase();
        const shortAddr      = w.address
            ? w.address.slice(0, 6) + "..." + w.address.slice(-4)
            : "-";

        const el = document.createElement("div");
        el.className = "wp-item" + (isActive ? " selected" : "");
        el.innerHTML = `
            <div class="wp-avatar${isFullAccess ? "" : " view-only"}">${initial}</div>
            <div class="wp-meta">
                <p class="wp-name">${w.name || "Wallet"}${isActive ? '<span class="wp-active-tag">&#9679; Aktif</span>' : ""}</p>
                <p class="wp-addr">${shortAddr}</p>
                <span class="wp-badge ${isFullAccess ? "full-access" : "view-only"}">
                    <i class="fa-solid ${isFullAccess ? "fa-key" : "fa-eye"}"></i>
                    ${isFullAccess ? "Full Access" : "View Only"}
                </span>
            </div>
            <div class="wp-radio"><div class="wp-radio-dot"></div></div>
            <button class="wp-menu-btn" data-index="${index}" aria-label="Menu wallet" type="button">
                <i class="fa-solid fa-ellipsis-vertical"></i>
            </button>
        `;

        el.addEventListener("click", (e) => {
            if (e.target.closest(".wp-menu-btn")) return;
            selectWalletFromPicker(index, w);
        });

        const menuBtn = el.querySelector(".wp-menu-btn");
        menuBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openWpItemMenu(menuBtn, index, w);
        });

        list.appendChild(el);
    });
}

function selectWalletFromPicker(index, wallet) {
    const select = document.getElementById("walletSelect");
    if (select) {
        select.value = String(index);
        select.dispatchEvent(new Event("change"));
    }

    syncWalletPickerDisplay();
    closeWalletPicker();
}

// =====================================================
// MENU TITIK TIGA (Rename / Delete)
// =====================================================
let _wpActiveMenu = null;
let _wpMenuCloseHandler = null;
let _wpMenuListenerActive = false;

function closeWpItemMenu() {
    if (_wpActiveMenu) {
        _wpActiveMenu.remove();
        _wpActiveMenu = null;
    }
    if (_wpMenuListenerActive && _wpMenuCloseHandler) {
        document.removeEventListener("click", _wpMenuCloseHandler);
        _wpMenuListenerActive = false;
    }
    _wpMenuCloseHandler = null;
}

function openWpItemMenu(anchorBtn, index, wallet) {
    closeWpItemMenu();

    const isPK = wallet.type === "pk";

    const menu = document.createElement("div");
    menu.className = "wp-item-menu";
    menu.innerHTML = `
        <button class="wp-item-menu-option" data-action="rename" type="button" ${isPK ? "disabled" : ""}>
            <i class="fa-solid fa-pen"></i> Ganti Nama${isPK ? " (terkunci)" : ""}
        </button>
        <button class="wp-item-menu-option danger" data-action="delete" type="button" ${isPK ? "disabled" : ""}>
            <i class="fa-solid fa-trash"></i> Hapus${isPK ? " (terkunci)" : ""}
        </button>
    `;

    const rect = anchorBtn.getBoundingClientRect();
    const menuHeight = 90;
    const spaceBelow = window.innerHeight - rect.bottom;

    menu.style.position = "fixed";
    menu.style.right = (window.innerWidth - rect.right) + "px";

    if (spaceBelow < menuHeight + 70) {
        menu.style.bottom = (window.innerHeight - rect.top + 4) + "px";
    } else {
        menu.style.top = (rect.bottom + 4) + "px";
    }

    document.body.appendChild(menu);
    _wpActiveMenu = menu;

    const renameBtn = menu.querySelector('[data-action="rename"]');
    renameBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isPK) {
            showToast?.("Wallet ini hanya bisa diubah nama dari menu Manage Wallet (ikon gembok)", "error");
            return;
        }
        closeWpItemMenu();
        wpRenameWallet(index, wallet);
    });

    const delBtn = menu.querySelector('[data-action="delete"]');
    delBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isPK) {
            showToast?.("Wallet ini hanya bisa dihapus dari menu Manage Wallet (ikon gembok)", "error");
            return;
        }
        closeWpItemMenu();
        wpDeleteWallet(index, wallet);
    });

    _wpMenuCloseHandler = (e) => {
        if (_wpActiveMenu && !_wpActiveMenu.contains(e.target) && e.target !== anchorBtn) {
            closeWpItemMenu();
        }
    };

    Promise.resolve().then(() => {
        if (!_wpMenuListenerActive) {
            document.addEventListener("click", _wpMenuCloseHandler);
            _wpMenuListenerActive = true;
        }
    });
}

function wpRenameWallet(index, wallet) {
    showPrompt?.(
        "Nama baru:",
        wallet.name || "",
        function (newName) {
            if (!newName?.trim()) return;

            const wallets = getWallets?.() || [];
            if (!wallets[index]) return;

            wallets[index].name = newName.trim();
            setWallets?.(wallets);

            renderWallets?.();
            renderWalletPickerList();
            syncWalletPickerDisplay();
            showToast?.("Nama wallet diubah", "success");
        }
    );
}

function wpDeleteWallet(index, wallet) {
    showConfirm?.(
        "Hapus wallet \"" + (wallet.name || "Wallet") + "\"?",
        function () {
            const wallets = getWallets?.() || [];
            if (!wallets[index]) return;

            wallets.splice(index, 1);
            setWallets?.(wallets);

            renderWallets?.();
            renderWalletPickerList();

            if (wallets.length > 0) {
                const newIndex = Math.max(0, index - 1);
                if (typeof _selectWallet === "function") _selectWallet(newIndex);
            }

            syncWalletPickerDisplay();
            showToast?.("Wallet dihapus", "success");
        }
    );
}

// Catatan: listener backdrop sekarang dipasang langsung di openWalletPicker()
// supaya selalu aktif terlepas dari timing DOMContentLoaded.

// =====================================================
// BACKDROP CLICK = sama persis dengan tombol X
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
    const wpModal = document.getElementById("walletPickerModal");
    if (!wpModal) return;

    wpModal.addEventListener("click", (e) => {
        if (e.target.id === "walletPickerModal") {
            closeWalletPicker();
        }
    });
});

// =====================================================
// SAVED ADDRESS PICKER (UI sama dengan wallet picker)
// Sinkron ke <select id="savedAddressSelect"> yang disembunyikan
// supaya logic lama (sel.onchange dll di wallet.js) tetap jalan
// =====================================================

function openSavedAddressPicker() {
    const modal = document.getElementById("savedAddressModal");
    if (!modal) return;

    renderSavedAddressList();
    modal.classList.add("show");
    document.body.style.overflow = "hidden";
}

function closeSavedAddressPicker() {
    const modal = document.getElementById("savedAddressModal");
    if (!modal) return;
    modal.classList.remove("show");
    document.body.style.overflow = "";
}

function renderSavedAddressList() {
    const list = document.getElementById("savedAddressList");
    if (!list) return;

    const wallets = getWallets?.() || [];
    const active  = getSelectedWallet?.();
    const activeAddress = (active?.address || "").toLowerCase();

    const sel = document.getElementById("savedAddressSelect");
    const currentVal = (sel?.value || "").toLowerCase();

    if (!wallets.length) {
        list.innerHTML = `<div class="wp-empty">Belum ada address tersimpan</div>`;
        return;
    }

    list.innerHTML = "";

    wallets.forEach((w) => {
        const isFullAccess = w.type === "pk";
        const isActive     = (w.address || "").toLowerCase() === activeAddress;
        const isSelected   = (w.address || "").toLowerCase() === currentVal;
        const initial      = (w.name || "W").trim().charAt(0).toUpperCase();
        const shortAddr    = w.address
            ? w.address.slice(0, 6) + "..." + w.address.slice(-4)
            : "-";

        const el = document.createElement("div");
        el.className = "wp-item" + (isSelected ? " selected" : "");
        el.innerHTML = `
            <div class="wp-avatar${isFullAccess ? "" : " view-only"}">${initial}</div>
            <div class="wp-meta">
                <p class="wp-name">${w.name || "Wallet"}${isActive ? '<span class="wp-active-tag">&#9679; Aktif</span>' : ""}</p>
                <p class="wp-addr">${shortAddr}</p>
                <span class="wp-badge ${isFullAccess ? "full-access" : "view-only"}">
                    <i class="fa-solid ${isFullAccess ? "fa-key" : "fa-eye"}"></i>
                    ${isFullAccess ? "Full Access" : "View Only"}
                </span>
            </div>
            <div class="wp-radio"><div class="wp-radio-dot"></div></div>
        `;

        el.addEventListener("click", () => selectSavedAddress(w));
        list.appendChild(el);
    });
}

function selectSavedAddress(wallet) {
    const sel = document.getElementById("savedAddressSelect");
    if (sel) {
        sel.value = wallet.address;
        sel.dispatchEvent(new Event("change")); // trigger logic lama (isi toSend, update balance)
    }
    syncSavedAddressDisplay();
    closeSavedAddressPicker();
}

function syncSavedAddressDisplay() {
    const textEl = document.getElementById("savedAddrOverlayText");
    const sel    = document.getElementById("savedAddressSelect");
    if (!textEl || !sel) return;

    const wallets = getWallets?.() || [];
    const w = wallets.find(w => w.address?.toLowerCase() === sel.value?.toLowerCase());

    textEl.textContent = w
        ? `${w.name || "Wallet"} - ${w.address.slice(0,6)}...${w.address.slice(-4)}`
        : "Pilih address";
}

document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById("savedAddrOverlay");
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openSavedAddressPicker();
        });
    }

    document.getElementById("savedAddressModal")?.addEventListener("click", (e) => {
        if (e.target.id === "savedAddressModal") closeSavedAddressPicker();
    });
});