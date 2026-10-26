import type { NodeView } from "../store.svelte.ts";

/** Что получает компонент содержимого узла. */
export interface NodeCompProps {
  v: NodeView;
  sel: boolean;
  editing: boolean;
}
