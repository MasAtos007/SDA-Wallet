// =============================
// SEND MODAL CONTROLLER
// v3 - sendTx + confirm terintegrasi
// =============================

function getEl(id) { return document.getElementById(id); }

function openSendProcess(text = "Mengirim transaksi...") {
    const el = document.getElementById("sendProcessModal");
    if (!el) return;

    const txt = document.getElementById("sendProcessText");
    if (txt) txt.innerText = text;

    el.style.display = "flex";
}

function updateSendProcess(text) {
    const txt = document.getElementById("sendProcessText");
    if (txt) txt.innerText = text;
}

function closeSendProcess() {
    const el = document.getElementById("sendProcessModal");
    if (el) el.style.display = "none";
}

// =============================
// INIT
// =============================
document.addEventListener("DOMContentLoaded", () => {

    const sendModal    = getEl("sendModal");
    const openSendBtn  = getEl("openSendBtn");
    const closeSendBtn = getEl("closeSendModal");

    console.log("BOTTOM NAV =", document.querySelector(".bottom-nav"));

    // OPEN
    if (openSendBtn && sendModal) {
        openSendBtn.addEventListener("click", () => {

            if (!SESSION?.unlocked || !SESSION?.signer) {
                showToast?.("Unlock wallet dulu", "error");
                showPINUnlockScreen?.();
                return;
            }

            sendModal.classList.add("show");
            setBottomNavActive?.("navSend");

            _updateSendWalletInfo();
            syncSendTokenUI();
            updateSendBalance?.();
            renderSavedAddresses?.();

            const amountInput = getEl("amountSend");
            const toInput     = getEl("toSend");
            if (amountInput) amountInput.value = "";
            if (toInput)     toInput.value     = "";
        });
    }

    // CLOSE
    if (closeSendBtn && sendModal) {
        closeSendBtn.addEventListener("click", () => {
            sendModal.classList.remove("show");
            setBottomNavActive?.("navHome");
        });
    }
    if (sendModal) {
        sendModal.addEventListener("click", (e) => {
            if (e.target === sendModal) {
                sendModal.classList.remove("show");
                document.querySelector(".bottom-nav")
                    ?.classList.remove("modal-open");
            }
        });
    }

    // AMOUNT - validasi live
    const amountInput = getEl("amountSend");
    if (amountInput) {
        amountInput.addEventListener("input", () => updateSendBalance?.());
    }

    // TO ADDRESS - validasi live
    const toInput = getEl("toSend");
    if (toInput) {
        toInput.addEventListener("input", () => {
            const val   = toInput.value.trim();
            const valid = isValidEvmAddress(val);
            toInput.style.borderColor = val.length > 5
                ? (valid ? "#00cc66" : "#ff4444")
                : "";
        });

        // Intercept paste native (keyboard/long-press), bukan cuma tombol custom
        toInput.addEventListener("paste", (e) => {
            e.preventDefault();
            const pasted = (e.clipboardData || window.clipboardData)
                ?.getData("text")
                ?.trim() || "";

            if (!pasted) return;

            if (!isValidEvmAddress(pasted)) {
                showToast?.("Bukan format alamat wallet yang valid", "error");
                return;
            }

            toInput.value = pasted;
            toInput.dispatchEvent(new Event("input"));
        });
    }

    // SAVED ADDRESS -> isi toSend
    const savedSel = getEl("savedAddressSelect");
    if (savedSel) {
        savedSel.addEventListener("change", () => {
            const toInput = getEl("toSend");
            if (toInput && savedSel.value) {
                toInput.value = savedSel.value;
                toInput.dispatchEvent(new Event("input"));
            }
        });
    }

    // TOKEN SELECT -> update icon + balance
    const tokenSel = getEl("sendTokenSelect");
    if (tokenSel) {
        tokenSel.addEventListener("change", (e) => setSendToken(e.target.value));
    }

    // CONFIRM SEND MODAL - close on backdrop click
    const sendConfirm = getEl("sendConfirmModal");
    if (sendConfirm) {
        sendConfirm.addEventListener("click", (e) => {
            if (e.target === sendConfirm || e.target.classList.contains("confirm-backdrop")) {
                closeSendConfirm();
            }
        });
    }
});


// =============================
// UPDATE INFO WALLET AKTIF
// =============================
function _updateSendWalletInfo() {
    const nameEl   = getEl("sendWalletName");
    const addrEl   = getEl("sendWalletAddr");
    const statusEl = getEl("sendWalletStatus");

    const address  = SESSION?.address || null;
    const unlocked = SESSION?.unlocked || false;

    const wallets = getWallets?.() || [];
    const wallet  = wallets.find(w => w.address?.toLowerCase() === address?.toLowerCase());
    const name    = wallet?.name || "Account 1";

    if (nameEl) nameEl.textContent = name;
    if (addrEl) {
        addrEl.textContent = address
            ? address.slice(0, 10) + "..." + address.slice(-8)
            : "-";
    }
    if (statusEl) {
        if (unlocked && address) {
            statusEl.innerHTML        = '<i class="fa-solid fa-lock-open" style="margin-right:3px;"></i>Siap';
            statusEl.style.background = "#00cc6620";
            statusEl.style.color      = "#00cc66";
        } else {
            statusEl.innerHTML        = '<i class="fa-solid fa-lock" style="margin-right:3px;"></i>Terkunci';
            statusEl.style.background = "#ff333320";
            statusEl.style.color      = "#ff4444";
        }
    }
}


// =============================
// MAX BUTTON
// =============================
async function setSendMax() {

    const input = getEl("amountSend");
    if (!input) return;

    const addr =
        getSelectedWallet?.()?.address ||
        SESSION?.address;

    if (!addr) return;

    const tokenData = window.selectedTokenData || { type: "native" };
    const isNativeToken = !tokenData?.address || tokenData?.type === "native";

    try {

        if (isNativeToken) {

            // Token native (SDA) — sisakan reserve buat gas
            const bal =
                await provider.getBalance(addr);

            const amount =
                parseFloat(
                    ethers.utils.formatEther(bal)
                );

            const reserve = 0.0001;

            input.value =
                amount > reserve
                    ? (amount - reserve).toFixed(6)
                    : amount.toFixed(6);

        } else {

            // Token ERC20 — ambil balanceOf dari contract, tanpa reserve
            const abi = [
                "function balanceOf(address) view returns (uint256)",
                "function decimals() view returns (uint8)"
            ];

            const contract = new ethers.Contract(tokenData.address, abi, provider);

            const [bal, dec] = await Promise.all([
                contract.balanceOf(addr),
                contract.decimals().catch(() => tokenData.decimals || 18)
            ]);

            const amount =
                parseFloat(
                    ethers.utils.formatUnits(bal, dec)
                );

            input.value = amount.toFixed(6);
        }

    } catch (e) {

        console.error(e);
        showToast?.("Gagal ambil saldo token", "error");

    }

}


// =============================
// PASTE ADDRESS
// =============================
function isValidEvmAddress(str) {
    return /^0x[a-fA-F0-9]{40}$/.test(str);
}

async function pasteToAddress() {

    const input = getEl("toSend");
    if (!input) return;

    try {

        let text = "";

        if (
            window.AndroidWallet &&
            typeof AndroidWallet.getClipboardText === "function"
        ) {

            text = AndroidWallet.getClipboardText();

        } else if (
            navigator.clipboard?.readText
        ) {

            text = await navigator.clipboard.readText();
        }

        text = (text || "").trim();

        if (!text) {
            showToast?.("Clipboard kosong", "error");
            return;
        }

        if (!isValidEvmAddress(text)) {
            showToast?.("Bukan format alamat wallet yang valid", "error");
            return;
        }

        input.value = text;
        input.dispatchEvent(new Event("input"));

    } catch (e) {

        console.error(e);

        showToast?.(
            "Clipboard tidak dapat diakses",
            "error"
        );
    }
}


// =============================
// SYNC TOKEN UI
// =============================
function syncSendTokenUI() {
    const val = window.selectedToken || "native";
    let logo = "img/sda.png", symbol = "SDA";

    if (val === "native") {
        window.selectedTokenData = { symbol: "SDA", type: "native", decimals: 18, logo: "img/sda.png" };
    } else {
        const token = (window.TOKENS || []).find(t => t.address === val);
        if (token) {
            logo   = token.logo || "img/default.png";
            symbol = token.symbol;
            window.selectedTokenData = { ...token, type: "erc20", decimals: token.decimals || 18 };
        }
    }

    const iconEl   = getEl("sendTokenIcon");
    const iconSmEl = getEl("sendTokenIconSm");
    const symbolEl = getEl("sendTokenSymbol");
    const selectEl = getEl("sendTokenSelect");

    if (iconEl)   iconEl.src = logo;
    if (iconSmEl) iconSmEl.src = logo;
    if (symbolEl) symbolEl.textContent = symbol;
    if (selectEl) selectEl.value = val;
}


// =============================
// SET TOKEN
// =============================
function setSendToken(tokenAddress) {
    window.selectedToken = tokenAddress || "native";
    localStorage.setItem("selectedToken", window.selectedToken);

    if (window.selectedToken === "native") {
        window.selectedTokenData = { symbol: "SDA", type: "native", decimals: 18, logo: "img/sda.png" };
    } else {
        const token = (window.TOKENS || []).find(t => t.address === window.selectedToken);
        if (token) {
            window.selectedTokenData = { ...token, type: "erc20", decimals: token.decimals || 18 };
        }
    }

    syncSendTokenUI();
    loadBalance?.();
    updateSendBalance?.();
    renderAssets?.();
}


// =============================
// SEND TX - tampilkan confirm dulu
// =============================
async function sendTx() {

    const to     = getEl("toSend")?.value?.trim();
    const amount = getEl("amountSend")?.value?.trim();

    if (!to || !to.startsWith("0x") || to.length < 42) {
        showToast?.("Alamat tujuan tidak valid", "error");
        return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        showToast?.("Jumlah tidak valid", "error");
        return;
    }
    if (!SESSION?.unlocked || !SESSION?.signer) {
        showToast?.("Unlock wallet dulu", "error");
        showPINUnlockScreen?.();
        return;
    }

    const tokenData   = window.selectedTokenData || { symbol: "SDA", type: "native", decimals: 18, logo: "img/sda.png" };
    const fromAddress =
        getSelectedWallet()?.address ||
        SESSION.address ||
        "";
    const wallets     = getWallets?.() || [];
    const fromName    = wallets.find(w => w.address?.toLowerCase() === fromAddress.toLowerCase())?.name || "Account 1";

    // Tampilkan confirm modal - eksekusi di executeSendTx()
    showSendConfirmModal({ to, amount, tokenData, fromAddress, fromName });
}


// =============================
// SHOW SEND CONFIRM MODAL
// =============================
window._pendingSendData = null;

function showSendConfirmModal({ to, amount, tokenData, fromAddress, fromName }) {

    const isNativeToken = !tokenData?.address || tokenData?.type === "native";

    const iconEl = getEl("confirmSendIcon");
    if (iconEl) {
        iconEl.src = isNativeToken
            ? "img/sda.png"
            : (tokenData?.logo || tokenData?.icon || "img/default.png");
    }

    const set = (id, val) => { const el = getEl(id); if (el) el.textContent = val; };

    set("confirmSendAmount", Number(amount).toLocaleString(undefined, { maximumFractionDigits: 6 }));
    set("confirmSendSymbol", tokenData?.symbol || "SDA");
    set("confirmSendFrom",   (fromName ? fromName + " Â· " : "") + (fromAddress ? fromAddress.slice(0,10) + "..." + fromAddress.slice(-8) : "-"));
    set("confirmSendTo",     to ? to.slice(0,10) + "..." + to.slice(-8) : "-");

    window._pendingSendData = { to, amount, tokenData, fromAddress };

    const modal = getEl("sendConfirmModal");
    if (modal) {
        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
    }
}

function closeSendConfirm() {
    const modal = getEl("sendConfirmModal");
    if (modal) modal.style.display = "none";
    document.body.style.overflow = "";
    window._pendingSendData = null;
}


// =============================
// EXECUTE SEND - dipanggil tombol konfirmasi
// =============================
async function executeSendTx() {

    const data = window._pendingSendData;
    if (!data) return;

    closeSendConfirm();

    const { to, amount, tokenData, fromAddress } = data;
    const isNativeToken = !tokenData?.address || tokenData?.type === "native";

    openSendProcess("Mempersiapkan...");

    // Update icon di process modal sesuai token
    const processIcon = document.querySelector("#sendProcessModal .tx-loading-tokens img");
    if (processIcon) {
        processIcon.src = isNativeToken
            ? "img/sda.png"
            : (tokenData?.logo || "img/default.png");
        processIcon.onerror = function() { this.src = "img/default.png"; };
    }

    try {
        const signer = (typeof requireSigner === "function") ? requireSigner() : SESSION?.signer;
        if (!signer) throw new Error("Wallet terkunci. Unlock dulu.");

        updateSendProcess("Mengirim Transaksi...");

        let tx;
        if (isNativeToken) {
            tx = await signer.sendTransaction({
                to,
                value: ethers.utils.parseEther(String(amount))
            });
        } else {
            const abi      = ["function transfer(address to, uint256 amount) returns (bool)"];
            const contract = new ethers.Contract(tokenData.address, abi, signer);
            tx = await contract.transfer(
                to,
                ethers.utils.parseUnits(String(amount), tokenData.decimals || 18)
            );
        }

        updateSendProcess("Menunggu Konfirmasi...");

        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("Transaksi gagal di blockchain");

        updateSendProcess("Berhasil!");

        // Simpan history
        try {
            const history = JSON.parse(localStorage.getItem("txHistory") || "[]");
            history.unshift({
                hash:         tx.hash,
                from:         fromAddress,
                to,
                value:        amount,
                symbol:       tokenData?.symbol || "SDA",
                logo:         isNativeToken ? "img/sda.png" : (tokenData?.logo || "img/default.png"),
                tokenAddress: tokenData?.address || "native",
                type:         "SEND",
                timestamp:    Date.now(),
                status:       "success",
                read:         false
            });
            if (history.length > 50) history.pop();
            localStorage.setItem("txHistory", JSON.stringify(history));
        } catch (e) { console.warn("history error", e); }

        renderTxHistory?.();
        updateBellBadge?.();
        refreshAll?.();
        showToast?.("Terkirim! " + tx.hash.slice(0, 12) + "...", "success");

        const wallets  = getWallets?.() || [];
        const fromName = wallets.find(
            w => w.address?.toLowerCase() === fromAddress.toLowerCase()
        )?.name || "Account 1";

        closeSendProcess();

        showSendSuccessModal({
            hash: tx.hash,
            amount,
            tokenData,
            fromAddress,
            fromName,
            to,
            receipt,
            explorerUrl:
                window.EXPLORER_TX_URL ||
                window.EXPLORER_URL ||
                "https://ledger.sidrachain.com/tx/"
        });

        // Tutup send modal
        getEl("sendModal")?.classList.remove("show");

    } catch (err) {
        console.error(err);
        closeSendProcess();
        showToast?.(err.message || "Transaksi gagal", "error");
    } finally {
        window._pendingSendData = null;
    }
}