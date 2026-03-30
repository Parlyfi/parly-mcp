export type CanonicalRelayExecutionPayload = {
  pool: `0x${string}`
  pA: [`0x${string}`, `0x${string}`]
  pB: [[`0x${string}`, `0x${string}`], [`0x${string}`, `0x${string}`]]
  pC: [`0x${string}`, `0x${string}`]
  pubSignals: string[]
  recipients: `0x${string}`[]
  amounts: string[]
  destEids: number[]
  newChangeCommitment: `0x${string}`
  newChangeEnvelope: `0x${string}`
  lzOptions: `0x${string}`[]
}

export type RelayCipherBundle = {
  version: 1
  relayerAddress: `0x${string}`
  ciphertext: `0x${string}`
}

export type RelayerRegistryEntry = {
  executionAddress: `0x${string}`
  publicKeyB64: string
}

export type RelayerRegistryResponse = {
  items: RelayerRegistryEntry[]
  liveCount: number
  maxCount: number
  registryOpen: boolean
}

export type PublicSurfaceRecord = {
  name: "relayer" | "sdk" | "mcp"
  description: string
  audience: string
}
