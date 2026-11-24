import { AppError } from "../domain/errors";
import { hasPermission, type Permission, type RoleKey } from "./permissions";

/** Framework-independent permission check used by every service. */
export function assertPermission(actor: { role: string }, permission: Permission) {
  if (actor.role === "SYSTEM") return;
  if (!hasPermission(actor.role as RoleKey, permission)) {
    throw new AppError("FORBIDDEN", "You do not have permission to perform this action.");
  }
}

export function can(actor: { role: string }, permission: Permission) {
  return actor.role === "SYSTEM" || hasPermission(actor.role as RoleKey, permission);
}
