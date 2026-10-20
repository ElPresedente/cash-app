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
export type CategoryMap = Record<string, string[]>;
export type Data = {
  version: 2;
  accounts: Account[];
  operations: Operation[];
  categories: CategoryMap;
};
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
  version: 2,
  categories: Object.fromEntries(
    Object.entries(categories).map(([name, subs]) => [name, [...subs]]),
  ),
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
export function validate(
  op: Operation,
  accounts: Account[],
  catalog: CategoryMap = categories,
): string {
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
    !Object.hasOwn(catalog, op.category)
  )
    return "Выберите категорию";
  if (op.subcategory && !catalog[op.category]?.includes(op.subcategory))
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
    d.version === 2 &&
    isCategoryMap(d.categories) &&
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
        !validate(o, d.accounts, d.categories),
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

const categoryKey = (name: string) => name.trim().toLocaleLowerCase("ru");
function isCategoryMap(value: unknown): value is CategoryMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    new Set(entries.map(([name]) => categoryKey(name))).size ===
      entries.length &&
    entries.every(
      ([name, subs]) =>
        name.trim() === name &&
        name.length > 0 &&
        name.length <= 60 &&
        Array.isArray(subs) &&
        subs.every(
          (s) =>
            typeof s === "string" &&
            s.trim() === s &&
            s.length > 0 &&
            s.length <= 60,
        ) &&
        new Set(subs.map(categoryKey)).size === subs.length,
    )
  );
}
// Upgrade the original browser data without changing accounts or transactions.
export function restoreData(value: unknown): Data | null {
  if (isData(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "version" in value &&
    value.version === 1
  ) {
    const migrated = {
      ...value,
      version: 2,
      categories: Object.fromEntries(
        Object.entries(categories).map(([name, subs]) => [name, [...subs]]),
      ),
    };
    return isData(migrated) ? migrated : null;
  }
  return null;
}
export type SubcategoryDraft = { original: string | null; name: string };
export function saveCategory(
  data: Data,
  original: string | null,
  rawName: string,
  rows: SubcategoryDraft[],
): Data {
  const name = rawName.trim();
  if (!name || name.length > 60)
    throw new Error("Название категории должно содержать от 1 до 60 символов");
  if (original !== null && !Object.hasOwn(data.categories, original))
    throw new Error("Категория не найдена");
  if (
    Object.keys(data.categories).some(
      (key) => key !== original && categoryKey(key) === categoryKey(name),
    )
  )
    throw new Error("Категория с таким названием уже существует");
  const subs = rows.map((row) => ({ ...row, name: row.name.trim() }));
  if (subs.some((row) => !row.name || row.name.length > 60))
    throw new Error(
      "Название подкатегории должно содержать от 1 до 60 символов",
    );
  if (new Set(subs.map((row) => categoryKey(row.name))).size !== subs.length)
    throw new Error("Названия подкатегорий не должны повторяться");
  const originals = subs
    .filter((row) => row.original !== null)
    .map((row) => row.original!);
  if (
    new Set(originals).size !== originals.length ||
    originals.some(
      (sub) => original === null || !data.categories[original].includes(sub),
    )
  )
    throw new Error("Проверьте подкатегории");
  if (
    original !== null &&
    data.operations.some(
      (op) =>
        op.category === original &&
        op.subcategory &&
        !originals.includes(op.subcategory),
    )
  )
    throw new Error(
      "Нельзя удалить подкатегорию с операциями. Сначала удалите связанные операции.",
    );
  const catalog =
    original === null
      ? Object.fromEntries([
          ...Object.entries(data.categories),
          [name, subs.map((row) => row.name)],
        ])
      : Object.fromEntries(
          Object.entries(data.categories).map(([key, values]) =>
            key === original
              ? [name, subs.map((row) => row.name)]
              : [key, values],
          ),
        );
  return {
    ...data,
    categories: catalog,
    operations: data.operations.map((op) =>
      op.category !== original
        ? op
        : {
            ...op,
            category: name,
            subcategory: op.subcategory
              ? subs.find((row) => row.original === op.subcategory)!.name
              : "",
          },
    ),
  };
}
export function categoryDeletionError(data: Data, name: string): string {
  if (!Object.hasOwn(data.categories, name)) return "Категория не найдена";
  if (Object.keys(data.categories).length <= 1)
    return "Последнюю категорию удалить нельзя. Сначала добавьте другую.";
  if (data.operations.some((op) => op.category === name))
    return "У категории есть операции. Сначала удалите связанные операции.";
  return "";
}
export function deleteCategory(data: Data, name: string): Data {
  const error = categoryDeletionError(data, name);
  if (error) throw new Error(error);
  return {
    ...data,
    categories: Object.fromEntries(
      Object.entries(data.categories).filter(([key]) => key !== name),
    ),
  };
}
