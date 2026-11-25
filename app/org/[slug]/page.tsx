import { redirect } from "next/navigation"

// Loads is where people work, so the organization's home is the loads list.
// ?welcome (set when the organization was just created) carries over to open
// the company setup popup there.
export default async function OrganizationHome({
  params,
  searchParams,
}: PageProps<"/org/[slug]">) {
  const { slug } = await params
  const { welcome } = await searchParams
  redirect(`/org/${slug}/loads${welcome ? "?welcome=1" : ""}`)
}
