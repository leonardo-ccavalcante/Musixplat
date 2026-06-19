import { Link, Route, Switch } from "wouter";
import { CohortsExplorerPage } from "./pages/CohortsExplorerPage";
import { CockpitPage } from "./pages/CockpitPage";

// SPA shell (mobile-first, dark-only). Screen 01 = Cohorts Explorer · Screen 02 = Autonomy Cockpit.
export function App() {
  return (
    <div className="min-h-screen bg-mxm-bg text-mxm-content">
      <nav aria-label="Primary" className="flex gap-4 border-b border-mxm-border px-[clamp(1rem,2vw,2rem)] py-2 text-sm">
        <Link href="/cohorts" className="text-mxm-content-secondary hover:text-mxm-content">
          Cohorts
        </Link>
        <Link href="/cockpit" className="text-mxm-content-secondary hover:text-mxm-content">
          Autonomy Cockpit
        </Link>
      </nav>
      <Switch>
        <Route path="/" component={CohortsExplorerPage} />
        <Route path="/cohorts" component={CohortsExplorerPage} />
        <Route path="/cockpit" component={CockpitPage} />
        <Route>
          <main className="p-6 text-mxm-content-secondary">Not found</main>
        </Route>
      </Switch>
    </div>
  );
}
