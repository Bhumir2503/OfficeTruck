import {
  SectionPlaceholder,
  sectionMetadata,
} from "@/components/section-placeholder"

export const metadata = sectionMetadata("invoices")

export default function Page() {
  return <SectionPlaceholder path="invoices" />
}
