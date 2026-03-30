import { parseAbi } from "viem"

export const POOL_ABI = parseAbi([
  "function deposit(uint256,uint256,uint256,bytes) external",
  "function batchWithdraw(uint256[2],uint256[2][2],uint256[2],uint256[50],address[],uint256[],uint32[],bytes32,bytes,bytes[]) external",
  "function quoteCrossChainFee(uint32,address,uint256,bytes) view returns (uint256)",
  "function globalFeeBps() view returns (uint256)",
  "function setGlobalFeeBps(uint256) external",
  "function lzFeeToken() view returns (address)",
  "function nullifierHashes(bytes32) view returns (bool)",
  "function currentRoot() view returns (bytes32)"
])

export const SPOKE_GATEWAY_ABI = parseAbi([
  "function quoteShieldFee(uint256,uint256,address,bytes) view returns (uint256,bool)",
  "function shieldCrossChain(uint256,uint256,bytes) payable",
  "function underlyingToken() view returns (address)",
  "function lzFeeToken() view returns (address)",
  "function previewExecutionOptions() view returns (bytes)",
  "event ShieldedCrossChain(address indexed sender, uint16 indexed assetId, bytes32 indexed guid, uint256 amount, uint256 innerCommitment)"
])

export const ERC20_ABI = parseAbi([
  "function approve(address,uint256) external returns (bool)",
  "function allowance(address,address) external view returns (uint256)"
])

export const TREASURY_ABI = parseAbi([
  "function getOwners() view returns (address[])",
  "function threshold() view returns (uint256)",
  "function getTransactionCount() view returns (uint256)",
  "function pendingTransactionCount() view returns (uint256)",
  "function transactions(uint256) view returns (address target, uint256 value, bytes data, bool executed, bool cancelled, uint256 numConfirmations)",
  "function isConfirmed(uint256,address) view returns (bool)",
  "function submitTransaction(address,uint256,bytes) external",
  "function confirmTransaction(uint256) external",
  "function revokeConfirmation(uint256) external",
  "function executeTransaction(uint256) external",
  "function cancelTransaction(uint256) external",
  "function addSigner(address) external",
  "function removeSigner(address) external",
  "function replaceSigner(address,address) external",
  "function sweepRevenue(address,address,uint256) external"
])
