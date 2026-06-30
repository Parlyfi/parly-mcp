import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { requireEnv, requirePositiveChainIdValue } from "@parly/env-utils"
import { POOL_ABI } from "@parly/protocol-abis"
import type { PublicSurfaceRecord } from "@parly/shared-types"
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  parseUnits
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { MerkleTree } from "fixed-merkle-tree"

import { safeApproveExactSdk } from "./erc20.js"
import {
  type EnvelopeRow,
  fetchEnvelopes,
  fetchLeaves,
  type LeafRow,
  fetchNullifiers,
  fetchRecoveryHeads,
  type NullifierRow,
  type RecoveryHeads
} from "./indexer.js"
import { resolveTempoSettlementEid } from "./lz-options.js"
import {
  createFreshNote,
  openSealedNoteEnvelope,
  reconstructEnvelopeNote,
  type NoteEnvelopePayload
} from "./note-crypto.js"
import { buildSdkRecoveryAuthMessage, deriveRecoveryKeypair } from "./recovery-keys.js"

const require = createRequire(import.meta.url)
const snarkjs = require("snarkjs") as {
  groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasmPath: string,
      zkeyPath: string
    ): Promise<{
      proof: {
        pi_a: [string, string]
        pi_b: [[string, string], [string, string]]
        pi_c: [string, string]
      }
      publicSignals: string[]
    }>
  }
}
const { buildPoseidon } = require("circomlibjs") as {
  buildPoseidon(): Promise<any>
}

export type ParlySDKConfig = {
  privateKeyHex: `0x${string}`
  tempoRpcUrl: string
  tempoChainId: number
  tempoLzEid: number
  ponderGraphqlUrl?: string
  proofAssetsBasePath?: string
}

export type ExecutePaymentParams = {
  destination: `0x${string}`
  amount: string
  assetId: 1 | 2
  destinationEid: number
  poolAddress: `0x${string}`
  proofAssetsBasePath?: string
}

export type BatchPaymentOutput = {
  destination: `0x${string}`
  amount: string
  destinationEid: number
}

export type ExecuteBatchPaymentParams = {
  outputs: BatchPaymentOutput[]
  assetId: 1 | 2
  poolAddress: `0x${string}`
  proofAssetsBasePath?: string
}

export type ParlyLaunchContext = ParlySDKConfig & {
  publicSurfaces: PublicSurfaceRecord[]
}

export type ExecutePaymentOutcome =
  | { kind: "success"; hash: `0x${string}` }
  | {
      kind: "pending_confirmation"
      hash: `0x${string}`
      message: string
      persistedTo: string | null
    }
  | { kind: "terminal_failure"; hash?: `0x${string}`; message: string }

type PendingSdkExecutionRecord = {
  version: 1
  recordedAt: number
  submittedHash: `0x${string}`
  nullifierHash: `0x${string}`
  pool: `0x${string}`
  destination: `0x${string}`
  destinationEid: number
  assetId: 1 | 2
  approvalToken: `0x${string}` | null
  approvalSpender: `0x${string}` | null
  reason: string
}

type CachedSdkBestNote = {
  envelope: `0x${string}`
  commitment: `0x${string}`
  nullifierHash: `0x${string}`
  amount: string
}

type SdkRecoveryCacheEntry = {
  version: 2
  assetId: 1 | 2
  heads: RecoveryHeads
  leaves: Array<{
    commitment: string
    leafIndex: number
    kind?: number
    txHash?: string
    timestamp?: string
  }>
  best: CachedSdkBestNote | null
}

type SdkRecoveryCacheFile = {
  version: 2
  assets: Record<string, SdkRecoveryCacheEntry>
}

const PUBLIC_SURFACES: PublicSurfaceRecord[] = [
  {
    name: "relayer",
    description: "Operator-facing public relayer distribution.",
    audience: "operators"
  },
  {
    name: "sdk",
    description: "Developer-facing public SDK distribution.",
    audience: "developers"
  },
  {
    name: "mcp",
    description: "Agent-facing public MCP distribution.",
    audience: "agent-integrators"
  }
]

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const
const DEFAULT_RECEIPT_TIMEOUT_MS = 300_000
const DEFAULT_PROOF_ASSETS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../assets"
)

function assertSdkProductionEnv(env: NodeJS.ProcessEnv) {
  if (env.PARLY_ENV !== "mainnet" && env.NEXT_PUBLIC_PARLY_ENV !== "mainnet") {
    return
  }

  for (const [key, value] of Object.entries(env)) {
    if (!value || value.trim() === "" || /^0x0{40}$/iu.test(value.trim())) continue
    if (/SPOKE|PATHUSD|LZD|LAYERZERO|DVN/u.test(key)) {
      throw new Error(`${key} is forbidden in active Tempo-only production SDK runtime.`)
    }
    if (key.includes("RPC") && /moderato|testnet|sepolia/iu.test(value)) {
      throw new Error(`${key} points at a test/staging RPC in active Tempo-only production SDK runtime.`)
    }
  }
}

function recoveryHeadsEqual(a: RecoveryHeads | null, b: RecoveryHeads | null) {
  if (!a || !b) {
    return false
  }
  return (
    a.leafCursor === b.leafCursor &&
    a.envelopeCursor === b.envelopeCursor &&
    a.nullifierCursor === b.nullifierCursor
  )
}

function loadSdkRecoveryCache(assetId: 1 | 2): SdkRecoveryCacheEntry | null {
  const raw = process.env.SDK_RECOVERY_CACHE_FILE
  if (!raw) {
    return null
  }

  const cacheFile = path.resolve(process.cwd(), raw)
  if (!fs.existsSync(cacheFile)) {
    return null
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as SdkRecoveryCacheFile
    const entry = parsed?.assets?.[String(assetId)]
    return entry && parsed?.version === 2 && entry.version === 2 && entry.assetId === assetId
      ? entry
      : null
  } catch {
    return null
  }
}

function saveSdkRecoveryCache(entry: SdkRecoveryCacheEntry) {
  const raw = process.env.SDK_RECOVERY_CACHE_FILE
  if (!raw) {
    return
  }

  const cacheFile = path.resolve(process.cwd(), raw)
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true })

  let file: SdkRecoveryCacheFile = {
    version: 2,
    assets: {}
  }

  try {
    if (fs.existsSync(cacheFile)) {
      file = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as SdkRecoveryCacheFile
    }
  } catch {
      file = {
      version: 2,
      assets: {}
    }
  }

  file.version = 2
  file.assets[String(entry.assetId)] = entry
  fs.writeFileSync(cacheFile, JSON.stringify(file, null, 2) + "\n", "utf8")
}

function clearSdkRecoveryCache(assetId: 1 | 2) {
  const raw = process.env.SDK_RECOVERY_CACHE_FILE
  if (!raw) {
    return
  }

  const cacheFile = path.resolve(process.cwd(), raw)
  if (!fs.existsSync(cacheFile)) {
    return
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, "utf8")) as SdkRecoveryCacheFile
    delete parsed.assets[String(assetId)]
    fs.writeFileSync(
      cacheFile,
      JSON.stringify({
        version: 2,
        assets: parsed.assets || {}
      }, null, 2) + "\n",
      "utf8"
    )
  } catch {
    return
  }
}

function persistSdkPendingExecution(record: PendingSdkExecutionRecord): string | null {
  const raw = process.env.SDK_PENDING_EXECUTIONS_FILE
  if (!raw) {
    return null
  }

  const outputFile = path.resolve(process.cwd(), raw)
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.appendFileSync(outputFile, `${JSON.stringify(record)}\n`)
  return outputFile
}

function resolveProofAssetsBasePath(explicitPath?: string): string {
  return explicitPath || process.env.PARLY_SDK_ASSETS_PATH || DEFAULT_PROOF_ASSETS_PATH
}

function resolveReceiptTimeoutMs(): number {
  const raw = process.env.SDK_RECEIPT_TIMEOUT_MS
  if (!raw) {
    return DEFAULT_RECEIPT_TIMEOUT_MS
  }

  const value = Number(raw)
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new Error("SDK_RECEIPT_TIMEOUT_MS invalid")
  }

  return value
}

export class ParlySDK {
  readonly config: ParlySDKConfig
  private readonly account
  private readonly publicClient
  private readonly walletClient

  constructor(config: ParlySDKConfig) {
    this.config = config

    const chain = defineChain({
      id: config.tempoChainId,
      name: "Tempo",
      nativeCurrency: { name: "TMP", symbol: "TMP", decimals: 18 },
      rpcUrls: { default: { http: [config.tempoRpcUrl] } }
    })

    this.account = privateKeyToAccount(config.privateKeyHex)
    this.publicClient = createPublicClient({
      chain,
      transport: http(config.tempoRpcUrl)
    })
    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(config.tempoRpcUrl)
    })
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): ParlySDK {
    assertSdkProductionEnv(env)

    return new ParlySDK({
      privateKeyHex: requireEnv("AGENT_PRIVATE_KEY", env) as `0x${string}`,
      tempoRpcUrl: requireEnv("TEMPO_RPC_URL", env),
      tempoChainId: requirePositiveChainIdValue(
        env.TEMPO_CHAIN_ID ?? env.NEXT_PUBLIC_TEMPO_CHAIN_ID,
        "TEMPO_CHAIN_ID/NEXT_PUBLIC_TEMPO_CHAIN_ID"
      ),
      tempoLzEid: resolveTempoSettlementEid(
        env.SETTLEMENT_DOMAIN_ID ??
          env.NEXT_PUBLIC_SETTLEMENT_DOMAIN_ID
      ),
      ponderGraphqlUrl: env.PONDER_GRAPHQL_URL ?? env.NEXT_PUBLIC_PONDER_GRAPHQL_URL,
      proofAssetsBasePath: env.PARLY_SDK_ASSETS_PATH
    })
  }

  getLaunchContext(): ParlyLaunchContext {
    return {
      ...this.config,
      publicSurfaces: PUBLIC_SURFACES
    }
  }

  describe(): string {
    return `ParlySDK V16.9.9 ready for Tempo chain ${this.config.tempoChainId} and settlement domain ${this.config.tempoLzEid}.`
  }

  async authenticate(recoveryMessage: string) {
    return (await this.walletClient.signMessage({
      account: this.account,
      message: recoveryMessage
    })) as `0x${string}`
  }

  async getRecoveryKeypair(args: {
    assetId: 1 | 2
    poolAddress: `0x${string}`
  }) {
    const recoveryMessage = buildSdkRecoveryAuthMessage({
      chainId: this.config.tempoChainId,
      settlementDomainId: this.config.tempoLzEid,
      poolAddress: args.poolAddress,
      assetPoolIdentity: `Tempo launch asset ${args.assetId} pool ${args.poolAddress.toLowerCase()}`
    })
    const signature = await this.authenticate(recoveryMessage)
    return deriveRecoveryKeypair(signature, recoveryMessage)
  }

  async recoverLargestNote(assetId: 1 | 2, poolAddress?: `0x${string}`) {
    const resolvedPoolAddress =
      poolAddress ||
      (assetId === 1
        ? (process.env.NEXT_PUBLIC_USDC_POOL as `0x${string}` | undefined)
        : (process.env.NEXT_PUBLIC_USDT_POOL as `0x${string}` | undefined)) ||
      (process.env.PARLY_RECOVERY_POOL_ADDRESS as `0x${string}` | undefined)

    if (!resolvedPoolAddress) {
      throw new Error("poolAddress is required for v2 SDK recovery.")
    }

    const keypair = await this.getRecoveryKeypair({ assetId, poolAddress: resolvedPoolAddress })
    const latestHeads = await fetchRecoveryHeads(assetId, {
      ponderUrl: this.config.ponderGraphqlUrl
    })
    const cached = loadSdkRecoveryCache(assetId)

    if (cached && recoveryHeadsEqual(cached.heads, latestHeads)) {
      try {
        return {
          best: cached.best
            ? {
                payload: await openSealedNoteEnvelope(
                  keypair.publicKeyB64,
                  keypair.privateKeyB64,
                  cached.best.envelope
                ),
                commitment: cached.best.commitment,
                nullifierHash: cached.best.nullifierHash,
                amount: BigInt(cached.best.amount)
              }
            : null,
          leaves: cached.leaves,
          kp: keypair
        }
      } catch {
        clearSdkRecoveryCache(assetId)
      }
    }

    const [envelopes, leaves, nullifiers] = (await Promise.all([
      fetchEnvelopes(assetId, { ponderUrl: this.config.ponderGraphqlUrl }),
      fetchLeaves(assetId, { ponderUrl: this.config.ponderGraphqlUrl }),
      fetchNullifiers(assetId, { ponderUrl: this.config.ponderGraphqlUrl })
    ])) as [EnvelopeRow[], LeafRow[], NullifierRow[]]

    const leafSet = new Set(leaves.map((leaf: any) => String(leaf.commitment).toLowerCase()))
    const spentSet = new Set(
      nullifiers.map((nullifier: any) => String(nullifier.nullifierHash).toLowerCase())
    )

      let best:
        | {
            payload: NoteEnvelopePayload
            envelope: `0x${string}`
            commitment: `0x${string}`
            nullifierHash: `0x${string}`
            amount: bigint
        }
      | null = null

    for (const envelope of envelopes) {
      try {
        const payload = await openSealedNoteEnvelope(
          keypair.publicKeyB64,
          keypair.privateKeyB64,
          envelope.envelope as `0x${string}`
        )

        const reconstructed = await reconstructEnvelopeNote(payload)
        if (
          String(reconstructed.commitment).toLowerCase() !==
          String(envelope.commitment).toLowerCase()
        ) {
          continue
        }
        if (!leafSet.has(String(reconstructed.commitment).toLowerCase())) {
          continue
        }
        if (spentSet.has(String(reconstructed.nullifierHash).toLowerCase())) {
          continue
        }

        const row = {
          payload,
          envelope: envelope.envelope as `0x${string}`,
          commitment: reconstructed.commitment,
          nullifierHash: reconstructed.nullifierHash,
          amount: BigInt(payload.amount)
        }

        if (!best || row.amount > best.amount) {
          best = row
        }
      } catch {
        continue
      }
    }

    saveSdkRecoveryCache({
      version: 2,
      assetId,
      heads: latestHeads,
      leaves,
      best: best
        ? {
            envelope: best.envelope,
            commitment: best.commitment,
            nullifierHash: best.nullifierHash,
            amount: best.amount.toString()
          }
        : null
    })

    return { best, leaves, kp: keypair }
  }

  async executeAgenticPayment(params: ExecutePaymentParams | ExecuteBatchPaymentParams): Promise<ExecutePaymentOutcome> {
    let approvalToken: `0x${string}` | null = null
    let submittedHash: `0x${string}` | null = null
    let shouldCleanupApproval = false
    let finalHash: `0x${string}` | null = null
    let replacementReason: "replaced" | "repriced" | "cancelled" | null = null
    let pendingRecordOutput: BatchPaymentOutput | null = null
    let activeNullifierHash =
      "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`

    try {
      if (!isAddress(params.poolAddress) || params.poolAddress.toLowerCase() === ZERO_ADDRESS) {
        throw new Error("Pool address must be a non-zero address.")
      }

      const outputs =
        "outputs" in params
          ? params.outputs
          : [
              {
                destination: params.destination,
                amount: params.amount,
                destinationEid: params.destinationEid
              }
            ]
      if (outputs.length < 1 || outputs.length > 10) {
        throw new Error("Batch send supports 1 to 10 payout lanes.")
      }
      pendingRecordOutput = outputs[0] ?? null

      const { best, leaves, kp } = await this.recoverLargestNote(params.assetId, params.poolAddress)
      if (!best) {
        throw new Error("No live note found.")
      }
      activeNullifierHash = best.nullifierHash as `0x${string}`

      const poseidon = await buildPoseidon()
      const zeroElement = BigInt(poseidon.F.toString(poseidon([0n, 0n]))).toString()

      const tree = new (MerkleTree as any)(
        32,
        leaves.map((leaf) => String(leaf.commitment)),
        {
          hashFunction: (left: any, right: any) =>
            poseidon.F.toString(poseidon([BigInt(left), BigInt(right)])),
          zeroElement
        }
      )

      const noteIndex = leaves.findIndex(
        (leaf) =>
          String(leaf.commitment).toLowerCase() === String(best.commitment).toLowerCase()
      )
      if (noteIndex === -1) {
        throw new Error("Note not found in Merkle tree.")
      }

      const { pathElements, pathIndices } = tree.path(noteIndex) as {
        pathElements: Array<string | bigint | number>
        pathIndices: number[]
      }

      const localEid = this.config.tempoLzEid
      for (const output of outputs) {
        if (!isAddress(output.destination) || output.destination.toLowerCase() === ZERO_ADDRESS) {
          throw new Error("Destination must be a non-zero address.")
        }
        if (output.destinationEid !== localEid) {
          throw new Error(
            "Cross-chain private sends are not enabled in this SDK path. Use the public payment route APIs for supported cross-chain deposits."
          )
        }
      }
      const outputAmounts = outputs.map((output) => parseUnits(output.amount, 6))
      const amount = outputAmounts.reduce((sum, value) => sum + value, 0n)

      const feeBps = (await this.publicClient.readContract({
        address: params.poolAddress,
        abi: POOL_ABI,
        functionName: "globalFeeBps"
      })) as bigint

      const protocolFee = (amount * feeBps) / 10_000n
      const executorFee = 0n
      const changeAmount = best.amount - amount - protocolFee - executorFee
      if (changeAmount < 0n) {
        throw new Error("Insufficient balance.")
      }

      let option = "0x" as `0x${string}`
      let quotedCrossChainFee = 0n

      let newChangeCommitment =
        "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`
      let newChangeEnvelope = "0x" as `0x${string}`
      let newChangeSecret = "0"
      let newChangeNullifier = "0"

      if (changeAmount > 0n) {
        const freshChange = await createFreshNote(
          kp.publicKeyB64,
          best.payload.depositor,
          params.assetId,
          changeAmount.toString(),
          "change"
        )

        newChangeCommitment = freshChange.commitment
        newChangeEnvelope = freshChange.envelope
        newChangeSecret = freshChange.secret
        newChangeNullifier = freshChange.nullifier
      }

      const circuitInputs = {
        root: BigInt(tree.root).toString(),
        nullifierHash: BigInt(best.nullifierHash).toString(),
        protocol_fee: protocolFee.toString(),
        executor_fee: executorFee.toString(),
        total_input_amount: best.payload.amount,
        asset_id: params.assetId.toString(),
        local_eid: String(localEid),
        recipients: [
          ...outputs.map((output) => BigInt(output.destination).toString()),
          ...Array(10 - outputs.length).fill("0")
        ],
        amounts: [
          ...outputAmounts.map((outputAmount) => outputAmount.toString()),
          ...Array(10 - outputs.length).fill("0")
        ],
        dest_eids: [
          ...outputs.map((output) => String(output.destinationEid)),
          ...Array(10 - outputs.length).fill(String(localEid))
        ],
        new_change_commitment: BigInt(newChangeCommitment).toString(),
        relayer: BigInt(this.account.address).toString(),
        secret: best.payload.secret,
        nullifier: best.payload.nullifier,
        depositor: BigInt(best.payload.depositor).toString(),
        pathElements: pathElements.map((element) => BigInt(element).toString()),
        pathIndices,
        new_change_secret: newChangeSecret,
        new_change_nullifier: newChangeNullifier
      }

      const assetsBasePath = resolveProofAssetsBasePath(
        params.proofAssetsBasePath || this.config.proofAssetsBasePath
      )

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        circuitInputs,
        `${assetsBasePath}/joinsplit.wasm`,
        `${assetsBasePath}/joinsplit_final.zkey`
      )

      const pA = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])] as [bigint, bigint]

      const pB = [
        [BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])],
        [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]
      ] as [[bigint, bigint], [bigint, bigint]]

      const pC = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])] as [bigint, bigint]

      const mappedSignals = publicSignals.map((signal: string) => BigInt(signal))
      const receiptTimeoutMs = resolveReceiptTimeoutMs()

      if (quotedCrossChainFee > 0n) {
        approvalToken = (await this.publicClient.readContract({
          address: params.poolAddress,
          abi: POOL_ABI,
          functionName: "lzFeeToken"
        })) as `0x${string}`

        await safeApproveExactSdk({
          token: approvalToken,
          spender: params.poolAddress,
          amount: quotedCrossChainFee,
          owner: this.account.address,
          publicClient: this.publicClient,
          walletClient: this.walletClient
        })
      }

      submittedHash = await this.walletClient.writeContract({
        address: params.poolAddress,
        abi: POOL_ABI,
        functionName: "batchWithdraw",
        args: [
          pA,
          pB,
          pC,
          mappedSignals as any,
          [...outputs.map((output) => output.destination), ...Array(10 - outputs.length).fill(ZERO_ADDRESS)],
          [...outputAmounts, ...Array(10 - outputs.length).fill(0n)],
          [...outputs.map((output) => output.destinationEid), ...Array(10 - outputs.length).fill(localEid)],
          newChangeCommitment,
          newChangeEnvelope,
          [option, ...Array(9).fill("0x")]
        ]
      })

      finalHash = submittedHash

      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: submittedHash,
        timeout: receiptTimeoutMs,
        onReplaced: (replacement) => {
          replacementReason = replacement.reason
          finalHash = replacement.transactionReceipt.transactionHash as `0x${string}`
        }
      })

      if (replacementReason === "cancelled") {
        shouldCleanupApproval = true
        return {
          kind: "terminal_failure",
          hash: finalHash || submittedHash,
          message: "Payment transaction cancelled before inclusion."
        }
      }

      if (replacementReason === "replaced") {
        shouldCleanupApproval = true
        return {
          kind: "terminal_failure",
          hash: finalHash || submittedHash,
          message: "Payment transaction replaced before inclusion."
        }
      }

      if (receipt.status !== "success") {
        shouldCleanupApproval = true
        return {
          kind: "terminal_failure",
          hash: finalHash || submittedHash,
          message: `Payment transaction reverted: ${finalHash || submittedHash}`
        }
      }

      return { kind: "success", hash: finalHash || submittedHash }
    } catch (error: any) {
      const message = error?.message || String(error)

      if (submittedHash) {
        const persistedTo = persistSdkPendingExecution({
          version: 1,
          recordedAt: Math.floor(Date.now() / 1000),
          submittedHash: finalHash || submittedHash,
          nullifierHash: activeNullifierHash,
          pool: params.poolAddress,
          destination: pendingRecordOutput?.destination ?? ZERO_ADDRESS,
          destinationEid: pendingRecordOutput?.destinationEid ?? this.config.tempoLzEid,
          assetId: params.assetId,
          approvalToken,
          approvalSpender: params.poolAddress,
          reason: message
        })

        return {
          kind: "pending_confirmation",
          hash: finalHash || submittedHash,
          message,
          persistedTo
        }
      }

      shouldCleanupApproval = true
      return { kind: "terminal_failure", message }
    } finally {
      if (approvalToken && (shouldCleanupApproval || !submittedHash)) {
        try {
          await safeApproveExactSdk({
            token: approvalToken,
            spender: params.poolAddress,
            amount: 0n,
            owner: this.account.address,
            publicClient: this.publicClient,
            walletClient: this.walletClient
          })
        } catch (cleanupError: any) {
          console.error(`SDK cleanup error: ${cleanupError.message || cleanupError}`)
        }
      }
    }
  }

  async sendShieldedPayment(
    params?: ExecutePaymentParams
  ): Promise<ExecutePaymentOutcome> {
    if (!params) {
      return {
        kind: "terminal_failure",
        message: "Payment params required."
      }
    }

    return this.executeAgenticPayment(params)
  }

  async sendShieldedBatchPayment(
    params?: ExecuteBatchPaymentParams
  ): Promise<ExecutePaymentOutcome> {
    if (!params) {
      return {
        kind: "terminal_failure",
        message: "Batch payment params required."
      }
    }

    return this.executeAgenticPayment(params)
  }

  /**
   * @deprecated Use sendShieldedPayment() for new Phase 3 integrations.
   * This legacy alias remains for SDK compatibility and delegates to the
   * Send-named API without changing payment behavior.
   */
  async executeShieldedPayment(
    params?: ExecutePaymentParams
  ): Promise<ExecutePaymentOutcome> {
    return this.sendShieldedPayment(params)
  }
}
