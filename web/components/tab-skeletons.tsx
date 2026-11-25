import { SettingsCard } from "@/components/settings/settings-card"
import { Skeleton } from "@/components/ui/skeleton"

/*
 * Placeholder cards for a tab while it loads, shaped like the cards it
 * holds: fields, a table, or a row of figures. Titles are real text so the
 * page reads the same while it fills in.
 */

/** A card of form fields, two to a row, with its Save footer. */
export function FieldsCardSkeleton({
  title,
  description,
  fields = 4,
}: {
  title: string
  description?: string
  fields?: number
}) {
  return (
    <SettingsCard
      title={title}
      description={description}
      contentClassName="grid gap-5 sm:grid-cols-2"
      footer={
        <div className="flex justify-end border-t bg-muted/30 px-6 py-3">
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      }
    >
      {Array.from({ length: fields }, (_, index) => (
        <div key={index} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      ))}
    </SettingsCard>
  )
}

/** A card holding a table: a header band and a few rows. */
export function TableCardSkeleton({
  title,
  description,
  rows = 3,
}: {
  title: string
  description?: string
  rows?: number
}) {
  return (
    <SettingsCard
      title={title}
      description={description}
      contentClassName="px-0 pb-0"
    >
      <div className="h-9 border-y bg-muted/40" />
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex items-center gap-4 border-b px-6 py-3 last:border-b-0"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48 max-w-full" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </SettingsCard>
  )
}

/** A card with a row of figures, like Earnings. */
export function StatsCardSkeleton({
  title,
  description,
  stats = 4,
}: {
  title: string
  description?: string
  stats?: number
}) {
  return (
    <SettingsCard
      title={title}
      description={description}
      className="@container"
      contentClassName="grid grid-cols-2 gap-3 @2xl:grid-cols-4"
    >
      {Array.from({ length: stats }, (_, index) => (
        <div key={index} className="rounded-lg border bg-muted/30 px-4 py-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="mt-2 h-6 w-24" />
          <Skeleton className="mt-1.5 h-3 w-28" />
        </div>
      ))}
    </SettingsCard>
  )
}

/** A tab's cards, stacked as on the page. */
export function TabSkeleton({ children }: { children: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-4">{children}</div>
}

/** The row of tabs under a page's header, one placeholder per tab. */
export function TabBarSkeleton({ widths }: { widths: string[] }) {
  return (
    <div className="inline-flex h-9 w-fit max-w-full items-center gap-1 overflow-hidden rounded-lg bg-muted p-[3px]">
      {widths.map((width, index) => (
        <Skeleton
          key={index}
          className={`h-full shrink-0 rounded-md ${index === 0 ? "bg-background" : ""} ${width}`}
        />
      ))}
    </div>
  )
}
