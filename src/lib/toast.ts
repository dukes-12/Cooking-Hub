import { useSyncExternalStore } from 'react';

/** Petits messages en bas d'écran, avec « Annuler » quand l'action peut être défaite. */
export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(message: string, undo?: () => void) {
  current = { id: Date.now(), message, undo };
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    emit();
  }, undo ? 5000 : 2200);
  emit();
}

export function dismissToast() {
  clearTimeout(timer);
  current = null;
  emit();
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => current,
  );
}
