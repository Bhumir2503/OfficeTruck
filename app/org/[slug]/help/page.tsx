import {
  SectionPlaceholder,
  sectionMetadata,
} from "@/components/section-placeholder"

export const metadata = sectionMetadata("help")

export default function Page() {
  return <SectionPlaceholder path="help" />
}
