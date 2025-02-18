import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseFetchOptions extends RequestInit {
  autoInvoke?: boolean;
}

export function useFetch<T>(url?: string, { autoInvoke = true, ...options }: UseFetchOptions = {}) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const controller = useRef<AbortController | null>(null);

  const refetch = useCallback(({ ...payload }: any = {}): Promise<T | null> => {
    if (!url) {
      return Promise.resolve(null);
    }

    if (controller.current) {
      controller.current.abort();
    }

    controller.current = new AbortController();

    setLoading(true);

    return fetch(url, { signal: controller.current.signal, ...options, ...payload })
      .then((res) => res.json())
      .then((res) => {
        console.log('[useFetch] refetch res', res);
        setData(res);
        setLoading(false);
        return res as T;
      })
      .catch((err) => {
        console.log('[useFetch] refetch err', err);
        setLoading(false);

        if (err.name === 'AbortError') {
          return null;
        }

        if (err.name !== 'AbortError') {
          setError(err);
        }

        throw err;
      });
  }, [url]);

  const abort = useCallback(() => {
    if (controller.current) {
      controller.current?.abort('');
    }
  }, []);

  useEffect(() => {
    if (autoInvoke) {
      refetch(url);
    }

    return () => {
      if (controller.current) {
        controller.current.abort('');
      }
    };
  }, [refetch, autoInvoke, url]);

  return { data, loading, error, refetch, abort };
}