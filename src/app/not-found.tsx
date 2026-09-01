import { FileQuestion } from "lucide-react";

/** Renders for any unmatched route (broken link, old bookmark, typo in the URL). */
export default function NotFound() {
  return (
    <main className="flex h-screen w-screen items-center justify-center bg-cool-grey p-4">
      <section className="w-full max-w-sm rounded-md border border-grid-line bg-pure-white p-5 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-grid-line bg-cool-grey">
          <FileQuestion className="h-5 w-5 text-muted" />
        </div>
        <h1 className="mb-1 text-base font-semibold text-slate-text">Página no encontrada</h1>
        <p className="mb-4 text-xs text-muted">
          La dirección a la que intenta acceder no existe o fue movida.
        </p>
        <a
          href="/"
          className="inline-flex w-full items-center justify-center rounded-md bg-clinical-blue px-3 py-2 text-sm font-semibold text-white hover:bg-clinical-blue-hover active:bg-clinical-blue-active"
        >
          Ir al panel
        </a>
      </section>
    </main>
  );
}