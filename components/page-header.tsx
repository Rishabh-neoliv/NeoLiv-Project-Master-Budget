// A page's heading, the same on every page (user, 2026-11-27): the title with search and the bell at the right end of
// its line, then the description with the page's own buttons to its right. `above` is a small line over the title
// (a breadcrumb), `icon` sits before it.
import { TopTools } from "@/components/top-tools";

export function PageHeader({ title, description, actions, above, icon }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; above?: React.ReactNode; icon?: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      {above && <div className="text-sm text-soft">{above}</div>}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="flex min-w-0 items-center gap-3 text-3xl font-semibold tracking-tight">{icon}{title}</h1>
        <TopTools />
      </div>
      {(description || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          {description && <div className="min-w-0 max-w-4xl flex-1 text-soft">{description}</div>}
          {actions && <div className="flex shrink-0 flex-wrap items-start gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}
