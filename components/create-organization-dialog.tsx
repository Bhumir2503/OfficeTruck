"use client"

import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useZodForm } from "@/hooks/use-zod-form"
import { createOrganizationSchema, slugify } from "@/lib/schemas/organization"
import { createClient } from "@/lib/supabase/client"

// Lives inside the dialog content so its state resets each time it closes.
function CreateOrganizationForm() {
  const router = useRouter()
  const [slug, setSlug] = useState("")
  // Follow the name until the user edits the URL themselves.
  const [slugEdited, setSlugEdited] = useState(false)

  const { errors, formError, pending, formProps } = useZodForm(
    createOrganizationSchema,
    async ({ name, slug }) => {
      const { error } = await createClient().rpc("create_organization", {
        org_name: name,
        org_slug: slug,
      })
      if (error) {
        return error.code === "23505"
          ? "That URL is already taken. Try another."
          : error.message
      }
      router.push(`/org/${slug}`)
      router.refresh()
    }
  )

  return (
    <form {...formProps}>
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="organization-name">Organization name</FieldLabel>
          <Input
            id="organization-name"
            name="name"
            placeholder="Acme Freight"
            autoComplete="organization"
            autoFocus
            required
            aria-invalid={!!errors.name}
            onChange={(event) => {
              if (!slugEdited) {
                setSlug(slugify(event.target.value))
              }
            }}
          />
          <FieldError errors={errors.name} />
        </Field>
        <Field data-invalid={!!errors.slug}>
          <FieldLabel htmlFor="organization-slug">URL</FieldLabel>
          <div className="flex items-center rounded-md border border-input bg-transparent focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-aria-invalid:border-destructive">
            <span className="pl-3 text-sm text-muted-foreground select-none">
              /org/
            </span>
            <Input
              id="organization-slug"
              name="slug"
              value={slug}
              placeholder="acme-freight"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-invalid={!!errors.slug}
              className="border-0 pl-0.5 shadow-none focus-visible:ring-0 aria-invalid:ring-0"
              onChange={(event) => {
                setSlugEdited(true)
                setSlug(event.target.value.toLowerCase())
              }}
            />
          </div>
          {errors.slug ? (
            <FieldError errors={errors.slug} />
          ) : (
            <FieldDescription>
              Lowercase letters, numbers and hyphens.
            </FieldDescription>
          )}
        </Field>
        <Field>
          <Button type="submit" disabled={pending}>
            Create organization
          </Button>
          <FieldError className="text-center">{formError}</FieldError>
        </Field>
      </FieldGroup>
    </form>
  )
}

export function CreateOrganizationDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="lg" />}>
        <Plus />
        New organization
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create an organization</DialogTitle>
          <DialogDescription>
            Your team will share loads, drivers and paperwork here.
          </DialogDescription>
        </DialogHeader>
        <CreateOrganizationForm />
      </DialogContent>
    </Dialog>
  )
}
