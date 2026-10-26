<script lang="ts">
  /* Справка по горячим клавишам и жестам. */
  import { keyLabel } from "../../lib/util.ts";
  import Dialog from "../../ui/Dialog.svelte";
  import { useBoard } from "../board.svelte.ts";

  const b = useBoard();

  type Row = [keys: string, label: string];
  const sections: { title: string; rows: Row[] }[] = [
    {
      title: "Инструменты",
      rows: [
        ["V", "Выделение"],
        ["H", "Рука (или зажать пробел)"],
        ["N", "Заметка"],
        ["T", "Текст"],
        ["C", "Код"],
        ["R", "Прямоугольник"],
        ["O", "Эллипс"],
        ["D", "Рисование — круг, стрелка, рамка распознаются"],
        ["P", "Перо без распознавания"],
        ["A", "Стрелка"],
        ["L", "Линия"],
        ["F", "Рамка"],
        ["E", "Ластик"],
        ["K", "Указка"],
      ],
    },
    {
      title: "Холст",
      rows: [
        ["Колесо", "Мышь — масштаб, тачпад — прокрутка (настраивается)"],
        ["Mod+Колесо", "Масштаб"],
        ["Shift+Колесо", "Прокрутка вбок"],
        ["Пробел+Тянуть", "Двигать холст (также средняя или правая кнопка)"],
        ["Shift+1", "Показать всё"],
        ["Shift+2", "Показать выделенное"],
        ["Mod+0", "Масштаб 100 %"],
        ["Mod+= / Mod+-", "Приблизить / отдалить"],
        ["Двойной щелчок", "Новая заметка на пустом месте"],
      ],
    },
    {
      title: "Правка",
      rows: [
        ["Mod+Z", "Отменить"],
        ["Mod+Shift+Z", "Повторить"],
        ["Mod+C / Mod+X / Mod+V", "Копировать, вырезать, вставить (в том числе картинки, файлы и ссылки)"],
        ["Mod+D", "Дублировать"],
        ["Mod+Alt+C / Mod+Alt+V", "Взять оформление / применить к выделенному"],
        ["Alt+Тянуть", "Перетащить копию"],
        ["Del", "Удалить"],
        ["Mod+A", "Выделить всё"],
        ["Mod+G", "Обернуть в рамку"],
        ["G", "Разложить выделенное сеткой"],
        ["Mod+L", "Закрепить / открепить"],
        ["Mod+] / Mod+[", "Выше / ниже (с Shift — на передний / задний план)"],
        ["Стрелки", "Сдвинуть на 1 px (с Shift — на 10)"],
        ["Enter", "Редактировать, переименовать, открыть"],
        ["Esc", "Закончить, сбросить инструмент, снять выделение"],
      ],
    },
    {
      title: "Выделение и форма",
      rows: [
        ["Shift+Щелчок", "Добавить к выделению или убрать"],
        ["Тянуть по пустому", "Рамка выделения (с Shift — добавить)"],
        ["Shift при размере", "Сохранять пропорции"],
        ["Alt при размере", "От центра"],
        ["Shift при повороте", "Шаг 15°"],
        ["Mod при переносе", "Без прилипания"],
        ["Alt у стрелки", "Прикрепить в точку, а не к центру"],
      ],
    },
    {
      title: "Поиск и вид",
      rows: [
        ["Mod+K", "Команды"],
        ["Mod+F", "Найти на доске"],
        ["B", "Библиотека объектов"],
        ["Shift+S", "Прилипание и направляющие"],
        ["?", "Эта справка"],
      ],
    },
    {
      title: "Общение",
      rows: [
        ["/", "Сообщение у курсора (Enter — оставить, Esc — убрать)"],
        ["M", "Чат доски"],
      ],
    },
    {
      title: "Телефон и планшет",
      rows: [
        ["Один палец", "По пустому месту — двигать доску, по объекту — перенести"],
        ["Щипок", "Масштаб"],
        ["Долгое касание", "На пустом месте: потянуть — рамка выделения, отпустить — меню"],
        ["Касание двумя пальцами", "Отменить"],
        ["Касание тремя пальцами", "Повторить"],
        ["Кнопка «Несколько»", "Выделять несколько объектов касаниями (в панели над объектом)"],
      ],
    },
  ];

  /** Сочетание из нескольких вариантов через « / ». */
  const variants = (k: string) => k.split(" / ").map((v) => keyLabel(v));
</script>

<Dialog title="Горячие клавиши" width={760} onclose={() => (b.ui.shortcuts = false)}>
  <div class="cols">
    {#each sections as sec (sec.title)}
      <section>
        <h3>{sec.title}</h3>
        {#each sec.rows as [k, label] (k + label)}
          <div class="row">
            <span class="label">{label}</span>
            <span class="keys">
              {#each variants(k) as parts, vi (vi)}
                {#if vi}<span class="or">/</span>{/if}
                <span class="kbd">{#each parts as p, pi (pi)}<span>{p}</span>{/each}</span>
              {/each}
            </span>
          </div>
        {/each}
      </section>
    {/each}
  </div>
</Dialog>

<style>
  .cols {
    columns: 2 300px;
    column-gap: 28px;
  }
  section {
    break-inside: avoid;
    margin-bottom: 18px;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-3);
    letter-spacing: 0.02em;
  }
  .row {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    align-items: center;
    padding: 5px 0;
    font-size: 13px;
    border-bottom: 1px solid var(--line);
  }
  .row:last-child {
    border-bottom: 0;
  }
  .keys {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 3px;
    flex: none;
    max-width: 55%;
  }
  .or {
    color: var(--ink-4);
    font-size: 11px;
  }
  .label {
    color: var(--ink-2);
    line-height: 1.4;
    min-width: 0;
  }
</style>
