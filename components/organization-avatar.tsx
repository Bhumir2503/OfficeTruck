import { cn } from "cn"

/** A rounded square with the organization's first letter, like GitHub's default org avatar. */
export function OrganizationAvatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
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
