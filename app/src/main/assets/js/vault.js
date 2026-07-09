// =====================================
// VAULT.JS â€” Encrypted Local Vault
// AES-256-GCM + PBKDF2 (100k iterations)
// Menggunakan Web Crypto API (native browser)
// Tidak butuh library tambahan
// =====================================
//
// STRUKTUR DATA VAULT (plaintext sebelum enkripsi):
// {
//     version:     1,
//     accounts: [
//         {
//             index:      0,
//             address:    "0x...",
//             privateKey: "0x...",
//             name:       "Account 1",
//             source:     "generated" | "mnemonic" | "privateKey",
//             addedAt:    1234567890
//         }
//     ],
//     mnemonic:    "word1 word2 ... word12",  // null jika import PK
//     hasMnemonic: true/false,
//     createdAt:   1234567890
// }
//
// STRUKTUR VAULT ENCRYPTED (tersimpan di localStorage):
// {
//     version: 1,
//     iv:      "base64...",    // 12 byte AES-GCM IV
//     salt:    "base64...",    // 16 byte PBKDF2 salt
//     cipher:  "base64..."    // encrypted JSON payload
// }
// =====================================

const VAULT_STORAGE_KEY = "sidra_vault_v1";
const PBKDF2_ITERATIONS = 100000;

const vault = {

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // INTERNAL: Convert ArrayBuffer â†” base64
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    _toBase64(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    },

    _fromBase64(b64) {
        return new Uint8Array(atob(b64).split("").map(c => c.charCodeAt(0)));
    },

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // INTERNAL: Derive AES key dari PIN
    // Menggunakan PBKDF2-SHA256
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async _deriveKey(pin, salt) {
        const enc     = new TextEncoder();
        const keyMat  = await crypto.subtle.importKey(
            "raw",
            enc.encode(pin),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );

        return crypto.subtle.deriveKey(
            {
                name:       "PBKDF2",
                salt:       salt,
                iterations: PBKDF2_ITERATIONS,
                hash:       "SHA-256"
            },
            keyMat,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CREATE VAULT â€” simpan data wallet terenkripsi
    // Dipanggil saat: create wallet baru ATAU reset
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async createVault(walletData, pin) {
        if (!pin || pin.length < 4) {
            throw new Error("PIN minimal 4 karakter");
        }

        const salt    = crypto.getRandomValues(new Uint8Array(16));
        const iv      = crypto.getRandomValues(new Uint8Array(12));
        const key     = await this._deriveKey(pin, salt);

        // Payload yang akan dienkripsi
        const payload = JSON.stringify({
            version:     1,
            accounts: [{
                index:      0,
                address:    walletData.address,
                privateKey: walletData.privateKey,
                name:       walletData.name || "Account 1",
                source:     walletData.source || "generated",
                addedAt:    Date.now()
            }],
            mnemonic:    walletData.mnemonic    || null,
            hasMnemonic: walletData.hasMnemonic || !!walletData.mnemonic,
            createdAt:   Date.now()
        });

        const enc     = new TextEncoder();
        const cipher  = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            enc.encode(payload)
        );

        const vaultObj = {
            version: 1,
            iv:      this._toBase64(iv),
            salt:    this._toBase64(salt),
            cipher:  this._toBase64(cipher)
        };

        localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vaultObj));
        return true;
    },

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // UNLOCK VAULT â€” decrypt dan kembalikan data
    // Throws jika PIN salah
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async unlockVault(pin) {
        const stored = localStorage.getItem(VAULT_STORAGE_KEY);
        if (!stored) throw new Error("Vault tidak ditemukan. Buat wallet dulu.");

        let vaultObj;
        try {
            vaultObj = JSON.parse(stored);
        } catch {
            throw new Error("Vault rusak. Perlu reset.");
        }

        const iv     = this._fromBase64(vaultObj.iv);
        const salt   = this._fromBase64(vaultObj.salt);
        const cipher = this._fromBase64(vaultObj.cipher);

        const key = await this._deriveKey(pin, salt);

        try {
            const plain = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                key,
                cipher
            );
            return JSON.parse(new TextDecoder().decode(plain));
        } catch {
            // AES-GCM gagal decrypt = PIN salah atau data rusak
            throw new Error("PIN salah");
        }
    },

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // UPDATE VAULT â€” simpan ulang dengan data baru
    // Verifikasi PIN dulu sebelum update
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async updateVault(newData, pin) {
        // Verifikasi PIN dengan decrypt dulu
        await this.unlockVault(pin);

        // Ambil salt lama (biar konsisten) atau buat baru
        const stored   = localStorage.getItem(VAULT_STORAGE_KEY);
        const vaultObj = JSON.parse(stored);
        const salt     = this._fromBase64(vaultObj.salt);
        const iv       = crypto.getRandomValues(new Uint8Array(12)); // IV baru tiap update

        const key = await this._deriveKey(pin, salt);

        const enc    = new TextEncoder();
        const cipher = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            enc.encode(JSON.stringify(newData))
        );

        const updated = {
            version: 1,
            iv:      this._toBase64(iv),
            salt:    this._toBase64(salt),
            cipher:  this._toBase64(cipher)
        };

        localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(updated));
        return true;
    },

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // CHANGE PIN â€” encrypt ulang dengan PIN baru
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async changePIN(oldPin, newPin) {
        if (!newPin || newPin.length < 4) {
            throw new Error("PIN baru minimal 4 karakter");
        }

        // Decrypt dengan PIN lama
        const data  = await this.unlockVault(oldPin);

        // Encrypt ulang dengan PIN baru (salt baru juga)
        const salt  = crypto.getRandomValues(new Uint8Array(16));
        const iv    = crypto.getRandomValues(new Uint8Array(12));
        const key   = await this._deriveKey(newPin, salt);

        const enc    = new TextEncoder();
        const cipher = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            enc.encode(JSON.stringify(data))
        );

        localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify({
            version: 1,
            iv:      this._toBase64(iv),
            salt:    this._toBase64(salt),
            cipher:  this._toBase64(cipher)
        }));

        return true;
    },

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // ADD ACCOUNT â€” tambah account ke vault
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async addAccount(pin, newAccount) {
        const data = await this.unlockVault(pin);

        // Cek duplikat address
        const exists = data.accounts.some(
            a => a.address.toLowerCase() === newAccount.address.toLowerCase()
        );
        if (exists) throw new Error("Account sudah ada di vault");

        data.accounts.push({
            index:   data.accounts.length,
            address:    newAccount.address,
            privateKey: newAccount.privateKey,
            name:       newAccount.name || `Account ${data.accounts.length + 1}`,
            source:     newAccount.source || "derived",
            addedAt:    Date.now()
        });

        await this.updateVault(data, pin);
        return data.accounts;
    },

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // RENAME ACCOUNT
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    async renameAccount(pin, index, newName) {
        const data = await this.unlockVault(pin);
        if (!data.accounts[index]) throw new Error("Account tidak ditemukan");

        data.accounts[index].name = newName;
        await this.updateVault(data, pin);
        return true;
    },

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // EXISTS â€” cek vault ada atau belum
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    exists() {
        return !!localStorage.getItem(VAULT_STORAGE_KEY);
    },

    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // DESTROY â€” hapus vault permanen
    // Hanya dipanggil saat user pilih "Reset Wallet"
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    destroy() {
        localStorage.removeItem(VAULT_STORAGE_KEY);
    }
};