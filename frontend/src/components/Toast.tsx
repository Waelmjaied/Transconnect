import { useCallback, useRef, useState } from 'react'

export function useToast() {
  const [message, setMessage] = useState('')
  const timer = useRef<number | undefined>(undefined)
  const showToast = useCallback((text: string) => {
    setMessage(text)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(''), 2400)
  }, [])
  const toast = message ? <div className="toast" role="status">{message}</div> : null
  return { toast, showToast }
}
