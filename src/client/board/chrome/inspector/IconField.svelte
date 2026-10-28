<script lang="ts">
  /* Выбор значка из набора с поиском по-русски. */
  import { searchIcons } from "../../nodes/icons.ts";

  let { value, set }: { value: string | undefined; set: (id: string) => void } = $props();
  let q = $state("");
  const list = $derived(searchIcons(q));
</script>

<div class="in-icons">
  <input class="input sm" placeholder="Найти: звезда, дом, кубок…" bind:value={q} onkeydown={(e) => e.stopPropagation()} />
  <div class="in-icon-grid">
    {#each list as it (it.id)}
      {@const C = it.comp}
      <button type="button" class:on={value === it.id} aria-label={it.words.split(" ")[0]} title={it.words.split(" ")[0]} onclick={() => set(it.id)}><C size={18} /></button>
    {:else}
      <span class="in-empty">Ничего не нашлось</span>
    {/each}
  </div>
</div>
