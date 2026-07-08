import { cn } from "@/lib/utils"

export const railTransitionClass = "transition-[width] duration-[400ms] ease-out"

/** Keeps label left edge at 56px from sidebar (matches expanded left-10 + nav pl-4). */
export const labelSlotClass = "left-[calc(56px-var(--sidebar-nav-pl))]"

export const labelTransitionClass =
  "transition-[max-width,opacity] duration-[400ms] ease-out"

/** Shared horizontal anchor — 30px from the sidebar edge (row stays full-width). */
export const sidebarAnchorClass =
  "absolute [left:calc(30px-var(--sidebar-nav-pl))] -translate-x-1/2"

export const sidebarIconSlotClass = cn(
  "pointer-events-none top-1/2 z-10 -translate-y-1/2",
  sidebarAnchorClass,
)

export const navIconClass =
  "h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110"

/** Left edge of selector / divider — matches collapsed w-9 pill (12px from sidebar). */
export const sidebarRailStartClass =
  "left-[calc(30px-var(--sidebar-nav-pl)-1.125rem)]"

export const railWidthClass = (collapsed: boolean) =>
  collapsed
    ? "w-9"
    : "w-[calc(100%-30px+var(--sidebar-nav-pl)+1.125rem)]"

export function rowChromeClass(collapsed: boolean) {
  return cn(
    "pointer-events-none absolute inset-y-0 z-0 rounded-lg",
    sidebarRailStartClass,
    railTransitionClass,
    railWidthClass(collapsed),
  )
}

export function dividerClass(collapsed: boolean) {
  return cn(
    "absolute left-[calc(30px-var(--sidebar-nav-pl)-1.125rem)] h-px shrink-0",
    railTransitionClass,
    railWidthClass(collapsed),
  )
}

export function itemLabelClass(collapsed: boolean) {
  return cn(
    "pointer-events-none overflow-hidden whitespace-nowrap",
    labelSlotClass,
    labelTransitionClass,
    collapsed ? "max-w-0 opacity-0" : "max-w-[12rem] opacity-100",
  )
}
