const { getTokenAddress } = require('./utils/ultra_fast_detector');
const { performSwap, approve } = require('./utils/swap');
const { ethers } = require('ethers');


// Trading parameters
const APPROVAL_AMOUNT = ethers.parseEther("100000000"); // 100 millions
const AMOUNT_IN = ethers.parseEther("10"); // 0.1 ETH swap amount
const VIRTUALS_ADDRESS = "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b";

// Main execution
async function main() {
    try {
        console.log('🔍 Starting...');
        
        const tokenAddress = await getTokenAddress(async (detectedToken) => {
            try {
                console.log(`⚡ Starting swap for: ${detectedToken}`);
                
                // Immediate swap
                const swapTx = await performSwap(AMOUNT_IN, VIRTUALS_ADDRESS, detectedToken);
                console.log(`🚀 Swapped: ${swapTx.hash}`);
                
                // Approval for selling (after swap)
                console.log(`🔒 Approving ${detectedToken} for selling...`);
                await approve(detectedToken, APPROVAL_AMOUNT);
                console.log('✅ Approved for selling');
                    
            } catch (error) {
                console.error('❌ Swap/Approval failed:', error.message);
                console.error('📋 Full error:', error);
                
                // Don't throw - let monitoring continue for next token
                return;
            }
        });
        
        console.log(`🎯 Complete: ${tokenAddress}`);
        
    } catch (error) {
        console.error('❌ Main execution failed:', error.message);
        console.error('📋 Full error:', error);
    }
    
    process.exit(0);
}

//============================================================================
// EXECUTION
//============================================================================

// Run the ultra-fast trading bot
main().catch(console.error); 