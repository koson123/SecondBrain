export async function api(path: string, options: RequestInit = {}) {
  const res = await fetch("/api" + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Brain-Request": "1",
      ...options.headers,
    },
  });
  const data = await res.json();
  if (!res.ok)
    throw Object.assign(new Error(data.error || "Request failed"), {
      status: res.status,
      current: data.current,
    });
  return data;
}
export const send = (path: string, data: unknown, method = "POST") =>
  api(path, { method, body: JSON.stringify(data) });
export type Entry = {
  openSource?: boolean;
  sourceMessage?: string;
  id: string;
  title: string;
  body: string;
  category: string;
  type: string;
  area: string;
  status: string;
  goal: string;
  handoff: string;
  nextAction: string;
  date: string;
  revision: number;
  updated: string;
  created: string;
  deleted: number;
  hidden: number;
  snooze: string;
  sourceId?: string;
};
export type Connection = {
  id: string;
  fromId: string;
  toId: string;
  label: string;
};
