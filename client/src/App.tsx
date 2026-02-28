import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Import pages
import Home from "@/pages/Home";
import EventPage from "@/pages/Event";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/event/:slug" component={EventPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        {/* Fixed neon background — sits outside any overflow container so it's truly fixed */}
        <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
          <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[90vw] h-[55vh] bg-orange-500/25 blur-[140px] rounded-full" />
          <div className="absolute top-[20%] left-[-15%] w-[55vw] h-[55vh] bg-pink-600/20 blur-[120px] rounded-full" />
          <div className="absolute top-[15%] right-[-15%] w-[55vw] h-[55vh] bg-purple-700/22 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] left-[15%] w-[70vw] h-[45vh] bg-blue-700/15 blur-[110px] rounded-full" />
        </div>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
