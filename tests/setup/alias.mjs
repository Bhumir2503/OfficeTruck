// Lets the tests import app modules that use the "@/" path alias, as
// tsconfig.json maps it: "@/lib/x" is <root>/lib/x.ts (or .tsx). Node
// strips the types itself.
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = new URL("../../", import.meta.url)

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = fileURLToPath(new URL(specifier.slice(2), root))
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        if (existsSync(base + ext)) {
          return nextResolve(pathToFileURL(base + ext).href, context)
        }
      }
    }
    return nextResolve(specifier, context)
  },
})
