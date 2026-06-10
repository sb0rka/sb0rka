import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  fadeItemVariants,
  staggerContainerVariants,
  staggerGroupVariants,
  slideInItemVariants,
  usageBarTransition,
} from "@/lib/motion"
import { cn } from "@/lib/utils"

interface PageStaggerProps {
  children: ReactNode
  className?: string
}

export function PageStagger({ children, className }: PageStaggerProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={reduceMotion ? { hidden: {}, show: {} } : staggerContainerVariants}
    >
      {children}
    </motion.div>
  )
}

/** Staggers children inside a grid/flex without sliding the container itself */
export function StaggerGroup({ children, className }: PageStaggerProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={className}
      variants={reduceMotion ? { hidden: {}, show: {} } : staggerGroupVariants}
    >
      {children}
    </motion.div>
  )
}

interface SlideInProps {
  children: ReactNode
  className?: string
}

export function SlideIn({ children, className }: SlideInProps) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      className={className}
      variants={reduceMotion ? fadeItemVariants : slideInItemVariants}
    >
      {children}
    </motion.div>
  )
}

interface UsageProgressBarProps {
  progress: number
  className?: string
  barClassName?: string
  delay?: number
}

export function UsageProgressBar({
  progress,
  className,
  barClassName,
  delay = 0,
}: UsageProgressBarProps) {
  const reduceMotion = useReducedMotion()
  const width = `${Math.min(Math.max(progress, 0), 100)}%`

  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-[#F2F4F7] dark:!bg-muted",
        className,
      )}
    >
      <motion.div
        className={cn(
          "h-full rounded-full bg-[#1D2939] dark:!bg-foreground",
          barClassName,
        )}
        initial={{ width: reduceMotion ? width : "0%" }}
        animate={{ width }}
        transition={{
          ...usageBarTransition,
          delay: reduceMotion ? 0 : delay,
        }}
      />
    </div>
  )
}
