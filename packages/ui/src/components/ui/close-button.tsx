import * as React from "react"
import { X } from "lucide-react"
import { buttonPressClass } from "./button"
import { cn } from "../../lib/utils"


const CloseButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      "rounded-sm opacity-70 ring-offset-background hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground",
      buttonPressClass,
      className,
    )}
    {...props}
    type="button"
  >
    <X className="h-4 w-4" aria-hidden />
  </button>
))
CloseButton.displayName = "CloseButton"

export { CloseButton }
