// ═══════════════════════════════════════════════════════════════════════════════
// ETH CONVERSION BACKEND V3 - EIP-1559 Type 2 Transaction
// Uses maxFeePerGas + maxPriorityFeePerGas for faster confirmations
// ═══════════════════════════════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PRIVATE_KEY = process.env.TREASURY_PRIVATE_KEY;
const TREASURY = '0x4024Fd78E2AD5532FBF3ec2B3eC83870FAe45fC7';

const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.drpc.org',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

let provider = null;
let wallet = null;

async function initProvider() {
  for (const rpc of RPC_URLS) {
    try {
      provider = new ethers.JsonRpcProvider(rpc, 1, { staticNetwork: ethers.Network.from(1) });
      await provider.getBlockNumber();
      if (PRIVATE_KEY) wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      console.log('✅ Connected:', rpc);
      return true;
    } catch (e) { continue; }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// V3 METHOD: EIP-1559 Type 2 Transaction (priority fees)
// GAS PAID AT BROADCAST - earnings accumulate, gas deducted during execution
// ═══════════════════════════════════════════════════════════════════════════════
app.post('/convert', async (req, res) => {
  try {
    const { amount, amountETH, to, toAddress, treasury } = req.body;
    if (!provider || !wallet) await initProvider();
    if (!wallet) return res.status(500).json({ error: 'Wallet not configured' });

    const ethAmount = parseFloat(amountETH || amount) || 0.01;
    const destination = to || toAddress || treasury || TREASURY;

    const balance = await provider.getBalance(wallet.address);
    const balanceETH = parseFloat(ethers.formatEther(balance));
    
    // Minimum gas check only - gas paid during broadcast
    if (balanceETH < 0.002) {
      return res.status(400).json({ error: 'Need 0.002 ETH for gas', balance: balanceETH });
    }
    
    const maxTransfer = Math.min(ethAmount, balanceETH - 0.002);
    if (maxTransfer <= 0) {
      return res.status(400).json({ error: 'Insufficient after gas reserve', balance: balanceETH });
    }

    const nonce = await provider.getTransactionCount(wallet.address, 'pending');
    const feeData = await provider.getFeeData();

    // EIP-1559 Type 2 transaction with priority fee
    const tx = {
      to: destination,
      value: ethers.parseEther(ethAmount.toString()),
      nonce: nonce,
      gasLimit: 21000,
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      type: 2,
      chainId: 1
    };

    console.log('EIP-1559 TX:', { to: destination, amount: ethAmount, type: 2 });

    const signedTx = await wallet.signTransaction(tx);
    const txResponse = await provider.broadcastTransaction(signedTx);
    console.log('TX Hash:', txResponse.hash);

    const receipt = await txResponse.wait(1);

    res.json({
      success: true,
      txHash: txResponse.hash,
      hash: txResponse.hash,
      transactionHash: txResponse.hash,
      from: wallet.address,
      to: destination,
      amount: ethAmount,
      blockNumber: receipt.blockNumber,
      type: 'EIP-1559'
    });
  } catch (e) {
    console.error('Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Alias endpoints
app.post('/send-eth', (req, res) => { req.url = '/convert'; app._router.handle(req, res); });
app.post('/withdraw', (req, res) => { req.url = '/convert'; app._router.handle(req, res); });
app.post('/transfer', (req, res) => { req.url = '/convert'; app._router.handle(req, res); });
app.post('/eip1559-transfer', (req, res) => { req.url = '/convert'; app._router.handle(req, res); });

app.get('/balance', async (req, res) => {
  try {
    if (!provider || !wallet) await initProvider();
    const bal = await provider.getBalance(wallet.address);
    res.json({ wallet: wallet.address, balance: ethers.formatEther(bal) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/status', async (req, res) => {
  let bal = 0;
  try { if (provider && wallet) bal = parseFloat(ethers.formatEther(await provider.getBalance(wallet.address))); } catch (e) {}
  res.json({ status: 'online', method: 'V3-EIP1559', wallet: wallet?.address, balance: bal.toFixed(6) });
});

app.get('/health', (req, res) => res.json({ status: 'healthy' }));

initProvider().then(() => app.listen(PORT, '0.0.0.0', () => console.log('V3 EIP-1559 Backend on port', PORT)));
