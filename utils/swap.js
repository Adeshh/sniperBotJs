require('dotenv').config();
const { ethers } = require('ethers');
const routerAbi = require('../abi/uniswapRouterABI.json');

// Initialize WebSocket provider and wallet
const provider = new ethers.WebSocketProvider(process.env.WSS_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 200;
const ULTRA_FAST_GAS = {
  gasLimit: 250000,
  maxFeePerGas: ethers.parseUnits('4', 'gwei'),
  maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei')
};

async function performSwap(amount, tokenIn, tokenOut) {
  const router = new ethers.Contract(process.env.UNISWAP_ROUTER_ADDRESS, routerAbi, wallet);

  let retries = 0;
  while (retries < MAX_RETRIES) {
    const deadline = Math.floor(Date.now() / 1000) + (2 * 60);
    try {
      const tx = await router.swapExactTokensForTokens(
        amount,
        0,
        [tokenIn, tokenOut],
        wallet.address,
        deadline,
        ULTRA_FAST_GAS
      );
      
      console.log(`🚀 Swap submitted: ${tx.hash} | ${new Date().toISOString()}`);
      return tx; // Return immediately without waiting for confirmation

    } catch (error) {
      console.error(`❌ Swap attempt ${retries + 1} failed: ${error.message}`);
      
      if (error.code === 'INSUFFICIENT_FUNDS') {
        console.error(`💰 Insufficient funds. Need: ${ethers.formatEther(amount)} tokens`);
      } else if (error.message.includes('TRANSFER_FROM_FAILED')) {
        console.error(`🔒 Transfer failed - check token approvals for ${tokenIn}`);
      } else if (error.message.includes('UniswapV2: INSUFFICIENT_OUTPUT_AMOUNT')) {
        console.error(`📉 Insufficient output amount - slippage too high`);
      } else if (error.message.includes('UniswapV2: INSUFFICIENT_LIQUIDITY')) {
        console.error(`🌊 Insufficient liquidity for this pair`);
      }
      
      retries++;
      if (retries < MAX_RETRIES) {
        await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
      }
    }
  }

  throw new Error('Failed to perform swap after multiple retries.');
}

async function approve(tokenAddress, amountToApprove) {
    const tokenContract = new ethers.Contract(tokenAddress, [
        'function approve(address spender, uint256 amount) public returns (bool)',
    ], wallet);

    const routerAddress = process.env.UNISWAP_ROUTER_ADDRESS;
    
    try {
        const tx = await tokenContract.approve(routerAddress, amountToApprove);
        console.log(`✅ Approval submitted: ${tx.hash}`);
        return tx; // Return immediately without waiting for confirmation
    } catch (error) {
        console.error(`Approval failed: ${error.message}`);
        throw error;
    }
}

// async function swapIfGettingGivenProfit(profitPercentage, percentToSold){
//   const router = new ethers.Contract(process.env.UNISWAP_ROUTER_ADDRESS, routerAbi, wallet);
// }

// Add ultra-fast swap optimizations if not already present
// Example optimization for immediate execution

module.exports = {performSwap, approve};