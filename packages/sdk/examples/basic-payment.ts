import { ParlySDK } from "../src/index.js"

function requireValue(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} missing`)
  }
  return value
}

const sdk = new ParlySDK({
  privateKeyHex: requireValue("AGENT_PRIVATE_KEY") as `0x${string}`,
  tempoRpcUrl: requireValue("TEMPO_RPC_URL"),
  tempoChainId: Number(requireValue("TEMPO_CHAIN_ID")),
  tempoLzEid: Number(requireValue("TEMPO_LZ_EID"))
})

console.log(sdk.describe())
