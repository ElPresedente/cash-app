import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyData, balances } from "../src/domain.ts";
import {
  MONTHS,
  readTemplate,
  sheetDate,
  uploadPlan,
  type TemplateSnapshot,
} from "../src/sheets-template.ts";
import { spreadsheetId } from "../src/google-sheets.ts";
const headers = [
  "Дата",
  "Тип",
  "Сумма",
  "Счёт",
  "Счёт назначения",
  "Категория",
  "Подкатегория",
  "Получатель",
  "Комментарий",
  "Связано с",
  "ID",
];
function fixture(): TemplateSnapshot {
  return {
    year: 2026,
    sheets: Object.fromEntries(
      ["Счета", "Категории", "Настройки", "Операции", ...MONTHS].map(
        (name, id) => [
          name,
          { id, rows: MONTHS.includes(name) ? 500 : 200, columns: 20 },
        ],
      ),
    ),
    grids: {
      Счета: [
        [
          "Счёт",
          "Тип",
          "Начальный баланс",
          "Валюта",
          "Текущий баланс",
          "Архив",
        ],
        ["Карта", "Карта", 1000, "RUB", 0, false],
      ],
      Категории: [
        ["Категория", "Подкатегория", "Тип", "Иконка", "Активна"],
        ["Еда", "Продукты", "Расход", "🛒", true],
      ],
      Настройки: [
        ["Параметр", "Значение"],
        ["Год", 2026],
      ],
      ...Object.fromEntries(MONTHS.map((m) => [m, [[m], [], [], headers]])),
    },
  };
}
test("Google Sheets dates and financial amounts load without timezone shifts", () => {
  assert.equal(sheetDate(46302), "2026-10-07");
  assert.equal(sheetDate("07.10.2026"), "2026-10-07");
  const s = fixture();
  s.grids["Октябрь"].push([
    46302,
    "Расход",
    549.9,
    "Карта",
    "",
    "Еда",
    "Продукты",
    "Магазин",
    "",
    "",
    "tx-1",
  ]);
  const d = readTemplate(s);
  assert.equal(d.operations[0].amount, 54990);
  assert.equal(balances(d)[d.accounts[0].id], 45010);
});
test("upload writes to the month and preserves the aggregate sheet", () => {
  const s = fixture(),
    d = readTemplate(s);
  d.operations.push({
    id: "new-1",
    kind: "expense",
    date: "2026-10-07",
    amount: 29050,
    accountId: d.accounts[0].id,
    toAccountId: "",
    category: "Еда",
    subcategory: "Продукты",
    title: "Магазин",
    note: "",
  });
  const plan = uploadPlan(d, s);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].sheet, "Октябрь");
  assert.equal(plan[0].row, 4);
  assert.equal(plan[0].values[2], 290.5);
  assert.equal(plan[0].values[10], "new-1");
  assert.ok(plan.every((w) => w.sheet !== "Операции"));
});
test("repeated upload deduplicates by ID and rejects conflicting changes", () => {
  const s = fixture();
  s.grids["Октябрь"].push([
    46302,
    "Расход",
    549.9,
    "Карта",
    "",
    "Еда",
    "Продукты",
    "Магазин",
    "",
    "",
    "tx-1",
  ]);
  const d = readTemplate(s);
  assert.deepEqual(uploadPlan(d, s), []);
  d.operations[0].amount = 123;
  assert.throws(() => uploadPlan(d, s), /отличается/);
});
test("unsupported types, duplicate IDs and non-ruble accounts abort the whole import", () => {
  const s = fixture();
  s.grids["Октябрь"].push([
    46302,
    "Выдан долг",
    500,
    "Карта",
    "",
    "",
    "",
    "Петя",
    "",
    "",
    "tx-1",
  ]);
  assert.throws(() => readTemplate(s), /не поддерживается/);
  s.grids["Октябрь"][4] = [
    46302,
    "Расход",
    500,
    "Карта",
    "",
    "Еда",
    "Продукты",
    "Магазин",
    "",
    "",
    "tx-1",
  ];
  s.grids["Октябрь"].push([...s.grids["Октябрь"][4]]);
  assert.throws(() => readTemplate(s), /повторяется ID/);
  s.grids["Октябрь"].pop();
  s.grids["Счета"][1][3] = "USD";
  assert.throws(() => readTemplate(s), /рублёвые/);
});
test("empty template receives new accounts with formulas, categories and credit correctly", () => {
  const s = fixture();
  s.grids["Счета"] = s.grids["Счета"].slice(0, 1);
  const d = emptyData();
  d.categories = { Еда: ["Продукты"] };
  d.operations.push({
    id: "credit-1",
    kind: "credit",
    date: "2026-10-07",
    amount: 100000,
    accountId: "main",
    toAccountId: "",
    category: "",
    subcategory: "",
    title: "Займ",
    note: "",
  });
  const plan = uploadPlan(d, s);
  assert.equal(plan.filter((w) => w.sheet === "Счета").length, 2);
  assert.ok(String(plan[0].values[4]).startsWith("=IF("));
  const tx = plan.find((w) => w.sheet === "Октябрь")!;
  assert.equal(tx.values[1], "Получен займ");
  assert.equal(tx.values[9], "Займ");
  for (const w of plan) {
    const grid = s.grids[w.sheet];
    while (grid.length <= w.row) grid.push([]);
    grid[w.row] = w.values;
  }
  assert.deepEqual(uploadPlan(d, s), []);
});
test("other years and renamed imported accounts cannot accidentally create new rows", () => {
  const s = fixture(),
    d = readTemplate(s);
  d.accounts[0].name = "Другая карта";
  assert.throws(() => uploadPlan(d, s), /Переименованный/);
  d.accounts[0].name = "Карта";
  d.operations.push({
    id: "new",
    kind: "income",
    date: "2027-01-01",
    amount: 100,
    accountId: d.accounts[0].id,
    toAccountId: "",
    category: "Еда",
    subcategory: "",
    title: "Доход",
    note: "",
  });
  assert.throws(() => uploadPlan(d, s), /2026/);
});
test("table URLs accept only Google Sheets documents", () => {
  const id = "1abcDEF_1234567890abcdefghijklmnop";
  assert.equal(
    spreadsheetId("https://docs.google.com/spreadsheets/d/" + id + "/edit"),
    id,
  );
  assert.equal(spreadsheetId(id), id);
  assert.throws(() =>
    spreadsheetId("https://evil.example/spreadsheets/d/" + id),
  );
  assert.throws(() => spreadsheetId("not-a-table"));
});

test("destination account is exported only for transfers, including legacy local records", () => {
  const snapshot = fixture();
  snapshot.grids["Счета"].push(["Наличные", "Наличные", 0, "RUB", 0, false]);
  const data = readTemplate(snapshot);
  const transaction = {
    id: "destination-test",
    kind: "expense" as const,
    date: "2026-10-20",
    amount: 100,
    accountId: data.accounts[0].id,
    toAccountId: data.accounts[1].id,
    category: "Еда",
    subcategory: "Продукты",
    title: "Тест",
    note: "",
  };
  data.operations = [transaction];
  assert.equal(uploadPlan(data, snapshot)[0].values[4], "");
  snapshot.grids["Октябрь"].push([
    sheetDate("2026-10-20"),
    "Расход",
    1,
    "Карта",
    "Наличные",
    "Еда",
    "Продукты",
    "Тест",
    "",
    "",
    transaction.id,
  ]);
  assert.equal(readTemplate(snapshot).operations[0].toAccountId, "");
  assert.deepEqual(uploadPlan(data, snapshot), []);
  snapshot.grids["Октябрь"].pop();
  data.operations = [
    { ...transaction, kind: "transfer", category: "", subcategory: "" },
  ];
  assert.equal(uploadPlan(data, snapshot)[0].values[4], "Наличные");
});
