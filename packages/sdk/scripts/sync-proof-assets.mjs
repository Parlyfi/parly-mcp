import fs from "node:fs"
import path from "node:path"

const sdkRoot = path.resolve(import.meta.dirname, "..")
const repoRoot = path.resolve(sdkRoot, "..", "..")
const circuitsRoot = path.join(repoRoot, "packages", "circuits")
const sdkAssetsRoot = path.join(sdkRoot, "assets")

const requiredAssets = [
  {
    source: path.join(circuitsRoot, "joinsplit_js", "joinsplit.wasm"),
    destination: path.join(sdkAssetsRoot, "joinsplit.wasm")
  },
  {
    source: path.join(circuitsRoot, "joinsplit_final.zkey"),
    destination: path.join(sdkAssetsRoot, "joinsplit_final.zkey")
  }
]

for (const asset of requiredAssets) {
  if (!fs.existsSync(asset.source)) {
    throw new Error(`Missing proof asset source: ${asset.source}`)
  }
}

fs.mkdirSync(sdkAssetsRoot, { recursive: true })

for (const asset of requiredAssets) {
  fs.copyFileSync(asset.source, asset.destination)
  console.log(`Copied ${asset.source} -> ${asset.destination}`)
}
