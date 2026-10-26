<script lang="ts">
  import { PEOPLE_COLORS } from "../../shared/colors.ts";

  let { value = $bindable(), colors = PEOPLE_COLORS as readonly string[] }: { value: string; colors?: readonly string[] } = $props();
</script>

<div class="dots" role="radiogroup" aria-label="Цвет">
  {#each colors as c (c)}
    <button
      type="button"
      class="dot"
      class:on={value === c}
      style:--c={c}
      role="radio"
      aria-checked={value === c}
      aria-label={c}
      onclick={() => (value = c)}
    ></button>
  {/each}
</div>

<style>
  .dots {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .dot {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.15);
    transition: transform var(--t-fast) var(--ease-out), box-shadow var(--t-fast);
  }
  .dot:hover {
    transform: scale(1.1);
  }
  .dot.on {
    box-shadow:
      0 0 0 2px var(--surface-1),
      0 0 0 4px var(--c);
  }
</style>
