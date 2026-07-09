// =====================================
// PK WALLET MODULE
// Tanggung jawab: input listener, sync
// ke wallet list, balance, send native
// SECURITY PATCH v2:
// [SEC-1]  syncPKToWalletList: TIDAK lagi simpan privateKey ke wallet list
// [SEC-2]  savePKWallet: DIHAPUS â€” tidak simpan PK ke localStorage
// [SEC-3]  loadPKWallet: DIHAPUS â€” tidak load PK dari localStorage
// [SEC-4]  initPrivateKeyWallet: bersihkan WALLET_SESSION (legacy)
//          hanya pakai SESSION dari wallet-session.js
// =====================================
// CATATAN: fungsi restorePK, lockPK,
// unlockPK, requirePK, savePKSession
// ada di wallet-core.js
// =====================================

window.__PK_RESTORING = window.__PK_RESTORING || false;
window.PK_STORAGE_KEY = window.PK_STORAGE_KEY  || "sda_pk_wallet";

window.pkProvider = window.pkProvider || new ethers.providers.JsonRpcProvider(
    window.RPC || "https://node.sidrachain.com"
);


// =====================================
// INIT â€” pasang listener ke input PK
// =====================================
function initPrivateKeyWallet() {

    const input = document.getElementById("globalPKInput");
    if (!input) return;

    input.addEventListener("input", (e) => {

        const pk = e.target.value.trim();

        if (!pk || pk.length < 20) {
            // Bersihkan SESSION (dari wallet-session.js)
            SESSION.signer   = null;
            SESSION.address  = null;
            SESSION.unlocked = false;
            updatePKUI?.();
            return;
        }

        try {
            const wallet = new ethers.Wallet(pk, window.pkProvider);

            // Set ke SESSION â€” satu-satunya state yang valid
            SESSION.signer   = wallet;
            SESSION.address  = wallet.address;
            SESSION.unlocked = true;

            if (!window.__PK_RESTORING) {
                // [SEC-1] Tidak pass pk â€” hanya address
                syncPKToWalletList(wallet.address);
            }

            updatePKUI?.();

        } catch {
            SESSION.signer   = null;
            SESSION.address  = null;
            SESSION.unlocked = false;
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
        if (!window._isSwitchingAccount) {
            select.dispatchEvent(new Event("change"));
        }
    }

    window.activeWallet = wallets[index] || null;
}


// =====================================
// GET PK WALLET (alias aman)
// Selalu dari SESSION â€” tidak dari storage
// =====================================
function getPKWallet() {
    return SESSION?.signer || null;
}


// =====================================
// SEND â€” native & ERC20
// Pakai SESSION.signer via requireSigner
// =====================================
async function sendWithPrivateKey(to, amount, tokenAddress = null) {

    // requireSigner dari wallet-session.js â€” throw kalau terkunci
    const wallet = requireSigner();

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
        if (err.message?.includes("terkunci")) throw err; // re-throw guard error
        console.error(err);
        showToast?.("Send gagal", "error");
    }
}


// =====================================
// BALANCE â€” native & ERC20
// Pakai address dari SESSION â€” tidak perlu signer untuk read
// =====================================
async function getPKBalance(tokenAddress = null) {

    // Untuk balance tidak perlu signer, cukup address
    const address = SESSION?.address;
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
// [SEC-2] savePKWallet â€” DIHAPUS
// Fungsi ini tidak lagi menyimpan apapun
// PK hanya boleh ada di vault terenkripsi
// =====================================
function savePKWallet(pk, address) {
    // DEPRECATED â€” tidak menyimpan PK ke localStorage
    console.warn("[Security] savePKWallet dipanggil tapi sudah deprecated â€” tidak menyimpan PK");
}


// =====================================
// [SEC-3] loadPKWallet â€” DIHAPUS
// Tidak lagi load PK dari localStorage
// Pengguna harus masukkan PIN
// =====================================
function loadPKWallet() {
    // DEPRECATED â€” tidak membaca PK dari localStorage
    console.info("[wallet-pk] loadPKWallet deprecated â€” gunakan vault.unlockVault");
}


// =====================================
// SYNC PK KE WALLET LIST
// [SEC-1] TIDAK LAGI menyimpan privateKey ke wallet list di localStorage
// Wallet list hanya menyimpan address, name, type
// =====================================
function syncPKToWalletList(address) {
    // Parameter pk DIHAPUS dari signature

    if (window.__PK_RESTORING) return;

    let wallets = getWallets?.() || [];
    const addr  = address.toLowerCase();

    const exist = wallets.find(w => w.address?.toLowerCase() === addr);

    if (!exist) {
        wallets.push({
            address,
            name: "Main Wallet (PK)",
            type: "pk"
            // TIDAK ADA privateKey
        });
    } else {
        // Update type, bersihkan privateKey kalau ada sisa lama
        exist.type = "pk";
        if (exist.privateKey) {
            delete exist.privateKey;
        }
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
// [SEC-3] loadPKWallet dihapus dari sini
// Tidak ada restore PK dari localStorage
// =====================================
document.addEventListener("DOMContentLoaded", () => {
    initPrivateKeyWallet();
    // loadPKWallet() â€” DIHAPUS
    // Pengguna harus masukkan PIN untuk unlock

    setTimeout(() => {
        if (typeof validateInput === "function") validateInput();
    }, 100);
});