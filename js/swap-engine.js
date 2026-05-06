// ==========================
// SWAP ENGINE FINAL (SIDRA FIXED)
// ==========================

window.SWAP_ENGINE = (function () {

    const ROUTER_ADDR = window.CONFIG?.ROUTER;
    const WSDA_ADDR   = window.CONFIG?.WSDA;
    
    const ROUTE_HUBS = [
    window.CONFIG?.WSDA,
    "0xb8d7fb85c4BF32f418715Dcb9eBF88107eE73CB7", // IFC
    "0xEEd87C64D1650A824F8589adcB76a13A692E2EA8"  // SGHC
];

async function simulateRoute(tokenIn, tokenOut, amount){

    let bestOut = 0;
    let bestRoute = null;

    // direct
    const direct = [tokenIn, tokenOut];

    // via hubs
    const routes = [
        direct,
        [tokenIn, ROUTE_HUBS[0], tokenOut],
        [tokenIn, ROUTE_HUBS[1], tokenOut],
        [tokenIn, ROUTE_HUBS[2], tokenOut]
    ];

    for(const route of routes){

        let out = amount;

        for(let i=0;i<route.length-1;i++){

            out = await PRICE_ENGINE.getAmountOut(
                route[i],
                route[i+1],
                out
            );
        }

        if(out > bestOut){
            bestOut = out;
            bestRoute = route;
        }
    }

    return {
        route: bestRoute,
        output: bestOut
    };
}

    let isLoading = false;

    // ==========================
// ABI
// ==========================
const ROUTER_ABI = [
    "function multicall(bytes[] data) payable returns (bytes[] results)",

    "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)",

    "function unwrapWETH9(uint256 amountMinimum, address recipient)"
];

const ERC20_ABI = [
    "function approve(address spender,uint256 amount) returns (bool)",
    "function allowance(address owner,address spender) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

const WSDA_ABI = [
    "function deposit() payable",
    "function withdraw(uint256)"
];

// ==========================
// HELPERS
// ==========================
function isNative(token){
    return !token || token === "native";
}

function toWSDA(token){
    if (!token || token === "native") return WSDA_ADDR;
    return token;
}

function getWallet(){
    return getPKWallet?.() || getSelectedWallet?.() || window.wallet || null;
}

// ==========================
// ENCODER (GLOBAL HELPER)
// ==========================
function encodeSwap(router, params) {
    return router.interface.encodeFunctionData(
        "exactInputSingle",
        [params]
    );
}

function encodeUnwrap(router, recipient) {
    return router.interface.encodeFunctionData(
        "unwrapWETH9",
        [0, recipient]
    );
}

function log(msg){
    console.log("[SWAP]", msg);
    const el = document.getElementById("swapRate");
    if(el) el.innerText = msg;
}

function setLoading(state){
    const btn = document.getElementById("btnReviewSwap");
    if(!btn) return;

    btn.disabled = state;
    btn.innerHTML = state ? `Swapping...` : `Review Swap`;
}

function showSwapLoading(text="Preparing Swap...", percent=20){
    const overlay = document.getElementById("swapLoadingOverlay");
    const fill = document.getElementById("swapProgressFill");
    const txt = document.getElementById("swapLoadingText");

    if(overlay) overlay.style.display = "flex";
    if(fill) fill.style.width = percent + "%";
    if(txt) txt.innerText = text;
}

function hideSwapLoading(){
    const overlay = document.getElementById("swapLoadingOverlay");
    if(overlay) overlay.style.display = "none";
}

async function openSwapConfirm(){

    try{

        const wallet = getWallet();
        if(!wallet) throw new Error("Wallet not found");

        const tokenIn  = swapState.payToken;
        const tokenOut = swapState.receiveToken;

        const amountUI = document.getElementById("payAmount")?.value;

        if(!amountUI || Number(amountUI) <= 0){
            throw new Error("Invalid amount");
        }

        const estimated = await PRICE_ENGINE.getAmountOut(
            tokenIn,
            tokenOut,
            Number(amountUI)
        );

        const realistic = getRealisticOut(
            Number(amountUI),
            estimated
        );

        const inData  = getTokenData(tokenIn);
        const outData = getTokenData(tokenOut);

        window.swapConfirmState = {
            tokenIn,
            tokenOut,
            amountUI,
            estimated: realistic,
            wallet: wallet.address
        };

        showSwapConfirmModal(
            inData,
            outData,
            amountUI,
            realistic
        );

    }catch(e){
        console.error(e);
        showToast?.(
            e.message || "Preview failed",
            "error"
        );
    }
}

function showSwapConfirmModal(inToken, outToken, amountIn, amountOut){

    let modal = document.getElementById("swapConfirmModal");

    if(!modal){
        modal = document.createElement("div");
        modal.id = "swapConfirmModal";
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="swap-confirm-bg"></div>
        <div class="swap-confirm-box">
            <h3>Confirm Swap</h3>

            <div class="row">
                <span>From</span>
                <b>${amountIn} ${inToken.symbol}</b>
            </div>

            <div class="row">
                <span>To</span>
                <b>${Number(amountOut).toFixed(6)} ${outToken.symbol}</b>
            </div>

            <button id="confirmSwapBtn">Confirm Swap</button>
            <button id="cancelSwapBtn">Cancel</button>
        </div>
    `;

    modal.style.display = "flex";

    const cancelBtn  = modal.querySelector("#cancelSwapBtn");
    const confirmBtn = modal.querySelector("#confirmSwapBtn");

    if(cancelBtn){
        cancelBtn.onclick = () => {
            modal.style.display = "none";
            window.swapConfirmState = null;
        };
    }

    if(confirmBtn){
        confirmBtn.onclick = async () => {
            modal.style.display = "none";
            await SWAP_ENGINE.swapExactInput();
            window.swapConfirmState = null;
        };
    }
}


// ==========================
// DECIMALS
// ==========================
async function getDecimals(token){
    const addr = toWSDA(token);

    try{
        const c = new ethers.Contract(addr, ERC20_ABI, provider);
        return await c.decimals();
    }catch{
        return 18;
    }
}

async function parseAmount(token, amount){
    const dec = await getDecimals(token);
    return ethers.utils.parseUnits(amount.toString(), dec);
}

// ==========================
// APPROVE
// ==========================
async function approveIfNeeded(token, amount, wallet){

    if(isNative(token)) return;

    const contract = new ethers.Contract(token, ERC20_ABI, wallet);

    const allowance = await contract.allowance(wallet.address, ROUTER_ADDR);

    if(allowance.gte(amount)) return;

    log("Approving token...");
    showSwapLoading("Approving Token...", 30);

    const tx = await contract.approve(
        ROUTER_ADDR,
        ethers.constants.MaxUint256
    );

    showSwapLoading("Waiting Approval Confirmation...", 45);

    await tx.wait();
}

// ==========================
// SLIPPAGE (ANTI FAIL)
// ==========================
function getSlippage(){
    const cfg = Number(window.CONFIG?.SLIPPAGE_DEFAULT);
    if (!cfg || cfg <= 0) return 2;
    return Math.min(Math.max(cfg, 1), 10);
}

// ==========================
// BUILD PARAMS
// ==========================
async function buildParams(wallet, tokenIn, tokenOut, amountUI){

    const amountNum = parseFloat(amountUI);

    if(!amountNum || amountNum <= 0){
        throw new Error("Invalid amount");
    }

    const amountIn = await parseAmount(tokenIn, amountNum);

    const estimated = await PRICE_ENGINE.getAmountOut(
        tokenIn,
        tokenOut,
        amountNum
    );

    if(!estimated || estimated <= 0){
        throw new Error("No liquidity pool");
    }

    let impactFactor;

    if(amountNum < 0.00001){
        impactFactor = 0.98;
    }else if(amountNum < 0.001){
        impactFactor = 0.95;
    }else if(amountNum < 0.01){
        impactFactor = 0.9;
    }else if(amountNum < 0.1){
        impactFactor = 0.85;
    }else{
        impactFactor = 0.8;
    }

    const slippage = getSlippage() / 100;

    let minOut = estimated * impactFactor * (1 - slippage);

    if(!isFinite(minOut) || minOut <= 0){
        throw new Error("Invalid output calculation");
    }

    if(minOut < 0.0000000001){
        minOut = estimated * 0.5;
    }

    const amountOutMinimum = await parseAmount(
        tokenOut,
        minOut.toFixed(8)
    );

    return {
        tokenIn: toWSDA(tokenIn),
        tokenOut: isNative(tokenOut) ? WSDA_ADDR : tokenOut,
        fee: window.CONFIG?.FEE || 3000,
        recipient: isNative(tokenOut) ? ROUTER_ADDR : wallet.address,
        deadline: Math.floor(Date.now()/1000) + 300,
        amountIn,
        amountOutMinimum,
        sqrtPriceLimitX96: 0
    };
}

// ==========================
// LOGO PATH HELPER
// Normalise semua sumber logo jadi path
// yang valid: "img/xxx.png"
// ==========================
function resolveLogoPath(tokenData, isNativeToken) {

    if (isNativeToken) return "img/sda.png";

    if (!tokenData) return "img/default.png";

    // Cek field logo / icon satu per satu
    const raw = tokenData.logo || tokenData.icon || "";

    if (!raw) return "img/default.png";

    // Sudah ada prefix "img/" â€” pakai langsung
    if (raw.startsWith("img/"))  return raw;

    // Hanya nama file (misal "ifc.png") â€” tambah prefix
    if (!raw.includes("/"))      return "img/" + raw;

    // URL absolut atau path lain â€” pakai apa adanya
    return raw;
}


async function executeSwap(tokenIn, tokenOut, amountUI) {

    const prevPay  = window.swapState.payToken;
    const prevRecv = window.swapState.receiveToken;

    try {

        window.swapState.payToken     = tokenIn;
        window.swapState.receiveToken = tokenOut;

        const payInput = document.getElementById("payAmount");
        if (payInput) {
            payInput.value = Number(amountUI).toFixed(6);
        }

        window.swapConfirmState = {
            tokenIn,
            tokenOut,
            amountUI: Number(amountUI).toFixed(6)
        };

        return await swapExactInput();

    } finally {

        window.swapState.payToken     = prevPay;
        window.swapState.receiveToken = prevRecv;
    }
}

// ==========================
// MAIN SWAP
// ==========================
async function swapExactInput(){

    if(isLoading) return;

    try{

        if(!window.swapConfirmState){
            throw new Error("Please confirm swap first");
        }

        const wallet = getWallet();
        if(!wallet) throw new Error("Wallet not found");

        const tokenIn  = swapState.payToken;
        const tokenOut = swapState.receiveToken;

        const amountUI = document.getElementById("payAmount")?.value;

        if(!amountUI || Number(amountUI) <= 0){
            throw new Error("Invalid amount");
        }

        if(
            window.swapConfirmState.amountUI !== amountUI ||
            window.swapConfirmState.tokenIn !== tokenIn ||
            window.swapConfirmState.tokenOut !== tokenOut
        ){
            throw new Error("Swap data changed. Please reconfirm.");
        }

        isLoading = true;
        setLoading(true);
        showSwapLoading("Preparing Swap...", 15);

        const isNativeIn  = isNative(tokenIn);
        const isNativeOut = isNative(tokenOut);

        const router = new ethers.Contract(
            ROUTER_ADDR,
            ROUTER_ABI,
            wallet
        );

        const params = await buildParams(
            wallet,
            tokenIn,
            tokenOut,
            amountUI
        );

        const ENABLE_ROUTE_SIM = false;

        if (ENABLE_ROUTE_SIM) {
            const bestRoute = await simulateRoute(tokenIn, tokenOut, Number(amountUI));
            console.log("BEST ROUTE:", bestRoute);
            window.lastBestRoute = bestRoute;
        }

        log("Executing swap...");

        const calls = [];

        if (!isNativeIn) {
            await approveIfNeeded(params.tokenIn, params.amountIn, wallet);
        }

        calls.push(encodeSwap(router, params));

        if (isNativeOut) {
            calls.push(encodeUnwrap(router, wallet.address));
        }

        showSwapLoading("Broadcasting Transaction...", 60);

        const tx = await router.multicall(calls, {
            value: isNative(tokenIn) ? params.amountIn : 0,
            gasLimit: 1200000
        });

        log("TX: " + tx.hash);
        showSwapLoading("Waiting Confirmation...", 80);

        const receipt = await tx.wait();

        if (receipt.status !== 1) {
            throw new Error("Swap failed");
        }

        // ==========================
        // SAVE HISTORY
        // FIX: resolveLogoPath() untuk semua logo
        // ==========================
        try {
            const history = JSON.parse(localStorage.getItem("txHistory") || "[]");

            const amountIn  = Number(amountUI) || 0;
            const receiveEl = document.getElementById("receiveAmount");
            const amountOut = Number(receiveEl?.value || 0) || amountIn;

            const inSymbol  = isNativeIn
                ? "SDA"
                : (getTokenData(tokenIn)?.symbol  || "TOKEN");

            const inData  = isNativeIn  ? null : getTokenData(tokenIn);
            const outData = isNativeOut ? null : getTokenData(tokenOut);

            const outSymbol = isNativeOut
                ? "SDA"
                : (outData?.symbol || "UNKNOWN");

            // FIX UTAMA: pakai resolveLogoPath â€” tidak ada lagi double "img/"
            const inLogo  = resolveLogoPath(inData,  isNativeIn);
            const outLogo = resolveLogoPath(outData, isNativeOut);

            history.unshift({
                hash:         tx.hash,
                from:         wallet.address,
                to:           wallet.address,
                value:        amountOut,
                symbol:       outSymbol,
                logo:         outLogo,
                tokenAddress: tokenOut,
                type:         "SWAP",
                amountIn,
                amountOut,
                inSymbol,
                outSymbol,
                inLogo,
                outLogo,
                timestamp:    Date.now(),
                status:       "success",
                read:         false
            });

            if (history.length > 50) history.pop();

            localStorage.setItem("txHistory", JSON.stringify(history));

        } catch (e) {
            console.warn("history save error", e);
        }

        renderTxHistory?.();
        updateBellBadge?.();

        log("Swap success");
        showSwapLoading("Finalizing Swap...", 95);
        showToast?.("Swap success", "success");
        loadBalance?.();

        return receipt;

    } catch(e){
        console.error(e);
        log("Swap failed");
        showToast?.(e.message || "Swap failed", "error");

    } finally {
        setTimeout(() => hideSwapLoading(), 500);
        isLoading = false;
        setLoading(false);
    }
}

// ==========================
// INIT
// ==========================
function init(){
    document.getElementById("btnReviewSwap")
        ?.addEventListener("click", () => {
            SWAP_ENGINE.openSwapConfirm();
        });
}

document.addEventListener("DOMContentLoaded", init);

return {
    swapExactInput,
    openSwapConfirm,
    executeSwap
};

})();