import { useCallback, useEffect, useState } from 'react'

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true })
  const [tick, setTick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps)
  useEffect(() => {
    let alive = true
    setState((current) => ({ ...current, loading: true, error: undefined }))
    run().then((data) => alive && setState({ data, loading: false }), (error) => alive && setState({ error, loading: false }))
    return () => { alive = false }
  }, [run, tick])
  const reload = useCallback(() => setTick((value) => value + 1), [])
  return { ...state, reload }
}
