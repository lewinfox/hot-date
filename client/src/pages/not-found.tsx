/**
 * pages/not-found.tsx — 404 Error Page
 *
 * Rendered by the Router in App.tsx as the catch-all route when no other route
 * matches the current URL. For example, visiting "/misspelled-route" would land
 * here because the router only knows about "/" and "/event/:slug".
 *
 * This is a purely presentational component — it displays a static error message
 * with no interactivity. The developer-facing message ("Did you forget to add
 * the page to the router?") is intentional: it signals to developers that a 404
 * in development usually means a missing route registration, not a broken link.
 */

import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    // Full-screen centred layout — same pattern as the loading skeleton in Event.tsx.
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            {/* AlertCircle is an icon from the lucide-react icon library. */}
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Did you forget to add the page to the router?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
