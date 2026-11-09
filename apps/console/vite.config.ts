import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "tailwindcss"
import autoprefixer from "autoprefixer"
import { mockApiPlugin } from "./mock/mock-api-plugin"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const useMockApi = env.VITE_USE_MOCK_API === "true"

  return {
  base: "/",
  plugins: [react(), mockApiPlugin(useMockApi)],
  css: {
    postcss: {
      plugins: [tailwindcss(), autoprefixer()],
    },
  },
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    host: useMockApi,
    port: 3000,
    strictPort: true,
  },
}
})
