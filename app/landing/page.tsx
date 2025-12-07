import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-900">
      <header className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-10 text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-amber-500">TERRABATT Analytics</p>
        <h1 className="text-4xl font-semibold sm:text-5xl">Chytrý mozek pro vaši fotovoltaiku</h1>
        <p className="text-lg text-slate-600 sm:text-xl">
          Sledujte výrobu, spotřebu a ceny elektřiny v jednom přehledném dashboardu. Spočítáme ideální kapacitu baterie i reálnou návratnost.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
          <Link href="/" className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-lg hover:bg-slate-800">
            Vyzkoušet na vlastních datech
          </Link>
          <a
            href="mailto:info@terrabatt.cz"
            className="rounded-lg border border-slate-200 px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Domluvit konzultaci
          </a>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-2">
        <LandingCard title="Výroba a spotřeba v čase" text="Na grafech vidíte, kdy vyrábíte nejvíc a kdy nejvíc spotřebováváte." />
        <LandingCard title="Tok energie" text="Zda energii rovnou spotřebujete, ukládáte do baterie nebo posíláte do sítě." />
        <LandingCard title="Úspory v korunách" text="Přepočet kWh na peníze podle vašeho tarifu nebo spotových cen." />
        <LandingCard title="Optimální kapacita baterie" text="Ze skutečných dat spočítáme, jak velká baterie dává ekonomicky smysl." />
        <LandingCard title="Varianty tarifů" text="Uvidíte, jak by se změnila návratnost při jiné ceně elektřiny." />
        <LandingCard title="Scénáře baterie" text="Porovnej bez baterie vs. 0–20 kWh a uvidíš soběstačnost i úsporu." />
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <h2 className="text-2xl font-semibold">Jak to funguje</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            "Nahrajete data (CSV/XLS)",
            "Nastavíte tarif a parametry",
            "Aplikace spočítá scénáře",
            "Vyberete ideální řešení",
          ].map((step, idx) => (
            <li key={step} className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
              <span className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500 text-white">
                {idx + 1}
              </span>
              <p className="font-medium">{step}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function LandingCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-base font-semibold">{title}</p>
      <p className="mt-1 text-sm text-slate-600">{text}</p>
    </div>
  );
}
