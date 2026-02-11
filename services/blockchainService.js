const { ethers } = require('ethers');
const { query } = require('../config/database');
const logger = require('../utils/logger');

class BlockchainService {
  constructor() {
    // FIX: Make blockchain optional - don't crash if not configured
    this.enabled = !!(process.env.BSC_CONTRACT_ADDRESS && process.env.PRIVATE_KEY);
    
    if (!this.enabled) {
      console.log('⚠️  Blockchain service disabled: BSC_CONTRACT_ADDRESS or PRIVATE_KEY not configured');
      console.log('   App will work normally without blockchain verification');
      return; // Exit early - don't try to create contract
    }

    try {
      this.provider = new ethers.JsonRpcProvider(
        process.env.BSC_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545'
      );
      this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
      
      let contractABI;
      try {
        contractABI = require('../contracts/JobIntVerification.json');
      } catch (error) {
        console.log('Contract ABI not found');
        this.enabled = false;
        return;
      }

      this.contract = new ethers.Contract(
        process.env.BSC_CONTRACT_ADDRESS,
        contractABI.abi,
        this.wallet
      );

      console.log('✅ Blockchain service initialized');
    } catch (error) {
      console.log('Failed to initialize blockchain:', error.message);
      this.enabled = false;
    }
  }

  isEnabled() {
    return this.enabled || false;
  }

  async recordApplication(userId, jobListingId) {
    if (!this.enabled) {
      return { skipped: true, txHash: null };
    }
    // Blockchain code here (will be skipped if disabled)
    return { txHash: null };
  }

  async recordInterview(userId, applicationId, scheduledTime, company, location) {
    if (!this.enabled) {
      return { skipped: true, txHash: null };
    }
    return { txHash: null };
  }

  async getUserStats(walletAddress) {
    return { applications: 0, interviews: 0, enabled: this.enabled || false };
  }

  async getGasPrice() {
    return this.enabled ? '5' : '0';
  }

  async estimateApplicationCost() {
    if (!this.enabled) {
      return { gasCost: 'N/A', usdEstimate: 'N/A' };
    }
    return { gasCost: '~0.001 BNB', usdEstimate: '~$0.30' };
  }

  getTransactionUrl(txHash) {
    const network = process.env.BSC_NETWORK === 'mainnet' ? '' : 'testnet.';
    return `https://${network}bscscan.com/tx/${txHash}`;
  }

  generateJobHash(jobId, title, company) {
    return ethers.keccak256(ethers.toUtf8Bytes(`${jobId}-${title}-${company}`));
  }

  generateProfileHash(userId, skills, timestamp) {
    return ethers.keccak256(ethers.toUtf8Bytes(`${userId}-${skills.join(',')}-${timestamp}`));
  }
}

module.exports = new BlockchainService();