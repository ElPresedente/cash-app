import {
  emptyData,
  isData,
  validate,
  type Account,
  type Data,
  type Kind,
  type Operation,
} from "./domain";
export const TEMPLATE_ID = "1TE13iPqQCg-b4eOBLaPrXbQtbjnIV-qV0R8hZt1_VZw";
export const TEMPLATE_URL = `https://docs.google.com/spreadsheets/d/${TEMPLATE_ID}/edit`;
export const MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];
export type CellValue = string | number | boolean;
export type Grid = CellValue[][];
export type TemplateSnapshot = {
  sheets: Record<string, { id: number; rows: number; columns: number }>;
  grids: Record<string, Grid>;
  year: number;
};
export type SheetWrite = {
  sheet: string;
  row: number;
  column: number;
  values: CellValue[];
  formulaColumns?: number[];
};
const kindNames: Record<Kind, string> = {
  expense: "Расход",
  income: "Доход",
  transfer: "Перевод",
  credit: "Получен займ",
};
const text = (v: CellValue | undefined) =>
  v === undefined ? "" : String(v).trim();
export function rubles(value: CellValue | undefined): number {
  const s =
    typeof value === "number"
      ? String(value)
      : text(value).replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(s))
    throw new Error("В таблице найдена некорректная денежная сумма");
  const cents = Math.round(Number(s) * 100);
  if (!Number.isSafeInteger(cents))
    throw new Error("Сумма в таблице слишком велика");
  return cents;
}
export function sheetDate(value: CellValue | undefined): string {
  if (typeof value === "number")
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
      .toISOString()
      .slice(0, 10);
  const s = text(value);
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  const result = match ? `${match[3]}-${match[2]}-${match[1]}` : s;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString().slice(0, 10) !== result
  )
    throw new Error("Некорректная дата операции в таблице");
  return result;
}
export function readTemplate(snapshot: TemplateSnapshot): Data {
  const accounts: Account[] = [];
  const names = new Set<string>();
  for (const row of snapshot.grids["Счета"].slice(1)) {
    const name = text(row[0]);
    if (!name) continue;
    if (names.has(name))
      throw new Error("В таблице повторяется название счёта: " + name);
    names.add(name);
    if (text(row[3]) && text(row[3]) !== "RUB")
      throw new Error("Пока поддерживаются только рублёвые счета");
    accounts.push({
      id: "sheet-account:" + encodeURIComponent(name),
      name,
      opening: rubles(row[2] ?? 0),
      color: "#7863db",
    });
  }
  const catalog = new Map<string, string[]>();
  for (const row of snapshot.grids["Категории"].slice(1)) {
    const name = text(row[0]),
      sub = text(row[1]);
    if (!name) continue;
    const subs = catalog.get(name) || [];
    if (sub && !subs.includes(sub)) subs.push(sub);
    catalog.set(name, subs);
  }
  if (!catalog.size) throw new Error("В шаблоне нет категорий");
  const data: Data = {
    version: 2,
    accounts,
    categories: Object.fromEntries(catalog),
    operations: [],
  };
  const ids = new Set<string>();
  for (const [monthIndex, month] of MONTHS.entries())
    for (const [index, row] of snapshot.grids[month].slice(4).entries()) {
      if (!row.some((v) => v !== "" && v !== undefined)) continue;
      const kind = (Object.keys(kindNames) as Kind[]).find(
        (k) => kindNames[k] === text(row[1]),
      );
      if (!kind)
        throw new Error(
          `Лист «${month}», строка ${index + 5}: тип «${text(row[1])}» пока не поддерживается приложением. Импорт отменён целиком.`,
        );
      const date = sheetDate(row[0]);
      if (
        Number(date.slice(0, 4)) !== snapshot.year ||
        Number(date.slice(5, 7)) !== monthIndex + 1
      )
        throw new Error(
          `Дата операции не соответствует листу «${month}» и году шаблона`,
        );
      const source = accounts.find((a) => a.name === text(row[3])),
        target = accounts.find((a) => a.name === text(row[4]));
      if (!source) throw new Error("Не найден счёт операции: " + text(row[3]));
      const id = text(row[10]) || `sheet-row:${month}:${index + 5}`;
      if (ids.has(id))
        throw new Error("В таблице повторяется ID операции: " + id);
      ids.add(id);
      const op: Operation = {
        id,
        kind,
        date,
        amount: rubles(row[2]),
        accountId: source.id,
        toAccountId: kind === "transfer" ? target?.id || "" : "",
        category: text(row[5]),
        subcategory: text(row[6]),
        title: text(row[7]) || text(row[5]) || kindNames[kind],
        note: text(row[8]),
        related: text(row[9]),
      };
      const error = validate(op, accounts, data.categories);
      if (error)
        throw new Error(`Лист «${month}», строка ${index + 5}: ${error}`);
      data.operations.push(op);
    }
  if (!accounts.length) {
    if (data.operations.length)
      throw new Error("В таблице нет счетов для операций");
    data.accounts = emptyData().accounts;
  }
  if (!isData(data)) throw new Error("Данные шаблона не прошли проверку");
  return data;
}
function balanceFormula(row: number): string {
  const plus = ["Доход", "Возврат долга", "Получен займ"],
    minus = [
      "Расход",
      "Выдан долг",
      "Возврат займа",
      "Платёж по кредиту",
      "Перевод",
    ];
  const term = (kind: string, column = "D") =>
    `SUMIFS('Операции'!$C:$C;'Операции'!$${column}:$${column};A${row};'Операции'!$B:$B;"${kind}")`;
  return `=IF(A${row}="";"";C${row}+${plus.map((k) => term(k)).join("+")}-${minus.map((k) => term(k)).join("-")}+${term("Перевод", "E")})`;
}
export function uploadPlan(
  data: Data,
  snapshot: TemplateSnapshot,
): SheetWrite[] {
  if (!isData(data)) throw new Error("Локальные данные не прошли проверку");
  const remote = readTemplate(snapshot),
    writes: SheetWrite[] = [];
  const occupied = new Map<string, Set<number>>();
  for (const [name, grid] of Object.entries(snapshot.grids))
    occupied.set(
      name,
      new Set(
        grid
          .map((row, i) => (row[0] !== undefined && row[0] !== "" ? i : -1))
          .filter((i) => i >= 0),
      ),
    );
  function freeRow(sheet: string, start: number, max: number) {
    const used = occupied.get(sheet)!;
    for (let i = start; i < max; i++)
      if (!used.has(i)) {
        used.add(i);
        return i;
      }
    throw new Error(`На листе «${sheet}» закончились подготовленные строки`);
  }
  const accountNames = new Set<string>();
  for (const account of data.accounts) {
    if (accountNames.has(account.name))
      throw new Error("Для отправки названия счетов должны быть уникальны");
    accountNames.add(account.name);
    if (
      account.id.startsWith("sheet-account:") &&
      decodeURIComponent(account.id.slice(14)) !== account.name
    )
      throw new Error(
        "Переименованный импортированный счёт сначала измените в таблице и загрузите заново",
      );
    const found = snapshot.grids["Счета"]
      .slice(1)
      .find((row) => text(row[0]) === account.name);
    if (found) {
      if (rubles(found[2] ?? 0) !== account.opening)
        throw new Error(
          "Начальный остаток счёта «" +
            account.name +
            "» отличается от таблицы. Сначала загрузите её актуальную версию.",
        );
      continue;
    }
    const i = freeRow("Счета", 1, 100);
    writes.push({
      sheet: "Счета",
      row: i,
      column: 0,
      values: [
        account.name,
        "Другое",
        account.opening / 100,
        "RUB",
        balanceFormula(i + 1),
        false,
      ],
      formulaColumns: [4],
    });
  }
  for (const [category, subs] of Object.entries(data.categories))
    for (const sub of subs.length ? subs : [""]) {
      if (
        snapshot.grids["Категории"]
          .slice(1)
          .some((row) => text(row[0]) === category && text(row[1]) === sub)
      )
        continue;
      const i = freeRow("Категории", 1, 100);
      const hasIncome = data.operations.some(
        (op) => op.category === category && op.kind === "income",
      );
      writes.push({
        sheet: "Категории",
        row: i,
        column: 0,
        values: [category, sub, hasIncome ? "Доход" : "Расход", "", true],
      });
    }
  for (const op of data.operations) {
    if (Number(op.date.slice(0, 4)) !== snapshot.year)
      throw new Error(
        `Шаблон рассчитан на ${snapshot.year} год. Операции другого года отправить нельзя.`,
      );
    const existing = remote.operations.find((o) => o.id === op.id);
    if (existing) {
      const source = data.accounts.find((a) => a.id === op.accountId)?.name,
        target =
          op.kind === "transfer"
            ? data.accounts.find((a) => a.id === op.toAccountId)?.name || ""
            : "";
      const remoteSource = remote.accounts.find(
          (a) => a.id === existing.accountId,
        )?.name,
        remoteTarget =
          existing.kind === "transfer"
            ? remote.accounts.find((a) => a.id === existing.toAccountId)
                ?.name || ""
            : "";
      if (
        op.kind !== existing.kind ||
        op.date !== existing.date ||
        op.amount !== existing.amount ||
        op.title !== existing.title ||
        op.category !== existing.category ||
        op.subcategory !== existing.subcategory ||
        op.note !== existing.note ||
        source !== remoteSource ||
        target !== remoteTarget ||
        (op.related || (op.kind === "credit" ? op.title : "")) !==
          (existing.related || "")
      )
        throw new Error(
          "Операция «" +
            op.title +
            "» уже есть в таблице и отличается. Автоматическая перезапись отключена.",
        );
      continue;
    }
    const month = MONTHS[Number(op.date.slice(5, 7)) - 1];
    const i = freeRow(month, 4, 500);
    const dateSerial =
      (Date.parse(op.date) - Date.UTC(1899, 11, 30)) / 86400000;
    writes.push({
      sheet: month,
      row: i,
      column: 0,
      values: [
        dateSerial,
        kindNames[op.kind],
        op.amount / 100,
        data.accounts.find((a) => a.id === op.accountId)!.name,
        op.kind === "transfer"
          ? data.accounts.find((a) => a.id === op.toAccountId)?.name || ""
          : "",
        op.category,
        op.subcategory,
        op.title,
        op.note,
        op.related || (op.kind === "credit" ? op.title : ""),
        op.id,
      ],
    });
  }
  return writes;
}
