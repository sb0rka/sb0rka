# @sb0rka/ui

UI component library for Sb0rka projects: React components (built on Radix UI), a Tailwind CSS preset and theme CSS variables.

## Installation

```bash
npm install @sb0rka/ui
```

All runtime dependencies are peer dependencies — install them in your app:

```bash
npm install react react-dom tailwindcss \
  @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-scroll-area \
  @radix-ui/react-separator @radix-ui/react-slot @radix-ui/react-tabs @radix-ui/react-tooltip \
  class-variance-authority clsx tailwind-merge framer-motion lucide-react
```

## Setup

### 1. Tailwind config

Add the preset and the package content globs so Tailwind picks up classes used inside the components:

```js
// tailwind.config.js
import preset from "@sb0rka/ui/tailwind-preset"
import { content as uiContent } from "@sb0rka/ui/tailwind-content"

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: ["./index.html", "./src/**/*.{ts,tsx}", ...uiContent],
}
```

For monorepo development against the workspace sources, use `contentWorkspace` from `@sb0rka/ui/tailwind-content` instead of `content`.

### 2. Theme CSS

Import the CSS variables and base styles once, e.g. in your entry point. `base.css` uses `@apply`, so it must go through your Tailwind/PostCSS pipeline (this is the default in a Vite app):

```ts
// main.tsx
import "@sb0rka/ui/variables.css"
import "@sb0rka/ui/base.css"
```

## Usage

```tsx
import { ThemeProvider, Button, Card, CardContent } from "@sb0rka/ui"

export function App() {
  return (
    <ThemeProvider defaultTheme="system">
      <Card>
        <CardContent>
          <Button>Click me</Button>
        </CardContent>
      </Card>
    </ThemeProvider>
  )
}
```

Components are also available via subpath imports, e.g. `@sb0rka/ui/components/ui/button`.

## What's inside

- **Primitives** — `Button`, `Badge`, `Card`, `Dialog`, `DropdownMenu`, `Input`, `Label`, `ScrollArea`, `Separator`, `Tabs`, `Textarea`, `Tooltip`, `FloatingHint`, `AlphaToast`.
- **Providers** — `ThemeProvider` (light/dark/system with view-transition animation), `ToastProvider`, `ConfirmDialogProvider`.
- **App components** — `ThemeToggle`, `LanguageSwitcher`, `Logo`.
- **Utilities** — `cn` (clsx + tailwind-merge).

## License

Apache-2.0
