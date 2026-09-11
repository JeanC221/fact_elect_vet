"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clearRoleCookie, clearSessionCookie } from "@/services/sessionCookies";

/**
 * Destroys the employee session cookie and redirects to the login screen.
 * Lives in a dedicated "use server" module so the client dashboard can invoke it.
 */
export async function logoutAction(): Promise<void> {
  (await cookies()).set(clearSessionCookie());
  (await cookies()).set(clearRoleCookie());
  redirect("/login");
}
