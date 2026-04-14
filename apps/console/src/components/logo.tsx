import { cn } from "@/lib/utils"

export function SborkaLogo({ className }: { className?: string }) {
  return (
    <svg
      width="100"
      height="24"
      viewBox="0 0 100 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-foreground", className)}
    >
      <rect x="0" y="6" width="7" height="13" rx="0.75" fill="currentColor" />
      <rect x="8.5" y="6" width="16" height="13" rx="0.75" fill="currentColor" />
      <text
        x="30"
        y="18"
        className="text-[14px] font-semibold"
        fill="currentColor"
        fontFamily="Inter, sans-serif"
      >
        sb0rka
      </text>
    </svg>
  )
}
