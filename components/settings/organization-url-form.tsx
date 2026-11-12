"use client"

import { useRouter } from "next/navigation"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useZodForm } from "@/hooks/use-zod-form"
import { createOrganizationSchema } from "@/lib/schemas/organization"
import { createClient } from "@/lib/supabase/client"

const slugSchema = createOrganizationSchema.pick({ slug: true })

export function OrganizationUrlForm({
  organizationId,
  slug,
  canEdit,
}: {
  organizationId: string
  slug: string
  canEdit: boolean
}) {
  const router = useRouter()
  const { errors, formError, pending, formProps } = useZodForm(
    slugSchema,
    async (values) => {
      const next = values.slug.toLowerCase()
      if (next === slug) {
        return
      }
      const { data, error } = await createClient()
        .from("organizations")
        .update({ slug: next })
        .eq("id", organizationId)
        .select("id")
      if (error) {
        return error.code === "23505"
          ? "That URL is already taken. Try another."
          : error.message
      }
      // Row-level security skips the update, rather than failing, for non-admins.
      if (!data.length) {
        return "Only owners and admins can change the URL."
      }
      // The page we're on lives at the old URL, so move to the new one.
      router.replace(`/org/${next}/settings`)
      router.refresh()
    }
  )

  return (
    <form {...formProps}>
      <SettingsCard
        title="Organization URL"
        description="The web address for your organization in OfficeTruck."
        footer={
          <SettingsCardFooter
            hint={
              canEdit
                ? "Changing it breaks links your team has saved to the old URL."
                : "Only owners and admins can change the URL."
            }
          >
            {formError && <FieldError>{formError}</FieldError>}
            {canEdit && (
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            )}
          </SettingsCardFooter>
        }
      >
        <Field data-invalid={!!errors.slug}>
          <FieldLabel htmlFor="organization-url" className="sr-only">
            URL
          </FieldLabel>
          <div className="flex items-center rounded-md border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-disabled:bg-muted/40 has-aria-invalid:border-destructive">
            <span className="pl-3 text-sm text-muted-foreground select-none">
              /org/
            </span>
            <Input
              id="organization-url"
              name="slug"
              defaultValue={slug}
              disabled={!canEdit || pending}
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={!!errors.slug}
              className="border-0 pl-0.5 shadow-none focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0"
              onChange={(event) => {
                event.target.value = event.target.value.toLowerCase()
              }}
            />
          </div>
          <FieldError errors={errors.slug} />
        </Field>
      </SettingsCard>
    </form>
  )
}
