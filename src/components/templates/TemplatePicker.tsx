import { For } from "solid-js";
import { templateStore } from "~/stores/template";
import type { DiaryTemplate } from "~/models/types";

interface TemplatePickerProps {
  onSelect?: (template: DiaryTemplate) => void;
}

export default function TemplatePicker(props: TemplatePickerProps) {
  const templates = templateStore.getTemplates();

  function handleSelect(template: DiaryTemplate) {
    templateStore.setActiveTemplate(template);
    props.onSelect?.(template);
  }

  return (
    <div class="flex gap-2">
      <For each={templates}>
        {(template) => (
          <button
            class={`px-3 py-1.5 rounded-md text-xs font-mono transition-all duration-150 cursor-pointer border ${
              templateStore.activeTemplate().id === template.id
                ? "border-accent-cyan/60 bg-accent-cyan/20 text-accent-cyan"
                : "border-border-default bg-bg-elevated text-text-secondary hover:text-text-primary hover:border-text-secondary/40"
            }`}
            onClick={() => handleSelect(template)}
            title={template.description}
          >
            {template.name}
          </button>
        )}
      </For>
    </div>
  );
}
