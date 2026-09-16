import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // CommonJS that plain `node` runs with no build step: scripts/deploy-remote.sh
  // starts maintenance-server.js during the deploy swap, and the attachment
  // migration is a one-shot `node scripts/...` on the server. require() is
  // how they load modules, so they stay CommonJS and this rule is off for them.
  {
    files: ["maintenance-server.js", "scripts/migrate-attachments-to-disk.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ad-hoc local scripts, not part of the app (see .gitignore).
    "scratch/**",
  ]),
]);

export default eslintConfig;
