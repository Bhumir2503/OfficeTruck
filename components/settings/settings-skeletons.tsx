import { cn } from "cn"

import {
  SettingsCard,
  SettingsCardFooter,
  SettingsPage,
} from "@/components/settings/settings-card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  PROFILE_SECTIONS,
  SPANS,
  type FieldConfig,
} from "@/lib/company-profile-fields"

/*
 * Loading states for the settings tabs. Everything that doesn't depend on
 * data (titles, labels, hints) is the real text, built from the same pieces
 * as the pages, so nothing shifts when the content arrives. Only values and
 * buttons are grey placeholders.
 */

/** Stands in for a small button in a card footer, a shade darker than the grey footer. */
function ButtonSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      className={cn("h-8 w-14 rounded-md bg-foreground/10", className)}
    />
  )
}

export function GeneralSettingsSkeleton() {
  return (
    <SettingsPage
      title="General"
      description="Your company profile, shown on invoices and used for broker and compliance checks."
    >
      {Object.entries(PROFILE_SECTIONS).map(([key, section]) => (
        <SettingsCard
          key={key}
          title={section.title}
          description={section.description}
          footer={
            <SettingsCardFooter>
              <ButtonSkeleton />
            </SettingsCardFooter>
          }
        >
          <div className="grid gap-5 sm:grid-cols-6">
            {(section.fields as FieldConfig[]).map((field) => (
              <Field key={field.name} className={SPANS[field.span]}>
                <FieldLabel>{field.label}</FieldLabel>
                <Skeleton className="h-9 w-full" />
                {field.hint && (
                  <FieldDescription>{field.hint}</FieldDescription>
                )}
              </Field>
            ))}
          </div>
        </SettingsCard>
      ))}

      <SettingsCard
        title="Organization URL"
        description="The web address for your organization in OfficeTruck."
        footer={
          <SettingsCardFooter hint="Changing it breaks links your team has saved to the old URL.">
            <ButtonSkeleton />
          </SettingsCardFooter>
        }
      >
        {/* The real field is a bordered box around a 36px input. */}
        <Skeleton className="h-[38px] w-full" />
      </SettingsCard>

      <SettingsCard
        title="Delete this organization"
        description="Permanently delete this organization, its company profile and everyone's access to it. This can't be undone."
        className="border-destructive/40"
        footer={
          <SettingsCardFooter hint="All of the organization's data will be deleted.">
            <ButtonSkeleton className="w-36" />
          </SettingsCardFooter>
        }
      />
    </SettingsPage>
  )
}

const MEMBER_ROWS = [
  { name: "w-28", email: true },
  { name: "w-24", email: false },
  { name: "w-32", email: false },
]

export function MembersSettingsSkeleton() {
  return (
    <SettingsPage
      title="Members"
      description="Everyone with access to your organization, and the role each person has."
      action={<Skeleton className="h-9 w-32 rounded-md" />}
    >
      <SettingsCard
        title="Team"
        description="Search by name, or filter by role."
        contentClassName="px-0 pb-0"
        footer={
          <SettingsCardFooter
            hint={<Skeleton className="h-4 w-20 bg-foreground/10" />}
          />
        }
      >
        <div className="flex items-center gap-3 px-6 pb-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-20 shrink-0" />
        </div>
        <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden text-right sm:table-cell">
                Joined
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MEMBER_ROWS.map((row, index) => (
              <TableRow key={index} className="hover:bg-transparent">
                <TableCell className="py-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 shrink-0 rounded-full" />
                    {/* Each line matches the 20px text line it stands in for. */}
                    <div>
                      <div className="flex h-5 items-center">
                        <Skeleton className={cn("h-4", row.name)} />
                      </div>
                      {row.email && (
                        <div className="flex h-5 items-center">
                          <Skeleton className="h-3.5 w-36" />
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Skeleton className="h-5 w-16 rounded-full" />
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Skeleton className="ml-auto h-4 w-24" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SettingsCard>
    </SettingsPage>
  )
}
