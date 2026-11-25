import { cn } from "cn"

/*
 * The boxes the record pages' side panels are made of (loads, drivers), so
 * they share one look: a small titled card, and label/amount lines in it.
 */

export function Panel({
  title,
  aside,
  children,
  className,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <h4 className="font-semibold">{title}</h4>
        {aside}
      </div>
      <div className="px-5 pt-3 pb-4">{children}</div>
    </section>
  )
}

export function MoneyLine({
  label,
  children,
  strong,
  muted,
}: {
  label: React.ReactNode
  children: React.ReactNode
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 text-sm",
        strong && "text-base font-semibold",
        muted && "text-muted-foreground"
      )}
    >
      <dt>{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  )
}
