import type { Plugin } from "vite"
import type { IncomingMessage, ServerResponse } from "node:http"
import { handleMockRequest } from "./handlers"
import { MockStore } from "./state"

export function mockApiPlugin(enabled: boolean): Plugin {
  const store = new MockStore()

  return {
    name: "sb0rka-mock-api",
    configureServer(server) {
      if (!enabled) return

      server.middlewares.use((req, res, next) => {
        void route(req, res, next)
      })

      async function route(
        req: IncomingMessage,
        res: ServerResponse,
        next: (err?: unknown) => void,
      ): Promise<void> {
        try {
          const handled = await handleMockRequest(req, res, store)
          if (handled) return
          next()
        } catch (error) {
          next(error)
        }
      }

      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address()
        const host = typeof address === "object" && address ? address.port : 3000
        console.log("")
        console.log("  Mock API enabled (auth + platform)")
        console.log("  Login with any credentials, e.g. demo / demo")
        console.log(`  Open on phone: http://<your-lan-ip>:${host}`)
        console.log("")
      })
    },
  }
}
