import type { DiaryEntry } from "~/models/types";

/**
 * Simple client-side search. Matches substring in title or tags.
 * Case-insensitive.
 */
export function searchEntries(
  entries: DiaryEntry[],
  query: string,
): DiaryEntry[] {
  if (!query.trim()) return entries;
  const q = query.toLowerCase().trim();
  return entries.filter(
    (entry) =>
      entry.title.toLowerCase().includes(q) ||
      entry.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
}

/**
 * Filter entries by date range.
 */
export function filterByDate(
  entries: DiaryEntry[],
  filter: "all" | "today" | "week",
): DiaryEntry[] {
  if (filter === "all") return entries;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  if (filter === "today") {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return entries.filter((e) => e.createdAt >= startOfDay.getTime());
  }

  if (filter === "week") {
    return entries.filter((e) => now - e.createdAt < 7 * dayMs);
  }

  return entries;
}
