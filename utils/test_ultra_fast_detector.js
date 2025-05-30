const { ethers } = require('ethers');
require('dotenv').config();

// Configuration - Pre-resolved for speed
const WEBSOCKET_PROVIDER_URL = process.env.WSS_URL;
const TARGET_EVENT_TOPIC = '0xf9d151d23a5253296eb20ab40959cf48828ea2732d337416716e302ed83ca658';
const VIRTUALS_DEPLOYER_ADDRESS = "0x71B8EFC8BCaD65a5D9386D07f2Dff57ab4EAf533"; // Add the actual deployer address here

// Caller filtering - only tokens from wanted caller
const WANTED_CALLER = "0x81F7cA6AF86D1CA6335E44A2C28bC88807491415"; // onGenesisSuccessSalt
const UNWANTED_CALLER = "0x03Fb99ea8d3A832729a69C3e8273533b52f30D1A"; // launch (ignore)

// Global state - Minimal memory allocation
let provider = null;
let shouldStopMonitoring = false;
let resolveCallback = null; // Direct callback reference

// Pre-compiled regex and constants
const addressRegex = /000000000000000000000000([a-fA-F0-9]{40})/g;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// OPTIMIZATION: Smart caches for maximum speed
const processedTxs = new Set(); // Duplicate prevention
const callerCache = new Map(); // Cache tx.from lookups (key: txHash, value: fromAddress)
const rejectedCallers = new Set(); // Fast rejection cache

// Pre-computed hex values for ultra-fast string matching
const WANTED_CALLER_HEX = WANTED_CALLER.slice(2).toLowerCase();
const UNWANTED_CALLER_HEX = UNWANTED_CALLER.slice(2).toLowerCase();

// Configuration flags
const USE_TRANSACTION_CALLER_VERIFICATION = true; // Set to true for 100% accuracy (+50-200ms delay)

// OPTIMIZATION: Cache management with automatic cleanup
function manageCaches() {
    // Prevent memory leaks - keep caches under control
    if (processedTxs.size >= 1000) {
        processedTxs.clear();
    }
    if (callerCache.size >= 500) {
        // Keep only most recent 250 entries
        const entries = Array.from(callerCache.entries());
        callerCache.clear();
        entries.slice(-250).forEach(([k, v]) => callerCache.set(k, v));
    }
    if (rejectedCallers.size >= 100) {
        rejectedCallers.clear();
    }
}

// Provider initialization - Optimized for speed
function getProvider() {
    if (!provider) {
        if (!WEBSOCKET_PROVIDER_URL) {
            throw new Error('WSS_URL not found in environment variables');
        }
        provider = new ethers.WebSocketProvider(WEBSOCKET_PROVIDER_URL);
        
        // Minimal error handling - no logging in critical path
        provider.on('error', (err) => {
            if (err.message.includes('connection') || err.message.includes('network')) {
                provider = null; // Force reconnection only on real errors
            }
        });
    }
    return provider;
}

// ULTRA-OPTIMIZED: Extract token AND caller directly from event data (0ms)
function ultraFastExtractTokenAndCaller(data) {
    // Fast exit for invalid data
    if (!data || data.length < 130) return null;
    
    const dataLower = data.toLowerCase();
    
    // Reset regex state and extract ALL addresses from event data
    addressRegex.lastIndex = 0;
    const addresses = [];
    let match;
    
    // Extract all addresses from the event data
    while ((match = addressRegex.exec(data)) !== null && addresses.length < 10) {
        const addr = '0x' + match[1];
        if (addr !== ZERO_ADDRESS) {
            addresses.push(addr);
        }
        // Prevent infinite loop
        if (addressRegex.lastIndex === match.index) break;
    }
    
    if (addresses.length < 2) return null;
    
    // Based on your event structure: [contract, token, caller, ...]
    // You may need to adjust indices based on actual event structure
    const contractAddr = addresses[0];
    const tokenAddr = addresses[1];
    const possibleCaller = addresses[2]; // Caller might be 3rd address
    
    // OPTIMIZATION 1: Direct caller verification from event data
    let callerConfidence = 'UNKNOWN';
    let extractedCaller = null;
    
    // Check if we can identify the caller from the extracted addresses
    for (const addr of addresses) {
        const addrLower = addr.toLowerCase();
        if (addrLower === WANTED_CALLER.toLowerCase()) {
            extractedCaller = addr;
            callerConfidence = 'WANTED_VERIFIED';
            break;
        } else if (addrLower === UNWANTED_CALLER.toLowerCase()) {
            extractedCaller = addr;
            callerConfidence = 'UNWANTED_VERIFIED';
            break;
        }
    }
    
    // OPTIMIZATION 2: Fallback pattern matching if exact address not found
    if (callerConfidence === 'UNKNOWN') {
        if (dataLower.includes(UNWANTED_CALLER_HEX)) {
            callerConfidence = 'UNWANTED_PATTERN';
        } else if (dataLower.includes(WANTED_CALLER_HEX)) {
            callerConfidence = 'WANTED_PATTERN';
        } else {
            callerConfidence = 'NEEDS_VERIFICATION';
        }
    }
    
    return {
        tokenAddress: tokenAddr,
        extractedCaller: extractedCaller,
        callerConfidence: callerConfidence,
        allAddresses: addresses // For debugging
    };
}

// FALLBACK: Only use when event data extraction is insufficient
async function fallbackVerifyTransactionCaller(transactionHash) {
    // Check cache first (instant return)
    if (callerCache.has(transactionHash)) {
        const cachedCaller = callerCache.get(transactionHash);
        return cachedCaller.toLowerCase() === WANTED_CALLER.toLowerCase();
    }
    
    // Early rejection if caller is known bad
    if (rejectedCallers.has(transactionHash)) {
        return false;
    }
    
    try {
        const tx = await getProvider().getTransaction(transactionHash);
        const fromAddress = tx.from;
        
        // Cache the result for future lookups
        callerCache.set(transactionHash, fromAddress);
        
        const isWantedCaller = fromAddress.toLowerCase() === WANTED_CALLER.toLowerCase();
        
        // Cache rejections for fast future filtering
        if (!isWantedCaller) {
            rejectedCallers.add(transactionHash);
        }
        
        return isWantedCaller;
        
    } catch (error) {
        // Cache failed lookups as rejections to avoid retry
        rejectedCallers.add(transactionHash);
        return false; // Reject on error to be safe
    }
}

// ULTRA-OPTIMIZED: Event processing with direct caller extraction
function processEvent(log) {
    // Fast duplicate check
    if (processedTxs.has(log.transactionHash)) return;
    
    // Cache management - only when needed
    if (processedTxs.size >= 1000) manageCaches();
    processedTxs.add(log.transactionHash);
    
    // ZERO-DELAY: Extract token AND caller from event data directly
    const result = ultraFastExtractTokenAndCaller(log.data);
    
    if (result && result.tokenAddress) {
        // Handle based on caller confidence level
        switch (result.callerConfidence) {
            case 'WANTED_VERIFIED':
            case 'WANTED_PATTERN':
                // INSTANT EXECUTION: Genuine token detected
                executeCallback(result.tokenAddress);
                break;
                
            case 'UNWANTED_VERIFIED':
            case 'UNWANTED_PATTERN':
                // SILENT REJECTION: Continue monitoring
                break;
                
            case 'NEEDS_VERIFICATION':
                // FALLBACK: Only use transaction call when absolutely necessary
                if (USE_TRANSACTION_CALLER_VERIFICATION) {
                    fallbackVerifyTransactionCaller(log.transactionHash).then(isValidCaller => {
                        if (isValidCaller) {
                            executeCallback(result.tokenAddress);
                        }
                    }).catch(() => {
                        // Silent failure, continue monitoring
                    });
                } else {
                    // Trust event extraction when verification is disabled
                    executeCallback(result.tokenAddress);
                }
                break;
        }
    }
    // Continue monitoring for next event
}

// Helper function to execute callback and cleanup - ONLY for genuine tokens
function executeCallback(tokenAddress) {
    // Double-check we should actually stop (safety check)
    if (shouldStopMonitoring) return;
    
    // Log detection time immediately for timing analysis
    console.log(`🚀 DETECTED: ${tokenAddress} | ${new Date().toISOString()}`);
    
    // IMMEDIATE RESOLUTION - Stop monitoring and trigger swap
    shouldStopMonitoring = true;
    
    // Instant cleanup and callback
    provider.removeAllListeners();
    
    // IMMEDIATE callback for maximum swap speed
    resolveCallback(tokenAddress);
}

// Pure WebSocket monitoring - Zero overhead
async function setupUltraFastMonitoring() {
    const filter = { 
        address: VIRTUALS_DEPLOYER_ADDRESS,  // Only events from legitimate deployer
        topics: [TARGET_EVENT_TOPIC] 
    };
    
    // ONLY event listener - maximum efficiency, zero fake tokens
    getProvider().on(filter, (log) => {
        if (shouldStopMonitoring) return;
        processEvent(log);
    });
}

// Main function: Maximum speed token detection
async function getTokenAddress(onTokenFound = null) {
    return new Promise(async (resolve, reject) => {
        try {
            // Store resolve callback globally for direct access
            resolveCallback = resolve;
            
            // Store custom callback for immediate execution
            if (onTokenFound && typeof onTokenFound === 'function') {
                const originalResolve = resolveCallback;
                resolveCallback = (tokenAddress) => {
                    // Validate token address before executing callback
                    if (!tokenAddress || tokenAddress === ZERO_ADDRESS) {
                        return; // Don't resolve, continue monitoring
                    }
                    
                    // Execute custom callback immediately (direct call)
                    onTokenFound(tokenAddress);
                    // Then resolve the promise
                    originalResolve(tokenAddress);
                };
            }
            
            // Reset state - minimal operations
            shouldStopMonitoring = false;
            processedTxs.clear();
            
            // OPTIMIZATION: Pre-warm caches if needed
            manageCaches();
            
            console.log(`🔍 Monitoring for tokens from: ${WANTED_CALLER}`);
            
            // Setup monitoring immediately
            await setupUltraFastMonitoring();
            
        } catch (error) {
            shouldStopMonitoring = true;
            if (provider) provider.removeAllListeners();
            reject(error);
        }
    });
}

// OPTIMIZATION: Enhanced testing with parallel processing
async function testHistoricalBlocks(startBlock, endBlock) {
    console.log(`🔍 Testing blocks ${startBlock} to ${endBlock}`);
    console.log(`📍 Deployer: ${VIRTUALS_DEPLOYER_ADDRESS}`);
    console.log(`🎯 Event: ${TARGET_EVENT_TOPIC}`);
    console.log(`🔧 Caller verification: ${USE_TRANSACTION_CALLER_VERIFICATION ? 'ENABLED (+cache optimization)' : 'DISABLED (fast event data filtering)'}`);
    
    try {
        const testProvider = getProvider();
        const foundTokens = [];
        
        console.log(`⏳ Scanning ${endBlock - startBlock + 1} blocks...`);
        
        const logs = await testProvider.getLogs({
            fromBlock: startBlock,
            toBlock: endBlock,
            address: VIRTUALS_DEPLOYER_ADDRESS,
            topics: [TARGET_EVENT_TOPIC]
        });
        
        console.log(`📦 Found ${logs.length} events`);
        
        if (USE_TRANSACTION_CALLER_VERIFICATION && logs.length > 1) {
            // OPTIMIZATION: Parallel processing for multiple tokens
            console.log(`⚡ Processing ${logs.length} events in parallel...`);
            
            const verificationPromises = logs.map(async (log) => {
                const tokenResult = ultraFastExtractTokenAndCaller(log.data);
                if (tokenResult) {
                    const isValidCaller = await fallbackVerifyTransactionCaller(log.transactionHash);
                    return {
                        log,
                        tokenResult,
                        isValidCaller
                    };
                }
                return null;
            });
            
            const results = await Promise.all(verificationPromises);
            
            for (const result of results) {
                if (result && result.tokenResult) {
                    if (result.isValidCaller) {
                        foundTokens.push({
                            tokenAddress: result.tokenResult.tokenAddress,
                            blockNumber: result.log.blockNumber,
                            transactionHash: result.log.transactionHash,
                            timestamp: new Date().toISOString(),
                            caller: 'VERIFIED_WANTED',
                            confidence: result.tokenResult.callerConfidence
                        });
                        
                        console.log(`🚀 Block ${result.log.blockNumber}: ${result.tokenResult.tokenAddress} (VERIFIED-${result.tokenResult.callerConfidence})`);
                        console.log(`   TX: ${result.log.transactionHash}`);
                    } else {
                        console.log(`❌ Block ${result.log.blockNumber}: ${result.tokenResult.tokenAddress} (REJECTED - wrong caller)`);
                        console.log(`   TX: ${result.log.transactionHash}`);
                    }
                }
            }
        } else {
            // Sequential processing for single events or fast mode
            for (const log of logs) {
                const tokenResult = ultraFastExtractTokenAndCaller(log.data);
                if (tokenResult) {
                    if (USE_TRANSACTION_CALLER_VERIFICATION) {
                        // SLOW PATH: Verify caller via transaction (+cache optimization)
                        const isValidCaller = await fallbackVerifyTransactionCaller(log.transactionHash);
                        if (isValidCaller) {
                            foundTokens.push({
                                tokenAddress: tokenResult.tokenAddress,
                                blockNumber: log.blockNumber,
                                transactionHash: log.transactionHash,
                                timestamp: new Date().toISOString(),
                                caller: 'VERIFIED_WANTED',
                                confidence: tokenResult.callerConfidence
                            });
                            
                            console.log(`🚀 Block ${log.blockNumber}: ${tokenResult.tokenAddress} (VERIFIED-${tokenResult.callerConfidence})`);
                            console.log(`   TX: ${log.transactionHash}`);
                        } else {
                            console.log(`❌ Block ${log.blockNumber}: ${tokenResult.tokenAddress} (REJECTED - wrong caller)`);
                            console.log(`   TX: ${log.transactionHash}`);
                        }
                    } else {
                        // FAST PATH: Trust event data filtering (0ms overhead)
                        foundTokens.push({
                            tokenAddress: tokenResult.tokenAddress,
                            blockNumber: log.blockNumber,
                            transactionHash: log.transactionHash,
                            timestamp: new Date().toISOString(),
                            caller: 'EVENT_DATA_FILTERED',
                            confidence: tokenResult.callerConfidence
                        });
                        
                        console.log(`🚀 Block ${log.blockNumber}: ${tokenResult.tokenAddress} (EVENT FILTERED-${tokenResult.callerConfidence})`);
                        console.log(`   TX: ${log.transactionHash}`);
                    }
                }
            }
        }
        
        console.log(`\n📊 Test Results:`);
        console.log(`   Events found: ${logs.length}`);
        console.log(`   Valid tokens: ${foundTokens.length}`);
        console.log(`   Success rate: ${logs.length > 0 ? ((foundTokens.length/logs.length)*100).toFixed(1) : 0}%`);
        console.log(`   Verification mode: ${USE_TRANSACTION_CALLER_VERIFICATION ? 'TRANSACTION CALLER (CACHED)' : 'EVENT DATA ONLY'}`);
        console.log(`   Cache stats: ${callerCache.size} cached calls, ${rejectedCallers.size} rejections`);
        
        return foundTokens;
        
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
        throw error;
    }
}

// Ultra-minimal shutdown
process.on('SIGINT', () => {
    shouldStopMonitoring = true;
    if (provider) provider.destroy();
    process.exit(0);
});

// Command line usage with testing support
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args[0] === 'test' && args[1] && args[2]) {
        // Testing mode: node ultra_fast_detector.js test <startBlock> <endBlock>
        const startBlock = parseInt(args[1]);
        const endBlock = parseInt(args[2]);
        
        console.log('📊 Historical Testing Mode');
        testHistoricalBlocks(startBlock, endBlock)
            .then(tokens => {
                console.log(`✅ Testing complete: ${tokens.length} tokens found`);
                process.exit(0);
            })
            .catch(error => {
                console.error(`❌ Testing failed: ${error.message}`);
                process.exit(1);
            });
            
    } else if (args[0] === 'test') {
        console.log('❌ Usage: node ultra_fast_detector.js test <startBlock> <endBlock>');
        console.log('   Example: node ultra_fast_detector.js test 12000000 12001000');
        console.log('   Or for real-time: node ultra_fast_detector.js');
        process.exit(1);
        
    } else {
        // Real-time detection mode (default)
        (async () => {
            try {
                const tokenAddress = await getTokenAddress();
                console.log(tokenAddress);
                process.exit(0);
            } catch (error) {
                process.exit(1);
            }
        })().catch(() => process.exit(1));
    }
}

// Export
module.exports = {
    getTokenAddress,
    testHistoricalBlocks,
    TARGET_EVENT_TOPIC,
    WEBSOCKET_PROVIDER_URL,
    VIRTUALS_DEPLOYER_ADDRESS,
    WANTED_CALLER,
    UNWANTED_CALLER
};