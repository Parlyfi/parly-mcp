import { ParlySDK } from "../src/index.js"

async function main() {
  const sdk = new ParlySDK({
    privateKeyHex: "0x1111111111111111111111111111111111111111111111111111111111111111",
    tempoRpcUrl: "https://rpc.example.tempo.xyz",
    tempoChainId: 4217,
    tempoLzEid: 4217
  })

  console.log(await sdk.executeShieldedPayment())
}

void main()
