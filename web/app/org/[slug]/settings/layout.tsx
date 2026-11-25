import { SettingsNav } from "@/components/settings/settings-nav"

export default async function SettingsLayout({
  params,
  children,
}: LayoutProps<"/org/[slug]/settings">) {
  const { slug } = await params

  return (
    <div className="px-4 py-6 lg:px-6 lg:py-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
        <SettingsNav base={`/org/${slug}/settings`} />
        <div className="min-w-0 flex-1 lg:max-w-3xl">{children}</div>
      </div>
    </div>
  )
}
