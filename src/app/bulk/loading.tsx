export default function BulkCreateLoading() {
  return (
    <main className="bg-mihrab min-h-[calc(100dvh-65px)] px-5 py-12">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="h-3 w-28 rounded-full bg-white/10" />
        <div className="mt-5 h-12 max-w-xl rounded-xl bg-white/[0.07]" />
        <div className="mt-4 h-5 max-w-2xl rounded-lg bg-white/[0.05]" />
        <div className="mt-10 h-96 rounded-2xl border border-[var(--hairline-soft)] bg-white/[0.025]" />
      </div>
    </main>
  );
}
