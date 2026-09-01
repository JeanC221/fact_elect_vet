import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { loginFormSchema, authErrorToSpanish, type LoginFormValues } from "@/mappers/auth";
import { AuthError, authenticate, verifySessionToken } from "@/services/auth";
import { isLockedOut, lockoutSecondsRemaining, recordFailure, recordSuccess } from "@/mappers/loginRateLimit";
import { readRateLimitState, writeRateLimitState } from "@/services/loginRateLimitStore";
import {
  SESSION_COOKIE_NAME,
  createRoleCookie,
  createSessionCookie,
} from "@/services/sessionCookies";

export default async function LoginPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (token && (await verifySessionToken(token))) {
    redirect("/");
  }

  async function loginAction(values: LoginFormValues): Promise<{ error: string | null }> {
    "use server";
    const parsed = loginFormSchema.safeParse(values);
    if (!parsed.success) return { error: authErrorToSpanish("invalid_credentials") };

    const now = Date.now();
    const rateState = await readRateLimitState(parsed.data.email);
    if (isLockedOut(rateState, now)) {
      const seconds = lockoutSecondsRemaining(rateState, now);
      const minutes = Math.ceil(seconds / 60);
      return { error: `Demasiados intentos fallidos. Espere ${minutes} minuto${minutes === 1 ? "" : "s"} e intente nuevamente.` };
    }

    let sessionToken: string;
    let isAdmin: boolean;
    try {
      const result = await authenticate(parsed.data.email, parsed.data.password);
      sessionToken = result.token;
      isAdmin = result.admin;
    } catch (error) {
      if (error instanceof AuthError && error.code === "invalid_credentials") {
        await writeRateLimitState(parsed.data.email, recordFailure(rateState, now));
      }
      if (error instanceof AuthError) return { error: authErrorToSpanish(error.code) };
      return { error: authErrorToSpanish("default") };
    }
    await writeRateLimitState(parsed.data.email, recordSuccess());
    // redirect() throws NEXT_REDIRECT — must stay outside the try/catch above.
    cookies().set(createSessionCookie(sessionToken));
    cookies().set(createRoleCookie(isAdmin));
    redirect("/");
  }

  return (
    <main className="flex h-screen w-screen items-center justify-center overflow-hidden bg-cool-grey p-4">
      <section className="w-full max-w-sm rounded-md border border-grid-line bg-pure-white p-5 shadow-sm">
        <header className="mb-4 space-y-1">
          <h1 className="text-base font-semibold text-clinical-blue">
            Facturación
          </h1>
          <p className="text-xs text-muted">Acceso restringido a personal autorizado.</p>
        </header>
        <LoginForm action={loginAction} />
      </section>
    </main>
  );
}