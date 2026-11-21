import { SettingsCard } from "@/components/settings/settings-card"
import { Skeleton } from "@/components/ui/skeleton"

/*
 * Loading states for the Trailers pages: the real titles, with placeholders
 * where values go. Keep the page wrappers in step with the pages.
 */

export function TrailersListSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <SettingsCard
        title="Trailers"
        action={<Skeleton className="h-8 w-28 rounded-md" />}
        contentClassName="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full shrink-0 rounded-md sm:w-44" />
        </div>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </SettingsCard>
    </div>
  )
}

/** The Add trailer and trailer pages: a back link, then the form's cards. */
export function TrailerPageSkeleton() {
  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Skeleton className="h-8 w-28 rounded-md" />
        <SettingsCard title="Trailer">
          <Skeleton className="h-32 w-full" />
        </SettingsCard>
        <SettingsCard title="Plate and compliance">
          <Skeleton className="h-32 w-full" />
        </SettingsCard>
      </div>
    </div>
  )
}
