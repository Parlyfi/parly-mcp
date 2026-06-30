import { ParlySDK } from "../src/index.js"

async function main() {
  const sdk = ParlySDK.fromEnv()
  console.log(
    await sdk.sendShieldedPayment({
      destination: "0x0000000000000000000000000000000000000000",
      amount: "1",
      assetId: 1,
      destinationEid: 40444,
      poolAddress: "0x0000000000000000000000000000000000000000"
    })
  )
}

void main()
