import preset from "@sb0rka/ui/tailwind-preset"
import { content as uiContent } from "@sb0rka/ui/tailwind-content"


/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ["./index.html", "./src/**/*.{ts,tsx}", ...uiContent],
}
