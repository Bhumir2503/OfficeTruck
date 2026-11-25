import { SettingsCard } from "@/components/settings/settings-card"
import { Skeleton } from "@/components/ui/skeleton"

// Keep the wrapper and card titles in step with the Compliance page.
export default function ComplianceLoading() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <SettingsCard
          title="Due soon"
          description="Anything late or due in the next 60 days, for active drivers, trucks and trailers."
          contentClassName="space-y-3"
        >
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </SettingsCard>
      </div>
    </div>
  )
}
