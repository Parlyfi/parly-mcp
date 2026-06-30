import { ParlyMppAdapter, ParlySDK } from "../src/index.js"

function requireValue(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} missing`)
  }
  return value
}

async function main() {
  const sdk = ParlySDK.fromEnv()
  const adapter = new ParlyMppAdapter(sdk)

  const session = await adapter.createSession({
    sessionId: "session-demo",
    counterparty: requireValue("PARLY_EXAMPLE_COUNTERPARTY") as `0x${string}`,
    assetId: Number(requireValue("PARLY_EXAMPLE_ASSET_ID")) as 1 | 2,
    spendLimit: requireValue("PARLY_EXAMPLE_SPEND_LIMIT"),
    destinationEid: Number(requireValue("PARLY_EXAMPLE_DESTINATION_EID")),
    poolAddress: requireValue("PARLY_EXAMPLE_POOL_ADDRESS") as `0x${string}`
  })
  const preflight = adapter.preflightSessionPayment(
    {
      sessionId: session.sessionId,
      destination: requireValue("PARLY_EXAMPLE_DESTINATION") as `0x${string}`,
      amount: requireValue("PARLY_EXAMPLE_AMOUNT")
    },
    session
  )

  console.log(sdk.getLaunchContext())
  console.log(session)
  console.log(preflight)
}

void main()
