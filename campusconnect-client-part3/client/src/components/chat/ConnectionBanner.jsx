import { Loader2, WifiOff } from 'lucide-react';

export default function ConnectionBanner({ connection }) {
  if (connection === 'reconnecting') {
    return (
      <div role="status" className="flex items-center justify-center gap-2 bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning-ink">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Reconnecting… messages will send when you're back online
      </div>
    );
  }
  if (connection === 'error') {
    return (
      <div role="alert" className="flex items-center justify-center gap-2 bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger">
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
        Can't connect to live chat. Refresh the page or try again later.
      </div>
    );
  }
  return null;
}
