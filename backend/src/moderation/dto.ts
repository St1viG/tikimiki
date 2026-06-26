import { z } from "zod";

/** Body for creating a server role. `permissions` are catalog permission NAMES. */
export const createRoleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  permissions: z.array(z.string().trim().min(1).max(100)).max(50),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

/**
 * Body for editing a server role. Either field may be omitted; when
 * `permissions` is present it REPLACES the full permission set of the role.
 */
export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    permissions: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  })
  .refine((b) => b.name !== undefined || b.permissions !== undefined, {
    message: "Provide at least one of name or permissions",
  });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

/** Body for assigning a role to a server member. */
export const assignRoleMemberSchema = z.object({
  userId: z.string().uuid(),
});
export type AssignRoleMemberInput = z.infer<typeof assignRoleMemberSchema>;

/* ── Response shapes ─────────────────────────────────────────── */

export interface PermissionDto {
  permissionId: string;
  name: string;
  description: string;
}

export interface ServerRoleDto {
  serverRoleId: string;
  name: string;
  permissions: string[];
  memberCount: number;
  createdAt: string;
}
