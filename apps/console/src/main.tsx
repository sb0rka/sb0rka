import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import i18n from "@/lib/i18n"
import App from "./App.tsx"
import "./index.css"

console.warn(
  `%c SB0RKA ALPHA TEST %c ${i18n.t("app.alphaWarning")}`,
  "background:#f59e0b;color:#111827;padding:2px 8px;border-radius:4px 0 0 4px;font-weight:700;",
  "background:#111827;color:#f9fafb;padding:2px 8px;border-radius:0 4px 4px 0;"
)

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
