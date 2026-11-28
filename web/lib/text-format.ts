/**
 * "Ana’s", "RTS’s", but "Prairie Path Transport Services’" for a name that
 * ends in a lowercase s.
 */
export const possessive = (name: string) =>
  name.trim().endsWith("s") ? `${name}’` : `${name}’s`
