import { createSignal } from "solid-js";
import type { DiaryTemplate } from "~/models/types";
import { templateRegistry } from "~/components/templates/registry";

const [activeTemplate, setActiveTemplate] = createSignal<DiaryTemplate>(
  templateRegistry[0],
);

export const templateStore = {
  activeTemplate,
  setActiveTemplate,

  /** Get all available templates */
  getTemplates(): DiaryTemplate[] {
    return templateRegistry;
  },

  /** Set template by ID */
  setTemplateById(id: string): void {
    const t = templateRegistry.find((t) => t.id === id);
    if (t) setActiveTemplate(t);
  },
};
