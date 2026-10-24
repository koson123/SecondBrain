export const destinations = {
  Home: "/",
  Inbox: "/inbox",
  Projects: "/projects",
  "Life areas": "/life",
  Ideas: "/ideas",
  Knowledge: "/knowledge",
  Archive: "/archive",
  Imports: "/imports",
  Settings: "/settings",
  Search: "/search",
};
export function routeFor(view, area = "") {
  return (
    (destinations[view] || "/") +
    (area ? "/" + encodeURIComponent(area.toLowerCase()) : "")
  );
}
export function parseRoute(input) {
  const url = new URL(input, "http://secondbrain.local");
  const path = url.pathname.replace(/\/$/, "") || "/";
  const parts = path.split("/").filter(Boolean);
  let view = Object.entries(destinations).find(
    ([, value]) => value === path,
  )?.[0];
  let area = "";
  if (parts[0] === "life" && parts.length === 2) {
    const name = ["Journal", "Faith", "Health", "School", "Finances"].find(
      (a) => a.toLowerCase() === parts[1],
    );
    if (name) {
      view = "Life areas";
      area = name;
    }
  }
  if (path === "/imports") view = "Imports";
  if (path === "/settings") view = "Settings";
  if (path === "/search") view = "Search";
  return {
    view: view || "Not found",
    area,
    path,
    query: url.searchParams.get("q") || "",
    journal: url.searchParams.get("journal") === "1",
    mode: url.searchParams.get("mode") === "explore" ? "explore" : "cards",
    trash: url.searchParams.get("trash") === "1",
    entryId: url.searchParams.get("entry") || "",
    sourceMessage: url.searchParams.get("source") || "",
    url: url.pathname + url.search,
  };
}
