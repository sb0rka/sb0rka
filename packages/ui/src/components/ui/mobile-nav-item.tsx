import {
  type ReactElement,
  type ComponentType,
  type CSSProperties,
  useRef,
  useState,
  useEffect,
  useCallback,
  cloneElement,
  isValidElement,
  useLayoutEffect,
} from "react"
import { createPortal } from "react-dom"
import { Lock } from "lucide-react"
import { cn } from "../../lib/utils"
import { Badge } from "./badge"
import { SidebarUpgradeAction } from "./sidebar-item"

type ItemChildProps = { className?: string }

const popupMargin = 12
const popupGap = 8
const popupMaxWidth = 288

export interface MobileNavItemProps {
  icon?: ComponentType<{ className?: string }>
  label: string
  active?: boolean
  locked?: boolean
  /** Already translated badge text, shown with the upgrade action. */
  lockedBadge?: string
  /** Already translated upgrade button label. */
  upgradeLabel?: string
  upgradeHref?: string
  onUpgradeClick?: (event: React.MouseEvent<HTMLElement>) => void
  asChild?: boolean
  className?: string
  children?: ReactElement
}

function popupStyle(anchor: DOMRect): CSSProperties {
  const width = Math.min(popupMaxWidth, window.innerWidth - popupMargin * 2)
  const centered = anchor.left + anchor.width / 2 - width / 2
  const left = Math.max(
    popupMargin,
    Math.min(centered, window.innerWidth - width - popupMargin),
  )
  return {
    left,
    width,
    bottom: window.innerHeight - anchor.top + popupGap,
  }
}

export function MobileNavItem({
  icon: Icon,
  label,
  active = false,
  locked = false,
  lockedBadge,
  upgradeLabel,
  upgradeHref,
  onUpgradeClick,
  asChild = false,
  className,
  children,
}: MobileNavItemProps) {
  const anchorRef = useRef<HTMLButtonElement>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const focusedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties>()
  const showActive = active && !locked
  const showUpgrade = Boolean(lockedBadge) || Boolean(upgradeLabel)
  const itemClass = cn(
    "flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-xl px-2 text-[11px] font-medium",
    locked ? "cursor-default text-muted-foreground" : "pressable",
    showActive
      ? "bg-background text-foreground shadow-sm dark:bg-muted dark:shadow-none"
      : !locked &&
          "text-muted-foreground hover:bg-background/60 hover:text-foreground dark:hover:bg-muted/50",
    className,
  )

  const placePopup = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    setStyle(popupStyle(anchor.getBoundingClientRect()))
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    placePopup()
    window.addEventListener("resize", placePopup)
    window.addEventListener("scroll", placePopup, true)
    return () => {
      window.removeEventListener("resize", placePopup)
      window.removeEventListener("scroll", placePopup, true)
    }
  }, [open, placePopup])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  useEffect(() => {
    if (!open) {
      focusedRef.current = false
      return
    }
    if (!style || focusedRef.current) return
    focusedRef.current = true
    popupRef.current?.focus()
  }, [open, style])

  const content = (
    <>
      {Icon ? (
        <span className="relative">
          <Icon className="size-4" />
          {locked ? (
            <span
              aria-hidden
              className="absolute -right-2 -top-1.5 flex size-3.5 items-center justify-center rounded-full bg-background text-muted-foreground"
            >
              <Lock className="size-2.5" />
            </span>
          ) : null}
        </span>
      ) : null}
      <span className="max-w-full truncate">{label}</span>
    </>
  )

  let control: ReactElement
  if (locked) {
    control = (
      <button
        ref={anchorRef}
        type="button"
        className={itemClass}
        aria-disabled="true"
        aria-haspopup={showUpgrade ? "dialog" : undefined}
        aria-expanded={showUpgrade ? open : undefined}
        aria-label={lockedBadge ? `${label}. ${lockedBadge}` : label}
        onClick={() => {
          if (showUpgrade) setOpen((value) => !value)
        }}
      >
        {content}
      </button>
    )
  } else if (asChild && isValidElement<ItemChildProps>(children)) {
    control = cloneElement(
      children,
      { className: cn(itemClass, children.props.className) },
      content,
    )
  } else {
    control = (
      <button type="button" className={itemClass}>
        {content}
      </button>
    )
  }

  const popup =
    open && style
      ? createPortal(
          <>
            <div className="fixed inset-0 z-50" onPointerDown={() => setOpen(false)} />
            <div
              ref={popupRef}
              role="dialog"
              tabIndex={-1}
              aria-label={lockedBadge ? `${label}. ${lockedBadge}` : label}
              style={style}
              className="fixed z-50 flex flex-col items-stretch gap-2 rounded-md border border-border bg-popover p-3 text-sm text-popover-foreground shadow-md outline-none"
            >
              <span className="font-medium">{label}</span>
              {lockedBadge ? (
                <Badge variant="inactive" className="w-fit">
                  {lockedBadge}
                </Badge>
              ) : null}
              {upgradeLabel ? (
                <SidebarUpgradeAction
                  label={upgradeLabel}
                  href={upgradeHref}
                  onClick={(event) => {
                    onUpgradeClick?.(event)
                    setOpen(false)
                  }}
                />
              ) : null}
            </div>
          </>,
          document.body,
        )
      : null

  return (
    <div className="min-w-0">
      {control}
      {locked && showUpgrade ? popup : null}
    </div>
  )
}
