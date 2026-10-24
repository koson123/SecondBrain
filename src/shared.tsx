import React from "react";
import {
  Inbox,
  Layers,
  Heart,
  Lightbulb,
  BookOpen,
  Archive,
  FileText,
} from "lucide-react";
export const CATS = [
  "Inbox",
  "Projects",
  "Life areas",
  "Ideas",
  "Knowledge",
  "Archive",
];
const ICONS: any = {
  Inbox,
  Projects: Layers,
  "Life areas": Heart,
  Ideas: Lightbulb,
  Knowledge: BookOpen,
  Archive,
};
export const COLORS: any = {
  Inbox: "#b9c6d0",
  Projects: "#c0baed",
  "Life areas": "#dab8a3",
  Ideas: "#ddcd93",
  Knowledge: "#a7c6b4",
  Archive: "#aeb1b6",
};
export const DESC: any = {
  Inbox: "Unsorted captures and conversations.",
  Projects: "Active work and next steps.",
  "Life areas": "Ongoing responsibilities and Journal.",
  Ideas: "Possibilities to revisit.",
  Knowledge: "Useful notes and references.",
  Archive: "Inactive and completed notes.",
};
export const AREA = ["Journal", "Faith", "Health", "School", "Finances"];
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const date = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const Icon = ({ name, ...props }: any) => {
  const I = ICONS[name] || FileText;
  return <I {...props} />;
};
export function download(data: any, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function SectionHeading({ title, subtitle }: any) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
