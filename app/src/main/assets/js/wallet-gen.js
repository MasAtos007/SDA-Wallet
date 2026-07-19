// =====================================
// WALLET-GEN.JS â€” Generate & Import Wallet
// Menggunakan ethers.js v5 HDNode
// Kompatibel dengan SidraChain EVM
// =====================================

// Derivation path standar EVM (MetaMask compatible)
const SIDRA_DERIVATION_PATH = "m/44'/60'/0'/0";

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GENERATE WALLET BARU (mnemonic 12 kata)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function generateNewWallet() {
    try {
        const wallet = ethers.Wallet.createRandom();
        return {
            mnemonic:    wallet.mnemonic.phrase,
            privateKey:  wallet.privateKey,
            address:     wallet.address,
            path:        wallet.mnemonic.path || `${SIDRA_DERIVATION_PATH}/0`,
            accountIndex: 0,
            source:      "generated"
        };
    } catch (err) {
        console.error("generateNewWallet error:", err);
        throw new Error(LANG[CURRENT_LANG]?.err_gen_wallet_failed || "Gagal generate wallet");
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DERIVE ACCOUNT DARI MNEMONIC (multi-account)
// index 0 = account utama, 1 = kedua, dst
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function deriveAccount(mnemonic, index = 0) {
    try {
        const path   = `${SIDRA_DERIVATION_PATH}/${index}`;
        const wallet = ethers.Wallet.fromMnemonic(mnemonic.trim(), path);
        return {
            address:     wallet.address,
            privateKey:  wallet.privateKey,
            index:       index,
            path:        path,
            name:        index === 0 ? "Account 1" : `Account ${index + 1}`
        };
    } catch (err) {
        console.error("deriveAccount error:", err);
        throw new Error(LANG[CURRENT_LANG]?.err_derive_account_failed || "Gagal derive account dari seed phrase");
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// IMPORT DARI PRIVATE KEY
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function importFromPrivateKey(pk) {
    try {
        const cleaned = pk.trim();
        const wallet  = new ethers.Wallet(cleaned);
        return {
            address:     wallet.address,
            privateKey:  wallet.privateKey,
            index:       0,
            source:      "privateKey",
            hasMnemonic: false,
            mnemonic:    null
        };
    } catch {
        throw new Error(LANG[CURRENT_LANG]?.err_pk_invalid || "Private key tidak valid");
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// IMPORT DARI MNEMONIC / SEED PHRASE
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function importFromMnemonic(phrase, index = 0) {
    try {
        const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
        const words      = normalized.split(" ");

        // Validasi jumlah kata (12 atau 24)
        if (words.length !== 12 && words.length !== 24) {
            throw new Error(LANG[CURRENT_LANG]?.err_seed_word_count || "Seed phrase harus 12 atau 24 kata");
        }

        if (!ethers.utils.isValidMnemonic(normalized)) {
            throw new Error(LANG[CURRENT_LANG]?.err_seed_invalid || "Seed phrase tidak valid");
        }

        const account = deriveAccount(normalized, index);
        return {
            ...account,
            mnemonic:    normalized,
            hasMnemonic: true,
            source:      "mnemonic"
        };
    } catch (err) {
        // Re-throw kalau sudah pesan yang di-lempar manual di atas
        const knownMsgs = [
            LANG[CURRENT_LANG]?.err_seed_word_count,
            LANG[CURRENT_LANG]?.err_seed_invalid,
            "Seed phrase harus 12 atau 24 kata",
            "Seed phrase tidak valid"
        ];
        if (knownMsgs.includes(err.message)) {
            throw err;
        }
        throw new Error(LANG[CURRENT_LANG]?.err_seed_invalid_check || "Seed phrase tidak valid. Periksa kembali setiap kata.");
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// VALIDASI PRIVATE KEY (tanpa throw)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function isValidPrivateKey(pk) {
    try {
        new ethers.Wallet(pk.trim());
        return true;
    } catch {
        return false;
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// VALIDASI MNEMONIC (tanpa throw)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function isValidMnemonic(phrase) {
    try {
        const normalized = phrase.trim().toLowerCase().replace(/\s+/g, " ");
        const words      = normalized.split(" ");
        if (words.length !== 12 && words.length !== 24) return false;
        return ethers.utils.isValidMnemonic(normalized);
    } catch {
        return false;
    }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DERIVE MULTIPLE ACCOUNTS SEKALIGUS
// Untuk preview saat import mnemonic
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function deriveMultipleAccounts(mnemonic, count = 3) {
    const accounts = [];
    for (let i = 0; i < count; i++) {
        try {
            accounts.push(deriveAccount(mnemonic, i));
        } catch {
            break;
        }
    }
    return accounts;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// FORMAT ADDRESS PENDEK
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function shortAddr(addr) {
    if (!addr) return "-";
    return addr.slice(0, 6) + "..." + addr.slice(-4);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// SPLIT MNEMONIC JADI ARRAY KATA
// Untuk tampil di grid UI
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function mnemonicToWords(mnemonic) {
    return mnemonic.trim().split(/\s+/);
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// GENERATE VERIFY QUIZ
// Ambil 3 index random dari mnemonic untuk verifikasi
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function generateVerifyQuiz(mnemonic) {
    const words   = mnemonicToWords(mnemonic);
    const indices = [];

    while (indices.length < 3) {
        const i = Math.floor(Math.random() * words.length);
        if (!indices.includes(i)) indices.push(i);
    }

    indices.sort((a, b) => a - b);

    return indices.map(i => ({
        index:  i,
        label:  (LANG[CURRENT_LANG]?.verify_word_label || 'Kata ke-{n}').replace('{n}', i + 1),
        answer: words[i]
    }));
}