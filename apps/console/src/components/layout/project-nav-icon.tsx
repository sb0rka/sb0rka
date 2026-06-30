import type { ComponentType, ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { Link, useLocation } from "react-router-dom"
import { entranceEase } from "@/lib/motion"
import { cn } from "@/lib/utils"
import {
  itemLabelClass,
  navIconClass,
  rowChromeClass,
  sidebarIconSlotClass,
} from "@/components/layout/sidebar-rail"

export type ProjectNavIconAnimation = "chart" | "database" | "key" | "settings"

const navIconTransition = {
  duration: 0.2,
  ease: entranceEase,
} as const

const navIconVariants: Record<ProjectNavIconAnimation, Variants> = {
  chart: {
    rest: { scale: 1, y: 0 },
    hover: { scale: 1.1, y: -1, transition: navIconTransition },
  },
  database: {
    rest: { scale: 1, y: 0 },
    hover: { scale: 1.06, y: -2, transition: navIconTransition },
  },
  key: {
    rest: { rotate: 0 },
    hover: { rotate: -18, transition: navIconTransition },
  },
  settings: {
    rest: { rotate: 0 },
    hover: { rotate: 72, transition: navIconTransition },
  },
}


interface ProjectNavIconProps {
  icon: ComponentType<{ className?: string }>
  animation: ProjectNavIconAnimation
  hovered: boolean
}

function ProjectNavIcon({ icon: Icon, animation, hovered }: ProjectNavIconProps) {
  const reduceMotion = useReducedMotion()
  const MotionIcon = useMemo(() => motion.create(Icon), [Icon])

  if (reduceMotion) {
    return (
      <span className={sidebarIconSlotClass}>
        <Icon className={navIconClass} />
      </span>
    )
  }

  return (
    <span className={sidebarIconSlotClass}>
      <MotionIcon
        className={navIconClass}
        variants={navIconVariants[animation]}
        initial={false}
        animate={hovered ? "hover" : "rest"}
      />
    </span>
  )
}

interface ProjectNavLinkProps {
  to: string
  isActive: boolean
  icon: ComponentType<{ className?: string }>
  animation: ProjectNavIconAnimation
  collapsed?: boolean
  children: ReactNode
}

export function ProjectNavLink({
  to,
  isActive,
  icon,
  animation,
  collapsed = false,
  children,
}: ProjectNavLinkProps) {
  const location = useLocation()
  const [hovered, setHovered] = useState(false)
  const label = typeof children === "string" ? children : undefined

  useEffect(() => {
    setHovered(false)
  }, [location.pathname, location.search])

  return (
    <Link
      to={to}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        "group relative block h-9 w-full rounded-lg text-sm font-medium pressable",
        isActive ? "text-foreground" : "text-muted-foreground",
      )}
      title={collapsed ? label : undefined}
    >
      <span
        className={cn(
          rowChromeClass(collapsed),
          isActive ? "bg-muted" : "group-hover:bg-muted/50",
        )}
        aria-hidden
      />
      <ProjectNavIcon icon={icon} animation={animation} hovered={hovered} />
      <span
        className={cn(
          itemLabelClass(collapsed),
          "absolute top-1/2 -translate-y-1/2",
        )}
      >
        {children}
      </span>
    </Link>
  )
}
