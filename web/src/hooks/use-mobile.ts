import * as React from "react"

/*
 * App-wide rule (#172): below Tailwind's `md` breakpoint (768px, what the
 * sidebar's `md:` classes use) the sidebar becomes a sheet. Read from
 * matchMedia so the first render is already right and tests can stub it.
 */
const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
