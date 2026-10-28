<script lang="ts">
  /* Выбор эмодзи: наборы по темам и поле для любого своего. */
  import { EMOJI_GROUPS } from "../../library.ts";

  let { value, set }: { value: string | undefined; set: (e: string) => void } = $props();
  let group = $state(0);
  const list = $derived(EMOJI_GROUPS[group]?.list ?? []);

  function own(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const t = el.value.trim();
    if (t) set([...t].slice(0, 4).join(""));
    el.value = "";
  }
</script>

<div class="in-emoji">
  <div class="in-chips scroll-x">
    {#each EMOJI_GROUPS as g, i (g.name)}
      <button type="button" class="in-chip" class:on={group === i} onclick={() => (group = i)}>{g.name}</button>
    {/each}
  </div>
  <div class="in-emoji-grid">
    {#each list as e (e)}
      <button type="button" class:on={value === e} aria-label={e} onclick={() => set(e)}>{e}</button>
    {/each}
  </div>
  <input
    class="input sm"
    placeholder="Свой: вставьте любой эмодзи"
    maxlength="12"
    onchange={own}
    onkeydown={(e) => {
      e.stopPropagation();
      if (e.key === "Enter") own(e);
    }}
  />
</div>
