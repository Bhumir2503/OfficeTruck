import { SettingsCard } from "@/components/settings/settings-card"
import { Skeleton } from "@/components/ui/skeleton"

// Keep the wrapper and card titles in step with the IFTA page.
export default function IftaLoading() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="flex flex-col gap-6">
        <SettingsCard title="Return" contentClassName="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </SettingsCard>
        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
          <SettingsCard
            title="Miles by state"
            description="Each truck's miles in each state this quarter, beside the miles on its delivered loads as a check."
            contentClassName="space-y-3"
          >
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </SettingsCard>
          <SettingsCard
            title="Fuel purchases"
            description="Every gallon bought this quarter, with the state it was bought in. Fuel receipts on loads count here once they have gallons and a state."
            contentClassName="space-y-3"
          >
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </SettingsCard>
        </div>
      </div>
    </div>
  )
}
