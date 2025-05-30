const { ethers } = require('ethers');
require('dotenv').config();

// Configuration - Pre-resolved for speed
const WEBSOCKET_PROVIDER_URL = process.env.WSS_URL;
const TARGET_EVENT_TOPIC = '0xf9d151d23a5253296eb20ab40959cf48828ea2732d337416716e302ed83ca658';
const VIRTUALS_DEPLOYER_ADDRESS = "0x71B8EFC8BCaD65a5D9386D07f2Dff57ab4EAf533"; // Add the actual deployer address here

// Global state - Minimal memory allocation
let provider = null;
let shouldStopMonitoring = false;
let resolveCallback = null; // Direct callback reference

// Pre-compiled regex and constants
const addressRegex = /000000000000000000000000([a-fA-F0-9]{40})/g;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Ultra-minimal cache - Set is fastest for has() operations
const processedTxs = new Set();

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

// MAXIMUM SPEED: Inline address extraction with zero allocations
function fastExtractTokenAddress(data) {
    // Fast exit for invalid data
    if (!data || data.length < 130) return null; // 2 + 64*2 minimum
    
    // Reset regex state
    addressRegex.lastIndex = 0;
    
    let match1 = addressRegex.exec(data);
    if (!match1) return null;
    
    let match2 = addressRegex.exec(data);
    if (!match2) return null;
    
    // First address is contract, second is token (based on your pattern)
    const tokenAddr = '0x' + match2[1];
    return tokenAddr !== ZERO_ADDRESS ? tokenAddr : null;
}

// CRITICAL PATH: Ultra-optimized event processing
function processEvent(log) {
    // Fast duplicate check
    if (processedTxs.has(log.transactionHash)) return;
    
    // Ultra-fast cache management - clear when full
    if (processedTxs.size >= 1000) processedTxs.clear();
    processedTxs.add(log.transactionHash);
    
    // Extract token address directly
    const tokenAddress = fastExtractTokenAddress(log.data);
    
    if (tokenAddress) {
        // IMMEDIATE RESOLUTION - No logging in critical path for max speed
        shouldStopMonitoring = true;
        
        // Instant cleanup and callback
        provider.removeAllListeners();
        
        // IMMEDIATE callback for maximum swap speed
        resolveCallback(tokenAddress);
        
        return tokenAddress;
    }
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
                    // Execute custom callback immediately (direct call)
                    onTokenFound(tokenAddress);
                    // Then resolve the promise
                    originalResolve(tokenAddress);
                    // Log AFTER swap is triggered (non-blocking)
                    console.log(`🚀 ${tokenAddress} | ${new Date().toISOString()}`);
                };
            }
            
            // Reset state - minimal operations
            shouldStopMonitoring = false;
            processedTxs.clear();
            
            // Setup monitoring immediately
            await setupUltraFastMonitoring();
            
        } catch (error) {
            shouldStopMonitoring = true;
            if (provider) provider.removeAllListeners();
            reject(error);
        }
    });
}

// Ultra-minimal shutdown
process.on('SIGINT', () => {
    shouldStopMonitoring = true;
    if (provider) provider.destroy();
    process.exit(0);
});

// Export
module.exports = {
    getTokenAddress,
    TARGET_EVENT_TOPIC,
    WEBSOCKET_PROVIDER_URL,
    VIRTUALS_DEPLOYER_ADDRESS
};