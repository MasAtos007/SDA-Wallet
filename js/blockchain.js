// ===============================
// SDA Wallet Checker
// ===============================

// ===============================
// PI NETWORK HORIZON
// ===============================

const PI_HORIZON = "https://api.mainnet.minepi.com";

// RPC SIDRA
const SIDRA_RPC = "https://node.sidrachain.com";


// ===============================
// FORMAT HASH
// ===============================

function truncateHash(hash){

if(!hash) return "-";

return hash.slice(0,10)+"..."+hash.slice(-6);

}


// ===============================
// FORMAT DATE
// ===============================

function formatDate(ts){

return new Date(ts*1000).toLocaleString(
"id-ID",
{
day:"2-digit",
month:"short",
year:"numeric",
hour:"2-digit",
minute:"2-digit",
second:"2-digit"
}
);

}


// ===============================
// GENERATE ORDER ID
// ===============================

function generateOrderID(hash){

return "BW-"+hash.slice(2,8).toUpperCase();

}


// ===============================
// RPC CALL
// ===============================

async function rpcCall(method,params=[]){

const res = await fetch(SIDRA_RPC,{
method:"POST",
headers:{
"Content-Type":"application/json"
},
body:JSON.stringify({
jsonrpc:"2.0",
method:method,
params:params,
id:1
})
});

const data = await res.json();

return data.result;

}

// ===============================
// VERIFY PI TRANSACTION
// ===============================

async function verifyPiTx(txHash){

if(!window.CONFIG_READY){
throw "Config belum siap";
}

// wallet exchanger
const exchangerWallet =
window.APP_CONFIG?.WALLETS?.PI;

if(!exchangerWallet){
throw "Wallet PI exchanger belum diset";
}

// ambil data transaksi
const res = await fetch(
PI_HORIZON + "/transactions/" + txHash
);

if(!res.ok){
throw "Hash tidak ditemukan";
}

const tx = await res.json();

// ambil operation
const opRes = await fetch(
PI_HORIZON + "/transactions/" + txHash + "/operations"
);

const opData = await opRes.json();

const payment =
opData._embedded.records.find(o => o.type === "payment");

if(!payment){
throw "Bukan transaksi payment";
}

// cek tujuan
if(payment.to !== exchangerWallet){
throw "Bukan ke wallet exchanger";
}

return {
hash : tx.hash,
from : payment.from,
to : payment.to,
value : parseFloat(payment.amount),
timestamp : Math.floor(new Date(tx.created_at).getTime()/1000)
};

}
// ===============================
// VERIFY TRANSACTION FULL
// ===============================

async function verifyTxFull(txHash){

if(!window.CONFIG_READY){

throw "Config belum siap";

}


// ===============================
// GET WALLET EXCHANGER
// ===============================

const exchangerWallet =
window.APP_CONFIG?.WALLETS?.SIDRA;

if(!exchangerWallet){

throw "Wallet exchanger belum diset di prices.json";

}


// ===============================
// GET TX DATA
// ===============================

const tx =
await rpcCall(
"eth_getTransactionByHash",
[txHash]
);

if(!tx){

throw "Transaksi tidak ditemukan";

}


// ===============================
// CEK TUJUAN
// ===============================

if(
tx.to.toLowerCase() !==
exchangerWallet.toLowerCase()
){

throw "Transaksi bukan ke wallet exchanger";

}


// ===============================
// RECEIPT
// ===============================

const receipt =
await rpcCall(
"eth_getTransactionReceipt",
[txHash]
);

if(!receipt){

throw "Transaksi belum dikonfirmasi";

}

if(receipt.status !== "0x1"){

throw "Transaksi gagal";

}


// ===============================
// LATEST BLOCK
// ===============================

const latestBlockHex =
await rpcCall("eth_blockNumber");

const latestBlock =
parseInt(latestBlockHex,16);

// ===============================
// GET BLOCK DATA (UNTUK TIMESTAMP)
// ===============================

const block = await rpcCall(
"eth_getBlockByNumber",
[tx.blockNumber, false]
);

const blockTimestamp =
parseInt(block.timestamp,16);


// ===============================
// VALUE TOKEN
// ===============================

const value =
parseInt(tx.value,16) / 1e18;


// ===============================
// GAS
// ===============================

const gasLimit =
parseInt(tx.gas,16);

const gasUsed =
parseInt(receipt.gasUsed,16);


// ===============================
// GAS PRICE
// ===============================

const gasPriceWei =
parseInt(tx.gasPrice,16);

const gasPrice =
gasPriceWei / 1e9;


// ===============================
// FEE
// ===============================

const txFee =
(gasUsed * gasPriceWei) / 1e18;


// ===============================
// RETURN OBJECT
// ===============================

return {

hash : tx.hash,

from : tx.from,

to   : tx.to,

value : value,

gasLimit : gasLimit,

gasUsed : gasUsed,

gasPrice : gasPrice,

txFee : txFee,

blockNumber : tx.blockNumber,

nonce : tx.nonce,

timestamp : blockTimestamp,

latestBlock : latestBlock

};

}


function playSuccessSound(){

const enabled = localStorage.getItem("sound_enabled") === "true";

if(!enabled) return;

const audio = new Audio("sounds/success.mp3");

audio.play();

}


