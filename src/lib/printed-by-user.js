import { getStoredUser } from "@/lib/auth-storage";

function nameFromUserRecord(user) {
  if (!user || typeof user !== "object") return null;
  const name = user.full_name ?? user.name ?? user.username ?? null;
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  return trimmed || null;
}

/** Display name for "Printed By" on document footers. Falls back to the logged-in user. */
export function resolvePrintedByUser(userOrName) {
  if (typeof userOrName === "string") {
    const trimmed = userOrName.trim();
    if (trimmed) return trimmed;
  } else if (userOrName != null) {
    const fromUser = nameFromUserRecord(userOrName);
    if (fromUser) return fromUser;
  }

  return nameFromUserRecord(getStoredUser());
}
