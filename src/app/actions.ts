"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { clearSessionCookie } from "@/services/auth";

/**
 * Destroys the employee session cookie and redirects to the login screen.
 * Lives in a dedicated "use server" module so the client dashboard can invoke it.
 */
export async function logoutAction(): Promise<void> {
  cookies().set(clearSessionCookie());
  redirect("/login");
}
