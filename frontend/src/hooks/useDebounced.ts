/** Delays a fast-changing value, for example search text while typing. */
import { useEffect, useState } from 'react';
/** Returns `value`, updated only after it has stayed the same for `ms` milliseconds. */
export function useDebounced<T>(value: T, ms = 150): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}
