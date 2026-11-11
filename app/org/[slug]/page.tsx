import { ActionCards } from "@/components/action-cards"
import { getActionCounts } from "@/lib/action-counts"

export default async function DashboardPage({
  params,
}: PageProps<"/org/[slug]">) {
  const { slug } = await params

  return (
    <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <div className="px-4 lg:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Today</h2>
        <p className="text-sm text-muted-foreground">
          Everything that needs your action, in one place.
        </p>
      </div>
      <ActionCards base={`/org/${slug}`} counts={await getActionCounts()} />
    </div>
  )
}
