import { AnimatePresence, motion } from "framer-motion"
import { SborkaLogo, SborkaLogoMark } from "@sb0rka/ui"

const logoTransition = { duration: 0.21, ease: "easeOut" as const }

/** Logo mark center — 30px from sidebar edge (header is full-width, no nav padding). */
const logoMarkCenterClass =
  "absolute top-1/2 left-[30px] -translate-x-1/2 -translate-y-1/2"

/** Expanded wordmark: mark left edge matches collapsed centered mark (30px − 12.5px). */
const logoExpandedClass =
  "absolute top-1/2 left-[calc(30px-12.5px)] -translate-y-1/2"

interface SidebarLogoProps {
  collapsed?: boolean
}

export function SidebarLogo({ collapsed = false }: SidebarLogoProps) {
  return (
    <div className="relative h-[60px] overflow-hidden border-b border-border">
      <AnimatePresence mode="wait" initial={false}>
        {collapsed ? (
          <motion.div
            key="mark"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={logoTransition}
          >
            <SborkaLogoMark className={logoMarkCenterClass} />
          </motion.div>
        ) : (
          <motion.div
            key="wordmark"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
            transition={logoTransition}
          >
            <SborkaLogo className={logoExpandedClass} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
