import type { Transition, Variants } from "framer-motion"

/** Snappy ease-out — fast settle without feeling abrupt */
export const entranceEase = [0.22, 1, 0.36, 1] as const

export const slideInDuration = 0.36
export const staggerStep = 0.042
export const usageBarDuration = 0.52

export const slideInTransition: Transition = {
  duration: slideInDuration,
  ease: entranceEase,
}

export const usageBarTransition: Transition = {
  duration: usageBarDuration,
  ease: entranceEase,
}

export const staggerContainerVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: staggerStep,
      delayChildren: 0.02,
    },
  },
}

/** Groups children in a stagger without animating the group itself */
export const staggerGroupVariants: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: staggerStep,
    },
  },
}

export const slideInItemVariants: Variants = {
  hidden: { opacity: 0, y: -12 },
  show: {
    opacity: 1,
    y: 0,
    transition: slideInTransition,
  },
}

export const fadeItemVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { duration: 0.15 },
  },
}
