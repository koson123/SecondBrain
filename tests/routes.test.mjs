import { test } from "node:test";
import assert from "node:assert/strict";
import { destinations, parseRoute, routeFor } from "../src/routes.mjs";
test("each collection has its own stable URL", () => {
  for (const [view, path] of Object.entries(destinations)) {
    assert.equal(parseRoute(path).view, view);
    assert.equal(routeFor(view), path);
  }
  assert.equal(parseRoute("/life/journal").area, "Journal");
  assert.equal(routeFor("Life areas", "Journal"), "/life/journal");
  assert.equal(parseRoute("/life/journal/").view, "Life areas");
});
test("search, view, trash and source-entry links survive URL serialization", () => {
  const route = parseRoute("/ideas?mode=explore&entry=note-1&source=message-2");
  assert.equal(route.mode, "explore");
  assert.equal(route.entryId, "note-1");
  assert.equal(route.sourceMessage, "message-2");
  const search = parseRoute("/search?q=watering%20plants&journal=1");
  assert.equal(search.view, "Search");
  assert.equal(search.query, "watering plants");
  assert.equal(search.journal, true);
  assert.equal(parseRoute("/archive?trash=1").trash, true);
  assert.equal(parseRoute("/imports").view, "Imports");
  assert.equal(parseRoute("/settings").view, "Settings");
});
test("unknown paths never masquerade as the desk or another collection", () => {
  for (const path of [
    "/unknown",
    "/life/unknown",
    "/ideas/extra",
    "/life/journal/extra",
  ])
    assert.equal(parseRoute(path).view, "Not found");
});
