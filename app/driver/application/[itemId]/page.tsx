import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  ApplicationForm,
  type SavedApplication,
} from "@/components/dq/application-form"
import { applicationAnswersSchema } from "@/lib/schemas/dq"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Employment application" }

/**
 * The driver's employment application. Row-level security only returns it
 * to the driver themselves (and their carrier's owners and admins). The
 * encrypted SSN and date of birth are never read here, only whether they're
 * on file and the SSN's last 4 digits.
 */
export default async function ApplicationPage({
  params,
}: PageProps<"/driver/application/[itemId]">) {
  const { itemId } = await params
  if (!/^[0-9a-f-]{36}$/.test(itemId)) notFound()
  const supabase = await createClient()

  const { data: item } = await supabase
    .from("dq_items")
    .select("id, driver_id, organization_id, template_code")
    .eq("id", itemId)
    .maybeSingle()
  const row = item as {
    id: string
    driver_id: string
    organization_id: string
    template_code: string
  } | null
  if (!row || row.template_code !== "employment_application") notFound()

  const [{ data: mine }, { data: application }, { data: signature }] =
    await Promise.all([
      supabase.rpc("my_dq_drivers"),
      supabase
        .from("dq_employment_applications")
        .select("answers, ssn_last4, date_of_birth_ciphertext, attestation_id")
        .eq("dq_item_id", itemId)
        .maybeSingle(),
      supabase
        .from("dq_attestations")
        .select("signer_name, signed_at, pdf_path")
        .eq("dq_item_id", itemId)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
  const me = ((mine ?? []) as { driver_id: string; full_name: string }[]).find(
    (d) => d.driver_id === row.driver_id
  )
  if (!me) notFound()

  const app = application as {
    answers: unknown
    ssn_last4: string | null
    date_of_birth_ciphertext: string | null
    attestation_id: string | null
  } | null
  const signed = signature as {
    signer_name: string
    signed_at: string
    pdf_path: string | null
  } | null
  let url: string | null = null
  if (signed?.pdf_path) {
    const { data } = await supabase.storage
      .from("dq-files")
      .createSignedUrl(signed.pdf_path, 60 * 60)
    url = data?.signedUrl ?? null
  }
  const answers = applicationAnswersSchema.safeParse(app?.answers)
  const saved: SavedApplication = {
    answers: answers.success ? answers.data : null,
    ssn_last4: app?.ssn_last4 ?? null,
    has_date_of_birth: !!app?.date_of_birth_ciphertext,
    signed: signed
      ? { signer_name: signed.signer_name, signed_at: signed.signed_at, url }
      : null,
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/driver"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" /> Your file
      </Link>
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-brand-ink">
          Employment application
        </h1>
        <p className="text-sm text-muted-foreground">
          Your carrier needs this before your first trip. You can save and come
          back.
        </p>
      </div>
      <ApplicationForm
        itemId={itemId}
        driverName={me.full_name}
        saved={saved}
      />
    </div>
  )
}
