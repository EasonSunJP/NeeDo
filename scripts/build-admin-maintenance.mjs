import { build } from "esbuild";

await build({
  entryPoints: {
    "provision-admin-six-month": "backend/scripts/provision-admin-six-month.ts",
    "check-admin-six-month": "backend/scripts/check-admin-six-month.cjs"
  },
  outdir: "backend/dist/maintenance",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  packages: "external",
  platform: "node",
  target: "node22",
  format: "cjs",
  logLevel: "info"
});
