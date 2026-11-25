import type { LICENSE_CLASSES } from "@/lib/schemas/dq"

/**
 * The driver facts the qualification file needs. A driver who leaves is
 * marked inactive from Change status, which asks for their last day and
 * closes the file.
 */
export type DriverFacts = {
  id: string
  full_name: string
  license_class: (typeof LICENSE_CLASSES)[number] | null
  cdl_state: string | null
  prior_license_states: string[]
  start_date: string | null
  end_date: string | null
  holds_medical_variance: boolean
  login_phone: string | null
  linked: boolean
}
