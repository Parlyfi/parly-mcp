import { createRequire } from "node:module"
import { encodePacked, keccak256 } from "viem"
import {
  buildRecoveryAuthMessage,
  type ParlyRecoveryEnvironment,
  type RecoveryAuthContext
} from "@parly/shared-types"

const require = createRequire(import.meta.url)
const sodium = require("libsodium-wrappers-sumo") as {
  ready: Promise<void>
  crypto_box_SEEDBYTES: number
  base64_variants: { ORIGINAL: string }
  crypto_box_seed_keypair(seed: Uint8Array): {
    publicKey: Uint8Array
    privateKey: Uint8Array
  }
  to_base64(value: Uint8Array, variant: string): string
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

function envValue(env: NodeJS.ProcessEnv, name: string) {
  return env[name]?.trim() ?? ""
}

function sdkRecoveryEnvironment(env: NodeJS.ProcessEnv): ParlyRecoveryEnvironment {
  const raw = envValue(env, "PARLY_ENV") || envValue(env, "NEXT_PUBLIC_PARLY_ENV")
  if (raw === "mainnet" || raw === "staging" || raw === "development") {
    return raw
  }
  return "staging"
}

function requiredAddress(value: string | undefined, name: string): `0x${string}` {
  const normalized = value?.trim() ?? ""
  if (!ADDRESS_RE.test(normalized) || /^0x0{40}$/iu.test(normalized)) {
    throw new Error(`${name} must be configured as a non-zero 20-byte address before SDK note recovery.`)
  }
  return normalized as `0x${string}`
}

function requiredPositiveInteger(value: number | string | undefined, name: string) {
  const numeric = typeof value === "number" ? value : Number(value?.trim() ?? "")
  if (!Number.isInteger(numeric) || numeric <= 0) {
    throw new Error(`${name} must be configured as a positive integer before SDK note recovery.`)
  }
  return numeric
}

function assertExpectedProductionValue(env: NodeJS.ProcessEnv, name: string, actual: string) {
  const expected = envValue(env, `PARLY_EXPECTED_${name}`) || envValue(env, `NEXT_PUBLIC_EXPECTED_${name}`)
  if (!expected) {
    throw new Error(`PARLY_EXPECTED_${name} must be configured for mainnet SDK recovery.`)
  }
  if (expected.toLowerCase() !== actual.toLowerCase()) {
    throw new Error(`${name} does not match the expected mainnet SDK recovery config.`)
  }
}

export function buildSdkRecoveryAuthMessage(args: {
  chainId: number
  settlementDomainId?: number
  poolAddress: `0x${string}`
  verifierAddress?: `0x${string}`
  assetPoolIdentity: string
  env?: NodeJS.ProcessEnv
}) {
  const env = args.env ?? process.env
  const environment = sdkRecoveryEnvironment(env)
  const verifierAddress = requiredAddress(
    args.verifierAddress ||
      envValue(env, "GROTH16_VERIFIER_ADDRESS") ||
      envValue(env, "NEXT_PUBLIC_GROTH16_VERIFIER_ADDRESS"),
    "GROTH16_VERIFIER_ADDRESS"
  )
  const poolAddress = requiredAddress(args.poolAddress, "poolAddress")
  const officialOrigin =
    envValue(env, "PARLY_OFFICIAL_ORIGIN") ||
    envValue(env, "NEXT_PUBLIC_PARLY_OFFICIAL_ORIGIN") ||
    (environment === "mainnet" ? "https://parly.fi" : "https://staging.parly.fi")
  const currentOrigin =
    envValue(env, "PARLY_CURRENT_ORIGIN") ||
    envValue(env, "NEXT_PUBLIC_PARLY_CURRENT_ORIGIN") ||
    officialOrigin
  let settlementDomainIdInput: number | string | undefined = args.settlementDomainId
  if (settlementDomainIdInput == null) {
    settlementDomainIdInput =
      envValue(env, "SETTLEMENT_DOMAIN_ID") || envValue(env, "NEXT_PUBLIC_SETTLEMENT_DOMAIN_ID")
  }
  const settlementDomainId = requiredPositiveInteger(settlementDomainIdInput, "SETTLEMENT_DOMAIN_ID")

  if (environment === "mainnet") {
    assertExpectedProductionValue(env, "TEMPO_CHAIN_ID", String(args.chainId))
    assertExpectedProductionValue(env, "SETTLEMENT_DOMAIN_ID", String(settlementDomainId))
    assertExpectedProductionValue(env, "POOL", poolAddress)
    assertExpectedProductionValue(env, "GROTH16_VERIFIER_ADDRESS", verifierAddress)
  }

  const context: RecoveryAuthContext = {
    appName: "Parly",
    officialOrigin,
    currentOrigin,
    purpose: "private payment note recovery",
    recoveryVersion: 2,
    environment,
    chainId: args.chainId,
    settlementDomainId,
    poolAddress,
    verifierAddress,
    assetPoolIdentity: args.assetPoolIdentity
  }

  return buildRecoveryAuthMessage(context)
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  if (clean.length % 2 !== 0) {
    throw new Error("Invalid hex length")
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error("Invalid hex value")
  }

  const out = new Uint8Array(clean.length / 2)
  for (let index = 0; index < out.length; index += 1) {
    const byte = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16)
    if (Number.isNaN(byte)) {
      throw new Error("Invalid hex byte")
    }
    out[index] = byte
  }

  return out
}

export async function deriveRecoveryKeypair(signature: `0x${string}`, recoveryMessage: string) {
  await sodium.ready

  const seedHex = keccak256(
    encodePacked(
      ["bytes", "string", "string"],
      [signature, "PARLY_RECOVERY_SEED_V2", recoveryMessage]
    )
  )

  const seed = hexToBytes(seedHex).slice(0, sodium.crypto_box_SEEDBYTES)
  const keypair = sodium.crypto_box_seed_keypair(seed)

  return {
    publicKeyB64: sodium.to_base64(keypair.publicKey, sodium.base64_variants.ORIGINAL),
    privateKeyB64: sodium.to_base64(keypair.privateKey, sodium.base64_variants.ORIGINAL)
  }
}
