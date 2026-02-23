import { createSignal, Show, For } from "solid-js";
import { diaryStore } from "~/stores/diary";
import { searchEntries, filterByDate } from "~/utils/search";
import type { DiaryEntry } from "~/models/types";
import DiaryCard from "~/components/library/DiaryCard";
import DiarySearch from "~/components/library/DiarySearch";
import DiaryDetail from "~/components/library/DiaryDetail";
import { toastStore } from "~/stores/toast";

export default function Library() {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [dateFilter, setDateFilter] = createSignal<"all" | "today" | "week">("all");
  const [selectedEntry, setSelectedEntry] = createSignal<DiaryEntry | null>(null);

  const filteredEntries = () => {
    let result = diaryStore.entries();
    result = searchEntries(result, searchQuery());
    result = filterByDate(result, dateFilter());
    return result;
  };

  async function handleDelete(id: string) {
    try {
      await diaryStore.deleteEntry(id);
      setSelectedEntry(null);
      toastStore.success("Entry deleted");
    } catch (err) {
      console.error("[Library] Failed to delete entry:", err);
      toastStore.error("Failed to delete entry");
    }
  }

  return (
    <div class="w-full max-w-5xl flex flex-col gap-6 animate-slide-up-in">
      <h1 class="text-xl font-display font-bold tracking-wider text-text-primary">
        LIBRARY
      </h1>

      {/* Search & filter */}
      <DiarySearch
        onSearch={setSearchQuery}
        onFilterDate={setDateFilter}
      />

      {/* Entries grid */}
      <Show
        when={filteredEntries().length > 0}
        fallback={
          <div class="flex flex-col items-center justify-center py-20 text-center">
            <div class="text-text-secondary/30 font-mono text-sm mb-2">
              {diaryStore.entries().length === 0
                ? "No log entries yet"
                : "No entries match your search"}
            </div>
            <Show when={diaryStore.entries().length === 0}>
              <p class="text-text-secondary/50 text-xs font-mono">
                Record your first video diary entry to get started.
              </p>
            </Show>
          </div>
        }
      >
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <For each={filteredEntries()}>
            {(entry) => (
              <DiaryCard
                entry={entry}
                onClick={() => setSelectedEntry(entry)}
              />
            )}
          </For>
        </div>

        <p class="text-xs font-mono text-text-secondary/50">
          Showing {filteredEntries().length} of {diaryStore.entries().length} entries
        </p>
      </Show>

      {/* Detail modal */}
      <Show when={selectedEntry()}>
        <DiaryDetail
          entry={selectedEntry()!}
          onClose={() => setSelectedEntry(null)}
          onDelete={handleDelete}
        />
      </Show>
    </div>
  );
}
