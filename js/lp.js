// =====================================
// LP.JS â€” NFT Position Manager
// Scan, Render, Collect, Remove
// =====================================

const NFT_PM = "0x8b9bCc8C722778f30146e20e44E8d8e28adD8df8";
const LP_CACHE_KEY = "lp_cache_v1";
const LP_CACHE_TTL = 60 * 1000;

const poolAddressCache = {};
const priceCache       = {};

window.currentLPs = [];


// =====================================
// SIGNER â€” pakai requirePK
// Kalau bukan PK wallet, masih bisa scan
// tapi tidak bisa transaksi
// =====================================
function getLPSigner() {
    return requirePK(); // throws kalau tidak ada / locked
}

function canTransactLP(lp) {
    const s = window.WALLET_SESSION;
    if (!s.pkWallet) return false;
    if (s.pkLocked)  return false;
    return s.activeAddress?.toLowerCase() === lp.owner?.toLowerCase();
}


// =====================================
// AMOUNTS FROM LIQUIDITY MATH
// =====================================
function getAmounts(liquidity, sqrtPriceX96, tickLower, tickUpper) {
    const Q96        = 2 ** 96;
    const sqrtLower  = Math.pow(1.0001, tickLower / 2);
    const sqrtUpper  = Math.pow(1.0001, tickUpper / 2);
    const sqrtPrice  = Number(sqrtPriceX96) / Q96;
    const L          = Number(liquidity);

    if (!L) return { amount0: 0, amount1: 0 };

    if (sqrtPrice <= sqrtLower) {
        return {
            amount0: L * ((sqrtUpper - sqrtLower) / (sqrtLower * sqrtUpper)),
            amount1: 0
        };
    }

    if (sqrtPrice < sqrtUpper) {
        return {
            amount0: L * ((sqrtUpper - sqrtPrice) / (sqrtPrice * sqrtUpper)),
            amount1: L * (sqrtPrice - sqrtLower)
        };
    }

    return {
        amount0: 0,
        amount1: L * (sqrtUpper - sqrtLower)
    };
}


// =====================================
// POOL ADDRESS (CACHED)
// =====================================
async function getPoolAddress(token0, token1, fee) {
    const key = `${token0}_${token1}_${fee}`;
    if (poolAddressCache[key]) return poolAddressCache[key];

    const factory = new ethers.Contract(
        window.CONFIG.FACTORY,
        ["function getPool(address,address,uint24) view returns (address)"],
        provider
    );

    const pool = await factory.getPool(token0, token1, fee);
    poolAddressCache[key] = pool;
    return pool;
}


// =====================================
// CLAIMABLE FEES (callStatic)
// =====================================
async function getRealClaimableFees(tokenId) {
    try {
        const wallet = getSelectedWallet();
        if (!wallet?.address) return { amount0: 0, amount1: 0 };

        const contract = new ethers.Contract(
            NFT_PM,
            ["function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) payable returns (uint256 amount0,uint256 amount1)"],
            provider
        );

        const MAX = ethers.BigNumber.from("0xffffffffffffffffffffffffffffffff");

        const result = await contract.callStatic.collect({
            tokenId,
            recipient:   wallet.address,
            amount0Max:  MAX,
            amount1Max:  MAX
        });

        return { amount0: result.amount0, amount1: result.amount1 };

    } catch (e) {
        console.warn("callStatic collect error:", tokenId.toString(), e.message);
        return { amount0: 0, amount1: 0 };
    }
}


// =====================================
// LOAD ALL NFT POSITIONS
// =====================================
async function loadNFTs() {
    const wallet = getSelectedWallet();
    if (!wallet?.address) return [];

    try {
        const abi = [
            "function balanceOf(address owner) view returns (uint256)",
            "function tokenOfOwnerByIndex(address owner,uint256 index) view returns (uint256)",
            "function positions(uint256 tokenId) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
            "function tokenURI(uint256 tokenId) view returns (string)"
        ];

        const POOL_ABI = [
            "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)"
        ];

        const contract = new ethers.Contract(NFT_PM, abi, provider);
        const balance  = Number(await contract.balanceOf(wallet.address));

        if (balance === 0) return [];

        const tasks = Array.from({ length: balance }, async (_, i) => {
            try {
                const tokenId = await contract.tokenOfOwnerByIndex(wallet.address, i);
                const pos     = await contract.positions(tokenId);

                const token0 = pos[2];
                const token1 = pos[3];
                const fee    = pos[4];

                const poolAddr = await getPoolAddress(token0, token1, fee);

                if (!poolAddr || poolAddr === ethers.constants.AddressZero) return null;

                const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);

                const [slot0, previewFees] = await Promise.all([
                    pool.slot0(),
                    getRealClaimableFees(tokenId)
                ]);

                const priceKey = `${token0}_${token1}`;
                if (!priceCache[priceKey]) {
                    priceCache[priceKey] = await PRICE_ENGINE.getPrice(token0, token1);
                }
                const currentPrice = priceCache[priceKey] || 0;

                let priceLower = Math.pow(1.0001, pos[5]);
                let priceUpper = Math.pow(1.0001, pos[6]);
                if (priceLower > priceUpper) [priceLower, priceUpper] = [priceUpper, priceLower];

                const status = (slot0.tick >= pos[5] && slot0.tick < pos[6]) ? "Active" : "Inactive";

                const t0 = (window.TOKENS || []).find(t => t.address?.toLowerCase() === token0.toLowerCase());
                const t1 = (window.TOKENS || []).find(t => t.address?.toLowerCase() === token1.toLowerCase());

                const amounts = getAmounts(pos[7], slot0.sqrtPriceX96, pos[5], pos[6]);

                const fees0 = parseFloat(ethers.utils.formatUnits(previewFees.amount0, t0?.decimals || 18));
                const fees1 = parseFloat(ethers.utils.formatUnits(previewFees.amount1, t1?.decimals || 18));

                // ===========================
                // FETCH NFT IMAGE (tokenURI)
                // ===========================
                let nftImage = null;
                try {
                    const uri = await contract.tokenURI(tokenId);

                    // uri = "data:application/json;base64,..."
                    if (uri.startsWith("data:application/json;base64,")) {
                        const json = JSON.parse(atob(uri.split(",")[1]));
                        // image field bisa berupa "data:image/svg+xml;base64,..." atau svg langsung
                        nftImage = json.image || null;
                    } else if (uri.startsWith("data:image")) {
                        nftImage = uri;
                    }
                } catch {
                    nftImage = null;
                }

                return {
                    id:           tokenId.toString(),
                    owner:        wallet.address,
                    token0,
                    token1,
                    fee:          (fee / 10000) + "%",
                    feeRaw:       fee,
                    status,
                    symbol0:      t0?.symbol || "T0",
                    symbol1:      t1?.symbol || "T1",
                    logo0:        t0?.logo   || "img/default.png",
                    logo1:        t1?.logo   || "img/default.png",
                    decimals0:    t0?.decimals || 18,
                    decimals1:    t1?.decimals || 18,
                    amount0:      (amounts.amount0 / 10 ** (t0?.decimals || 18)).toFixed(4),
                    amount1:      (amounts.amount1 / 10 ** (t1?.decimals || 18)).toFixed(4),
                    fees0:        fees0.toFixed(6),
                    fees1:        fees1.toFixed(6),
                    hasFees:      fees0 > 0 || fees1 > 0,
                    liquidity:    pos[7].toString(),
                    tickLower:    pos[5],
                    tickUpper:    pos[6],
                    priceLower,
                    priceUpper,
                    currentPrice,
                    nftImage      // SVG/image dari tokenURI
                };
            } catch (e) {
                console.warn("NFT position load error:", e.message);
                return null;
            }
        });

        return (await Promise.all(tasks)).filter(Boolean);

    } catch (e) {
        console.warn("loadNFTs error:", e);
        return [];
    }
}


// =====================================
// COLLECT FEES
// =====================================
async function collectFees(tokenId) {
    try {
        const wallet = getLPSigner(); // throws kalau tidak ada PK / locked

        const MAX = ethers.BigNumber.from("0xffffffffffffffffffffffffffffffff");

        const contract = new ethers.Contract(
            NFT_PM,
            ["function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) payable returns (uint256 amount0,uint256 amount1)"],
            wallet
        );

        showToast?.("Collecting fees...", "info");

        const tx = await contract.collect({
            tokenId,
            recipient:  wallet.address,
            amount0Max: MAX,
            amount1Max: MAX
        });

        await tx.wait();

        showToast?.("Fees collected!", "success");
        clearCachedLP();
        renderLP(true);

    } catch (e) {
        console.error("collectFees error:", e);
        if (e.message === "PK required" || e.message === "PK locked") return;
        showToast?.("Collect gagal: " + (e.reason || e.message || ""), "error");
    }
}


// =====================================
// REMOVE LIQUIDITY + AUTO COLLECT FEES
// =====================================
async function removeLiquidity(tokenId) {
    const lp = window.currentLPs.find(x => x.id == tokenId);
    if (!lp) return;

    showConfirm?.(
        `Remove semua liquidity dari posisi #${tokenId}? Fees yang ada akan di-collect otomatis.`,
        async () => {
            try {
                const wallet = getLPSigner();

                const pm = new ethers.Contract(
                    NFT_PM,
                    [
                        "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) payable returns (uint256 amount0,uint256 amount1)",
                        "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) payable returns (uint256 amount0,uint256 amount1)",
                        "function burn(uint256 tokenId) payable"
                    ],
                    wallet
                );

                const deadline = Math.floor(Date.now() / 1000) + 600;
                const MAX      = ethers.BigNumber.from("0xffffffffffffffffffffffffffffffff");

                showToast?.("Removing liquidity...", "info");

                // Step 1 â€” decrease semua liquidity
                if (BigInt(lp.liquidity) > 0n) {
                    const tx1 = await pm.decreaseLiquidity({
                        tokenId,
                        liquidity:   lp.liquidity,
                        amount0Min:  0,
                        amount1Min:  0,
                        deadline
                    });
                    await tx1.wait();
                }

                // Step 2 â€” collect semua (termasuk fees)
                showToast?.("Collecting tokens & fees...", "info");
                const tx2 = await pm.collect({
                    tokenId,
                    recipient:  wallet.address,
                    amount0Max: MAX,
                    amount1Max: MAX
                });
                await tx2.wait();

                // Step 3 â€” burn NFT kalau liquidity & fees sudah 0
                try {
                    const tx3 = await pm.burn(tokenId);
                    await tx3.wait();
                } catch {
                    // burn bisa gagal kalau ada sisa dust â€” tidak critical
                }

                showToast?.("Liquidity removed!", "success");
                clearCachedLP();
                renderLP(true);

            } catch (e) {
                console.error("removeLiquidity error:", e);
                if (e.message === "PK required" || e.message === "PK locked") return;
                showToast?.("Remove gagal: " + (e.reason || e.message || ""), "error");
            }
        }
    );
}


// =====================================
// BOOST LIQUIDITY (INCREASE)
// =====================================
async function boostLiquidity(tokenId) {
    const lp = window.currentLPs.find(x => x.id == tokenId);
    if (!lp) return;

    showPrompt?.("Jumlah token0 yang ingin ditambah:", "0.0", async (val) => {
        const amount0 = parseFloat(val);
        if (!amount0 || amount0 <= 0) return showToast?.("Jumlah tidak valid", "error");

        try {
            const wallet = getLPSigner();

            // Hitung amount1 dari harga saat ini
            const price   = lp.currentPrice || 0;
            const amount1 = price > 0 ? amount0 * price : 0;

            const dec0 = lp.decimals0 || 18;
            const dec1 = lp.decimals1 || 18;

            const lpTx = await LP_ENGINE.increaseLP({
                tokenId,
                amount0: ethers.utils.parseUnits(amount0.toFixed(dec0 > 6 ? 6 : dec0), dec0),
                amount1: ethers.utils.parseUnits(amount1.toFixed(dec1 > 6 ? 6 : dec1), dec1)
            });

            showToast?.("Liquidity boosted!", "success");
            clearCachedLP();
            renderLP(true);

        } catch (e) {
            console.error("boostLiquidity error:", e);
            if (e.message === "PK required" || e.message === "PK locked") return;
            showToast?.("Boost gagal: " + (e.reason || e.message || ""), "error");
        }
    });
}


// =====================================
// TRANSFER LP NFT
// =====================================
async function transferLP(tokenId) {
    showPrompt?.("Masukkan alamat tujuan:", "", async (to) => {
        if (!to || !ethers.utils.isAddress(to)) {
            return showToast?.("Alamat tidak valid", "error");
        }

        showConfirm?.(`Kirim LP NFT #${tokenId} ke ${to.slice(0,8)}...?`, async () => {
            try {
                const wallet = getLPSigner();

                const contract = new ethers.Contract(
                    NFT_PM,
                    ["function safeTransferFrom(address from,address to,uint256 tokenId)"],
                    wallet
                );

                showToast?.("Sending NFT...", "info");
                const tx = await contract.safeTransferFrom(wallet.address, to, tokenId);
                await tx.wait();

                showToast?.("LP NFT terkirim!", "success");
                clearCachedLP();
                renderLP(true);

            } catch (e) {
                console.error("transferLP error:", e);
                if (e.message === "PK required" || e.message === "PK locked") return;
                showToast?.("Transfer gagal: " + (e.reason || e.message || ""), "error");
            }
        });
    });
}


// =====================================
// LP DETAIL VIEW
// =====================================
function openLPDetail(id) {
    const lp = window.currentLPs.find(x => x.id == id);
    if (!lp) return;

    const can     = canTransactLP(lp);
    const hasFees = lp.hasFees;

    // kalau bukan PK wallet tapi scan wallet orang lain
    const isPKWallet  = !!window.WALLET_SESSION?.pkWallet && !window.WALLET_SESSION?.pkLocked;
    const isOwner     = window.WALLET_SESSION?.activeAddress?.toLowerCase() === lp.owner?.toLowerCase();

    const noTxReason = !isPKWallet
        ? "Import PK untuk transaksi"
        : !isOwner
            ? "Bukan wallet pemilik"
            : "";

    document.getElementById("tab-lp").innerHTML = `
        <div class="lp-detail">

            <button class="lp-back-btn" onclick="renderLP()">
                <i class="fa-solid fa-arrow-left"></i> Back
            </button>

            ${lp.nftImage ? `
            <div class="lp-nft-image">
                <img src="${lp.nftImage}"
                     alt="LP NFT #${lp.id}"
                     onerror="this.parentElement.style.display='none'">
            </div>` : ""}

            <div class="lp-detail-header">
                <div class="lp-pair-icons">
                    <img src="${lp.logo0}" onerror="this.src='img/default.png'" class="lp-icon">
                    <img src="${lp.logo1}" onerror="this.src='img/default.png'" class="lp-icon overlap">
                </div>
                <div>
                    <div class="lp-title">${lp.symbol0}/${lp.symbol1}</div>
                    <div class="lp-sub">${lp.fee} &bull; #${lp.id}</div>
                </div>
                <div class="lp-status ${lp.status === 'Active' ? 'active' : 'inactive'}">
                    ${lp.status}
                </div>
            </div>

            <div class="lp-detail-card">
                <div class="lp-card-title">
                    <i class="fa-solid fa-droplet"></i> Liquidity
                </div>
                <div class="lp-row">
                    <span>${lp.symbol0}</span>
                    <b>${lp.amount0}</b>
                </div>
                <div class="lp-row">
                    <span>${lp.symbol1}</span>
                    <b>${lp.amount1}</b>
                </div>
                <div class="lp-price-info">
                    1 ${lp.symbol0} = ${lp.currentPrice.toFixed(6)} ${lp.symbol1}
                </div>
                <div class="lp-range-bar" style="margin:10px 0 4px;">
                    <div class="lp-range-dot" style="left:${Math.max(0,Math.min(100,((lp.currentPrice-lp.priceLower)/(lp.priceUpper-lp.priceLower))*100))}%"></div>
                </div>
                <div class="lp-range-labels">
                    <span>${formatPrice(lp.priceLower)}</span>
                    <span>${formatPrice(lp.priceUpper)}</span>
                </div>
            </div>

            <div class="lp-detail-card">
                <div class="lp-card-title">
                    <i class="fa-solid fa-coins"></i> Claimable Fees
                </div>
                <div class="lp-row">
                    <span>${lp.symbol0}</span>
                    <b style="color:${lp.fees0 > 0 ? '#00d084' : '#888'}">${lp.fees0}</b>
                </div>
                <div class="lp-row">
                    <span>${lp.symbol1}</span>
                    <b style="color:${lp.fees1 > 0 ? '#00d084' : '#888'}">${lp.fees1}</b>
                </div>
                <button
                    class="lp-btn primary"
                    onclick="collectFees('${lp.id}')"
                    ${(!can || !hasFees) ? "disabled" : ""}>
                    <i class="fa-solid fa-hand-holding-dollar"></i>
                    ${!can ? noTxReason || "Collect Fees" : hasFees ? "Collect Fees" : "No Fees"}
                </button>
            </div>

            <div class="lp-detail-card">
                <div class="lp-card-title">
                    <i class="fa-solid fa-sliders"></i> Manage
                </div>
                <button
                    class="lp-btn"
                    onclick="boostLiquidity('${lp.id}')"
                    ${!can ? "disabled" : ""}>
                    <i class="fa-solid fa-plus"></i>
                    ${can ? "Boost Liquidity" : noTxReason}
                </button>
                <button
                    class="lp-btn danger"
                    onclick="removeLiquidity('${lp.id}')"
                    ${!can ? "disabled" : ""}>
                    <i class="fa-solid fa-minus"></i>
                    ${can ? "Remove Liquidity" : noTxReason}
                </button>
                <button
                    class="lp-btn"
                    onclick="transferLP('${lp.id}')"
                    ${!can ? "disabled" : ""}>
                    <i class="fa-solid fa-paper-plane"></i>
                    ${can ? "Send NFT" : noTxReason}
                </button>
            </div>

        </div>
    `;
}


// =====================================
// RENDER LP CARDS
// =====================================
function renderLPCards(list) {
    const container = document.getElementById("tab-lp");

    if (!list?.length) {
        container.innerHTML = `
            <div style="text-align:center;color:#888;padding:30px;">
                <i class="fa-solid fa-droplet" style="font-size:32px;margin-bottom:10px;opacity:0.3;"></i>
                <div>No liquidity positions found</div>
            </div>`;
        return;
    }

    const html = list.map(lp => {
        const active    = lp.status === "Active";
        const isFullRange = lp.priceLower < 0.000001 && lp.priceUpper > 1e9;

        // progress dot hanya relevan kalau bukan full range
        const progress = isFullRange ? 50 : Math.max(2, Math.min(98,
            ((lp.currentPrice - lp.priceLower) / (lp.priceUpper - lp.priceLower)) * 100
        ));

        const minLabel = isFullRange ? "0"      : formatPrice(lp.priceLower);
        const maxLabel = isFullRange ? "&#8734;" : formatPrice(lp.priceUpper); // âˆž

        // fees bar â€” tampil hanya kalau ada fees
        const feesHTML = lp.hasFees
            ? `<div class="lp-fees-bar">
                <img src="${lp.logo0}" onerror="this.src='img/default.png'" style="width:14px;height:14px;border-radius:50%;">
                <span style="color:#ffb020;font-weight:600;">${lp.fees0} ${lp.symbol0}</span>
                <span style="color:#888;">+</span>
                <img src="${lp.logo1}" onerror="this.src='img/default.png'" style="width:14px;height:14px;border-radius:50%;">
                <span style="color:#ffb020;font-weight:600;">${lp.fees1} ${lp.symbol1}</span>
               </div>`
            : `<div class="lp-fees-empty">No uncollected fees</div>`;

        return `
            <div class="lp-card" onclick="openLPDetail('${lp.id}')">

                <!-- HEADER -->
                <div class="lp-header">
                    <div class="lp-pair">
                        <div class="lp-pair-logos">
                            <img src="${lp.logo0}" onerror="this.src='img/default.png'" class="lp-icon">
                            <img src="${lp.logo1}" onerror="this.src='img/default.png'" class="lp-icon overlap">
                        </div>
                        <div>
                            <div class="lp-title">${lp.symbol0}/${lp.symbol1}</div>
                            <div class="lp-sub">${lp.fee} &bull; #${lp.id}</div>
                        </div>
                    </div>
                    <div class="lp-status-badge ${active ? 'active' : 'inactive'}">
                        <span class="lp-status-dot"></span>
                        ${active ? 'Active' : 'Inactive'}
                    </div>
                </div>

                <!-- CURRENT PRICE -->
                <div class="lp-current-price">
                    Current: 1 ${lp.symbol0} = ${lp.currentPrice.toFixed(6)} ${lp.symbol1}
                </div>

                <!-- RANGE BAR -->
                <div class="lp-range-track">
                    <div class="lp-range-fill ${active ? 'active' : ''}"
                         style="width:${progress}%"></div>
                    <div class="lp-range-dot-new ${active ? 'active' : ''}"
                         style="left:${progress}%"></div>
                </div>
                <div class="lp-range-labels">
                    <span>${minLabel}</span>
                    <span>${maxLabel}</span>
                </div>

                <!-- AMOUNTS WITH LOGOS -->
                <div class="lp-amounts">
                    <div class="lp-amount-item">
                        <img src="${lp.logo0}" onerror="this.src='img/default.png'" style="width:18px;height:18px;border-radius:50%;">
                        <span><b>${lp.amount0}</b> ${lp.symbol0}</span>
                    </div>
                    <div class="lp-amount-sep">|</div>
                    <div class="lp-amount-item">
                        <img src="${lp.logo1}" onerror="this.src='img/default.png'" style="width:18px;height:18px;border-radius:50%;">
                        <span><b>${lp.amount1}</b> ${lp.symbol1}</span>
                    </div>
                </div>

                <!-- FEES -->
                ${feesHTML}

            </div>
        `;
    }).join("");

    container.innerHTML = html;
}


// =====================================
// RENDER LP TAB
// =====================================
async function renderLP(forceRefresh = false) {
    const container = document.getElementById("tab-lp");
    const wallet    = getSelectedWallet();

    if (!wallet) {
        container.innerHTML = "<div style='text-align:center;color:#888;padding:20px;'>No wallet selected</div>";
        return;
    }

    if (!forceRefresh) {
        const cached = getCachedLP(wallet);
        if (cached?.length) {
            window.currentLPs = cached;
            renderLPCards(cached);
            refreshLPBackground();
            return;
        }
    }

    container.innerHTML = `
        <div style="text-align:center;color:#888;padding:30px;">
            <i class="fa-solid fa-spinner fa-spin" style="font-size:24px;margin-bottom:10px;"></i>
            <div>Loading positions...</div>
        </div>`;

    try {
        const list        = await loadNFTs();
        window.currentLPs = list;
        setCachedLP(wallet, list);
        renderLPCards(list);
    } catch (e) {
        console.error(e);
        container.innerHTML = "<div style='text-align:center;color:#f66;padding:20px;'>Failed to load LP</div>";
    }
}

async function refreshLPBackground() {
    try {
        const wallet = getSelectedWallet();
        if (!wallet) return;
        const fresh       = await loadNFTs();
        window.currentLPs = fresh;
        setCachedLP(wallet, fresh);
    } catch (e) {
        console.warn("LP background refresh fail:", e);
    }
}


// =====================================
// CACHE HELPERS
// =====================================
function getCachedLP(wallet) {
    if (!wallet) return null;
    try {
        const raw    = localStorage.getItem(LP_CACHE_KEY + "_" + wallet.address);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.time > LP_CACHE_TTL) return null;
        return parsed.data;
    } catch { return null; }
}

function setCachedLP(wallet, data) {
    if (!wallet) return;
    localStorage.setItem(LP_CACHE_KEY + "_" + wallet.address, JSON.stringify({ time: Date.now(), data }));
}

function clearCachedLP() {
    const wallet = getSelectedWallet();
    if (!wallet) return;
    localStorage.removeItem(LP_CACHE_KEY + "_" + wallet.address);
}


// =====================================
// MANUAL LP LIST (legacy)
// =====================================
function getLPs() {
    const wallet = getSelectedWallet();
    if (!wallet) return [];
    return JSON.parse(localStorage.getItem(wallet.address + "_lp") || "[]");
}

function setLPs(data) {
    const wallet = getSelectedWallet();
    if (!wallet) return;
    localStorage.setItem(wallet.address + "_lp", JSON.stringify(data));
}

function removeLP(id) {
    setLPs(getLPs().filter(x => x !== id));
    renderLPList?.();
}


// =====================================
// FORMAT HELPERS
// =====================================
function formatPrice(p) {
    if (!p || p < 0.000001) return "0";
    if (p > 1e9)            return "\u221E"; // âˆž
    return p.toFixed(5);
}

function tickToPrice(tick) {
    return Math.pow(1.0001, tick);
}