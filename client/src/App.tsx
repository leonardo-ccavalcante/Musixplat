import { Route, Switch } from "wouter";
import { CohortsExplorerPage } from "./pages/CohortsExplorerPage";

// SPA shell (mobile-first, dark-only). Screen 01 = Cohorts Explorer.
export function App() {
  return (
    <Switch>
      <Route path="/" component={CohortsExplorerPage} />
      <Route path="/cohorts" component={CohortsExplorerPage} />
      <Route>
        <main className="p-6 text-mxm-content-secondary">Not found</main>
      </Route>
    </Switch>
  );
}
