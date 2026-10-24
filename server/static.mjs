import path from "node:path";

// Use the platform's path semantics. Comparing with a literal '/' rejects
// every child path on Windows, whose resolved paths use backslashes.
export function resolveStaticPath(directory, urlPath, paths = path) {
  const candidate = paths.resolve(directory, "." + decodeURIComponent(urlPath));
  const relative = paths.relative(directory, candidate);
  if (
    relative === ".." ||
    relative.startsWith(".." + paths.sep) ||
    paths.isAbsolute(relative)
  )
    return null;
  return candidate;
}
