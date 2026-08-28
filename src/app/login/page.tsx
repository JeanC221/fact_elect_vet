import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { loginFormSchema, authErrorToSpanish, type LoginFormValues } from "@/mappers/auth";
import {
  AuthError,
  authenticateEmployee,
  isAdminEmail,
  verifySessionToken,
} from "@/services/auth";
import {
  SESSION_COOKIE_NAME,
  createRoleCookie,
  createSessionCookie,
} from "@/services/sessionCookies";

/**
 * Employee login route (server component).
 * Already-authenticated users are redirected to the dashboard ("/").
 * The inline `loginAction` server action validates credentials, issues a JWT,
 * and stores it in an HttpOnly/Secure(prod)/SameSite=Strict cookie.
 */
export default async function LoginPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (token && (await verifySessionToken(token))) {
    redirect("/");
  }

  async function loginAction(values: LoginFormValues): Promise<{ error: string | null }> {
    "use server";
    const parsed = loginFormSchema.safeParse(values);
    if (!parsed.success) return { error: authErrorToSpanish("invalid_credentials") };
    let sessionToken: string;
    try {
      sessionToken = await authenticateEmployee(parsed.data.email, parsed.data.password);
    } catch (error) {
      if (error instanceof AuthError) return { error: authErrorToSpanish(error.code) };
      return { error: authErrorToSpanish("default") };
    }
    // redirect() throws NEXT_REDIRECT — must stay outside the try/catch above.
    cookies().set(createSessionCookie(sessionToken));
    cookies().set(createRoleCookie(isAdminEmail(parsed.data.email)));
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

