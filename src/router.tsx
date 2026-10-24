import React, { useEffect, useState } from "react";
import { parseRoute } from "./routes.mjs";
export function go(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"](
    { secondbrain: true },
    "",
    to,
  );
  window.dispatchEvent(new PopStateEvent("popstate"));
}
export function useRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.href));
  useEffect(() => {
    const update = () => setRoute(parseRoute(location.href));
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return route;
}
export function NavLink({
  href,
  children,
  onClick,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (
          e.defaultPrevented ||
          e.button !== 0 ||
          e.ctrlKey ||
          e.metaKey ||
          e.shiftKey ||
          e.altKey ||
          props.target === "_blank"
        )
          return;
        e.preventDefault();
        go(href || "/");
      }}
    >
      {children}
    </a>
  );
}
export function changeQuery(
  values: Record<string, string | null>,
  replace = false,
) {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  go(url.pathname + url.search, replace);
}
