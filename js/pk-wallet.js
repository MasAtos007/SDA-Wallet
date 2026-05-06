// =====================================
// PK WALLET MODULE
// Tanggung jawab: input listener, sync
// ke wallet list, balance, send native
// =====================================
// CATATAN: fungsi restorePK, lockPK,
// unlockPK, requirePK, savePKSession
// ada di wallet-core.js — jangan duplikat
// =====================================

window.__PK_RESTORING  = window.__PK_RESTORING  || false;
window.PK_STORAGE_KEY  = window.PK_STORAGE_KEY  || "sda_pk_wallet";

window.pkProvider = window.pkProvider || new ethers.providers.JsonRpcProvider(
    "https://node.sidrachain.com"
);


// =====================================
// INIT — pasang listener ke input PK
// =====================================
function initPrivateKeyWallet() {

    const input = document.getElementById("globalPKInput");
    if (!input) return;

    input.addEventListener("input", (e) => {

        const pk = e.target.value.trim();

        // reset state kalau input kosong / terlalu pendek
        if (!pk || pk.length < 20) {
            window.WALLET_SESSION.pkWallet      = null;
            window.WALLET_SESSION.activeAddress = null;
            updatePKUI?.();
            return;
        }

        try {
            const wallet = new ethers.Wallet(pk, window.pkProvider);

            window.WALLET_SESSION.pkWallet      = wallet;
            window.WALLET_SESSION.activeAddress = wallet.address;
            window.WALLET_SESSION.mode          = "pk";

            if (!window.__PK_RESTORING) {
                syncPKToWalletList(pk, wallet.address);
            }

            updatePKUI?.();

        } catch {
            window.WALLET_SESSION.pkWallet      = null;
            window.WALLET_SESSION.activeAddress = null;
            updatePKUI?.();
        }
    });
}


// =====================================
// SET ACTIVE WALLET BY ADDRESS
// =====================================
function setActiveWalletByPK(address) {

    const select  = document.getElementById("walletSelect");
    const wallets = getWallets?.() || [];

    const index = wallets.findIndex(
        w => w.address?.toLowerCase() === address.toLowerCase()
    );

    if (index !== -1 && select) {
        select.value = String(index);
        select.dispatchEvent(new Event("change"));
    }

    window.activeWallet = wallets[index] || null;
}


// =====================================
// GET PK WALLET (alias aman)
// =====================================
function getPKWallet() {
    return window.WALLET_SESSION.pkWallet;
}


// =====================================
// SEND — native & ERC20
// =====================================
async function sendWithPrivateKey(to, amount, tokenAddress = null) {

    const wallet = getPKWallet();
    if (!wallet) return showToast?.("Private key belum diinput", "error");

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

        const tx = await contract.transfer(
            to,
            ethers.utils.parseUnits(amount, 18)
        );
        showToast?.("TX sent: " + tx.hash, "success");
        return tx;

    } catch (err) {
        console.error(err);
        showToast?.("Send gagal", "error");
    }
}


// =====================================
// BALANCE — native & ERC20
// =====================================
async function getPKBalance(tokenAddress = null) {

    const wallet = getPKWallet();
    if (!wallet) return null;

    try {
        if (!tokenAddress) {
            const bal = await window.pkProvider.getBalance(wallet.address);
            return ethers.utils.formatEther(bal);
        }

        const abi = [
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
// SAVE PK KE STORAGE LAMA (legacy)
// =====================================
function savePKWallet(pk, address) {
    localStorage.setItem(window.PK_STORAGE_KEY, JSON.stringify({ pk, address }));
}


// =====================================
// LOAD PK DARI STORAGE LAMA (legacy)
// Dipakai sebelum wallet-core ada.
// Kalau wallet-core.js sudah aktif,
// restorePK() di sana yang jalan.
// =====================================
function loadPKWallet() {

    try {
        window.__PK_RESTORING = true;

        const data = JSON.parse(localStorage.getItem(window.PK_STORAGE_KEY));
        if (!data?.pk) return;

        const wallet = new ethers.Wallet(data.pk, window.pkProvider);
        window.WALLET_SESSION.pkWallet = wallet;

        const select  = document.getElementById("walletSelect");
        const wallets = getWallets?.() || [];
        const index   = wallets.findIndex(
            w => w.address?.toLowerCase() === wallet.address.toLowerCase()
        );

        if (select && index !== -1) select.value = String(index);

        updateActiveWalletName?.();
        loadBalance?.();

    } catch (err) {
        console.warn("PK load failed:", err);
    } finally {
        window.__PK_RESTORING = false;
    }
}


// =====================================
// SYNC PK KE WALLET LIST
// =====================================
function syncPKToWalletList(pk, address) {

    if (window.__PK_RESTORING) return;

    let wallets = getWallets?.() || [];
    const addr  = address.toLowerCase();

    const exist = wallets.find(w => w.address.toLowerCase() === addr);

    if (!exist) {
        wallets.push({
            address,
            name:       "Main Wallet (PK)",
            type:       "pk",
            privateKey: pk
        });
    } else if (exist.type !== "pk") {
        exist.type       = "pk";
        exist.privateKey = pk;
    }

    setWallets(wallets);

    const index  = wallets.findIndex(w => w.address.toLowerCase() === addr);
    const select = document.getElementById("walletSelect");
    if (select && index !== -1) select.value = String(index);

    renderWallets?.();
    renderSavedAddresses?.();
    updateActiveWalletName?.();
    loadBalance?.();
    setActiveWalletByPK(address);
}


// =====================================
// AUTO INIT
// =====================================
document.addEventListener("DOMContentLoaded", () => {
    initPrivateKeyWallet();
    loadPKWallet();

    setTimeout(() => {
        if (typeof validateInput === "function") validateInput();
    }, 100);
});