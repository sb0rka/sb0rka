import * as React from "react"
import { ExternalLink, Lock } from "lucide-react"
import { cn } from "../../lib/utils"
import { Badge } from "./badge"
import { Button } from "./button"
import {
  itemLabelClass,
  navIconClass,
  rowChromeClass,
  sidebarIconSlotClass,
} from "./sidebar-rail"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip"

type ItemChildProps = { className?: string; title?: string }

const trailingTransitionClass =
  "overflow-hidden transition-[max-width,opacity] duration-[400ms] ease-out"

function trailingSlotClass(collapsed: boolean) {
  return cn(
    "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2",
    trailingTransitionClass,
    collapsed ? "max-w-0 opacity-0" : "max-w-6 opacity-100",
  )
}

export interface SidebarUpgradeActionProps {
  label: string
  href?: string
  onClick?: (event: React.MouseEvent<HTMLElement>) => void
  className?: string
}

export function SidebarUpgradeAction({
  label,
  href,
  onClick,
  className,
}: SidebarUpgradeActionProps) {
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    onClick?.(event)
  }

  if (href) {
    return (
      <Button variant="outline" size="sm" className={className} asChild>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
        >
          {label}
        </a>
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      onClick={handleClick}
    >
      {label}
    </Button>
  )
}

export interface SidebarItemProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  collapsed?: boolean
  external?: boolean
  locked?: boolean
  /** Already translated badge text, shown with the upgrade action. */
  lockedBadge?: string
  /** Already translated upgrade button label. */
  upgradeLabel?: string
  upgradeHref?: string
  onUpgradeClick?: (event: React.MouseEvent<HTMLElement>) => void
  asChild?: boolean
  className?: string
  children?: React.ReactElement
}

export function SidebarItem({
  icon: Icon,
  label,
  active = false,
  collapsed = false,
  external = false,
  locked = false,
  lockedBadge,
  upgradeLabel,
  upgradeHref,
  onUpgradeClick,
  asChild = false,
  className,
  children,
}: SidebarItemProps) {
  const showActive = active && !locked
  const itemClass = cn(
    "group relative block h-9 w-full rounded-lg text-sm font-medium",
    locked ? "cursor-default" : "pressable",
    showActive ? "text-foreground" : "text-muted-foreground",
    className,
  )
  const title = collapsed && !locked ? label : undefined
  const hasTrailing = external || locked

  const content = (
    <>
      <span
        className={cn(
          rowChromeClass(collapsed),
          showActive ? "bg-muted" : "group-hover:bg-muted/50",
        )}
        aria-hidden
      />
      <Icon className={cn(navIconClass, sidebarIconSlotClass)} />
      <span
        className={cn(
          itemLabelClass(collapsed),
          "absolute top-1/2 -translate-y-1/2",
          hasTrailing && "right-9",
        )}
      >
        {label}
      </span>
      {external && !locked ? (
        <span className={trailingSlotClass(collapsed)} aria-hidden>
          <ExternalLink className="h-4 w-4" />
        </span>
      ) : null}
      {locked ? (
        <>
          <span className={trailingSlotClass(collapsed)} aria-hidden>
            <Lock className="h-4 w-4" />
          </span>
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-1/2 z-20 flex h-3.5 w-3.5 -translate-y-[20%] items-center justify-center rounded-full bg-background text-muted-foreground",
              "[left:calc(30px-var(--sidebar-nav-pl)+4px)]",
              "transition-opacity duration-[400ms] ease-out",
              collapsed ? "opacity-100" : "opacity-0",
            )}
          >
            <Lock className="h-2.5 w-2.5" />
          </span>
        </>
      ) : null}
    </>
  )

  // A locked row must not follow the section route, and the upgrade control
  // cannot be nested inside that link.
  let item: React.ReactElement
  if (locked) {
    item = (
      <div
        className={itemClass}
        aria-disabled="true"
        aria-label={lockedBadge ? `${label}. ${lockedBadge}` : label}
      >
        {content}
      </div>
    )
  } else if (asChild && React.isValidElement<ItemChildProps>(children)) {
    item = React.cloneElement(
      children,
      {
        className: cn(itemClass, children.props.className),
        ...(title ? { title } : {}),
      },
      content,
    )
  } else {
    item = (
      <button type="button" className={itemClass} title={title}>
        {content}
      </button>
    )
  }

  const showUpgradeTooltip = Boolean(lockedBadge) || Boolean(upgradeLabel)
  if (!locked || (!collapsed && !showUpgradeTooltip)) return item

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{item}</TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={8}
          className="flex w-max flex-col items-stretch gap-2"
        >
          {collapsed ? <span className="font-medium">{label}</span> : null}
          {lockedBadge ? (
            <Badge variant="inactive" className="w-fit">
              {lockedBadge}
            </Badge>
          ) : null}
          {upgradeLabel ? (
            <SidebarUpgradeAction
              label={upgradeLabel}
              href={upgradeHref}
              onClick={onUpgradeClick}
            />
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
