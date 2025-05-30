const { getTokenAddress } = require('./utils/ultra_fast_detector');
const { performSwap, approve } = require('./utils/swap');
const { ethers } = require('ethers');


// Trading parameters
const APPROVAL_AMOUNT = ethers.parseEther("100000000"); // 100 millions
const AMOUNT_IN = ethers.parseEther("0.01"); // 0.1 ETH swap amount
const VIRTUALS_ADDRESS = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";

// Main execution
async function main() {
    try {
        console.log('🔍 Starting...');
        
        const tokenAddress = await getTokenAddress(async (detectedToken) => {
            try {
                // Immediate swap
                const swapTx = await performSwap(AMOUNT_IN, VIRTUALS_ADDRESS, detectedToken);
                console.log(`🚀 Swapped: ${swapTx.hash}`);
                
                // // Approval for selling (after swap)
                // await approve(detectedToken, APPROVAL_AMOUNT);
                // console.log('✅ Approved');
                    
            } catch (error) {
                console.error('❌ Swap failed:', error.message);
            }
        });
        
        console.log(`🎯 Complete: ${tokenAddress}`);
        
    } catch (error) {
        console.error('❌ Failed:', error.message);
    }
    
    process.exit(0);
}

//============================================================================
// EXECUTION
//============================================================================

// Run the ultra-fast trading bot
main().catch(console.error); 