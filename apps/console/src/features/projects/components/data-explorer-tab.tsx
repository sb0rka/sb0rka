import { TabsContent } from "@/components/ui/tabs"
import { DataExplorerPage } from "../data-explorer-page"

export function DataExplorerTab() {
  return (
    <TabsContent value="data-explorer">
      <DataExplorerPage />
    </TabsContent>
  )
}
