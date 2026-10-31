import { useCallback, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '../services/api';

/**
 * Run an async loader whenever `deps` change. Ignores stale responses so fast typing
 * or filter changes never show out-of-order results.
 */
export function useAsync(loader, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null });
  const seq = useRef(0);

  const run = useCallback(async () => {
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader();
      if (id === seq.current) setState({ data, loading: false, error: null });
      return data;
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, loading: false, error: getErrorMessage(e) }));
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (enabled) run();
  }, [run, enabled]);

  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function useDebounce(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Eye Care HMS` : 'Eye Care HMS';
  }, [title]);
}
