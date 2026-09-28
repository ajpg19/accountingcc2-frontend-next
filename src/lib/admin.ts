// Single administrator allowed to perform privileged actions such as
// importing bank movements. Kept as a shared constant so the middleware,
// server components and client components all agree on the same identity.
export const ADMIN_EMAIL = "ajpg19@gmail.com";

// Case-insensitive comparison so a login like "AJPG19@Gmail.com" still matches.
export function isAdminEmail(email: string | null | undefined): boolean {
  return Boolean(email) && email!.toLowerCase() === ADMIN_EMAIL;
}