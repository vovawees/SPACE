/* Подтверждение в стиле приложения вместо системного confirm():
   const yes = await ask({ title: "Удалить доску?", ok: "Удалить", danger: true }); */

export interface Ask {
  title: string;
  text?: string;
  ok?: string;
  cancel?: string;
  /** Разрушительное действие: красная кнопка, фокус на «Отмена». */
  danger?: boolean;
}

interface Pending extends Ask {
  resolve: (yes: boolean) => void;
}

export const asking = $state<{ current: Pending | null }>({ current: null });

export function ask(o: Ask): Promise<boolean> {
  asking.current?.resolve(false);
  return new Promise((resolve) => (asking.current = { ...o, resolve }));
}

export function answer(yes: boolean) {
  const p = asking.current;
  asking.current = null;
  p?.resolve(yes);
}
