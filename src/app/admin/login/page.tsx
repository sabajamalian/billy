import { redirect } from "next/navigation";

import { LoginForm } from "@/app/admin/login/LoginForm";
import { isAdminEnabled } from "@/lib/env";
import { ADMIN_COOKIE_NAME, verifyAdminCookie } from "@/server/admin/auth";
import { cookies } from "next/headers";

export default async function AdminLoginPage() {
  if (!isAdminEnabled()) redirect("/admin");

  const store = await cookies();
  if (verifyAdminCookie(store.get(ADMIN_COOKIE_NAME)?.value ?? "")) redirect("/admin");

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <LoginForm />
    </main>
  );
}
