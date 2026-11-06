"use client";

import * as React from "react";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Minimal data hook for the service layer. Pages stay declarative while all
 * reads/writes still flow through src/lib/api/*.
 */
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: React.DependencyList = [],
) {
  const [state, setState] = React.useState<ApiState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = React.useState(0);
  const fetcherRef = React.useRef(fetcher);

  React.useEffect(() => {
    fetcherRef.current = fetcher;
  });

  React.useEffect(() => {
    let active = true;

    fetcherRef
      .current()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          data: null,
          loading: false,
          error:
            error instanceof Error ? error.message : "Unable to load data right now.",
        });
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = React.useCallback(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    setNonce((value) => value + 1);
  }, []);

  const setData = React.useCallback(
    (updater: T | ((current: T | null) => T | null)) =>
      setState((current) => ({
        ...current,
        data:
          typeof updater === "function"
            ? (updater as (value: T | null) => T | null)(current.data)
            : updater,
      })),
    [],
  );

  return { ...state, reload, setData };
}
