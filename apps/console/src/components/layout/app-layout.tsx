import { Outlet, useMatch } from "react-router-dom"
import { Sidebar } from "./sidebar"
import { ProjectSidebar } from "./project-sidebar"
import { Header } from "./header"

const breadcrumbs = [
  { label: "sb0rka" },
  { label: "Проекты" },
]

export function AppLayout() {
  const isProjectRoot = useMatch("/projects/:id") !== null
  const isProjectNested = useMatch("/projects/:id/*") !== null
  const isProjectOpen = isProjectRoot || isProjectNested

  return (
    <div className="flex h-screen w-full">
      <Sidebar collapsed={isProjectOpen} />
      {isProjectOpen && <ProjectSidebar />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header breadcrumbs={breadcrumbs} />
        <main className="flex-1 overflow-auto bg-background p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
