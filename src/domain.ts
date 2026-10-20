export type Kind = "expense" | "income" | "transfer" | "credit";
export type Account = {
  id: string;
  name: string;
  opening: number;
  color: string;
};
export type Operation = {
  id: string;
  kind: Kind;
  title: string;
  amount: number;
  accountId: string;
  toAccountId: string;
  category: string;
  subcategory: string;
  date: string;
  note: string;
};
export type Data = { version: 1; accounts: Account[]; operations: Operation[] };
export const kinds: Record<Kind, string> = {
  expense: "Расход",
  income: "Доход",
  transfer: "Перевод",
  credit: "Кредит",
};
export const categories: Record<string, string[]> = {
  Продукты: ["Супермаркет", "Рынок", "Доставка продуктов"],
  "Кафе и рестораны": ["Кофе", "Обед", "Ресторан"],
  Транспорт: ["Такси", "Общественный транспорт", "Автомобиль"],
  Дом: ["Аренда", "Коммунальные услуги", "Покупки для дома"],
  Здоровье: ["Аптека", "Врач"],
  Развлечения: ["Подписки", "Кино", "Хобби"],
  Покупки: ["Одежда", "Техника"],
  Зарплата: [],
  Подарки: [],
  Другое: [],
};
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const money = (cents: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: cents % 100 ? 2 : 0,
  }).format(cents / 100);
export function parseMoney(value: string): number {
  const s = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [whole, fraction = ""] = s.split(".");
  const n = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(n) ? n : NaN;
}
export const emptyData = (): Data => ({
  version: 1,
  accounts: [
    { id: "main", name: "Основной счёт", opening: 0, color: "#7564df" },
    { id: "cash", name: "Наличные", opening: 0, color: "#d7a25c" },
  ],
  operations: [],
});
export function balances(data: Data) {
  const result: Record<string, number> = Object.fromEntries(
    data.accounts.map((a) => [a.id, a.opening]),
  );
  for (const op of data.operations) {
    result[op.accountId] +=
      op.kind === "expense" || op.kind === "transfer" ? -op.amount : op.amount;
    if (op.kind === "transfer") result[op.toAccountId] += op.amount;
  }
  return result;
}
export function validate(op: Operation, accounts: Account[]): string {
  if (!op.title.trim()) return "Добавьте название операции";
  if (!Number.isSafeInteger(op.amount) || op.amount <= 0)
    return "Введите сумму больше нуля, до двух знаков после запятой";
  if (!accounts.some((a) => a.id === op.accountId)) return "Выберите счёт";
  if (
    op.kind === "transfer" &&
    (!accounts.some((a) => a.id === op.toAccountId) ||
      op.toAccountId === op.accountId)
  )
    return "Для перевода выберите другой счёт получателя";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(op.date) ||
    isNaN(Date.parse(op.date)) ||
    new Date(op.date).toISOString().slice(0, 10) !== op.date
  )
    return "Укажите корректную дату";
  if (
    (op.kind === "income" || op.kind === "expense") &&
    !categories[op.category]
  )
    return "Выберите категорию";
  if (op.subcategory && !categories[op.category]?.includes(op.subcategory))
    return "Проверьте подкатегорию";
  return "";
}
const normalize = (s: string) =>
  s
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
function similarity(a: string, b: string) {
  const x = normalize(a),
    y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length >= 3 && (y.includes(x) || x.includes(y))) return 0.85;
  const row = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const old = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        prev + (x[i - 1] === y[j - 1] ? 0 : 1),
      );
      prev = old;
    }
  }
  return 1 - row[y.length] / Math.max(x.length, y.length);
}
export function suggest(title: string, kind: Kind, operations: Operation[]) {
  if (normalize(title).length < 2 || kind === "transfer" || kind === "credit")
    return undefined;
  return operations
    .filter((o) => o.kind === kind)
    .map((o) => ({ op: o, score: similarity(title, o.title) }))
    .filter((x) => x.score >= 0.6)
    .sort((a, b) => b.score - a.score || b.op.date.localeCompare(a.op.date))[0]
    ?.op;
}
export function isData(value: unknown): value is Data {
  if (!value || typeof value !== "object") return false;
  const d = value as Data;
  return (
    d.version === 1 &&
    Array.isArray(d.accounts) &&
    d.accounts.length > 0 &&
    d.accounts.every(
      (a) =>
        a &&
        typeof a.id === "string" &&
        typeof a.name === "string" &&
        Number.isSafeInteger(a.opening) &&
        typeof a.color === "string",
    ) &&
    new Set(d.accounts.map((a) => a.id)).size === d.accounts.length &&
    Array.isArray(d.operations) &&
    d.operations.every(
      (o) =>
        o &&
        typeof o.id === "string" &&
        Object.hasOwn(kinds, o.kind) &&
        typeof o.title === "string" &&
        typeof o.note === "string" &&
        typeof o.subcategory === "string" &&
        !validate(o, d.accounts),
    )
  );
}
export function demoData(): Data {
  const d = emptyData();
  d.accounts[0].opening = 8450000;
  d.accounts[1].opening = 1250000;
  const items: [string, number, string, string, Kind][] = [
    ["Перекрёсток", 234050, "Продукты", "Супермаркет", "expense"],
    ["Кофе с собой", 29000, "Кафе и рестораны", "Кофе", "expense"],
    ["Зарплата", 12500000, "Зарплата", "", "income"],
    ["Яндекс Такси", 48000, "Транспорт", "Такси", "expense"],
    ["Кино с друзьями", 120000, "Развлечения", "Кино", "expense"],
  ];
  d.operations = items.map(
    ([title, amount, category, subcategory, kind], i) => ({
      id: crypto.randomUUID(),
      title,
      amount,
      category,
      subcategory,
      kind,
      accountId: "main",
      toAccountId: "",
      date: today(),
      note: "Демонстрационная операция " + (i + 1),
    }),
  );
  return d;
}

export function accountDeletionError(data: Data, id: string): string {
  if (!data.accounts.some((account) => account.id === id))
    return "Счёт не найден";
  if (data.accounts.length <= 1)
    return "Последний счёт удалить нельзя. Сначала добавьте другой.";
  if (
    data.operations.some(
      (op) =>
        op.accountId === id ||
        (op.kind === "transfer" && op.toAccountId === id),
    )
  )
    return "У счёта есть операции. Сначала удалите связанные операции, включая переводы, чтобы сохранить корректность истории и балансов.";
  return "";
}
