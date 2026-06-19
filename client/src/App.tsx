import type { ReactNode } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import { CohortsExplorerPage } from "./pages/CohortsExplorerPage";
import { CockpitPage } from "./pages/CockpitPage";
import { ActionDetailPage } from "@/pages/ActionDetailPage";
import { DiagnosisPage } from "./pages/DiagnosisPage";
import { HealthPage } from "./pages/HealthPage";

// Active nav = coral (Design §8 "active: coral marker · ONE active style everywhere"). aria-current
// for wayfinding (the trunk test: which page am I on?). Inactive = muted, hover lifts to primary.
function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-[24px] items-center rounded-mxm px-1 ${
        active ? "font-medium text-mxm-brand" : "text-mxm-content-secondary hover:text-mxm-content"
      }`}
    >
      {children}
    </Link>
  );
}

// SPA shell (mobile-first, dark-only). 01 = Cohorts Explorer · 02 = Autonomy Cockpit · 05B = Support·Diagnosis.
export function App() {
  const [loc] = useLocation();
  return (
    <div className="min-h-screen bg-mxm-bg text-mxm-content">
      <nav aria-label="Primary" className="flex gap-4 border-b border-mxm-border px-[clamp(1rem,2vw,2rem)] py-2 text-sm">
        <NavLink href="/cohorts" active={loc === "/" || loc.startsWith("/cohorts")}>
          Cohorts
        </NavLink>
        <NavLink href="/cockpit" active={loc.startsWith("/cockpit")}>
          Autonomy Cockpit
        </NavLink>
        <NavLink href="/diagnosis" active={loc.startsWith("/diagnosis")}>
          Support · Diagnosis
        </NavLink>
        <NavLink href="/health" active={loc.startsWith("/health")}>
          Health · 1:10
        </NavLink>
      </nav>
      <Switch>
        <Route path="/" component={CohortsExplorerPage} />
        <Route path="/cohorts" component={CohortsExplorerPage} />
        <Route path="/cockpit/action/:code" component={ActionDetailPage} />
        <Route path="/cockpit" component={CockpitPage} />
        <Route path="/diagnosis" component={DiagnosisPage} />
        <Route path="/health" component={HealthPage} />
        <Route>
          <main className="p-6 text-mxm-content-secondary">Not found</main>
        </Route>
      </Switch>
    </div>
  );
}
