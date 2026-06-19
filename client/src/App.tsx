import { Link, Route, Switch } from "wouter";
import { CohortsExplorerPage } from "./pages/CohortsExplorerPage";
import { CockpitPage } from "./pages/CockpitPage";
import { DiagnosisPage } from "./pages/DiagnosisPage";

// SPA shell (mobile-first, dark-only). 01 = Cohorts Explorer · 02 = Autonomy Cockpit · 05B = Support·Diagnosis.
export function App() {
  return (
    <div className="min-h-screen bg-mxm-bg text-mxm-content">
      <nav aria-label="Primary" className="flex gap-4 border-b border-mxm-border px-[clamp(1rem,2vw,2rem)] py-2 text-sm">
        <Link href="/cohorts" className="inline-flex min-h-[24px] items-center rounded-mxm px-1 text-mxm-content-secondary hover:text-mxm-content">
          Cohorts
        </Link>
        <Link href="/cockpit" className="inline-flex min-h-[24px] items-center rounded-mxm px-1 text-mxm-content-secondary hover:text-mxm-content">
          Autonomy Cockpit
        </Link>
        <Link href="/diagnosis" className="inline-flex min-h-[24px] items-center rounded-mxm px-1 text-mxm-content-secondary hover:text-mxm-content">
          Support · Diagnosis
        </Link>
      </nav>
      <Switch>
        <Route path="/" component={CohortsExplorerPage} />
        <Route path="/cohorts" component={CohortsExplorerPage} />
        <Route path="/cockpit" component={CockpitPage} />
        <Route path="/diagnosis" component={DiagnosisPage} />
        <Route>
          <main className="p-6 text-mxm-content-secondary">Not found</main>
        </Route>
      </Switch>
    </div>
  );
}
