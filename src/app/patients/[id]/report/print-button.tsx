'use client';
export function PrintButton() {
  return (
    <button
      type="button"
      className="no-print mt-4 inline-flex h-11 items-center rounded-md border px-4 text-sm"
      onClick={() => window.print()}
    >
      Print this report
    </button>
  );
}
