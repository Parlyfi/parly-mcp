import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const sodium = require("libsodium-wrappers-sumo") as {
  ready: Promise<void>
  base64_variants: { ORIGINAL: string }
  randombytes_buf(length: number): Uint8Array
  from_base64(value: string, variant: string): Uint8Array
  from_string(value: string): Uint8Array
  to_string(value: Uint8Array): string
  crypto_box_seal(message: Uint8Array, recipientPub: Uint8Array): Uint8Array
  crypto_box_seal_open(
    ciphertext: Uint8Array,
    publicKey: Uint8Array,
    privateKey: Uint8Array
  ): Uint8Array | null
}
const { buildPoseidon } = require("circomlibjs") as {
  buildPoseidon(): Promise<any>
}

export type NoteEnvelopePayload = {
  version: 1
  kind: "deposit" | "change"
  assetId: 1 | 2
  amount: string
  secret: string
  nullifier: string
  depositor: string
  ownerRecoveryPubKeyB64: string
  createdAt: number
}

export type LiveNote = NoteEnvelopePayload & {
  commitment: `0x${string}`
  nullifierHash: `0x${string}`
  status: "live" | "spent"
}

function hexToBytes(hex: `0x${string}`): Uint8Array {
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

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}` as `0x${string}`
}

async function randomFieldElement(): Promise<string> {
  await sodium.ready
  const bytes = sodium.randombytes_buf(31) as Uint8Array
  const hex = Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
  return BigInt(`0x${hex}`).toString()
}

export async function calcInnerCommitment(
  secret: string,
  nullifier: string,
  depositor: string,
  assetId: 1 | 2
): Promise<string> {
  const poseidon = await buildPoseidon()
  const out = poseidon([
    BigInt(secret),
    BigInt(nullifier),
    BigInt(depositor),
    BigInt(assetId)
  ])
  return BigInt(poseidon.F.toString(out)).toString()
}

export async function calcFinalCommitment(
  innerCommitment: string,
  amount: string
): Promise<`0x${string}`> {
  const poseidon = await buildPoseidon()
  const out = poseidon([BigInt(innerCommitment), BigInt(amount)])
  return `0x${BigInt(poseidon.F.toString(out)).toString(16).padStart(64, "0")}` as `0x${string}`
}

export async function calcNullifierHash(
  secret: string,
  nullifier: string
): Promise<`0x${string}`> {
  const poseidon = await buildPoseidon()
  const out = poseidon([BigInt(secret), BigInt(nullifier)])
  return `0x${BigInt(poseidon.F.toString(out)).toString(16).padStart(64, "0")}` as `0x${string}`
}

export async function createSealedNoteEnvelope(
  recipientRecoveryPubKeyB64: string,
  payload: NoteEnvelopePayload
): Promise<`0x${string}`> {
  await sodium.ready
  const recipientPub = sodium.from_base64(
    recipientRecoveryPubKeyB64,
    sodium.base64_variants.ORIGINAL
  )
  const message = sodium.from_string(JSON.stringify(payload))
  const sealed = sodium.crypto_box_seal(message, recipientPub)
  return bytesToHex(sealed)
}

export async function openSealedNoteEnvelope(
  recipientPublicKeyB64: string,
  recipientPrivateKeyB64: string,
  envelope: `0x${string}`
): Promise<NoteEnvelopePayload> {
  await sodium.ready
  const publicKey = sodium.from_base64(
    recipientPublicKeyB64,
    sodium.base64_variants.ORIGINAL
  )
  const privateKey = sodium.from_base64(
    recipientPrivateKeyB64,
    sodium.base64_variants.ORIGINAL
  )
  const ciphertext = hexToBytes(envelope)
  const opened = sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey)
  if (!opened) {
    throw new Error("Envelope decryption failed")
  }
  return JSON.parse(sodium.to_string(opened)) as NoteEnvelopePayload
}

export async function reconstructEnvelopeNote(payload: NoteEnvelopePayload) {
  const innerCommitment = await calcInnerCommitment(
    payload.secret,
    payload.nullifier,
    payload.depositor,
    payload.assetId
  )
  const commitment = await calcFinalCommitment(innerCommitment, payload.amount)
  const nullifierHash = await calcNullifierHash(payload.secret, payload.nullifier)
  return { commitment, nullifierHash }
}

export async function createFreshNote(
  recipientRecoveryPubKeyB64: string,
  depositor: string,
  assetId: 1 | 2,
  amount: string,
  kind: "deposit" | "change"
) {
  const secret = await randomFieldElement()
  const nullifier = await randomFieldElement()
  const innerCommitment = await calcInnerCommitment(secret, nullifier, depositor, assetId)
  const commitment = await calcFinalCommitment(innerCommitment, amount)
  const nullifierHash = await calcNullifierHash(secret, nullifier)

  const payload: NoteEnvelopePayload = {
    version: 1,
    kind,
    assetId,
    amount,
    secret,
    nullifier,
    depositor,
    ownerRecoveryPubKeyB64: recipientRecoveryPubKeyB64,
    createdAt: Math.floor(Date.now() / 1000)
  }

  const envelope = await createSealedNoteEnvelope(recipientRecoveryPubKeyB64, payload)

  return {
    secret,
    nullifier,
    innerCommitment,
    commitment,
    nullifierHash,
    envelope,
    payload
  }
}
