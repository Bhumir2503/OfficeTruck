import { cn } from "cn"

/**
 * The building blocks every settings tab is made of, so General, Members and
 * Billing share one look: a page header, then a stack of cards that each have
 * a title, content and an optional footer bar for a hint and an action.
 */

export function SettingsPage({
  title,
  description,
  action,
  children,
}: {
  title: string
  description: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  )
}

export function SettingsCard({
  title,
  description,
  action,
  footer,
  className,
  contentClassName,
  children,
  ...props
}: Omit<React.ComponentProps<"section">, "title"> & {
  title: string
  description?: React.ReactNode
  /** Shown beside the title, e.g. a status badge. */
  action?: React.ReactNode
  footer?: React.ReactNode
  contentClassName?: string
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs",
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-5">
        <div className="space-y-1">
          <h4 className="font-semibold">{title}</h4>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action}
      </div>
      <div className={cn("px-6 pt-5 pb-6", contentClassName)}>{children}</div>
      {footer}
    </section>
  )
}

/** The grey bar along the bottom of a card: a hint on the left, an action on the right. */
export function SettingsCardFooter({
  hint,
  children,
}: {
  hint?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-h-14 flex-col gap-3 border-t bg-muted/40 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground" role="status">
        {hint}
      </div>
      {children && (
        <div className="flex items-center gap-3 sm:justify-end">{children}</div>
      )}
    </div>
  )
}

/** A centered icon, title and line of text for a card with nothing in it yet. */
export function SettingsEmptyState({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center">
      <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <p className="font-medium">{title}</p>
      <p className="max-w-sm text-sm text-balance text-muted-foreground">
        {children}
      </p>
    </div>
  )
}
