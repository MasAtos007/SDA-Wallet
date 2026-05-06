// ==========================
// UNWRAP ENGINE FINAL
// ==========================

window.UNWRAP_ENGINE = {

    // ==========================
    // GET ACTIVE WALLET (FIX PK + SELECT)
    // ==========================
    getWallet() {

        // PRIORITY 1: PK wallet
        if (window.pkWallet) return window.pkWallet;

        // PRIORITY 2: selected wallet
        const w = getSelectedWallet?.();
        if (w?.signer) return w.signer;
        if (w?.privateKey) {
            return new ethers.Wallet(w.privateKey, window.pkProvider);
        }

        return null;
    },

    getAddress() {

        if (window.pkWallet) return window.pkWallet.address;

        const w = getSelectedWallet?.();
        return w?.address || null;
    },

    // ==========================
    // UNWRAP ALL WSDA
    // ==========================
    async unwrapAll() {

        const wallet = this.getWallet();
        const address = this.getAddress();

        if (!wallet || !address) {
            return alert("Wallet not found (PK / SELECT ERROR)");
        }

        const WSDA = window.CONFIG?.WSDA;
        if (!WSDA) return alert("WSDA address not set");

        try {

            const abi = [
                "function balanceOf(address) view returns (uint256)",
                "function withdraw(uint256)"
            ];

            const contract = new ethers.Contract(
                WSDA,
                abi,
                wallet
            );

            const bal = await contract.balanceOf(address);

            if (!bal || bal.toString() === "0") {
                return alert("WSDA balance 0");
            }

            const tx = await contract.withdraw(bal);

            await tx.wait();

            alert("Unwrap SUCCESS");

            loadBalance?.();
            renderAssets?.();

        } catch (e) {
            console.error(e);
            alert("Unwrap FAILED");
        }
    }
};