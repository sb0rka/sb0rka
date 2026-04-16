import { Card, CardContent } from "@/components/ui/card"
import { TabsContent } from "@/components/ui/tabs"

export function SettingsTab() {
  return (
    <TabsContent value="settings">
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Настройки проекта будут доступны в следующей версии.
          </p>
        </CardContent>
      </Card>
    </TabsContent>
  )
}
