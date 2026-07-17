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
// =====================================
// COLLECT FEES — Confirm -> Proses -> Sukses
// =====================================
function collectFees(tokenId) {
    const lp = window.currentLPs.find(x => x.id == tokenId);
    if (!lp) return;
    showCollectConfirmModal(lp);
}

function _lpLocale() {
    return window.CURRENT_LANG === "en" ? "en-US" : window.CURRENT_LANG === "ar" ? "ar-SA" : "id-ID";
}

function _lpTimeStr() {
    const now = new Date();
    const locale = _lpLocale();
    return now.toLocaleTimeString(locale, { hour:"2-digit", minute:"2-digit", second:"2-digit" })
         + " · " + now.toLocaleDateString(locale, { day:"2-digit", month:"short", year:"numeric" });
}

function showCollectConfirmModal(lp) {
    let modal = document.getElementById("lpCollectConfirmModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "lpCollectConfirmModal";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="confirm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:20000;
             display:flex;align-items:center;justify-content:center;">
            <div style="background:#151920;border:1px solid #252b38;border-radius:20px;
                        padding:24px 20px;width:90%;max-width:360px;">
                <div style="font-size:17px;font-weight:700;color:#fff;margin-bottom:16px;">${t("lp_collect_confirm_title") || "Confirm Collect Fees"}</div>

                <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:16px;">
                    <div style="text-align:center;">
                        <img src="${lp.logo0}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:10px;color:#aaa;margin-top:3px;">${lp.symbol0}</div>
                    </div>
                    <div style="font-size:18px;color:#9b5cff;">+</div>
                    <div style="text-align:center;">
                        <img src="${lp.logo1}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:10px;color:#aaa;margin-top:3px;">${lp.symbol1}</div>
                    </div>
                </div>

                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #1e2330;">
                    <span style="color:#888;">${lp.symbol0}</span>
                    <b style="color:#00d084;">${lp.fees0}</b>
                </div>
                <div style="display:flex;justify-content:space-between;padding:10px 0;margin-bottom:16px;">
                    <span style="color:#888;">${lp.symbol1}</span>
                    <b style="color:#00d084;">${lp.fees1}</b>
                </div>

                <button id="confirmCollectBtn" style="width:100%;padding:14px;border:none;border-radius:14px;
                        background:linear-gradient(135deg,#9b5cff,#6a3fd4);color:#fff;font-size:15px;
                        font-weight:700;cursor:pointer;margin-bottom:10px;">${t("lp_collect_confirm_btn") || "Collect Fees"}</button>
                <button id="cancelCollectBtn" style="width:100%;padding:12px;border:1px solid #252b38;
                        border-radius:14px;background:transparent;color:#666;font-size:14px;cursor:pointer;">
                        ${t("lp_cancel_btn") || "Cancel"}</button>
            </div>
        </div>`;

    modal.style.cssText = "position:fixed;inset:0;z-index:20000;display:flex;";

    modal.querySelector("#cancelCollectBtn").onclick = () => { modal.style.display = "none"; };
    modal.querySelector("#confirmCollectBtn").onclick = async () => {
        modal.style.display = "none";
        await executeCollectFees(lp);
    };
}

async function executeCollectFees(lp) {
    const tokenId = lp.id;
    try {
        const wallet = getLPSigner(); // throws kalau tidak ada PK / locked

        const MAX = ethers.BigNumber.from("0xffffffffffffffffffffffffffffffff");
        const contract = new ethers.Contract(
            NFT_PM,
            ["function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) payable returns (uint256 amount0,uint256 amount1)"],
            wallet
        );

        showLPLoading(
            t("lp_collect_processing") || "Collecting fees...",
            30,
            { logo: lp.logo0, symbol: lp.symbol0 },
            { logo: lp.logo1, symbol: lp.symbol1 }
        );

        const tx = await contract.collect({
            tokenId,
            recipient:  wallet.address,
            amount0Max: MAX,
            amount1Max: MAX
        });

        updateLPLoading(t("tx_loading") || "Waiting for confirmation...", 70);
        await tx.wait();
        updateLPLoading(t("gen_step4_title") || "Done", 100);
        hideLPLoading();

        clearCachedLP();
        renderLP(true);

        showCollectSuccessModal({ hash: tx.hash, lp });

    } catch (e) {
        hideLPLoading();
        console.error("collectFees error:", e);
        if (e.message === "PK required" || e.message === "PK locked") return;
        showToast?.((t("lp_toast_collect_failed") || "Collect failed: ") + (e.reason || e.message || ""), "error");
    }
}

function showCollectSuccessModal({ hash, lp }) {
    let modal = document.getElementById("lpCollectSuccessModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "lpCollectSuccessModal";
        document.body.appendChild(modal);
    }

    const shortHash = hash ? hash.slice(0, 10) + "..." + hash.slice(-8) : "—";
    const timeStr = _lpTimeStr();

    modal.innerHTML = `
        <div class="confirm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:20000;
             display:flex;align-items:center;justify-content:center;">
            <div style="background:#151920;border:1px solid #252b38;border-radius:20px;
                        padding:28px 20px;width:90%;max-width:360px;text-align:center;">

                <div style="width:56px;height:56px;border-radius:50%;background:rgba(0,204,102,0.15);
                            display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
                    <i class="fa-solid fa-check" style="color:#00cc66;font-size:24px;"></i>
                </div>

                <div style="font-size:17px;font-weight:700;color:#fff;margin-bottom:4px;">${t("lp_collect_success_title") || "Fees Collected"}</div>
                <div style="font-size:12px;color:#888;margin-bottom:18px;">${lp.symbol0} / ${lp.symbol1} Pool</div>

                <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:16px;">
                    <div style="text-align:center;">
                        <img src="${lp.logo0}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:11px;color:#fff;margin-top:4px;">${lp.fees0} ${lp.symbol0}</div>
                    </div>
                    <div style="font-size:18px;color:#9b5cff;">+</div>
                    <div style="text-align:center;">
                        <img src="${lp.logo1}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:11px;color:#fff;margin-top:4px;">${lp.fees1} ${lp.symbol1}</div>
                    </div>
                </div>

                <div style="text-align:left;background:#0e1117;border-radius:12px;padding:14px;margin-bottom:18px;">
                    <div style="display:flex;justify-content:space-between;padding:6px 0;">
                        <span style="color:#888;font-size:12px;">${t("unwrap_tx_hash") || "Tx Hash"}</span>
                        <span style="color:#fff;font-size:12px;">${shortHash}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;">
                        <span style="color:#888;font-size:12px;">${t("unwrap_time") || "Time"}</span>
                        <span style="color:#fff;font-size:12px;">${timeStr}</span>
                    </div>
                </div>

                <button id="lpcsExplorerBtn" style="width:100%;padding:13px;border:1px solid #252b38;border-radius:14px;
                        background:transparent;color:#9b5cff;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px;">
                        ${t("tx_explorer") || "Explorer"}</button>
                <button id="lpcsCloseBtn" style="width:100%;padding:14px;border:none;border-radius:14px;
                        background:linear-gradient(135deg,#9b5cff,#6a3fd4);color:#fff;font-size:15px;
                        font-weight:700;cursor:pointer;">${t("lp_done_btn") || "Done"}</button>
            </div>
        </div>`;

    modal.style.cssText = "position:fixed;inset:0;z-index:20000;display:flex;";

    modal.querySelector("#lpcsCloseBtn").onclick = () => { modal.style.display = "none"; };
    modal.querySelector("#lpcsExplorerBtn").onclick = () => {
        openExplorer?.("https://ledger.sidrachain.com/tx/" + hash);
    };
}


// =====================================
// REMOVE LIQUIDITY + AUTO COLLECT FEES
// =====================================
// =====================================
// REMOVE LIQUIDITY — Confirm -> Proses -> Sukses
// =====================================
function removeLiquidity(tokenId) {
    const lp = window.currentLPs.find(x => x.id == tokenId);
    if (!lp) return;
    showRemoveConfirmModal(lp);
}

function showRemoveConfirmModal(lp) {
    let modal = document.getElementById("lpRemoveConfirmModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "lpRemoveConfirmModal";
        document.body.appendChild(modal);
    }

    const desc = (t("lp_remove_confirm_desc") || "Remove all liquidity from position #{id}?")
        .replace("{id}", lp.id);

    modal.innerHTML = `
        <div class="confirm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:20000;
             display:flex;align-items:center;justify-content:center;">
            <div style="background:#151920;border:1px solid #252b38;border-radius:20px;
                        padding:24px 20px;width:90%;max-width:360px;">
                <div style="font-size:17px;font-weight:700;color:#fff;margin-bottom:10px;">${t("lp_remove_confirm_title") || "Confirm Remove Liquidity"}</div>
                <div style="font-size:13px;color:#aaa;margin-bottom:16px;line-height:1.5;">${desc}</div>

                <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:16px;">
                    <div style="text-align:center;">
                        <img src="${lp.logo0}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:10px;color:#aaa;margin-top:3px;">${lp.symbol0}</div>
                    </div>
                    <div style="font-size:18px;color:#9b5cff;">+</div>
                    <div style="text-align:center;">
                        <img src="${lp.logo1}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:10px;color:#aaa;margin-top:3px;">${lp.symbol1}</div>
                    </div>
                </div>

                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #1e2330;">
                    <span style="color:#888;">${lp.symbol0}</span>
                    <b style="color:#fff;">${lp.amount0}</b>
                </div>
                <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #1e2330;">
                    <span style="color:#888;">${lp.symbol1}</span>
                    <b style="color:#fff;">${lp.amount1}</b>
                </div>
                ${lp.hasFees ? `
                <div style="font-size:11px;color:#f59e0b;margin-top:12px;">
                    <i class="fa-solid fa-circle-info"></i> ${t("lp_remove_confirm_warning") || "Uncollected fees will be collected automatically."}
                </div>` : ""}

                <button id="confirmRemoveBtn" style="width:100%;padding:14px;border:none;border-radius:14px;
                        background:linear-gradient(135deg,#ff4d4f,#c92c2e);color:#fff;font-size:15px;
                        font-weight:700;cursor:pointer;margin-top:16px;margin-bottom:10px;">${t("lp_remove_confirm_btn") || "Remove Liquidity"}</button>
                <button id="cancelRemoveBtn" style="width:100%;padding:12px;border:1px solid #252b38;
                        border-radius:14px;background:transparent;color:#666;font-size:14px;cursor:pointer;">
                        ${t("lp_cancel_btn") || "Cancel"}</button>
            </div>
        </div>`;

    modal.style.cssText = "position:fixed;inset:0;z-index:20000;display:flex;";

    modal.querySelector("#cancelRemoveBtn").onclick = () => { modal.style.display = "none"; };
    modal.querySelector("#confirmRemoveBtn").onclick = async () => {
        modal.style.display = "none";
        await executeRemoveLiquidity(lp);
    };
}

async function executeRemoveLiquidity(lp) {
    const tokenId = lp.id;
    const t0 = { logo: lp.logo0, symbol: lp.symbol0 };
    const t1 = { logo: lp.logo1, symbol: lp.symbol1 };

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

        showLPLoading(t("lp_remove_step_decrease") || "Removing liquidity...", 20, t0, t1);

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

        updateLPLoading(t("lp_remove_step_collect") || "Collecting tokens & fees...", 60);
        const tx2 = await pm.collect({
            tokenId,
            recipient:  wallet.address,
            amount0Max: MAX,
            amount1Max: MAX
        });
        await tx2.wait();

        updateLPLoading(t("lp_remove_step_burn") || "Closing position...", 90);
        let finalHash = tx2.hash;
        try {
            const tx3 = await pm.burn(tokenId);
            await tx3.wait();
            finalHash = tx3.hash;
        } catch {
            // burn bisa gagal kalau ada sisa dust — tidak critical
        }

        updateLPLoading(t("gen_step4_title") || "Done", 100);
        hideLPLoading();

        clearCachedLP();
        renderLP(true);

        showRemoveSuccessModal({ hash: finalHash, lp });

    } catch (e) {
        hideLPLoading();
        console.error("removeLiquidity error:", e);
        if (e.message === "PK required" || e.message === "PK locked") return;
        showToast?.((t("lp_toast_remove_failed") || "Remove failed: ") + (e.reason || e.message || ""), "error");
    }
}

function showRemoveSuccessModal({ hash, lp }) {
    let modal = document.getElementById("lpRemoveSuccessModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "lpRemoveSuccessModal";
        document.body.appendChild(modal);
    }

    const shortHash = hash ? hash.slice(0, 10) + "..." + hash.slice(-8) : "—";
    const timeStr = _lpTimeStr();

    modal.innerHTML = `
        <div class="confirm-backdrop" style="position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:20000;
             display:flex;align-items:center;justify-content:center;">
            <div style="background:#151920;border:1px solid #252b38;border-radius:20px;
                        padding:28px 20px;width:90%;max-width:360px;text-align:center;">

                <div style="width:56px;height:56px;border-radius:50%;background:rgba(0,204,102,0.15);
                            display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
                    <i class="fa-solid fa-check" style="color:#00cc66;font-size:24px;"></i>
                </div>

                <div style="font-size:17px;font-weight:700;color:#fff;margin-bottom:4px;">${t("lp_remove_success_title") || "Liquidity Removed"}</div>
                <div style="font-size:12px;color:#888;margin-bottom:18px;">LP NFT #${lp.id} ${t("tx_status_closed") || "Closed"}</div>

                <div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:16px;">
                    <div style="text-align:center;">
                        <img src="${lp.logo0}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:11px;color:#fff;margin-top:4px;">${lp.amount0} ${lp.symbol0}</div>
                    </div>
                    <div style="font-size:18px;color:#9b5cff;">+</div>
                    <div style="text-align:center;">
                        <img src="${lp.logo1}" onerror="this.src='img/default.png'"
                             style="width:38px;height:38px;border-radius:50%;object-fit:contain;border:2px solid rgba(255,255,255,.1);">
                        <div style="font-size:11px;color:#fff;margin-top:4px;">${lp.amount1} ${lp.symbol1}</div>
                    </div>
                </div>

                <div style="text-align:left;background:#0e1117;border-radius:12px;padding:14px;margin-bottom:18px;">
                    <div style="display:flex;justify-content:space-between;padding:6px 0;">
                        <span style="color:#888;font-size:12px;">${t("unwrap_tx_hash") || "Tx Hash"}</span>
                        <span style="color:#fff;font-size:12px;">${shortHash}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;padding:6px 0;">
                        <span style="color:#888;font-size:12px;">${t("unwrap_time") || "Time"}</span>
                        <span style="color:#fff;font-size:12px;">${timeStr}</span>
                    </div>
                </div>

                <button id="lprsExplorerBtn" style="width:100%;padding:13px;border:1px solid #252b38;border-radius:14px;
                        background:transparent;color:#9b5cff;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:10px;">
                        ${t("tx_explorer") || "Explorer"}</button>
                <button id="lprsCloseBtn" style="width:100%;padding:14px;border:none;border-radius:14px;
                        background:linear-gradient(135deg,#9b5cff,#6a3fd4);color:#fff;font-size:15px;
                        font-weight:700;cursor:pointer;">${t("lp_done_btn") || "Done"}</button>
            </div>
        </div>`;

    modal.style.cssText = "position:fixed;inset:0;z-index:20000;display:flex;";

    modal.querySelector("#lprsCloseBtn").onclick = () => { modal.style.display = "none"; };
    modal.querySelector("#lprsExplorerBtn").onclick = () => {
        openExplorer?.("https://ledger.sidrachain.com/tx/" + hash);
    };
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

            showToast?.(t("lp_toast_boosted") || "Liquidity boosted!", "success");
            clearCachedLP();
            renderLP(true);

        } catch (e) {
            console.error("boostLiquidity error:", e);
            if (e.message === "PK required" || e.message === "PK locked") return;
            showToast?.((t("lp_toast_boost_failed") || "Boost failed: ") + (e.reason || e.message || ""), "error");
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

                showToast?.(t("lp_toast_sending_nft") || "Sending NFT...", "info");
                const tx = await contract.safeTransferFrom(wallet.address, to, tokenId);
                await tx.wait();

                showToast?.(t("lp_toast_nft_sent") || "LP NFT sent!", "success");
                clearCachedLP();
                renderLP(true);

            } catch (e) {
                console.error("transferLP error:", e);
                if (e.message === "PK required" || e.message === "PK locked") return;
                showToast?.((t("lp_toast_transfer_failed") || "Transfer failed: ") + (e.reason || e.message || ""), "error");
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
        ? (t("lp_no_tx_import_pk") || "Import PK for transaction")
        : !isOwner
            ? (t("lp_no_tx_not_owner") || "Not the owner wallet")
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
                    ${!can ? noTxReason || (t("lp_btn_collect_fees") || "Collect Fees") : hasFees ? (t("lp_btn_collect_fees") || "Collect Fees") : (t("lp_btn_no_fees") || "No Fees")}
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
                    ${can ? (t("lp_btn_boost") || "Boost Liquidity") : noTxReason}
                </button>
                <button
                    class="lp-btn danger"
                    onclick="removeLiquidity('${lp.id}')"
                    ${!can ? "disabled" : ""}>
                    <i class="fa-solid fa-minus"></i>
                    ${can ? (t("lp_btn_remove") || "Remove Liquidity") : noTxReason}
                </button>
                <button
                    class="lp-btn"
                    onclick="transferLP('${lp.id}')"
                    ${!can ? "disabled" : ""}>
                    <i class="fa-solid fa-paper-plane"></i>
                    ${can ? (t("lp_btn_send_nft") || "Send NFT") : noTxReason}
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