/** Внутренний «email» для отчётов и типа Profile; не используется как логин. */
export function syntheticEmailForUid(uid: string): string {
  const safe = uid.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-+|-+$/g, "");
  return `${safe || "user"}@pto.local`;
}
