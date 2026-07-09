// =====================================
// UI-ONBOARDING.JS  -  Onboarding & Unlock UI
// SECURITY PATCH v2 + NAV FIX
// =====================================

// -------------------------------------
// BLOCKIES
// -------------------------------------
function _generateBlockie(seed, size) {
    size = size || 8;
    var scale = 4;
    var color    = _hsl2rgb(Math.abs(_hashCode(seed) % 360) / 360, 0.6, 0.5);
    var bgColor  = _hsl2rgb(Math.abs(_hashCode(seed + "bg") % 360) / 360, 0.3, 0.15);
    var spotColor= _hsl2rgb(Math.abs(_hashCode(seed + "sp") % 360) / 360, 0.6, 0.4);
    var imageData = _createImageData(size);
    var width = Math.sqrt(imageData.length);
    var canvasSize = width * scale;
    var canvas = document.createElement("canvas");
    canvas.width  = canvasSize;
    canvas.height = canvasSize;
    var ctx = canvas.getContext("2d");
    for (var i = 0; i < imageData.length; i++) {
        var row = Math.floor(i / width);
        var col = i % width;
        var v = imageData[i];
        ctx.fillStyle = v === 0 ? _rgbStr(bgColor) : v === 1 ? _rgbStr(color) : _rgbStr(spotColor);
        ctx.fillRect(col * scale, row * scale, scale, scale);
    }
    return canvas.toDataURL();
}

function _createImageData(size) {
    var width      = Math.ceil(size / 2);
    var height     = size;
    var dataWidth  = Math.ceil(size / 2);
    var mirrorWidth= size - dataWidth;
    var data = [];
    for (var y = 0; y < height; y++) {
        var row = [];
        for (var x = 0; x < dataWidth; x++) {
            row.push(Math.floor(Math.random() * 2.3));
        }
        var mirror = row.slice(0, mirrorWidth).reverse();
        data = data.concat(row).concat(mirror);
    }
    return data;
}

function _hashCode(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
        hash |= 0;
    }
    return hash;
}

function _hsl2rgb(h, s, l) {
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
        var hue2rgb = function(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function _rgbStr(rgb) {
    return "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
}

function _injectBlockies() {
    var els = document.querySelectorAll("[data-blockie-addr]");
    els.forEach(function(el) {
        var addr = el.getAttribute("data-blockie-addr") || "default";
        el.src = _generateBlockie(addr.toLowerCase());
    });
}

// -------------------------------------
// STATE ONBOARDING
// -------------------------------------
window._onboardState = {
    screen:      null,
    walletData:  null,
    quizItems:   [],
    quizAnswers: {},
    pendingPin:  null
};

// -------------------------------------
// CONTAINER
// -------------------------------------
function _ensureOnboardingContainer() {
    let el = document.getElementById("onboardingOverlay");
    if (!el) {
        el = document.createElement("div");
        el.id = "onboardingOverlay";
        el.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 99997;
            background: #0a0a0a;
            overflow-y: auto;
            display: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        `;
        document.body.appendChild(el);
    }
    return el;
}

function _showOnboarding(html) {
    const el     = _ensureOnboardingContainer();
    el.innerHTML = html;
    el.style.display = "block";
    el.scrollTop = 0;
    setTimeout(_injectBlockies, 10);
}

function _hideOnboarding() {
    const el = document.getElementById("onboardingOverlay");
    if (el) el.style.display = "none";
    if (window.SESSION?.unlocked) {
        window._pinContext = null;
        if (typeof setBottomNavHidden === "function") setBottomNavHidden(false);
    }
}

// -------------------------------------
// SCREEN: WELCOME
// -------------------------------------
function showWelcomeScreen() {
    window._pinContext = "lock";
    if (typeof setBottomNavHidden === "function") setBottomNavHidden(true);

    _onboardState = {
        screen:      "WELCOME",
        walletData:  null,
        quizItems:   [],
        quizAnswers: {},
        pendingPin:  null
    };

    _showOnboarding(`
        <div style="
            min-height:100vh;
            display:flex;
            flex-direction:column;
            align-items:center;
            justify-content:center;
            padding:30px 24px;
            box-sizing:border-box;
            position:relative;
        ">
            <div style="position:absolute;top:16px;right:16px;">
                <button onclick="document.getElementById('welcomeLangMenu').style.display=document.getElementById('welcomeLangMenu').style.display==='none'?'block':'none'" style="background:#1a1a1a;border:1px solid #333;border-radius:10px;color:#fff;font-size:13px;padding:7px 12px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                    <i class="fa-solid fa-globe"></i>
                    <span style="display:flex;align-items:center;gap:6px;"><img src="https://flagcdn.com/w20/${CURRENT_LANG === 'en' ? 'us' : CURRENT_LANG === 'ar' ? 'sa' : 'id'}.png" style="width:18px;height:12px;border-radius:2px;object-fit:cover;"> ${CURRENT_LANG === 'en' ? 'English' : CURRENT_LANG === 'ar' ? 'العربية' : 'Indonesia'}</span>
                    <i class="fa-solid fa-chevron-down" style="font-size:10px;"></i>
                </button>
                <div id="welcomeLangMenu" style="display:none;position:absolute;right:0;top:40px;background:#1a1a1a;border:1px solid #333;border-radius:12px;overflow:hidden;min-width:140px;z-index:10;">
                    <div onclick="setLanguage('id');document.getElementById('welcomeLangMenu').style.display='none'" style="padding:12px 16px;cursor:pointer;color:#fff;font-size:13px;display:flex;align-items:center;gap:8px;"><img src="https://flagcdn.com/w20/id.png" style="width:18px;height:12px;border-radius:2px;object-fit:cover;"> Indonesia</div>
                    <div onclick="setLanguage('ar');document.getElementById('welcomeLangMenu').style.display='none'" style="padding:12px 16px;cursor:pointer;color:#fff;font-size:13px;display:flex;align-items:center;gap:8px;border-top:1px solid #333;"><img src="https://flagcdn.com/w20/sa.png" style="width:18px;height:12px;border-radius:2px;object-fit:cover;"> العربية</div>
                    <div onclick="setLanguage('en');document.getElementById('welcomeLangMenu').style.display='none'" style="padding:12px 16px;cursor:pointer;color:#fff;font-size:13px;display:flex;align-items:center;gap:8px;border-top:1px solid #333;"><img src="https://flagcdn.com/w20/us.png" style="width:18px;height:12px;border-radius:2px;object-fit:cover;"> English</div>
                </div>
            </div>
            <img src="img/logo.png" style="width:72px;height:72px;border-radius:20px;margin-bottom:16px;" onerror="this.style.display='none'">
            <div style="font-size:26px;font-weight:700;color:#fff;margin-bottom:8px;letter-spacing:-0.5px;">${LANG[CURRENT_LANG]?.welcome_title || 'Sidra Wallet'}</div>
            <div style="font-size:14px;color:#888;text-align:center;line-height:1.6;margin-bottom:48px;max-width:280px;">
                ${LANG[CURRENT_LANG]?.welcome_desc || 'Dompet non-custodial untuk ekosistem SidraChain.'}
            </div>
            <button onclick="showCreateSeedScreen()" style="
                width:100%;max-width:320px;padding:16px;
                background:#ff7a00;border:none;border-radius:14px;
                color:#fff;font-size:16px;font-weight:600;
                cursor:pointer;margin-bottom:12px;
                display:flex;align-items:center;justify-content:center;gap:10px;
            "><i class="fa-solid fa-plus"></i> ${LANG[CURRENT_LANG]?.welcome_create || 'Buat Wallet Baru'}</button>
            <button onclick="showImportChoiceScreen()" style="
                width:100%;max-width:320px;padding:16px;
                background:#1a1a1a;border:1px solid #333;border-radius:14px;
                color:#fff;font-size:16px;font-weight:600;
                cursor:pointer;
                display:flex;align-items:center;justify-content:center;gap:10px;
            "><i class="fa-solid fa-file-import"></i> ${LANG[CURRENT_LANG]?.welcome_import || 'Import Wallet'}</button>
            <div style="margin-top:32px;font-size:12px;color:#555;text-align:center;line-height:1.7;">
                ${LANG[CURRENT_LANG]?.welcome_footer || 'Private key tidak pernah meninggalkan perangkat kamu'}
            </div>
        </div>
    `);
}

// -------------------------------------
// SCREEN: TAMPIL SEED PHRASE
// -------------------------------------
function showCreateSeedScreen() {
    // Tampilkan loading dulu
    _showOnboarding(`
        <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px 24px;box-sizing:border-box;text-align:center;">
            <div id="genIconWrap" style="width:80px;height:80px;background:#ff7a0020;border-radius:50%;position:relative;margin-bottom:28px;">
                <i class="fa-solid fa-shield-halved" style="color:#ff7a00;font-size:32px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></i>
            </div>
            <div id="genTitle" style="font-size:18px;font-weight:700;color:#fff;margin-bottom:8px;">${LANG[CURRENT_LANG]?.gen_step1_title || 'Menyiapkan Wallet'}</div>
            <div id="genSub" style="font-size:13px;color:#888;margin-bottom:32px;">${LANG[CURRENT_LANG]?.gen_step1_sub || 'Membuat entropy acak...'}</div>
            <div style="width:200px;height:3px;background:#1a1a1a;border-radius:99px;overflow:hidden;">
                <div id="genBar" style="height:100%;width:0%;background:#ff7a00;border-radius:99px;transition:width 0.4s ease;"></div>
            </div>
        </div>
    `);

    // Animasi progress
    const L = LANG[CURRENT_LANG] || {};
    const steps = [
        { pct: 30,  title: L.gen_step1_title || "Menyiapkan Wallet",  sub: L.gen_step1_sub || "Membuat entropy acak...",       delay: 0    },
        { pct: 60,  title: L.gen_step2_title || "Generating Keys",     sub: L.gen_step2_sub || "Menurunkan seed phrase...",     delay: 500  },
        { pct: 85,  title: L.gen_step3_title || "Securing Wallet",     sub: L.gen_step3_sub || "Mengenkripsi data wallet...",  delay: 1000 },
        { pct: 100, title: L.gen_step4_title || "Wallet Siap!",        sub: L.gen_step4_sub || "Seed phrase berhasil dibuat.", delay: 1500 },
    ];

    steps.forEach(s => {
        setTimeout(() => {
            const bar   = document.getElementById("genBar");
            const title = document.getElementById("genTitle");
            const sub   = document.getElementById("genSub");
            if (bar)   bar.style.width   = s.pct + "%";
            if (title) title.textContent = s.title;
            if (sub)   sub.textContent   = s.sub;
        }, s.delay);
    });

    // Generate wallet & tampilkan seed setelah animasi selesai
    setTimeout(() => {
        let walletData;
        try {
            walletData = generateNewWallet();
        } catch (err) {
            showToast?.(err.message, "error");
            return;
        }

    _onboardState.walletData = walletData;
    const words = mnemonicToWords(walletData.mnemonic);

    const wordGrid = words.map((w, i) => `
        <div style="
            background:#141414;border:1px solid #2a2a2a;border-radius:10px;
            padding:10px 8px;display:flex;align-items:center;gap:8px;
        ">
            <span style="color:#555;font-size:11px;min-width:18px;">${i + 1}</span>
            <span style="color:#fff;font-size:14px;font-weight:500;">${w}</span>
        </div>
    `).join("");

    _showOnboarding(`
        <div style="padding:24px 24px 100px;max-width:420px;margin:0 auto;box-sizing:border-box;">
            <button onclick="showWelcomeScreen()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:0;margin-bottom:20px;">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">${LANG[CURRENT_LANG]?.seed_title || 'Seed Phrase Kamu'}</div>
            <div style="font-size:13px;color:#888;line-height:1.6;margin-bottom:20px;">
                ${LANG[CURRENT_LANG]?.seed_desc || 'Catat 12 kata ini di tempat aman. Jangan screenshot.'}
            </div>
            <div style="background:#2a1500;border:1px solid #ff7a0040;border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#ff9a30;line-height:1.6;">
                ${LANG[CURRENT_LANG]?.seed_warn || '(!!) Jangan pernah bagikan seed phrase ke siapapun, termasuk tim Sidra.'}
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:24px;user-select:none;">
                ${wordGrid}
            </div>
            <button onclick="showVerifySeedScreen()" style="width:100%;padding:16px;background:#ff7a00;border:none;border-radius:14px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">
                ${LANG[CURRENT_LANG]?.seed_btn || 'Sudah Dicatat - Lanjut Verifikasi'}
            </button>
        </div>
    `);
    }, 2000); // tunggu animasi selesai
}

// -------------------------------------
// SCREEN: VERIFIKASI SEED PHRASE
// -------------------------------------
function showVerifySeedScreen() {
    const { walletData } = _onboardState;
    if (!walletData) { showWelcomeScreen(); return; }

    const quiz = generateVerifyQuiz(walletData.mnemonic);
    _onboardState.quizItems   = quiz;
    _onboardState.quizAnswers = {};

    const fields = quiz.map((q, i) => `
        <div style="margin-bottom:16px;">
            <div style="font-size:13px;color:#888;margin-bottom:6px;">${q.label}</div>
            <input id="quizInput_${i}" type="text"
                autocomplete="off" autocorrect="off" spellcheck="false"
                placeholder="Masukkan kata ke-${q.index + 1}..."
                style="width:100%;box-sizing:border-box;padding:14px 16px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:15px;outline:none;"
                oninput="this.style.borderColor='#333';document.getElementById('verifyError').style.display='none';">
        </div>
    `).join("");

    _showOnboarding(`
        <div style="padding:24px 24px 100px;max-width:420px;margin:0 auto;box-sizing:border-box;">
            <button onclick="showCreateSeedScreen()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:0;margin-bottom:20px;">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">${LANG[CURRENT_LANG]?.verify_title || 'Verifikasi Seed Phrase'}</div>
            <div style="font-size:13px;color:#888;line-height:1.6;margin-bottom:24px;">
                ${LANG[CURRENT_LANG]?.verify_desc || 'Masukkan kata yang diminta untuk memastikan kamu sudah mencatatnya.'}
            </div>
            ${fields}
            <div id="verifyError" style="display:none;color:#ff4444;font-size:13px;margin-bottom:12px;padding:10px 14px;background:#2a0000;border-radius:10px;"></div>
            <button onclick="_submitVerifySeed()" style="width:100%;padding:16px;background:#ff7a00;border:none;border-radius:14px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">
                ${LANG[CURRENT_LANG]?.verify_btn || 'Verifikasi'}
            </button>
        </div>
    `);
}

function _submitVerifySeed() {
    const { quizItems } = _onboardState;
    let allCorrect = true;
    quizItems.forEach((q, i) => {
        const input = document.getElementById(`quizInput_${i}`);
        const val   = input?.value?.trim().toLowerCase();
        if (val !== q.answer.toLowerCase()) {
            allCorrect = false;
            if (input) input.style.borderColor = "#ff4444";
        } else {
            if (input) input.style.borderColor = "#00cc66";
        }
    });
    if (!allCorrect) {
        const errEl = document.getElementById("verifyError");
        if (errEl) { errEl.textContent = LANG[CURRENT_LANG]?.verify_error || "Ada kata yang salah. Periksa kembali seed phrase kamu."; errEl.style.display = "block"; }
        return;
    }
    window._pinBackScreen = "showVerifySeedScreen";
    showSetPINScreen();
}

// -------------------------------------
// SCREEN: IMPORT - PILIH METODE
// -------------------------------------
function showImportChoiceScreen() {
    _onboardState.screen = "IMPORT_CHOICE";
    _showOnboarding(`
        <div style="padding:24px 24px 100px;max-width:420px;margin:0 auto;box-sizing:border-box;">
            <button onclick="showWelcomeScreen()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:0;margin-bottom:20px;">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">${LANG[CURRENT_LANG]?.import_wallet || 'Import Wallet'}</div>
            <div style="font-size:13px;color:#888;line-height:1.6;margin-bottom:32px;">${LANG[CURRENT_LANG]?.import_choice_desc || 'Pilih metode import wallet kamu.'}</div>
            <button onclick="showImportPhraseScreen()" style="width:100%;padding:18px 20px;background:#141414;border:1px solid #2a2a2a;border-radius:14px;color:#fff;cursor:pointer;margin-bottom:12px;text-align:left;display:flex;align-items:flex-start;gap:16px;">
                <div style="width:40px;height:40px;background:#ff7a0020;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#ff7a00;font-size:18px;"><i class="fa-solid fa-seedling"></i></div>
                <div>
                    <div style="font-size:15px;font-weight:600;margin-bottom:4px;">${LANG[CURRENT_LANG]?.import_seed || 'Seed Phrase'}</div>
                    <div style="font-size:12px;color:#666;line-height:1.5;">${LANG[CURRENT_LANG]?.import_seed_desc || '12 atau 24 kata recovery phrase dari wallet lama kamu'}</div>
                </div>
            </button>
            <button onclick="showImportPKScreen()" style="width:100%;padding:18px 20px;background:#141414;border:1px solid #2a2a2a;border-radius:14px;color:#fff;cursor:pointer;text-align:left;display:flex;align-items:flex-start;gap:16px;">
                <div style="width:40px;height:40px;background:#3a6fff20;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#3a6fff;font-size:18px;"><i class="fa-solid fa-key"></i></div>
                <div>
                    <div style="font-size:15px;font-weight:600;margin-bottom:4px;">${LANG[CURRENT_LANG]?.import_pk || 'Private Key'}</div>
                    <div style="font-size:12px;color:#666;line-height:1.5;">${LANG[CURRENT_LANG]?.import_pk_desc || 'Import dengan private key (0x...). Tidak bisa multi-account.'}</div>
                </div>
            </button>
        </div>
    `);
}

// -------------------------------------
// SCREEN: IMPORT SEED PHRASE
// -------------------------------------
function showImportPhraseScreen() {
    _onboardState.screen = "IMPORT_PHRASE";
    _showOnboarding(`
        <div style="padding:24px 24px 100px;max-width:420px;margin:0 auto;box-sizing:border-box;">
            <button onclick="showImportChoiceScreen()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:0;margin-bottom:20px;">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">${LANG[CURRENT_LANG]?.import_phrase_title || 'Import Seed Phrase'}</div>
            <div style="font-size:13px;color:#888;line-height:1.6;margin-bottom:24px;">${LANG[CURRENT_LANG]?.import_phrase_desc || 'Masukkan 12 atau 24 kata seed phrase, pisahkan dengan spasi.'}</div>
            <textarea id="importPhraseInput" placeholder="word1 word2 word3 ..."
                autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" rows="4"
                style="width:100%;box-sizing:border-box;padding:14px 16px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:15px;outline:none;resize:none;line-height:1.6;margin-bottom:8px;"
                oninput="this.style.borderColor='#333';_validatePhraseInput(this.value);document.getElementById('importPhraseError').style.display='none';"></textarea>
            <div id="importPhraseHint" style="font-size:12px;color:#555;margin-bottom:16px;">0 kata</div>
            <div id="importPhraseError" style="display:none;color:#ff4444;font-size:13px;padding:10px 14px;background:#2a0000;border-radius:10px;margin-bottom:12px;"></div>
            <button onclick="_submitImportPhrase()" style="width:100%;padding:16px;background:#ff7a00;border:none;border-radius:14px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">${LANG[CURRENT_LANG]?.import_btn || 'Import'}</button>
        </div>
    `);
}

function _validatePhraseInput(val) {
    const hint  = document.getElementById("importPhraseHint");
    if (!hint) return;
    const words = val.trim().split(/\s+/).filter(Boolean);
    const count = words.length;
    const valid = count === 12 || count === 24;
    const wordLabel = LANG[CURRENT_LANG]?.words_label || "kata";
    hint.textContent = count + " " + wordLabel + (valid ? " \u2713" : "");
    hint.style.color = valid ? "#00cc66" : "#555";
}

function _submitImportPhrase() {
    const input = document.getElementById("importPhraseInput");
    const val   = input?.value?.trim() || "";
    try {
        const walletData         = importFromMnemonic(val);
        _onboardState.walletData = walletData;
        window._pinBackScreen = "showImportPhraseScreen";
        showSetPINScreen();
    } catch (err) {
        const errEl = document.getElementById("importPhraseError");
        if (errEl) { errEl.textContent = err.message; errEl.style.display = "block"; }
        if (input) input.style.borderColor = "#ff4444";
    }
}

// -------------------------------------
// SCREEN: IMPORT PRIVATE KEY
// -------------------------------------
function showImportPKScreen() {
    _onboardState.screen = "IMPORT_PK";
    _showOnboarding(`
        <div style="padding:24px 24px 100px;max-width:420px;margin:0 auto;box-sizing:border-box;">
            <button onclick="showImportChoiceScreen()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:0;margin-bottom:20px;">
                <i class="fa-solid fa-arrow-left"></i>
            </button>
            <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">${LANG[CURRENT_LANG]?.import_pk_title || 'Import Private Key'}</div>
            <div style="font-size:13px;color:#888;line-height:1.6;margin-bottom:24px;">${LANG[CURRENT_LANG]?.import_pk_desc2 || 'Masukkan private key (format 0x...).'}</div>
            <div style="background:#2a1500;border:1px solid #ff7a0030;border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#ff9a30;line-height:1.6;">
                ${LANG[CURRENT_LANG]?.import_pk_warn || '(!!) Jangan pernah paste private key di browser lain atau website apapun.'}
            </div>
            <div style="position:relative;margin-bottom:4px;">
                <input id="importPKInput" type="text" placeholder="0x..."
                    autocomplete="off" autocorrect="off" spellcheck="false"
                    style="width:100%;box-sizing:border-box;padding:12px 44px 12px 14px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:14px;outline:none;font-family:monospace;"
                    oninput="_pkMaskInput(this)" onpaste="_pkHandlePaste(event, this)" data-pk-real="">
                <button id="importPKToggleBtn" onclick="_pkToggleVisibility()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#666;cursor:pointer;font-size:16px;padding:4px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
                    <i class="fa-solid fa-eye"></i>
                </button>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <div id="importPKHint" style="font-size:11px;color:#555;font-family:monospace;min-height:16px;"></div>
                <button onclick="_importPKPaste()" style="padding:5px 12px;width:auto;margin-top:0;background:transparent;border:1px solid #2a2a2a;border-radius:8px;color:#ff7a00;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;">
                    <i class="fa-regular fa-clipboard"></i> Paste
                </button>
            </div>
            <div id="importPKError" style="display:none;color:#ff4444;font-size:13px;padding:10px 14px;background:#2a0000;border-radius:10px;margin-bottom:12px;"></div>
            <button onclick="_submitImportPK()" style="width:100%;padding:16px;background:#ff7a00;border:none;border-radius:14px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">Import</button>
        </div>
    `);
}

window._pkMasked = true;

function _pkMaskInput(inp) {
    var real = inp.dataset.pkReal || "";
    var cursorPos = inp.selectionStart;
    var displayVal = inp.value;
    if (window._pkMasked) {
        var newReal = "";
        for (var i = 0; i < displayVal.length; i++) {
            newReal += displayVal[i] === "*" ? (real[i] || "") : displayVal[i];
        }
        inp.dataset.pkReal = newReal;
        inp.value = "*".repeat(newReal.length);
        try { inp.setSelectionRange(cursorPos, cursorPos); } catch(e){}
    } else {
        inp.dataset.pkReal = displayVal;
    }
    var hint = document.getElementById("importPKHint");
    if (hint) { var len = inp.dataset.pkReal.length; hint.textContent = len > 0 ? len + " karakter" : ""; }
    document.getElementById("importPKError").style.display = "none";
}

function _pkHandlePaste(event, inp) {
    event.preventDefault();
    var pasted = (event.clipboardData || window.clipboardData).getData("text");
    var real   = inp.dataset.pkReal || "";
    var start  = inp.selectionStart;
    var end    = inp.selectionEnd;
    real = real.slice(0, start) + pasted + real.slice(end);
    inp.dataset.pkReal = real;
    inp.value = window._pkMasked ? "*".repeat(real.length) : real;
    var newPos = start + pasted.length;
    try { inp.setSelectionRange(newPos, newPos); } catch(e){}
    var hint = document.getElementById("importPKHint");
    if (hint) hint.textContent = real.length + " karakter";
    document.getElementById("importPKError").style.display = "none";
}

function _pkToggleVisibility() {
    var inp = document.getElementById("importPKInput");
    if (!inp) return;
    var real = inp.dataset.pkReal || "";
    window._pkMasked = !window._pkMasked;
    inp.value = window._pkMasked ? "*".repeat(real.length) : real;
    var btn = document.getElementById("importPKToggleBtn");
    if (btn) btn.innerHTML = window._pkMasked
        ? '<i class="fa-solid fa-eye"></i>'
        : '<i class="fa-solid fa-eye-slash"></i>';
}

async function _importPKPaste() {
    const inp = document.getElementById("importPKInput");
    if (!inp) return;
    let text = "";
    if (window.AndroidWallet?.getClipboardText) {
        text = AndroidWallet.getClipboardText();
    } else {
        text = await navigator.clipboard?.readText().catch(() => "") || "";
    }
    text = text.trim();
    if (!text) { showToast?.("Clipboard kosong", "error"); return; }
    inp.dataset.pkReal = text;
    inp.value = window._pkMasked ? "*".repeat(text.length) : text;
    const hint = document.getElementById("importPKHint");
    if (hint) hint.textContent = text.length + " karakter";
    showToast?.("Private key dipaste", "success");
}

function _submitImportPK() {
    const input = document.getElementById("importPKInput");
    const val   = (input?.dataset?.pkReal || input?.value || "").trim();
    try {
        const walletData         = importFromPrivateKey(val);
        _onboardState.walletData = walletData;
        window._pinBackScreen = "showImportPKScreen";
        showSetPINScreen();
    } catch (err) {
        const errEl = document.getElementById("importPKError");
        if (errEl) { errEl.textContent = err.message; errEl.style.display = "block"; }
        if (input) input.style.borderColor = "#ff4444";
    }
}

// -------------------------------------
// SCREEN: SET PIN
// -------------------------------------
function showSetPINScreen(isChange = false) {
    _onboardState.screen = "SET_PIN";
    const title = isChange ? (LANG[CURRENT_LANG]?.pin_change_title || "Ubah PIN") : (LANG[CURRENT_LANG]?.pin_create_title || "Buat PIN Wallet");
    const sub   = isChange ? (LANG[CURRENT_LANG]?.pin_change_desc || "Masukkan PIN lama, lalu PIN baru.") : (LANG[CURRENT_LANG]?.pin_create_desc || "PIN digunakan untuk membuka wallet. Minimal 6 digit.");

    _showOnboarding(`
        <div style="padding:24px 24px 100px;max-width:420px;margin:0 auto;box-sizing:border-box;">
            ${!isChange ? `
            <button onclick="window._pinBackScreen ? window[window._pinBackScreen]() : showVerifySeedScreen()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:0;margin-bottom:20px;">
                <i class="fa-solid fa-arrow-left"></i>
            </button>` : `
            <button onclick="showWalletManageScreen()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:0;margin-bottom:20px;">
                <i class="fa-solid fa-arrow-left"></i>
            </button>`}
            <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">${title}</div>
            <div style="font-size:13px;color:#888;line-height:1.6;margin-bottom:24px;">${sub}</div>
            ${isChange ? `
            <div style="margin-bottom:16px;">
                <div style="font-size:13px;color:#888;margin-bottom:6px;">${LANG[CURRENT_LANG]?.pin_old || 'PIN Lama'}</div>
                <input id="oldPINInput" type="password" inputmode="numeric" maxlength="12" placeholder="${LANG[CURRENT_LANG]?.pin_old_placeholder || 'PIN lama'}" style="${_pinInputStyle()}">
            </div>` : ""}
            <div style="margin-bottom:16px;">
                <div style="font-size:13px;color:#888;margin-bottom:6px;">${LANG[CURRENT_LANG]?.pin_new || 'PIN Baru (minimal 6 digit)'}</div>
                <input id="newPIN1Input" type="password" inputmode="numeric" maxlength="12" placeholder="${LANG[CURRENT_LANG]?.pin_placeholder_new || 'PIN baru'}"
                    style="${_pinInputStyle()}" oninput="document.getElementById('setPINError').style.display='none'">
            </div>
            <div style="margin-bottom:24px;">
                <div style="font-size:13px;color:#888;margin-bottom:6px;">${LANG[CURRENT_LANG]?.pin_confirm || 'Konfirmasi PIN'}</div>
                <input id="newPIN2Input" type="password" inputmode="numeric" maxlength="12" placeholder="${LANG[CURRENT_LANG]?.pin_placeholder_confirm || 'Ulangi PIN'}"
                    style="${_pinInputStyle()}" oninput="document.getElementById('setPINError').style.display='none'">
            </div>
            <div id="setPINError" style="display:none;color:#ff4444;font-size:13px;padding:10px 14px;background:#2a0000;border-radius:10px;margin-bottom:12px;"></div>
            <button onclick="${isChange ? '_submitChangePIN()' : '_submitSetPIN()'}" style="width:100%;padding:16px;background:#ff7a00;border:none;border-radius:14px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;margin-bottom:10px;">
                ${isChange ? (LANG[CURRENT_LANG]?.pin_change_btn || "Ubah PIN") : (LANG[CURRENT_LANG]?.pin_save || "Simpan PIN")}
            </button>
            ${isChange ? `
            <button onclick="showWalletManageScreen()" style="width:100%;padding:16px;background:#1a1a1a;border:1px solid #333;border-radius:14px;color:#888;font-size:16px;cursor:pointer;">
                ${LANG[CURRENT_LANG]?.pin_cancel || 'Batal'}
            </button>` : ""}
        </div>
    `);
}

function _pinInputStyle() {
    return "width:100%;box-sizing:border-box;padding:14px 16px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:18px;letter-spacing:4px;outline:none;text-align:center;";
}

async function _submitSetPIN() {
    const pin1 = document.getElementById("newPIN1Input")?.value || "";
    const pin2 = document.getElementById("newPIN2Input")?.value || "";
    if (pin1.length < 6) { _showPINError("PIN minimal 6 digit"); return; }
    if (pin1 !== pin2)   { _showPINError("PIN tidak cocok"); return; }
    const { walletData } = _onboardState;
    if (!walletData) { _showPINError("Data wallet hilang. Mulai ulang."); return; }
    try {
        await vault.createVault(walletData, pin1);
        await unlockWallet(pin1);
        _syncWalletToLegacySystem({ address: walletData.address, name: walletData.name || "Account 1" });
        showSuccessScreen();
        document.dispatchEvent(new Event("sidra:unlocked"));
    } catch (err) {
        _showPINError(err.message || "Gagal menyimpan wallet");
    }
}

async function _submitChangePIN() {
    const oldPin = document.getElementById("oldPINInput")?.value || "";
    const pin1   = document.getElementById("newPIN1Input")?.value || "";
    const pin2   = document.getElementById("newPIN2Input")?.value || "";
    if (!oldPin)         { _showPINError("Masukkan PIN lama"); return; }
    if (pin1.length < 6) { _showPINError("PIN baru minimal 6 digit"); return; }
    if (pin1 !== pin2)   { _showPINError("PIN baru tidak cocok"); return; }
    try {
        await vault.changePIN(oldPin, pin1);
        _hideOnboarding();
        showToast?.("PIN berhasil diubah", "success");
    } catch (err) {
        _showPINError(err.message || "Gagal ubah PIN");
    }
}

function _showPINError(msg) {
    const el = document.getElementById("setPINError");
    if (el) { el.textContent = msg; el.style.display = "block"; }
}

// -------------------------------------
// SCREEN: PIN UNLOCK
// -------------------------------------
function showPINUnlockScreen() {
    if (!vault.exists()) {
        showWelcomeScreen();
        return;
    }

    window._onboardState.screen = "PIN_UNLOCK";

    if (!SESSION.unlocked) {
        window._pinContext = "lock";
        if (typeof setBottomNavHidden === "function") setBottomNavHidden(true);
    }

    _showOnboarding(`
        <div style="
            min-height:100vh;
            display:flex;flex-direction:column;
            align-items:center;justify-content:center;
            padding:30px 24px;box-sizing:border-box;
        ">
            <img src="img/logo.png" style="width:64px;height:64px;border-radius:18px;margin-bottom:16px;" onerror="this.style.display='none'">
            <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">${LANG[CURRENT_LANG]?.unlock_title || 'Unlock Wallet'}</div>
            <div style="font-size:13px;color:#888;margin-bottom:32px;">${LANG[CURRENT_LANG]?.unlock_desc || 'Masukkan PIN untuk melanjutkan'}</div>
            <div style="position:relative;width:100%;max-width:280px;margin-bottom:8px;">
                <input id="pinUnlockInput" type="password" inputmode="numeric" maxlength="12"
                    placeholder="- - - - - -" autofocus
                    style="width:100%;box-sizing:border-box;padding:16px;background:#141414;border:2px solid #2a2a2a;border-radius:14px;color:#fff;font-size:22px;letter-spacing:6px;outline:none;text-align:center;"
                    onkeydown="if(event.key==='Enter') _submitPINUnlock()"
                    oninput="this.style.borderColor='#2a2a2a';document.getElementById('pinUnlockError').style.display='none';">
            </div>
            <div id="pinUnlockError" style="display:none;color:#ff4444;font-size:13px;margin-bottom:12px;"></div>
            <button onclick="_submitPINUnlock()" style="width:100%;max-width:280px;padding:16px;background:#ff7a00;border:none;border-radius:14px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;margin-bottom:16px;">
                ${LANG[CURRENT_LANG]?.unlock_btn || 'Unlock'}
            </button>
            <button onclick="_showResetConfirm()" style="background:none;border:none;color:#555;font-size:13px;cursor:pointer;text-decoration:underline;">
                ${LANG[CURRENT_LANG]?.unlock_forgot || 'Lupa PIN? Reset Wallet'}
            </button>
        </div>
    `);

    setTimeout(() => { document.getElementById("pinUnlockInput")?.focus(); }, 100);
}

async function _submitPINUnlock() {
    const pin   = document.getElementById("pinUnlockInput")?.value || "";
    const errEl = document.getElementById("pinUnlockError");
    const input = document.getElementById("pinUnlockInput");

    if (!pin) {
        if (errEl) { errEl.textContent = "Masukkan PIN"; errEl.style.display = "block"; }
        return;
    }

    if (vault.exists()) {
        try {
            await unlockWallet(pin);
            // [FIX] unlockWallet() SELALU reset SESSION.accountIndex ke 0 (dompet utama)
            // setiap kali di-unlock ulang, tidak peduli wallet mana yang terakhir aktif
            // di dropdown sebelum lock. Paksa signer mengikuti wallet yang SUDAH
            // ditampilkan UI (localStorage selectedWalletIndex), bukan default index 0.
            await _reconcileSessionToSelectedWallet();
            await _syncAllAccountsToLegacy();
            _hideOnboarding();
            showToast?.("Wallet unlocked", "success");
            // Baru sekarang boleh fetch RPC/Blockscout — wallet sudah terbukti dimiliki user
            document.dispatchEvent(new Event("sidra:unlocked"));
        } catch (err) {
            if (errEl) { errEl.textContent = err.message || "PIN salah"; errEl.style.display = "block"; }
            if (input) { input.style.borderColor = "#ff4444"; input.value = ""; }
        }
        return;
    }

    try {
        const legacy = JSON.parse(localStorage.getItem("PK_SESSION") || "null");
        if (!legacy?.pk) {
            if (errEl) { errEl.textContent = "Tidak ada wallet ditemukan. Buat wallet baru."; errEl.style.display = "block"; }
            return;
        }
        const inputHash = await hashPIN(pin);
        if (inputHash !== legacy.pinHash) {
            if (errEl) { errEl.textContent = "PIN salah"; errEl.style.display = "block"; }
            if (input) { input.style.borderColor = "#ff4444"; input.value = ""; }
            return;
        }
        const walletData = {
            address: legacy.address, privateKey: legacy.pk,
            name: "Account 1", source: "privateKey", mnemonic: null, hasMnemonic: false
        };
        await vault.createVault(walletData, pin);
        await unlockWallet(pin);
        localStorage.removeItem("PK_SESSION");
        localStorage.removeItem("sda_pk_wallet");
        await _syncAllAccountsToLegacy();
        _hideOnboarding();
        showToast?.("Wallet dimigrasikan ke sistem baru", "success");
        document.dispatchEvent(new Event("sidra:unlocked"));
    } catch (err) {
        if (errEl) { errEl.textContent = err.message || "Gagal unlock"; errEl.style.display = "block"; }
        if (input) { input.style.borderColor = "#ff4444"; input.value = ""; }
    }
}

// -------------------------------------
// RESET WALLET
// -------------------------------------
function _showResetConfirm() {
    const confirm = document.createElement("div");
    confirm.id = "resetConfirmBox";
    confirm.style.cssText = "position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;";
    confirm.innerHTML = `
        <div style="background:#141414;border:1px solid #333;border-radius:20px;padding:28px 24px;max-width:320px;width:100%;">
            <div style="font-size:32px;text-align:center;margin-bottom:12px;">(!)</div>
            <div style="font-size:17px;font-weight:700;color:#fff;text-align:center;margin-bottom:8px;">${LANG[CURRENT_LANG]?.reset_title || 'Reset Wallet?'}</div>
            <div style="font-size:13px;color:#888;text-align:center;line-height:1.6;margin-bottom:24px;">
                ${LANG[CURRENT_LANG]?.reset_desc || 'Semua data wallet akan dihapus permanen. Pastikan kamu sudah backup seed phrase.'}
            </div>
            <button onclick="_executeReset()" style="width:100%;padding:14px;background:#ff3333;border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;margin-bottom:10px;">${LANG[CURRENT_LANG]?.reset_confirm || 'Ya, Hapus Semua'}</button>
            <button onclick="document.getElementById('resetConfirmBox').remove()" style="width:100%;padding:14px;background:#1a1a1a;border:1px solid #333;border-radius:12px;color:#fff;font-size:15px;cursor:pointer;">${LANG[CURRENT_LANG]?.reset_cancel || 'Batal'}</button>
        </div>
    `;
    document.body.appendChild(confirm);
}

function _executeReset() {
    vault.destroy();
    lockWallet();
    localStorage.removeItem("sidra_wallets");
    localStorage.removeItem("selectedWalletIndex");
    localStorage.removeItem("PK_SESSION");
    localStorage.removeItem("sda_pk_wallet");
    localStorage.removeItem("sidra_lock_state");
    document.getElementById("resetConfirmBox")?.remove();
    renderWallets?.();
    showWelcomeScreen();
}

// -------------------------------------
// SCREEN: SUCCESS
// -------------------------------------
function showSuccessScreen() {
    _onboardState.screen = "SUCCESS";
    _showOnboarding(`
        <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:30px 24px;box-sizing:border-box;text-align:center;">
            <div style="width:80px;height:80px;background:#00cc6620;border-radius:50%;position:relative;margin-bottom:20px;"><i class="fa-solid fa-check" style="color:#00cc66;font-size:32px;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);"></i></div>
            <div style="font-size:22px;font-weight:700;color:#fff;margin-bottom:8px;">${LANG[CURRENT_LANG]?.success_title || 'Wallet Siap!'}</div>
            <div style="font-size:14px;color:#888;line-height:1.6;margin-bottom:16px;max-width:260px;">
                ${LANG[CURRENT_LANG]?.success_desc || 'Wallet SidraChain kamu berhasil dibuat. Siap menerima SDA.'}
            </div>
            <div style="background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:14px 18px;margin-bottom:32px;font-size:12px;color:#666;font-family:monospace;word-break:break-all;max-width:320px;">
                ${SESSION.address || ""}
            </div>
            <button onclick="_finishOnboarding()" style="width:100%;max-width:320px;padding:16px;background:#ff7a00;border:none;border-radius:14px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">
                ${LANG[CURRENT_LANG]?.success_btn || 'Mulai Gunakan Wallet →'}
            </button>
        </div>
    `);
    setTimeout(_finishOnboarding, 4000);
}

function _finishOnboarding() {
    _hideOnboarding();
    renderWallets?.();
    loadBalance?.();
    renderAssets?.();
    updateActiveWalletName?.();
    updateAddressUI?.();
}

// -------------------------------------
// SCREEN: WALLET MANAGE
// -------------------------------------
function showWalletManageScreen() {
    window._pinContext = "wallet";
    window._onboardState.screen = "WALLET_MANAGE";

    if (!SESSION.unlocked) { showPINUnlockScreen(); return; }

    const _hasValidAccounts = SESSION.accounts?.some(a => a.address?.length > 10);
    if (!_hasValidAccounts) {
        const _legacyWallets = getWallets?.() || [];
        const _pkWallets = _legacyWallets.filter(w => w.address);
        if (_pkWallets.length) {
            SESSION.accounts = _pkWallets.map((w, i) => ({
                index: i, address: w.address, name: w.name || `Account ${i + 1}`, source: "legacy"
            }));
        }
    }

    if (!SESSION.accounts?.length && SESSION.address) {
        SESSION.accounts = [{ index: 0, address: SESSION.address, name: "Account 1", source: "fallback" }];
    }

    _syncAllAccountsToLegacy();

    const _activeDropdownIdx = parseInt(localStorage.getItem("selectedWalletIndex") || "0");
    const _wallets           = getWallets?.() || [];
    const _activeAddr        = _wallets[_activeDropdownIdx]?.address?.toLowerCase();
    const _activeSessionIdx  = SESSION.accounts.findIndex(a => a.address?.toLowerCase() === _activeAddr);
    const _displayActiveIdx  = _activeSessionIdx !== -1 ? _activeSessionIdx : SESSION.accountIndex;

    const accountList = SESSION.accounts.map((a, i) => {
        const isActive     = i === _displayActiveIdx;
        const addr         = (a.address || "").trim();
        const name         = (a.name || ("Account " + (i + 1))).trim();
        const shortAddress = addr ? addr.slice(0, 8) + "..." + addr.slice(-6) : "";
        const safeName     = name.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
        const safeAddr     = addr.replace(/'/g, "&#39;");
        const canDelete    = i > 0;
        const blockieUrl   = addr ? _generateBlockie(addr.toLowerCase()) : "";

        return (
            `<div style="background:${isActive ? "#1a1a1a" : "#0d0d0d"};border:1px solid ${isActive ? "rgba(255,122,0,0.4)" : "#222"};border-radius:14px;margin-bottom:8px;overflow:hidden;">` +
            `<div style="padding:12px 14px 8px;display:flex;align-items:center;gap:10px;cursor:pointer;box-sizing:border-box;" onclick="_selectAccountFromManage(${i})">` +
            `<div style="width:36px;height:36px;min-width:36px;border-radius:10px;overflow:hidden;flex-shrink:0;pointer-events:none;border:2px solid ${isActive ? "rgba(255,122,0,0.5)" : "#2a2a2a"};">` +
            (blockieUrl ? `<img src="${blockieUrl}" style="width:100%;height:100%;display:block;image-rendering:pixelated;" />` : `<div style="width:100%;height:100%;background:#1a1a1a;display:flex;align-items:center;justify-content:center;color:#555;font-size:14px;"><i class="fa-solid fa-wallet"></i></div>`) +
            `</div>` +
            `<div style="flex:1;min-width:0;pointer-events:none;">` +
            `<div style="font-size:14px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}${isActive ? ` <span style="font-size:10px;color:#ff7a00;font-weight:400;margin-left:4px;">Aktif</span>` : ``}</div>` +
            `<div style="font-size:11px;color:#555;font-family:monospace;margin-top:2px;">${shortAddress}</div>` +
            `</div></div>` +
            `<div style="display:flex;align-items:center;gap:2px;padding:4px 10px 10px;border-top:1px solid #1a1a1a;" onclick="event.stopPropagation()">` +
            `<button onclick="_copyAddress('${safeAddr}');_flashBtn(this);" style="background:transparent;border:none;color:#666;font-size:14px;cursor:pointer;padding:7px 9px;border-radius:6px;" title="Copy address"><i class="fa-solid fa-copy"></i></button>` +
            `<button onclick="_openExplorerForAccount('${safeAddr}')" style="background:transparent;border:none;color:#666;font-size:14px;cursor:pointer;padding:7px 9px;border-radius:6px;" title="Lihat di Explorer"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>` +
            `<button onclick="_showAccountDetail(${i})" style="background:transparent;border:none;color:#666;font-size:14px;cursor:pointer;padding:7px 9px;border-radius:6px;" title="Detail"><i class="fa-solid fa-circle-info"></i></button>` +
            `<button onclick="_showRenameAccount(${i},'${safeName}')" style="background:transparent;border:none;color:#666;font-size:14px;cursor:pointer;padding:7px 9px;border-radius:6px;" title="Ubah nama"><i class="fa-solid fa-pen"></i></button>` +
            `<div style="flex:1;"></div>` +
            (canDelete ? `<button onclick="_confirmDeleteAccount(${i})" style="background:transparent;border:none;color:#ff4444;font-size:14px;cursor:pointer;padding:7px 9px;border-radius:6px;" title="Hapus account"><i class="fa-solid fa-trash"></i></button>` : ``) +
            `</div></div>`
        );
    }).join("");

    const canAddAccount = SESSION.hasMnemonic;

    _showOnboarding(`
        <div style="padding:24px 24px 100px;max-width:420px;margin:0 auto;box-sizing:border-box;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px;">
                <button onclick="_hideOnboarding()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:0;">
                    <i class="fa-solid fa-arrow-left"></i>
                </button>
                <div style="font-size:18px;font-weight:700;color:#fff;flex:1;">${LANG[CURRENT_LANG]?.wallet_manager_title || 'Wallet Manager'}</div>
            </div>
            <div style="margin-bottom:16px;">${accountList}</div>
            ${canAddAccount ? `
            <button onclick="showAddAccountScreen()" style="width:100%;padding:13px;background:#1a1a1a;border:1px dashed #333;border-radius:12px;color:#888;font-size:14px;cursor:pointer;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:8px;">
                <i class="fa-solid fa-plus"></i> ${LANG[CURRENT_LANG]?.add_account_btn || 'Tambah Account (seed sama)'}
            </button>` : ""}
            <button onclick="showImportExternalPKScreen()" style="width:100%;padding:13px;background:#141414;border:1px dashed #2a4a7f;border-radius:12px;color:#6699ff;font-size:14px;cursor:pointer;margin-bottom:20px;display:flex;align-items:center;justify-content:center;gap:8px;">
                <i class="fa-solid fa-file-import"></i> ${LANG[CURRENT_LANG]?.import_external_btn || 'Import dari Seed / PK Lain'}
            </button>
            <button onclick="showSetPINScreen(true)" style="width:100%;padding:14px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:14px;cursor:pointer;margin-bottom:10px;">
                <i class="fa-solid fa-key"></i> ${LANG[CURRENT_LANG]?.pin_change_title || 'Ubah PIN'}
            </button>
            <button onclick="lockWallet();_hideOnboarding();" style="width:100%;padding:14px;background:#1a0000;border:1px solid #ff333330;border-radius:12px;color:#ff6666;font-size:14px;cursor:pointer;">
                <i class="fa-solid fa-lock"></i> ${LANG[CURRENT_LANG]?.lock_wallet_btn || 'Kunci Wallet'}
            </button>
        </div>
    `);
}

// -------------------------------------
// FLASH BUTTON
// -------------------------------------
function _flashBtn(btn) {
    if (!btn) return;
    var icon = btn.querySelector("i");
    if (icon) { icon.className = "fa-solid fa-check"; btn.style.color = "#00cc66"; }
    setTimeout(function() { if (icon) icon.className = "fa-solid fa-copy"; btn.style.color = "#666"; }, 1200);
}

function _copyAddress(addr) {
    if (!addr) return;
    navigator.clipboard?.writeText(addr).then(() => { showToast?.("Address disalin", "success"); }).catch(() => {
        const t = document.createElement("textarea"); t.value = addr; document.body.appendChild(t); t.select();
        document.execCommand("copy"); document.body.removeChild(t); showToast?.("Address disalin", "success");
    });
}

// -------------------------------------
// DETAIL ACCOUNT
// -------------------------------------
function _showAccountDetail(index) {
    const a    = SESSION.accounts[index];
    const addr = a?.address || "";
    const name = a?.name || `Account ${index + 1}`;
    const blockieUrl = addr ? _generateBlockie(addr.toLowerCase()) : "";

    const L = LANG[CURRENT_LANG] || {};
    const box = document.createElement("div");
    box.id = "accountDetailBox";
    box.style.cssText = "position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;overflow-y:auto;";
    box.innerHTML = `
        <div style="background:#111;border:1px solid #2a2a2a;border-radius:20px;padding:24px;max-width:340px;width:100%;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    ${blockieUrl ? `<div style="width:32px;height:32px;border-radius:8px;overflow:hidden;border:1px solid #333;flex-shrink:0;"><img src="${blockieUrl}" style="width:100%;height:100%;display:block;image-rendering:pixelated;" /></div>` : ""}
                    <div style="font-size:16px;font-weight:700;color:#fff;">${L.detail_title || 'Detail Account'}</div>
                </div>
                <button onclick="document.getElementById('accountDetailBox').remove()" style="background:none;border:none;color:#555;font-size:18px;cursor:pointer;padding:4px;"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div style="font-size:12px;color:#888;margin-bottom:4px;">${L.detail_name_label || 'Nama'}</div>
            <div style="font-size:15px;font-weight:600;color:#fff;margin-bottom:16px;">${name}</div>
            <div style="font-size:12px;color:#888;margin-bottom:4px;">${L.detail_address_label || 'Address'}</div>
            <div style="font-size:11px;color:#aaa;font-family:monospace;background:#0d0d0d;border:1px solid #222;border-radius:10px;padding:10px 12px;margin-bottom:4px;word-break:break-all;line-height:1.6;">${addr}</div>
            <button onclick="_copyAddress('${addr}');_flashBtn(this)" style="background:none;border:none;color:#ff7a00;font-size:12px;cursor:pointer;padding:0;margin-bottom:20px;display:flex;align-items:center;gap:5px;"><i class="fa-solid fa-copy"></i> ${L.detail_copy_address || 'Salin address'}</button>
            <div style="font-size:12px;color:#888;margin-bottom:6px;">${L.detail_pk_label || 'Private Key'}</div>
            <div style="background:#2a1500;border:1px solid #ff7a0030;border-radius:10px;padding:10px 12px;font-size:11px;color:#ff9a30;margin-bottom:12px;line-height:1.5;">
                ${L.detail_pk_warn || '(!!) Masukkan PIN untuk melihat private key. Jangan bagikan ke siapapun.'}
            </div>
            <input id="detailPINInput" type="password" inputmode="numeric" maxlength="12" placeholder="${L.detail_pk_placeholder || 'Masukkan PIN'}"
                style="width:100%;box-sizing:border-box;padding:12px 16px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:16px;letter-spacing:4px;outline:none;text-align:center;margin-bottom:8px;"
                oninput="document.getElementById('detailPINError').style.display='none'">
            <div id="detailPINError" style="display:none;color:#ff4444;font-size:12px;margin-bottom:8px;"></div>
            <button onclick="_revealPrivateKey(${index})" style="width:100%;padding:13px;background:#ff7a00;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">
                <i class="fa-solid fa-eye"></i> ${L.detail_pk_show || 'Tampilkan Private Key'}
            </button>
            <div id="pkRevealBox" style="display:none;margin-top:16px;">
                <div style="font-size:12px;color:#888;margin-bottom:6px;">Private Key</div>
                <div id="pkRevealText" style="font-size:10.5px;color:#fff;font-family:monospace;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:10px;padding:10px 12px;word-break:break-all;line-height:1.7;user-select:all;"></div>
                <button onclick="_copyPKFromDetail();_flashBtn(this)" style="background:none;border:none;color:#ff7a00;font-size:12px;cursor:pointer;padding:0;margin-top:6px;display:flex;align-items:center;gap:5px;"><i class="fa-solid fa-copy"></i> ${L.detail_pk_copy || 'Salin private key'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(box);
}

async function _revealPrivateKey(index) {
    const pin   = document.getElementById("detailPINInput")?.value || "";
    const errEl = document.getElementById("detailPINError");
    if (!pin) { if (errEl) { errEl.textContent = "Masukkan PIN"; errEl.style.display = "block"; } return; }
    try {
        const data    = await vault.unlockVault(pin);
        const account = data.accounts[index];
        if (!account?.privateKey) throw new Error("Private key tidak ditemukan di vault");
        window._tempRevealedPK = account.privateKey;
        const pkBox  = document.getElementById("pkRevealBox");
        const pkText = document.getElementById("pkRevealText");
        if (pkBox && pkText) { pkText.textContent = account.privateKey; pkBox.style.display = "block"; }
        const btn = document.querySelector("#accountDetailBox button[onclick*='_revealPrivateKey']");
        if (btn) btn.style.display = "none";
        setTimeout(() => { window._tempRevealedPK = null; if (pkText) pkText.textContent = "[ PK dihapus dari memori ]"; }, 60000);
    } catch (err) {
        if (errEl) { errEl.textContent = err.message || "PIN salah"; errEl.style.display = "block"; }
    }
}

function _copyPKFromDetail() {
    const pk = window._tempRevealedPK;
    if (!pk) return;
    navigator.clipboard?.writeText(pk).then(() => { showToast?.("Private key disalin", "success"); }).catch(() => {
        const t = document.createElement("textarea"); t.value = pk; document.body.appendChild(t); t.select();
        document.execCommand("copy"); document.body.removeChild(t); showToast?.("Private key disalin", "success");
    });
}

// -------------------------------------
// HAPUS ACCOUNT
// -------------------------------------
function _confirmDeleteAccount(index) {
    if (index === 0) return;
    const L = LANG[CURRENT_LANG] || {};
    const name = SESSION.accounts[index]?.name || `Account ${index + 1}`;
    const box = document.createElement("div");
    box.id = "deleteAccountBox";
    box.style.cssText = "position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;";
    box.innerHTML = `
        <div style="background:#141414;border:1px solid #333;border-radius:20px;padding:28px 24px;max-width:320px;width:100%;">
            <div style="font-size:24px;text-align:center;margin-bottom:12px;"><i class="fa-solid fa-trash"></i></div>
            <div style="font-size:16px;font-weight:700;color:#fff;text-align:center;margin-bottom:8px;">${(L.delete_account_title || 'Hapus {name}?').replace('{name}', name)}</div>
            <div style="font-size:13px;color:#888;text-align:center;line-height:1.6;margin-bottom:20px;">${L.delete_account_desc || 'Account akan dihapus dari daftar. Pastikan kamu sudah backup private key-nya.'}</div>
            <input id="deletePINInput" type="password" inputmode="numeric" maxlength="12" placeholder="${L.delete_account_pin || 'Masukkan PIN untuk konfirmasi'}"
                style="width:100%;box-sizing:border-box;padding:12px 16px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:15px;letter-spacing:4px;outline:none;text-align:center;margin-bottom:8px;">
            <div id="deletePINError" style="display:none;color:#ff4444;font-size:12px;margin-bottom:8px;text-align:center;"></div>
            <button onclick="_executeDeleteAccount(${index})" style="width:100%;padding:13px;background:#ff3333;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px;">${L.delete_account_btn || 'Hapus Account'}</button>
            <button onclick="document.getElementById('deleteAccountBox').remove()" style="width:100%;padding:13px;background:#1a1a1a;border:1px solid #333;border-radius:12px;color:#fff;font-size:14px;cursor:pointer;">${L.delete_account_cancel || 'Batal'}</button>
        </div>
    `;
    document.body.appendChild(box);
}

async function _executeDeleteAccount(index) {
    if (index === 0) return;
    const pin   = document.getElementById("deletePINInput")?.value || "";
    const errEl = document.getElementById("deletePINError");
    if (!pin) { if (errEl) { errEl.textContent = "Masukkan PIN"; errEl.style.display = "block"; } return; }
    try {
        const data = await vault.unlockVault(pin);
        const deletedAddr = data.accounts[index]?.address;
        data.accounts.splice(index, 1);
        data.accounts.forEach((a, i) => { a.index = i; });
        await vault.updateVault(data, pin);
        SESSION.accounts.splice(index, 1);
        SESSION.accounts.forEach((a, i) => { a.index = i; });
        if (deletedAddr) {
            let wallets = getWallets?.() || [];
            wallets = wallets.filter(w => w.address?.toLowerCase() !== deletedAddr.toLowerCase());
            setWallets?.(wallets);
        }
        if (SESSION.accountIndex >= SESSION.accounts.length) { await switchSessionAccount(0); }
        document.getElementById("deleteAccountBox")?.remove();
        showToast?.("Account dihapus", "success");
        showWalletManageScreen();
    } catch (err) {
        if (errEl) { errEl.textContent = err.message || "PIN salah"; errEl.style.display = "block"; }
    }
}

// -------------------------------------
// TAMBAH ACCOUNT
// -------------------------------------
function showAddAccountScreen() {
    window._onboardState.screen = "ADD_ACCOUNT";
    const nextIndex = SESSION.accounts.length;
    _showOnboarding(`
        <div style="padding:24px 24px 100px;max-width:420px;margin:0 auto;box-sizing:border-box;">
            <button onclick="showWalletManageScreen()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:0;margin-bottom:20px;"><i class="fa-solid fa-arrow-left"></i></button>
            <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">${LANG[CURRENT_LANG]?.add_account_title || 'Tambah Account'}</div>
            <div style="font-size:13px;color:#888;line-height:1.6;margin-bottom:24px;">${(LANG[CURRENT_LANG]?.add_account_desc || 'Account baru di-derive dari seed phrase yang sama (index {n}).').replace('{n}', nextIndex)}</div>
            <div style="margin-bottom:16px;">
                <div style="font-size:13px;color:#888;margin-bottom:6px;">${LANG[CURRENT_LANG]?.add_account_name_label || 'Nama Account (opsional)'}</div>
                <input id="newAccountName" type="text" placeholder="Account ${nextIndex + 1}"
                    style="width:100%;box-sizing:border-box;padding:14px 16px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:15px;outline:none;">
            </div>
            <div style="margin-bottom:16px;">
                <div style="font-size:13px;color:#888;margin-bottom:6px;">${LANG[CURRENT_LANG]?.add_account_pin_label || 'PIN untuk konfirmasi'}</div>
                <input id="addAccountPIN" type="password" inputmode="numeric" maxlength="12" placeholder="- - - - - -" style="${_pinInputStyle()}">
            </div>
            <div id="addAccountError" style="display:none;color:#ff4444;font-size:13px;padding:10px 14px;background:#2a0000;border-radius:10px;margin-bottom:12px;"></div>
            <button onclick="_submitAddAccount()" style="width:100%;padding:16px;background:#ff7a00;border:none;border-radius:14px;color:#fff;font-size:16px;font-weight:600;cursor:pointer;">${LANG[CURRENT_LANG]?.add_account_submit || 'Tambah Account'}</button>
        </div>
    `);
}

async function _submitAddAccount() {
    const pin   = document.getElementById("addAccountPIN")?.value || "";
    const name  = document.getElementById("newAccountName")?.value?.trim();
    const errEl = document.getElementById("addAccountError");
    if (!pin) { if (errEl) { errEl.textContent = "Masukkan PIN"; errEl.style.display = "block"; } return; }
    try {
        const data = await vault.unlockVault(pin);
        if (!data.mnemonic) throw new Error("Vault tidak memiliki seed phrase");
        const nextIndex  = data.accounts.length;
        const newAccount = deriveAccount(data.mnemonic, nextIndex);
        newAccount.name  = name || `Account ${nextIndex + 1}`;
        await vault.addAccount(pin, newAccount);
        SESSION.accounts.push({ index: nextIndex, address: newAccount.address, name: newAccount.name, source: "derived" });
        if (typeof _addAccountToPrivateCache === "function") {
            _addAccountToPrivateCache({ index: nextIndex, address: newAccount.address, privateKey: newAccount.privateKey, name: newAccount.name, source: "derived" });
        }
        _syncWalletToLegacySystem({ address: newAccount.address, name: newAccount.name });
        showToast?.(`${newAccount.name} ditambahkan`, "success");
        showWalletManageScreen();
    } catch (err) {
        if (errEl) { errEl.textContent = err.message || "Gagal tambah account"; errEl.style.display = "block"; }
    }
}

// -------------------------------------
// IMPORT EXTERNAL PK / SEED
// -------------------------------------
function showImportExternalPKScreen() {
    window._onboardState.screen = "IMPORT_EXT";
    _showOnboarding(`
        <div style="padding:24px 24px 100px;max-width:420px;margin:0 auto;box-sizing:border-box;">
            <button onclick="showWalletManageScreen()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;padding:0;margin-bottom:20px;"><i class="fa-solid fa-arrow-left"></i></button>
            <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:6px;">${LANG[CURRENT_LANG]?.import_ext_title || 'Import dari Seed / PK Lain'}</div>
            <div style="font-size:13px;color:#888;line-height:1.6;margin-bottom:20px;">${LANG[CURRENT_LANG]?.import_ext_desc || 'Tambahkan account dari seed phrase atau private key yang berbeda.'}</div>
            <div style="background:#2a1500;border:1px solid #ff7a0030;border-radius:12px;padding:12px 16px;margin-bottom:20px;font-size:12px;color:#ff9a30;line-height:1.6;">
                ${LANG[CURRENT_LANG]?.import_ext_warn || '(!!) Private key akan disimpan terenkripsi di vault yang sama.'}
            </div>
            <div style="display:flex;gap:8px;margin-bottom:20px;">
                <button id="tabSeedBtn" onclick="_switchImportTab('seed')" style="flex:1;padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;background:#ff7a00;border:none;color:#fff;">Seed Phrase</button>
                <button id="tabPKBtn" onclick="_switchImportTab('pk')" style="flex:1;padding:10px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;background:#1a1a1a;border:1px solid #333;color:#888;">Private Key</button>
            </div>
            <div id="panelSeed">
                <div style="font-size:13px;color:#888;margin-bottom:6px;">${LANG[CURRENT_LANG]?.import_ext_seed_label || 'Seed Phrase (12 atau 24 kata)'}</div>
                <textarea id="extSeedInput" placeholder="word1 word2 word3 ..."
                    autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" rows="3"
                    style="width:100%;box-sizing:border-box;padding:12px 14px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:14px;outline:none;resize:none;line-height:1.6;margin-bottom:6px;"
                    oninput="_validatePhraseInput2(this.value)"></textarea>
                <div id="extSeedHint" style="font-size:12px;color:#555;margin-bottom:12px;">0 kata</div>
            </div>
            <div id="panelPK" style="display:none;">
                <div style="font-size:13px;color:#888;margin-bottom:6px;">${LANG[CURRENT_LANG]?.import_ext_pk_label || 'Private Key (0x...)'}</div>
                <div style="position:relative;margin-bottom:4px;">
                    <input id="extPKInput" type="text" placeholder="0x..." autocomplete="off" spellcheck="false" data-pk-real=""
                        style="width:100%;box-sizing:border-box;padding:12px 44px 12px 14px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:14px;outline:none;font-family:monospace;"
                        oninput="_extPkMaskInput(this)" onpaste="_extPkHandlePaste(event,this)">
                    <button id="extPKToggleBtn" onclick="_extPkToggle()" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#555;cursor:pointer;font-size:15px;padding:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
    <i class="fa-solid fa-eye-slash"></i>
</button>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <div id="extPKHint" style="font-size:11px;color:#555;font-family:monospace;min-height:16px;"></div>
                    <button onclick="_extPkPaste()" style="padding:5px 12px;width:auto;margin-top:0;background:transparent;border:1px solid #2a2a2a;border-radius:8px;color:#ff7a00;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:5px;">
                        <i class="fa-regular fa-clipboard"></i> Paste
                    </button>
                </div>
            </div>
            <div style="margin-bottom:16px;">
                <div style="font-size:13px;color:#888;margin-bottom:6px;">${LANG[CURRENT_LANG]?.import_ext_name_label || 'Nama Account (opsional)'}</div>
                <input id="extAccountName" type="text" placeholder="Imported Account"
                    style="width:100%;box-sizing:border-box;padding:12px 14px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:14px;outline:none;">
            </div>
            <div style="margin-bottom:16px;">
                <div style="font-size:13px;color:#888;margin-bottom:6px;">${LANG[CURRENT_LANG]?.import_ext_pin_label || 'PIN untuk konfirmasi'}</div>
                <input id="extImportPIN" type="password" inputmode="numeric" maxlength="12" placeholder="- - - - - -" style="${_pinInputStyle()}">
            </div>
            <div id="extImportError" style="display:none;color:#ff4444;font-size:13px;padding:10px 14px;background:#2a0000;border-radius:10px;margin-bottom:12px;"></div>
            <button onclick="_submitImportExternal()" style="width:100%;padding:15px;background:#ff7a00;border:none;border-radius:14px;color:#fff;font-size:15px;font-weight:600;cursor:pointer;">
                <i class="fa-solid fa-file-import"></i> ${LANG[CURRENT_LANG]?.import_ext_submit || 'Import & Tambahkan'}
            </button>
        </div>
    `);
}

window._extPkMasked = true;

function _extPkMaskInput(inp) {
    var real = inp.dataset.pkReal || "", cursorPos = inp.selectionStart, displayVal = inp.value;
    if (window._extPkMasked) {
        var newReal = "";
        for (var i = 0; i < displayVal.length; i++) { newReal += displayVal[i] === "*" ? (real[i] || "") : displayVal[i]; }
        inp.dataset.pkReal = newReal; inp.value = "*".repeat(newReal.length);
        try { inp.setSelectionRange(cursorPos, cursorPos); } catch(e){}
    } else { inp.dataset.pkReal = displayVal; }
    var hint = document.getElementById("extPKHint");
    if (hint) { var len = inp.dataset.pkReal.length; hint.textContent = len > 0 ? len + " karakter" : ""; }
}

function _extPkHandlePaste(event, inp) {
    event.preventDefault();
    var pasted = (event.clipboardData || window.clipboardData).getData("text");
    var real = inp.dataset.pkReal || "", start = inp.selectionStart, end = inp.selectionEnd;
    real = real.slice(0, start) + pasted + real.slice(end);
    inp.dataset.pkReal = real; inp.value = window._extPkMasked ? "*".repeat(real.length) : real;
    var newPos = start + pasted.length;
    try { inp.setSelectionRange(newPos, newPos); } catch(e){}
    var hint = document.getElementById("extPKHint");
    if (hint) hint.textContent = real.length + " karakter";
}

function _extPkToggle() {
    var inp = document.getElementById("extPKInput"); if (!inp) return;
    var real = inp.dataset.pkReal || "";
    window._extPkMasked = !window._extPkMasked;
    inp.value = window._extPkMasked ? "*".repeat(real.length) : real;
    var btn = document.getElementById("extPKToggleBtn");
    if (btn) btn.innerHTML = window._extPkMasked ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
}

async function _extPkPaste() {
    const inp = document.getElementById("extPKInput");
    if (!inp) return;
    let text = "";
    if (window.AndroidWallet?.getClipboardText) {
        text = AndroidWallet.getClipboardText();
    } else {
        text = await navigator.clipboard?.readText().catch(() => "") || "";
    }
    text = text.trim();
    if (!text) { showToast?.("Clipboard kosong", "error"); return; }
    inp.dataset.pkReal = text;
    inp.value = window._extPkMasked ? "*".repeat(text.length) : text;
    const hint = document.getElementById("extPKHint");
    if (hint) hint.textContent = text.length + " karakter";
    showToast?.("Private key dipaste", "success");
}

function _switchImportTab(tab) {
    const isSeed = tab === "seed";
    document.getElementById("panelSeed").style.display = isSeed ? "block" : "none";
    document.getElementById("panelPK").style.display   = isSeed ? "none"  : "block";
    const seedBtn = document.getElementById("tabSeedBtn"), pkBtn = document.getElementById("tabPKBtn");
    if (seedBtn) { seedBtn.style.background = isSeed ? "#ff7a00" : "#1a1a1a"; seedBtn.style.border = isSeed ? "none" : "1px solid #333"; seedBtn.style.color = isSeed ? "#fff" : "#888"; }
    if (pkBtn)   { pkBtn.style.background = !isSeed ? "#ff7a00" : "#1a1a1a"; pkBtn.style.border = !isSeed ? "none" : "1px solid #333"; pkBtn.style.color = !isSeed ? "#fff" : "#888"; }
}

function _validatePhraseInput2(val) {
    const hint = document.getElementById("extSeedHint"); if (!hint) return;
    const words = val.trim().split(/\s+/).filter(Boolean), count = words.length, valid = count === 12 || count === 24;
    const wordLabel = LANG[CURRENT_LANG]?.words_label || "kata";
    hint.textContent = count + " " + wordLabel + (valid ? " \u2713" : "");
    hint.style.color = valid ? "#00cc66" : "#555";
}

async function _submitImportExternal() {
    const pin    = document.getElementById("extImportPIN")?.value || "";
    const name   = document.getElementById("extAccountName")?.value?.trim() || "Imported Account";
    const errEl  = document.getElementById("extImportError");
    const isPKTab = document.getElementById("panelPK")?.style.display !== "none";
    const _showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.style.display = "block"; } };
    if (!pin) { _showErr("Masukkan PIN"); return; }
    let importedWallet;
    try {
        if (isPKTab) {
            const inp = document.getElementById("extPKInput");
            const pk = (inp?.dataset?.pkReal || inp?.value || "").trim();
            if (!pk) { _showErr("Masukkan private key"); return; }
            importedWallet = importFromPrivateKey(pk);
        } else {
            const phrase = document.getElementById("extSeedInput")?.value?.trim() || "";
            if (!phrase) { _showErr("Masukkan seed phrase"); return; }
            importedWallet = importFromMnemonic(phrase, 0);
        }
    } catch (err) { _showErr(err.message || "Data tidak valid"); return; }
    try {
        const data = await vault.unlockVault(pin);
        const exists = data.accounts.some(a => a.address?.toLowerCase() === importedWallet.address?.toLowerCase());
        if (exists) { _showErr("Address ini sudah ada di wallet kamu"); return; }
        const newAccount = { address: importedWallet.address, privateKey: importedWallet.privateKey, name, source: isPKTab ? "privateKey" : "mnemonic-external" };
        await vault.addAccount(pin, newAccount);
        const nextIndex = SESSION.accounts.length;
        SESSION.accounts.push({ index: nextIndex, address: newAccount.address, name: newAccount.name, source: newAccount.source });
        if (typeof _addAccountToPrivateCache === "function") {
            _addAccountToPrivateCache({ index: nextIndex, address: newAccount.address, privateKey: newAccount.privateKey, name: newAccount.name, source: newAccount.source });
        }
        _syncWalletToLegacySystem({ address: newAccount.address, name: newAccount.name });
        showToast?.(`${name} berhasil diimport`, "success");
        showWalletManageScreen();
    } catch (err) { _showErr(err.message || "Gagal import"); }
}

// -------------------------------------
// SYNC LEGACY
// -------------------------------------
function _syncWalletToLegacySystem(walletData) {
    if (!walletData?.address) return;
    let wallets = getWallets?.() || [];
    const addr  = walletData.address.toLowerCase();
    const idx   = wallets.findIndex(w => w.address?.toLowerCase() === addr);
    const entry = { address: walletData.address, name: walletData.name || `Wallet ${wallets.length + 1}`, type: "pk" };
    if (idx === -1) { wallets.push(entry); }
    else { const existing = wallets[idx]; delete existing.privateKey; wallets[idx] = { ...existing, ...entry }; }
    setWallets?.(wallets);
    const newIdx = wallets.findIndex(w => w.address?.toLowerCase() === addr);
    if (newIdx !== -1) {
        localStorage.setItem("selectedWalletIndex", String(newIdx));
        const sel = document.getElementById("walletSelect");
        if (sel) { sel.value = String(newIdx); sel.dispatchEvent(new Event("change")); }
    }
    renderWallets?.(); updateActiveWalletName?.(); updateAddressUI?.();
}

async function _syncAllAccountsToLegacy() {
    if (!SESSION.unlocked || !SESSION.accounts?.length) return;
    let wallets = getWallets?.() || [], changed = false;
    SESSION.accounts.forEach((a, i) => {
        const addr = a.address?.toLowerCase(); if (!addr) return;
        const existIdx = wallets.findIndex(w => w.address?.toLowerCase() === addr);
        if (existIdx === -1) { wallets.push({ address: a.address, name: a.name || `Account ${i + 1}`, type: "pk" }); changed = true; }
        else if (wallets[existIdx].privateKey) { delete wallets[existIdx].privateKey; changed = true; }
    });
    if (!changed) return;
    setWallets?.(wallets); renderWallets?.();
    const activeAddr = SESSION.address?.toLowerCase();
    if (activeAddr) {
        const activeIdx = wallets.findIndex(w => w.address?.toLowerCase() === activeAddr);
        if (activeIdx !== -1) {
            localStorage.setItem("selectedWalletIndex", String(activeIdx));
            const sel = document.getElementById("walletSelect");
            if (sel) { sel.value = String(activeIdx); sel.dispatchEvent(new Event("change")); }
        }
    }
}

async function _selectAccountFromManage(index) {
    if (!SESSION.unlocked) return;
    await switchSessionAccount(index);
    showWalletManageScreen();
}

// -------------------------------------
// RECONCILE SESSION SIGNER <-> DROPDOWN
// unlockWallet() selalu set SESSION.signer ke accounts[0] (reset tiap
// unlock ulang), padahal dropdown wallet bisa saja masih menampilkan
// wallet lain (tersimpan di localStorage selectedWalletIndex dari
// sebelum lock). Fungsi ini menyamakan signer aktif ke wallet yang
// SUDAH ditampilkan UI, supaya swap/tx tidak salah dompet.
// -------------------------------------
async function _reconcileSessionToSelectedWallet() {
    try {
        const wallets  = getWallets?.() || [];
        const savedIdx = parseInt(localStorage.getItem("selectedWalletIndex") || "0");
        const selectedWallet = wallets[savedIdx];

        if (!selectedWallet?.address) return;

        // Wallet type "watch" tidak punya signer di vault — abaikan
        if (selectedWallet.type !== "pk") return;

        const sessionIdx = SESSION.accounts.findIndex(
            a => a.address?.toLowerCase() === selectedWallet.address?.toLowerCase()
        );

        if (sessionIdx !== -1 && sessionIdx !== SESSION.accountIndex) {
            await switchSessionAccount(sessionIdx);
            console.log("[reconcile] Signer disinkronkan ke wallet aktif di UI:", selectedWallet.name);
        }
    } catch (e) {
        console.warn("[reconcile] Gagal sinkron wallet aktif:", e);
    }
}

// -------------------------------------
// PUBLIC ALIAS
// -------------------------------------
function showOnboarding()    { showWelcomeScreen(); }
function showPINUnlock()     { showPINUnlockScreen(); }
function showWalletManager() { showWalletManageScreen(); }

function _openExplorerForAccount(addr) {
    if (!addr) return;
    openExplorer(`https://explorer.sidrachain.com/address/${addr}`);
}

// -------------------------------------
// RENAME ACCOUNT
// -------------------------------------
function _showRenameAccount(index, currentName) {
    const L = LANG[CURRENT_LANG] || {};
    const box = document.createElement("div");
    box.id = "renameAccountBox";
    box.style.cssText = "position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;";
    box.innerHTML = `
        <div style="background:#141414;border:1px solid #333;border-radius:20px;padding:28px 24px;max-width:320px;width:100%;">
            <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:16px;">${L.rename_title || 'Ubah Nama Account'}</div>
            <input id="renameAccountInput" type="text" value="${currentName}"
                style="width:100%;box-sizing:border-box;padding:14px 16px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:15px;outline:none;margin-bottom:10px;"
                oninput="document.getElementById('renameAccountError').style.display='none'">
            <div style="font-size:12px;color:#888;margin-bottom:6px;">${L.rename_pin_label || 'PIN untuk konfirmasi'}</div>
            <input id="renameAccountPIN" type="password" inputmode="numeric" maxlength="12" placeholder="- - - - - -"
                style="width:100%;box-sizing:border-box;padding:12px 16px;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:12px;color:#fff;font-size:16px;letter-spacing:4px;outline:none;text-align:center;margin-bottom:8px;"
                oninput="document.getElementById('renameAccountError').style.display='none'">
            <div id="renameAccountError" style="display:none;color:#ff4444;font-size:12px;margin-bottom:8px;"></div>
            <div style="display:flex;gap:10px;margin-top:16px;">
                <button onclick="document.getElementById('renameAccountBox').remove()" style="flex:1;padding:12px;background:#1a1a1a;border:1px solid #333;border-radius:12px;color:#fff;font-size:14px;cursor:pointer;">${L.rename_cancel || 'Batal'}</button>
                <button onclick="_submitRenameAccount(${index})" style="flex:1;padding:12px;background:#ff7a00;border:none;border-radius:12px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;">${L.rename_save || 'Simpan'}</button>
            </div>
        </div>
    `;
    document.body.appendChild(box);
    setTimeout(() => { const inp = document.getElementById("renameAccountInput"); inp?.focus(); inp?.select(); }, 50);
}

async function _submitRenameAccount(index) {
    const newName = document.getElementById("renameAccountInput")?.value?.trim();
    const pin     = document.getElementById("renameAccountPIN")?.value || "";
    const errEl   = document.getElementById("renameAccountError");
    const showErr = (msg) => { if (errEl) { errEl.textContent = msg; errEl.style.display = "block"; } };

    if (!newName) { showErr("Nama tidak boleh kosong"); return; }
    if (!pin)     { showErr("Masukkan PIN"); return; }

    try {
        const data = await vault.unlockVault(pin);
        if (data.accounts[index]) data.accounts[index].name = newName;
        await vault.updateVault(data, pin);

        if (SESSION.accounts[index]) SESSION.accounts[index].name = newName;

        const addr = SESSION.accounts[index]?.address;
        if (addr) {
            const wallets = getWallets?.() || [];
            const wIdx    = wallets.findIndex(w => w.address?.toLowerCase() === addr.toLowerCase());
            if (wIdx !== -1) {
                wallets[wIdx].name = newName;
                setWallets?.(wallets);
                renderWallets?.();
                updateActiveWalletName?.();
            }
        }

        document.getElementById("renameAccountBox")?.remove();
        showToast?.("Nama account diubah", "success");
        showWalletManageScreen();
    } catch (err) {
        showErr(err.message || "PIN salah");
    }
}