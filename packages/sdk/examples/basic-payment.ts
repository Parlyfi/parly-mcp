import { ParlySDK } from "../src/index.js"

function requireValue(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} missing`)
  }
  return value
}

async function main() {
  const sdk = ParlySDK.fromEnv()

  const outcome = await sdk.sendShieldedPayment({
    destination: requireValue("PARLY_EXAMPLE_DESTINATION") as `0x${string}`,
    amount: requireValue("PARLY_EXAMPLE_AMOUNT"),
    assetId: Number(requireValue("PARLY_EXAMPLE_ASSET_ID")) as 1 | 2,
    destinationEid: Number(requireValue("PARLY_EXAMPLE_DESTINATION_EID")),
    poolAddress: requireValue("PARLY_EXAMPLE_POOL_ADDRESS") as `0x${string}`
  })

  console.log(sdk.describe())
  console.log(outcome)
}

void main()
