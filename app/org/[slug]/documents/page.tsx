import {
  SectionPlaceholder,
  sectionMetadata,
} from "@/components/section-placeholder"

export const metadata = sectionMetadata("documents")

export default function Page() {
  return <SectionPlaceholder path="documents" />
}
