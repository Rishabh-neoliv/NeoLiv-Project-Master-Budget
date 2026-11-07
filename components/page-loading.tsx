// Shown at once while a signed-in page loads its data.
export function PageLoading() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-56 animate-pulse rounded bg-well" />
      <div className="h-24 animate-pulse rounded-lg bg-well" />
      <div className="h-64 animate-pulse rounded-lg bg-well" />
    </div>
  );
}
