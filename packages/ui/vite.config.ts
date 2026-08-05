import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import dts from "vite-plugin-dts"
import { resolve } from "path"
import { copyFileSync, mkdirSync } from "fs"

/** Keep package internals bundled; let the app resolve everything from node_modules. */
function isExternal(id: string) {
  return !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0")
}

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  plugins: [
    react(),
    dts({
      insertTypesEntry: true,
      include: ["src"],
      exclude: ["src/styles/**"],
      tsconfigPath: "./tsconfig.app.json",
    }),
    {
      name: "copy-theme-css",
      closeBundle() {
        mkdirSync(resolve(__dirname, "dist/styles"), { recursive: true })
        copyFileSync(
          resolve(__dirname, "src/styles/variables.css"),
          resolve(__dirname, "dist/styles/variables.css"),
        )
        copyFileSync(
          resolve(__dirname, "src/styles/base.css"),
          resolve(__dirname, "dist/styles/base.css"),
        )
      },
    },
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      formats: ["es", "cjs"],
    },
    rollupOptions: {
      external: isExternal,
      output: [
        {
          format: "es",
          dir: "dist",
          preserveModules: true,
          preserveModulesRoot: "src",
          entryFileNames: "[name].js",
        },
        {
          format: "cjs",
          dir: "dist",
          preserveModules: true,
          preserveModulesRoot: "src",
          entryFileNames: "[name].cjs",
        },
      ],
    },
  },
})
