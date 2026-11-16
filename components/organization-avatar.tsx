import { cn } from "cn"

/**
 * The organization's icon: its square icon if it has one, else a rounded
 * square with its first letter, like GitHub's default org avatar.
 */
export function OrganizationAvatar({
  name,
  iconUrl,
  className,
}: {
  name: string
  iconUrl?: string | null
  className?: string
}) {
  if (iconUrl) {
    return (
      <div
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md",
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a public storage URL, shown as is */}
        <img src={iconUrl} alt="" className="size-full object-cover" />
      </div>
    )
  }

  return (
    <div
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground uppercase",
        className
      )}
    >
      {name.trim().charAt(0) || "?"}
    </div>
  )
}
