import { createSignal } from "solid-js";

interface DiarySearchProps {
  onSearch: (query: string) => void;
  onFilterDate: (filter: "all" | "today" | "week") => void;
}

export default function DiarySearch(props: DiarySearchProps) {
  const [query, setQuery] = createSignal("");
  const [dateFilter, setDateFilter] = createSignal<"all" | "today" | "week">("all");

  function handleInput(value: string) {
    setQuery(value);
    props.onSearch(value);
  }

  function handleDateFilter(filter: "all" | "today" | "week") {
    setDateFilter(filter);
    props.onFilterDate(filter);
  }

  return (
    <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
      {/* Search input */}
      <div class="relative flex-1">
        <svg
          class="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary/50"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <circle cx="7" cy="7" r="5" />
          <line x1="11" y1="11" x2="14" y2="14" />
        </svg>
        <input
          type="text"
          value={query()}
          onInput={(e) => handleInput(e.currentTarget.value)}
          placeholder="Search logs..."
          class="w-full bg-bg-elevated border border-border-default rounded-md pl-9 pr-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-accent-cyan/60 transition-colors font-mono"
        />
      </div>

      {/* Date filter pills */}
      <div class="flex gap-1.5">
        {(["all", "today", "week"] as const).map((filter) => (
          <button
            class={`px-3 py-1.5 rounded-md text-xs font-mono transition-all duration-150 cursor-pointer border ${
              dateFilter() === filter
                ? "border-accent-cyan/60 bg-accent-cyan/20 text-accent-cyan"
                : "border-border-default bg-bg-elevated text-text-secondary hover:text-text-primary"
            }`}
            onClick={() => handleDateFilter(filter)}
          >
            {filter === "all" ? "All" : filter === "today" ? "Today" : "This Week"}
          </button>
        ))}
      </div>
    </div>
  );
}
