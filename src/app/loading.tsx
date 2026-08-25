export default function Loading() {
  return (
    <main
      id="main-content"
      className="flex flex-1 items-center justify-center bg-canvas text-foreground"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
        <p className="text-xs text-muted-foreground">Loading…</p>
      </div>
    </main>
  );
}
