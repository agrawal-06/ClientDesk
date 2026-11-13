import { build } from "esbuild";
await build({
  entryPoints: ["server/function.js"], bundle: true, platform: "node", target: "node24",
  format: "esm", minify: true, outfile: "api-dist/index.mjs",
  banner: { js: "import{createRequire as ___cr}from'module';import{fileURLToPath as ___f}from'url';import{dirname as ___d}from'path';const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);" },
});

