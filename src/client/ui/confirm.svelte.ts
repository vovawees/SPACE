/* Подтверждение в стиле приложения вместо системного confirm():
   const yes = await ask({ title: "Удалить доску?", ok: "Удалить", danger: true }); */

export interface Ask {
  title: string;
  text?: string;
  ok?: string;
  cancel?: string;
  /** Разрушительное действие: красная кнопка, фокус на «Отмена». */
  danger?: boolean;
  /** Поле ввода: тогда это не «да/нет», а вопрос с ответом-текстом. */
  input?: { placeholder?: string; value?: string; multiline?: boolean; type?: "text" | "number" | "url" };
}

interface Pending extends Ask {
  value: string;
  resolve: (yes: boolean, value: string) => void;
}

export const asking = $state<{ current: Pending | null }>({ current: null });

export function ask(o: Ask): Promise<boolean> {
  asking.current?.resolve(false, "");
  return new Promise((resolve) => (asking.current = { ...o, value: "", resolve: (yes) => resolve(yes) }));
}

/** Спросить текст: null — отмена. */
export function promptText(o: Ask & { input: NonNullable<Ask["input"]> }): Promise<string | null> {
  asking.current?.resolve(false, "");
  return new Promise((resolve) => (asking.current = { ...o, value: o.input.value ?? "", resolve: (yes, v) => resolve(yes ? v : null) }));
}

export function answer(yes: boolean) {
  const p = asking.current;
  asking.current = null;
  p?.resolve(yes, p.value);
}
