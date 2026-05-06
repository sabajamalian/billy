import { requireAdmin } from "@/server/admin/auth";

export async function ensureAdmin(): Promise<Response | undefined> {
  try {
    await requireAdmin();
    return undefined;
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
