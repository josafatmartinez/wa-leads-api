function last4Digits(input: string) {
  const digits = input.replace(/\D/g, '');
  return digits.slice(-4).padStart(4, '0');
}

function two(n: number) {
  return String(n).padStart(2, '0');
}

export function buildLeadSlug(customerPhone: string, date = new Date()) {
  const dd = two(date.getDate());
  const mm = two(date.getMonth() + 1);
  return `lead-${last4Digits(customerPhone)}-${dd}-${mm}`;
}

export async function ensureUniqueSlug(
  baseSlug: string,
  isTaken: (candidate: string) => Promise<boolean>,
) {
  if (!(await isTaken(baseSlug))) return baseSlug;
  for (let suffix = 2; suffix <= 5; suffix++) {
    const candidate = `${baseSlug}-${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error(`Could not allocate unique slug for ${baseSlug}`);
}
