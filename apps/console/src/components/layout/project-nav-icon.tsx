import type { ComponentType, ReactNode } from "react"
import { useEffect, useState } from "react"
import { motion, useReducedMotion, type Variants } from "framer-motion"
import { Link, useLocation } from "react-router-dom"
import { entranceEase } from "@/lib/motion"
import { buttonPressClass } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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

const staticVariants: Variants = {
  rest: {},
  hover: {},
}

interface ProjectNavIconProps {
  icon: ComponentType<{ className?: string }>
  animation: ProjectNavIconAnimation
  hovered: boolean
}

function ProjectNavIcon({ icon: Icon, animation, hovered }: ProjectNavIconProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.span
      variants={reduceMotion ? staticVariants : navIconVariants[animation]}
      initial={false}
      animate={hovered ? "hover" : "rest"}
      className="inline-flex shrink-0"
    >
      <Icon className="h-4 w-4" />
    </motion.span>
  )
}

interface ProjectNavLinkProps {
  to: string
  isActive: boolean
  icon: ComponentType<{ className?: string }>
  animation: ProjectNavIconAnimation
  children: ReactNode
}

export function ProjectNavLink({
  to,
  isActive,
  icon,
  animation,
  children,
}: ProjectNavLinkProps) {
  const location = useLocation()
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    setHovered(false)
  }, [location.pathname, location.search])

  return (
    <Link
      to={to}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
        buttonPressClass,
        isActive
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <ProjectNavIcon icon={icon} animation={animation} hovered={hovered} />
      {children}
    </Link>
  )
}
