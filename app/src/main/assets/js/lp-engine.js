// =====================================
// LP ENGINE â€” Uniswap V3 NFT Positions
// =====================================

const PM_ADDRESS = "0x8b9bCc8C722778f30146e20e44E8d8e28adD8df8";

const PM_ABI = [
    "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns (uint256,uint128,uint256,uint256)",
    "function increaseLiquidity((uint256 tokenId,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) payable returns (uint128,uint256,uint256)",
    "function decreaseLiquidity((uint256 tokenId,uint128 liquidity,uint256 amount0Min,uint256 amount1Min,uint256 deadline)) payable returns (uint256,uint256)",
    "function collect((uint256 tokenId,address recipient,uint128 amount0Max,uint128 amount1Max)) payable returns (uint256,uint256)",
    "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
    "function balanceOf(address owner) view returns (uint256)",
    "function tokenOfOwnerByIndex(address owner,uint256 index) view returns (uint256)",
    "function refundETH() payable"
];

const LP_ERC20_ABI = [
    "function approve(address spender,uint256 amount) returns (bool)",
    "function allowance(address owner,address spender) view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

const TICK_SPACING = { 500: 10, 3000: 60, 10000: 200 };


// =====================================
// SIGNER â€” pakai requirePK() dari wallet-core
// =====================================
function getSigner() {
    // requirePK() throw kalau belum import atau locked
    const wallet = requirePK();
    return wallet.connect(window.provider);
}

function getPM() {
    return new ethers.Contract(PM_ADDRESS, PM_ABI, getSigner());
}

function getTokenContract(token) {
    return new ethers.Contract(token, LP_ERC20_ABI, getSigner());
}


// =====================================
// APPROVE (skip kalau native)
// =====================================
async function approveToken(token, amount) {
    if (!token || token === "native" || token === window.CONFIG.WSDA) return;

    const signer    = getSigner();
    const owner     = await signer.getAddress();
    const erc20     = getTokenContract(token);
    const allowance = await erc20.allowance(owner, PM_ADDRESS);

    if (allowance.gte(amount)) return;

    const tx = await erc20.approve(PM_ADDRESS, ethers.constants.MaxUint256);
    await tx.wait();
}


// =====================================
// NORMALIZE TICK
// =====================================
function normalizeTick(tick, fee) {
    const spacing = TICK_SPACING[fee] || 60;
    return Math.floor(tick / spacing) * spacing;
}


// =====================================
// ADD LIQUIDITY (NFT MINT)
//
// ATURAN POOL V3:
// - token0 < token1 (sort by address)
// - kalau salah satu adalah SDA native,
//   kirim sebagai msg.value (WSDA address dipakai
//   sebagai token0/token1 di params)
// =====================================
async function addLP({ token0, token1, fee = window.CONFIG.FEE, tickLower, tickUpper, amount0, amount1 }) {

    try {
        const signer   = getSigner();
        const addr     = await signer.getAddress();
        const deadline = Math.floor(Date.now() / 1000) + 600;

        // ==========================
        // RESOLVE WSDA untuk native
        // ==========================
        const isToken0Native = (token0 === "native");
        const isToken1Native = (token1 === "native");

        const resolved0 = isToken0Native ? window.CONFIG.WSDA : token0;
        const resolved1 = isToken1Native ? window.CONFIG.WSDA : token1;

        // ==========================
        // SORT BY ADDRESS (V3 requirement)
        // amount ikut ter-swap kalau urutan berubah
        // ==========================
        let finalToken0 = resolved0;
        let finalToken1 = resolved1;
        let finalAmount0 = amount0;
        let finalAmount1 = amount1;
        let isSwapped    = false;

        if (resolved0.toLowerCase() > resolved1.toLowerCase()) {
            finalToken0  = resolved1;
            finalToken1  = resolved0;
            finalAmount0 = amount1;
            finalAmount1 = amount0;
            isSwapped    = true;
        }

        // ==========================
        // NORMALIZE TICKS
        // ==========================
        tickLower = normalizeTick(tickLower, fee);
        tickUpper = normalizeTick(tickUpper, fee);

        if (tickLower >= tickUpper)      throw new Error("tickLower harus < tickUpper");
        if (tickLower < -887220)         throw new Error("tickLower out of range");
        if (tickUpper >  887220)         throw new Error("tickUpper out of range");

        // ==========================
        // APPROVALS
        // Native SDA tidak perlu approve â€” dikirim sebagai msg.value
        // ==========================
        const nativeIsToken0 = isSwapped ? isToken1Native : isToken0Native;
        const nativeIsToken1 = isSwapped ? isToken0Native : isToken1Native;

        if (!nativeIsToken0) await approveToken(finalToken0, finalAmount0);
        if (!nativeIsToken1) await approveToken(finalToken1, finalAmount1);

        // ==========================
        // MSG.VALUE = amount native
        // ==========================
        const nativeValue = nativeIsToken0
            ? finalAmount0
            : nativeIsToken1
                ? finalAmount1
                : ethers.constants.Zero;

        const pm = getPM();

        console.log("=== LP MINT ===");
        console.log("token0:", finalToken0);
        console.log("token1:", finalToken1);
        console.log("fee:", fee);
        console.log("tickLower:", tickLower, "tickUpper:", tickUpper);
        console.log("amount0:", finalAmount0.toString());
        console.log("amount1:", finalAmount1.toString());
        console.log("nativeValue:", nativeValue.toString());
        console.log("recipient:", addr);
        console.log("===============");

        const tx = await pm.mint(
            {
                token0:          finalToken0,
                token1:          finalToken1,
                fee,
                tickLower,
                tickUpper,
                amount0Desired:  finalAmount0,
                amount1Desired:  finalAmount1,
                amount0Min:      0,
                amount1Min:      0,
                recipient:       addr,
                deadline
            },
            {
                value:    nativeValue,
                gasLimit: 1500000
            }
        );

        const receipt = await tx.wait();

        // ==========================
        // PARSE TOKEN ID
        // Cara 1: decoded events
        // Cara 2: raw log topics
        // Cara 3: fallback tetap sukses
        // ==========================
        let tokenId = null;

        // Cara 1
        const transferEvent = receipt.events?.find(e => e.event === "Transfer");
        if (transferEvent?.args?.tokenId) {
            tokenId = transferEvent.args.tokenId.toString();
        }

        // Cara 2 â€” raw Transfer log
        if (!tokenId) {
            const TRANSFER_TOPIC =
                "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
            const rawLog = receipt.logs?.find(
                l => l.topics?.[0] === TRANSFER_TOPIC
            );
            if (rawLog?.topics?.[3]) {
                tokenId = ethers.BigNumber.from(rawLog.topics[3]).toString();
            }
        }

        console.log(
            "LP SUCCESS â€” Token ID:",
            tokenId || "(tidak terdeteksi, TX tetap sukses)"
        );

        return { success: true, hash: tx.hash, tokenId, receipt };

    } catch (e) {
        console.error("addLP error:", e);
        throw e;
    }
}


// =====================================
// INCREASE LP
// =====================================
async function increaseLP({ tokenId, amount0, amount1 }) {
    try {
        const pm       = getPM();
        const deadline = Math.floor(Date.now() / 1000) + 600;

        const tx = await pm.increaseLiquidity({
            tokenId,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min:     0,
            amount1Min:     0,
            deadline
        });

        return await tx.wait();
    } catch (e) {
        console.error("increaseLP error:", e);
        throw e;
    }
}


// =====================================
// DECREASE LP
// =====================================
async function decreaseLP({ tokenId, liquidity }) {
    try {
        const pm       = getPM();
        const deadline = Math.floor(Date.now() / 1000) + 600;

        const tx = await pm.decreaseLiquidity({
            tokenId,
            liquidity,
            amount0Min: 0,
            amount1Min: 0,
            deadline
        });

        return await tx.wait();
    } catch (e) {
        console.error("decreaseLP error:", e);
        throw e;
    }
}


// =====================================
// COLLECT FEES
// =====================================
async function collectLP(tokenId) {
    try {
        const pm     = getPM();
        const signer = getSigner();
        const addr   = await signer.getAddress();

        const tx = await pm.collect({
            tokenId,
            recipient:   addr,
            amount0Max:  ethers.constants.MaxUint128,
            amount1Max:  ethers.constants.MaxUint128
        });

        return await tx.wait();
    } catch (e) {
        console.error("collectLP error:", e);
        throw e;
    }
}


// =====================================
// GET POSITION
// =====================================
async function getLP(tokenId) {
    const pm = getPM();
    const p  = await pm.positions(tokenId);

    return {
        token0:    p[2],
        token1:    p[3],
        fee:       p[4],
        tickLower: p[5],
        tickUpper: p[6],
        liquidity: p[7].toString(),
        owed0:     p[10].toString(),
        owed1:     p[11].toString()
    };
}


// =====================================
// EXPORT
// =====================================
window.LP_ENGINE = { addLP, increaseLP, decreaseLP, collectLP, getLP };
