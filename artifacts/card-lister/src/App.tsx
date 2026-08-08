import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import Dashboard from "./pages/dashboard";
import UploadPage from "./pages/upload";
import CardsPage from "./pages/cards/index";
import CardDetailPage from "./pages/cards/detail";
import ListingsPage from "./pages/listings";
import ImportPage from "./pages/import";
import SettingsPage from "./pages/settings";
import ImportSoldPage from "./pages/import-sold";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/upload" component={UploadPage} />
      <Route path="/cards" component={CardsPage} />
      <Route path="/cards/:id" component={CardDetailPage} />
      <Route path="/listings" component={ListingsPage} />
      <Route path="/import" component={ImportPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/import-sold" component={ImportSoldPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
