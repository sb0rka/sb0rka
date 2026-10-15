import { TabsContent } from "@sb0rka/ui"
import { DataExplorerPage } from "../data-explorer-page"

export function DataExplorerTab() {
  return (
    <TabsContent value="data-explorer">
      <DataExplorerPage />
    </TabsContent>
  )
}
