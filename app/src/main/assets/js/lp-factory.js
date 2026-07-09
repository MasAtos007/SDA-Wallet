// =====================================
// LP FACTORY â€” Pool existence & price check
// =====================================

window.LP_FACTORY = {

    // =====================================
    // GET POOL ADDRESS
    // =====================================
    async getPool(token0, token1, fee) {
        try {
            if (!ethers.utils.isAddress(token0) || !ethers.utils.isAddress(token1)) {
                console.warn("Invalid token address:", token0, token1);
                return null;
            }

            if (!window.CONFIG?.FACTORY || !window.provider) {
                console.error("Factory or provider missing");
                return null;
            }

            const factory = new ethers.Contract(
                window.CONFIG.FACTORY,
                ["function getPool(address,address,uint24) view returns (address)"],
                window.provider
            );

            const pool = await factory.getPool(token0, token1, fee);

            if (!pool || pool === ethers.constants.AddressZero) return null;
            return pool;

        } catch (e) {
            console.error("getPool error:", e);
            return null;
        }
    },


    // =====================================
    // POOL EXISTS CHECK
    // =====================================
    async isPoolExist(token0, token1, fee) {
        const pool = await this.getPool(token0, token1, fee);
        return pool !== null;
    },


    // =====================================
    // GET CURRENT PRICE FROM POOL SLOT0
    // Returns: number | "NOT_INITIALIZED" | null
    // =====================================
    async getCurrentPrice(token0, token1, fee) {
        try {
            const poolAddr = await this.getPool(token0, token1, fee);
            if (!poolAddr) return null;

            const pool = new ethers.Contract(
                poolAddr,
                ["function slot0() view returns (uint160 sqrtPriceX96,int24,int24,uint16,uint16,uint16,uint8,bool)"],
                window.provider
            );

            let slot0;
            try {
                slot0 = await pool.slot0();
            } catch {
                return "NOT_INITIALIZED";
            }

            const sqrtPriceX96 = slot0?.[0];
            if (!sqrtPriceX96) return "NOT_INITIALIZED";

            const Q96         = ethers.BigNumber.from(2).pow(96);
            const numerator   = sqrtPriceX96.mul(sqrtPriceX96);
            const denominator = Q96.mul(Q96);
            const priceBN     = numerator.div(denominator);
            const price       = parseFloat(ethers.utils.formatUnits(priceBN, 0));

            if (!isFinite(price) || price <= 0) return "NOT_INITIALIZED";
            return price;

        } catch (e) {
            console.error("getCurrentPrice error:", e);
            return null;
        }
    },


    // =====================================
    // AUTO RANGE (current price +/- percent)
    // =====================================
    async getAutoRange(token0, token1, fee, percent = 5) {
        const price = await this.getCurrentPrice(token0, token1, fee);

        if (price === null || price === "NOT_INITIALIZED") return null;

        return {
            current: price,
            min:     price * (1 - percent / 100),
            max:     price * (1 + percent / 100)
        };
    }
};