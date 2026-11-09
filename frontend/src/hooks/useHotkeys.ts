/** Keyboard shortcuts that switch off while the teacher is typing. */
import { useEffect, useRef } from 'react';

/** True when the user is typing, so single-key shortcuts must not fire (requirement §9.4). */
export function isTypingTarget(t: EventTarget | null): boolean {
  const element = t as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (element as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'range'].includes(type);
  }
  return false;
}

/** True if this event is the given key pressed without Ctrl, Alt or Cmd. */
export function matchesKey(e: KeyboardEvent, key: string): boolean {
  if (!key) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return e.key.toLowerCase() === key.toLowerCase();
}

/** Return false from a handler to let the key through (e.g. when the user is typing). */
type Handlers = Record<string, (e: KeyboardEvent) => boolean | void>;

/** Binds single keys (from Settings) to handlers; ignored while typing or when a dialog is open. */
export function useHotkeys(bindings: { key: string; handler: (e: KeyboardEvent) => void }[], enabled = true) {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      for (const b of ref.current) {
        if (matchesKey(e, b.key)) {
          e.preventDefault();
          b.handler(e);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** Global shortcuts with modifiers, e.g. Ctrl+K. These work even while typing. */
export function useGlobalCombo(handlers: Handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const combo = `${e.ctrlKey || e.metaKey ? 'mod+' : ''}${e.shiftKey ? 'shift+' : ''}${e.key.toLowerCase()}`;
      const handler = ref.current[combo];
      if (handler && handler(e) !== false) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
