'use client';
// Tiny in-app toast (avoids extra deps). Real Phase 1 swap-in: Radix Toast.
import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastCtx {
  push: (text: string, kind?: ToastKind) => void;
}

const ToastContext = React.createContext<ToastCtx | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const push = React.useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((curr) => [...curr, { id, kind, text }]);
    setTimeout(() => {
      setItems((curr) => curr.filter((t) => t.id !== id));
    }, 3500);
  }, []);
  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={cn(
                'pointer-events-auto max-w-md rounded-lg px-4 py-3 text-sm font-medium shadow-lg',
                t.kind === 'success' && 'bg-emerald-600 text-white',
                t.kind === 'error' && 'bg-red-600 text-white',
                t.kind === 'info' && 'bg-slate-800 text-white'
              )}
            >
              {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
