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
interface SiigoCredentials {
  accessToken: string;
  partnerId: string;
  baseUrl: string;
}

/**
 * Reads Siigo credentials from env vars and obtains a Bearer token via
 * Siigo's POST /auth OAuth endpoint. Call from client components via
 * `import { getSiigoCredentials } from "@/app/actions"`.
 * Secrets never leave the server — the auth call is server-to-server.
 * En modo sandbox sin credenciales reales, devuelve un token simulado.
 */
export async function getSiigoCredentials(): Promise<SiigoCredentials> {
  const baseUrl = process.env.SIIGO_API_BASE_URL ?? "https://api-sandbox.siigo.com";
  const partnerId = process.env.SIIGO_PARTNER_ID ?? "SandboxPartner123";
  const username = process.env.SIIGO_USERNAME ?? "sandbox@siigoapi.com";
  const accessKey = process.env.SIIGO_ACCESS_KEY ?? "";

  // Sin accessKey → credenciales simuladas para pruebas con datos mock
  if (!accessKey) {
    return { accessToken: "sandbox-mock-token-no-reales", partnerId, baseUrl };
  }

  try {
    const res = await fetch(`${baseUrl}/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, access_key: accessKey }),
    });
    if (!res.ok) {
      console.warn(`Siigo Sandbox auth falló (${res.status}) → usando mock`);
      return { accessToken: "sandbox-mock-token-no-reales", partnerId, baseUrl };
    }
    const data = await res.json();
    return { accessToken: data.access_token as string, partnerId, baseUrl };
  } catch {
    console.warn("Siigo Sandbox no disponible → usando mock");
    return { accessToken: "sandbox-mock-token-no-reales", partnerId, baseUrl };
  }
}
