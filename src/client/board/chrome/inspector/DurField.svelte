<script lang="ts">
  /* Длительность: дни, часы, минуты и секунды отдельными полями — любое
     время до 999 дней — и готовые варианты. Можно вписать и текстом:
     «1 ч 30 мин», «2д 5ч», «90 с». */
  import { DAY, HOUR, MAX_DUR, MIN, SEC, durText, parseDur } from "../../nodes/timer.ts";

  let { value, set, presets = [], min = SEC }: { value: number; set: (ms: number) => void; presets?: number[]; min?: number } = $props();

  const parts = $derived({
    d: Math.floor(value / DAY),
    h: Math.floor((value % DAY) / HOUR),
    m: Math.floor((value % HOUR) / MIN),
    s: Math.floor((value % MIN) / SEC),
  });
  const UNITS = [
    ["d", "дн", DAY, 999],
    ["h", "ч", HOUR, 23],
    ["m", "мин", MIN, 59],
    ["s", "с", SEC, 59],
  ] as const;

  function commit(k: keyof typeof parts, raw: string) {
    const n = Math.max(0, Math.floor(Number(raw.replace(",", ".")) || 0));
    const next = { ...parts, [k]: n };
    const ms = next.d * DAY + next.h * HOUR + next.m * MIN + next.s * SEC;
    put(ms);
  }
  function put(ms: number) {
    const v = Math.max(min, Math.min(MAX_DUR, Math.round(ms)));
    if (v !== value) set(v);
  }

  let text = $state("");
  function commitText() {
    const ms = parseDur(text);
    if (ms !== null) put(ms);
    text = "";
  }

  function key(e: KeyboardEvent, k?: keyof typeof parts) {
    e.stopPropagation();
    const el = e.currentTarget as HTMLInputElement;
    if (e.key === "Enter") {
      e.preventDefault();
      if (k) commit(k, el.value);
      else commitText();
      el.blur();
    }
    if (k && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      const unit = UNITS.find((u) => u[0] === k)![2];
      put(value + (e.key === "ArrowUp" ? unit : -unit) * (e.shiftKey ? 10 : 1));
    }
  }
</script>

<div class="in-dur">
  {#each UNITS as [k, label] (k)}
    <label class="in-dur-box" style:--uw="{label.length * 6.5 + 3}px">
      <input class="input sm" inputmode="numeric" value={parts[k]} aria-label={label} onchange={(e) => commit(k, e.currentTarget.value)} onkeydown={(e) => key(e, k)} onfocus={(e) => e.currentTarget.select()} />
      <span>{label}</span>
    </label>
  {/each}
</div>
<input
  class="input sm in-dur-text"
  placeholder="или текстом: 1 ч 30 мин, 3д 2ч 5с"
  bind:value={text}
  onchange={commitText}
  onkeydown={(e) => key(e)}
/>
{#if presets.length}
  <div class="in-chips">
    {#each presets as ms (ms)}
      <button type="button" class="in-chip" class:on={value === ms} onclick={() => put(ms)}>{durText(ms)}</button>
    {/each}
  </div>
{/if}
