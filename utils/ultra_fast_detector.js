const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const WSS_URL = process.env.WSS_URL;
const TARGET_TOPIC = '0xf9d151d23a5253296eb20ab40959cf48828ea2732d337416716e302ed83ca658';
const DEPLOYER = "0x71B8EFC8BCaD65a5D9386D07f2Dff57ab4EAf533";
const WANTED = "0x81F7cA6AF86D1CA6335E44A2C28bC88807491415";
const UNWANTED = "0x03Fb99ea8d3A832729a69C3e8273533b52f30D1A";

// Global state
let provider, shouldStop, resolveCallback;
const processedTxs = new Set();
const callerCache = new Map();
const rejectedCallers = new Set();

// Pre-compiled patterns
const addressRegex = /000000000000000000000000([a-fA-F0-9]{40})/g;
const WANTED_HEX = WANTED.slice(2).toLowerCase();
const UNWANTED_HEX = UNWANTED.slice(2).toLowerCase();
const USE_TX_VERIFICATION = true;

// Provider
function getProvider() {
    if (!provider) {
        provider = new ethers.WebSocketProvider(WSS_URL);
        provider.on('error', () => provider = null);
    }
    return provider;
}

// Extract token and determine caller in one pass
function extractTokenAndCaller(data) {
    if (!data || data.length < 130) return null;
    
    addressRegex.lastIndex = 0;
    const addresses = [];
    let match;
    while ((match = addressRegex.exec(data)) && addresses.length < 10) {
        const addr = '0x' + match[1];
        if (addr !== '0x0000000000000000000000000000000000000000') addresses.push(addr);
    }
    
    if (addresses.length < 2) return null;
    const token = addresses[1];
    
    // Check exact addresses first
    for (const addr of addresses) {
        if (addr.toLowerCase() === WANTED.toLowerCase()) return { token, confidence: 'WANTED' };
        if (addr.toLowerCase() === UNWANTED.toLowerCase()) return { token, confidence: 'UNWANTED' };
    }
    
    // Pattern matching fallback
    const dataLower = data.toLowerCase();
    if (dataLower.includes(UNWANTED_HEX)) return { token, confidence: 'UNWANTED' };
    if (dataLower.includes(WANTED_HEX)) return { token, confidence: 'WANTED' };
    return { token, confidence: 'VERIFY' };
}

// Verify caller with caching
async function verifyCaller(txHash) {
    if (callerCache.has(txHash)) return callerCache.get(txHash).toLowerCase() === WANTED.toLowerCase();
    if (rejectedCallers.has(txHash)) return false;
    
    try {
        const tx = await getProvider().getTransaction(txHash);
        callerCache.set(txHash, tx.from);
        const isWanted = tx.from.toLowerCase() === WANTED.toLowerCase();
        if (!isWanted) rejectedCallers.add(txHash);
        return isWanted;
    } catch {
        rejectedCallers.add(txHash);
        return false;
    }
}

// Execute callback
function executeCallback(token) {
    if (shouldStop) return;
    console.log(`🚀 DETECTED: ${token} | ${new Date().toISOString()}`);
    shouldStop = true;
    provider.removeAllListeners();
    resolveCallback(token);
}

// Process events
function processEvent(log) {
    if (processedTxs.has(log.transactionHash)) return;
    
    // Simple cache management
    if (processedTxs.size >= 1000) {
        processedTxs.clear();
        if (callerCache.size >= 500) callerCache.clear();
        if (rejectedCallers.size >= 100) rejectedCallers.clear();
    }
    processedTxs.add(log.transactionHash);
    
    const result = extractTokenAndCaller(log.data);
    if (!result) return;
    
    if (result.confidence === 'WANTED') {
        executeCallback(result.token);
    } else if (result.confidence === 'UNWANTED') {
        console.log(`❌ UNWANTED: ${result.token} from ${UNWANTED} - continuing monitoring...`);
    } else if (result.confidence === 'VERIFY' && USE_TX_VERIFICATION) {
        verifyCaller(log.transactionHash).then(isValid => {
            if (isValid) {
                executeCallback(result.token);
            } else {
                console.log(`❌ REJECTED: ${result.token} (wrong caller) - continuing monitoring...`);
            }
        }).catch(() => {
            console.log(`❌ VERIFY ERROR: ${result.token} (network issue) - continuing monitoring...`);
        });
    } else if (result.confidence === 'VERIFY') {
        executeCallback(result.token);
    }
}

// Main function - Live token detection
async function getTokenAddress(onTokenFound = null) {
    return new Promise(async (resolve, reject) => {
        try {
            resolveCallback = onTokenFound ? async (token) => {
                if (token && token !== '0x0000000000000000000000000000000000000000') {
                    try {
                        await onTokenFound(token);  // Wait for swap to complete
                        resolve(token);             // Only resolve after swap is done
                    } catch (error) {
                        console.error('❌ Callback error:', error.message);
                        resolve(token); // Still resolve with token even if swap fails
                    }
                }
            } : resolve;
            
            shouldStop = false;
            processedTxs.clear();
            console.log(`🔍 Monitoring for tokens from: ${WANTED}`);
            console.log(`❌ Will reject tokens from: ${UNWANTED}`);
            
            getProvider().on({ address: DEPLOYER, topics: [TARGET_TOPIC] }, (log) => {
                if (!shouldStop) {
                    try {
                        processEvent(log);
                    } catch (error) {
                        console.log(`⚠️  Processing error: ${error.message} - continuing monitoring...`);
                    }
                }
            });
            
        } catch (error) {
            shouldStop = true;
            provider?.removeAllListeners();
            reject(error);
        }
    });
}

// CLI - Live detection only
if (require.main === module) {
    getTokenAddress().then(console.log).catch(() => process.exit(1));
}

module.exports = { getTokenAddress };