import {
  MONTHS,
  readTemplate,
  uploadPlan,
  type Grid,
  type TemplateSnapshot,
} from "./sheets-template";
import type { Data } from "./domain";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
type OAuthResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  scope?: string;
};
type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (options: {
        client_id: string;
        scope: string;
        callback: (r: OAuthResponse) => void;
        error_callback: (r: { type?: string }) => void;
      }) => { requestAccessToken: (options: { prompt: string }) => void };
      revoke: (token: string, callback: () => void) => void;
    };
  };
};
export type GoogleSession = { token: string; expiresAt: number };
const identity = () =>
  (window as unknown as { google?: GoogleIdentity }).google;
let sdkPromise: Promise<void> | undefined;
export function loadGoogleIdentity(): Promise<void> {
  if (identity()) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    const timer = setTimeout(() => {
      script.remove();
      sdkPromise = undefined;
      reject(
        new Error(
          "Не удалось загрузить вход Google. Проверьте соединение и блокировщики.",
        ),
      );
    }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      if (identity()) resolve();
      else {
        sdkPromise = undefined;
        reject(new Error("Вход Google недоступен"));
      }
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      sdkPromise = undefined;
      reject(new Error("Не удалось загрузить вход Google"));
    };
    document.head.append(script);
  });
  return sdkPromise;
}
export function authorizeGoogle(clientId: string): Promise<GoogleSession> {
  if (!identity())
    return Promise.reject(new Error("Дождитесь загрузки входа Google"));
  if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId))
    return Promise.reject(new Error("Укажите OAuth Client ID из Google Cloud"));
  return new Promise((resolve, reject) => {
    const client = identity()!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          reject(
            new Error(
              r.error_description || r.error || "Google не предоставил доступ",
            ),
          );
          return;
        }
        if (!r.scope?.split(" ").includes(SCOPE)) {
          reject(new Error("Google не предоставил доступ к таблицам"));
          return;
        }
        resolve({
          token: r.access_token,
          expiresAt: Date.now() + (r.expires_in || 3600) * 1000,
        });
      },
      error_callback: (r) =>
        reject(
          new Error(
            r.type === "popup_closed"
              ? "Окно входа закрыто"
              : "Не удалось открыть вход Google. Разрешите всплывающее окно.",
          ),
        ),
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}
export function revokeGoogle(session: GoogleSession) {
  identity()?.accounts.oauth2.revoke(session.token, () => {});
}
export function spreadsheetId(value: string): string {
  const raw = value.trim();
  if (/^[\w-]{20,}$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.hostname !== "docs.google.com")
      throw new Error();
    const match = /^\/spreadsheets\/d\/([\w-]+)/.exec(url.pathname);
    if (match) return match[1];
  } catch {
    /* Report one clear input error. */
  }
  throw new Error("Вставьте ссылку на Google Таблицу или её ID");
}
async function api<T>(
  session: GoogleSession,
  path: string,
  body?: unknown,
): Promise<T> {
  if (session.expiresAt <= Date.now() + 30000)
    throw new Error("Срок входа истёк. Войдите в Google ещё раз.");
  let response: Response;
  try {
    response = await fetch(
      "https://sheets.googleapis.com/v4/spreadsheets/" + path,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + session.token,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      },
    );
  } catch {
    throw new Error(
      body === undefined
        ? "Не удалось прочитать таблицу. Проверьте соединение."
        : "Связь прервалась. Результат отправки неизвестен: сначала проверьте таблицу. Повторная отправка сверяет ID операций.",
    );
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error("Войдите в Google ещё раз");
    if (response.status === 403)
      throw new Error(
        "Нет доступа: проверьте права на таблицу и включите Google Sheets API в Google Cloud",
      );
    if (response.status === 404)
      throw new Error("Таблица не найдена или недоступна этому аккаунту");
    const error = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(
      error?.error?.message || "Google Sheets: ошибка " + response.status,
    );
  }
  return response.json() as Promise<T>;
}
export async function fetchTemplate(
  session: GoogleSession,
  id: string,
): Promise<TemplateSnapshot> {
  const metadata = await api<{
    sheets: {
      properties: {
        sheetId: number;
        title: string;
        gridProperties: { rowCount: number; columnCount: number };
      };
    }[];
  }>(session, id + "?fields=sheets(properties)");
  const sheets = Object.fromEntries(
    metadata.sheets.map((s) => [
      s.properties.title,
      {
        id: s.properties.sheetId,
        rows: s.properties.gridProperties.rowCount,
        columns: s.properties.gridProperties.columnCount,
      },
    ]),
  );
  const headers: Record<string, string[]> = {
    Счета: [
      "Счёт",
      "Тип",
      "Начальный баланс",
      "Валюта",
      "Текущий баланс",
      "Архив",
    ],
    Категории: ["Категория", "Подкатегория", "Тип", "Иконка", "Активна"],
    Настройки: ["Параметр", "Значение"],
  };
  for (const name of [...Object.keys(headers), ...MONTHS, "Операции"])
    if (!sheets[name])
      throw new Error("Шаблон не распознан: нет листа «" + name + "»");
  const ranges = [
    "'Счета'!A1:F200",
    "'Категории'!A1:E200",
    "'Настройки'!A1:B6",
    ...MONTHS.map((m) => `'${m}'!A1:K500`),
  ];
  const query = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  for (const range of ranges) query.append("ranges", range);
  const result = await api<{ valueRanges: { values?: Grid }[] }>(
    session,
    id + "/values:batchGet?" + query,
  );
  const names = ["Счета", "Категории", "Настройки", ...MONTHS];
  const grids = Object.fromEntries(
    names.map((name, i) => [name, result.valueRanges[i]?.values || []]),
  );
  for (const [name, expected] of Object.entries(headers))
    if (expected.some((h, i) => grids[name][0]?.[i] !== h))
      throw new Error("Структура листа «" + name + "» отличается от шаблона");
  const operationHeaders = [
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
  for (const month of MONTHS)
    if (operationHeaders.some((h, i) => grids[month][3]?.[i] !== h))
      throw new Error("Заголовки листа «" + month + "» изменены");
  const yearRow = grids["Настройки"].find((row) => row[0] === "Год");
  const year = Number(yearRow?.[1]);
  if (!Number.isInteger(year) || year < 2000 || year > 2200)
    throw new Error("Проверьте год на листе «Настройки»");
  return { sheets, grids, year };
}
type SheetCell = {
  userEnteredValue?: {
    formulaValue?: string;
    stringValue?: string;
    numberValue?: number;
    boolValue?: boolean;
  };
  effectiveValue?: unknown;
  dataValidation?: {
    condition?: { type?: string; values?: { userEnteredValue?: string }[] };
  };
};
export async function sendNewOperations(
  session: GoogleSession,
  id: string,
  data: Data,
): Promise<{ operations: number; changes: number }> {
  const snapshot = await fetchTemplate(session, id);
  const writes = uploadPlan(data, snapshot);
  if (!writes.length) return { operations: 0, changes: 0 };
  if (writes.length > 500)
    throw new Error(
      "Слишком много новых строк для одной отправки (максимум 500).",
    );
  const query = new URLSearchParams({
    includeGridData: "true",
    fields:
      "sheets(properties(sheetId,title),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,dataValidation))))",
  });
  for (const w of writes) {
    const last = String.fromCharCode(65 + w.column + w.values.length - 1);
    query.append(
      "ranges",
      `'${w.sheet}'!${String.fromCharCode(65 + w.column)}${w.row + 1}:${last}${w.row + 1}`,
    );
  }
  const live = await api<{
    sheets: Array<{
      properties: { title: string };
      data?: Array<{
        startRow?: number;
        startColumn?: number;
        rowData?: Array<{ values?: SheetCell[] }>;
      }>;
    }>;
  }>(session, id + "?" + query);
  const requests = writes.map((w) => {
    const sheet = live.sheets.find((s) => s.properties.title === w.sheet);
    const block = sheet?.data?.find(
      (b) => (b.startRow || 0) === w.row && (b.startColumn || 0) === w.column,
    );
    if (!sheet || !block)
      throw new Error(
        "Не удалось проверить свободную строку в таблице. Отправка отменена.",
      );
    const old = block.rowData?.[0]?.values || [];
    const values = w.values.map((value, i) => {
      const cell = old[i];
      const formula = cell?.userEnteredValue?.formulaValue;
      if (
        cell?.userEnteredValue &&
        !(w.sheet === "Счета" && i === 4 && formula) &&
        !(
          typeof cell.userEnteredValue.boolValue === "boolean" &&
          cell.userEnteredValue.boolValue === false &&
          w.sheet !== "Операции" &&
          !MONTHS.includes(w.sheet)
        )
      )
        throw new Error(
          "Строка в таблице занята или изменена. Повторите отправку после проверки.",
        );
      if (cell?.effectiveValue && !cell.userEnteredValue)
        throw new Error("Запись попала в вычисляемый диапазон и отменена");
      const rule = cell?.dataValidation?.condition;
      if (
        value !== "" &&
        rule?.type === "ONE_OF_LIST" &&
        !rule.values?.some((v) => v.userEnteredValue === String(value))
      )
        throw new Error(
          "Значение не разрешено выпадающим списком таблицы: " + String(value),
        );
      const userEnteredValue = w.formulaColumns?.includes(i)
        ? { formulaValue: formula || String(value) }
        : typeof value === "number"
          ? { numberValue: value }
          : typeof value === "boolean"
            ? { boolValue: value }
            : { stringValue: String(value) };
      return { userEnteredValue };
    });
    return {
      updateCells: {
        start: {
          sheetId: snapshot.sheets[w.sheet].id,
          rowIndex: w.row,
          columnIndex: w.column,
        },
        rows: [{ values }],
        fields: "userEnteredValue",
      },
    };
  });
  await api(session, id + ":batchUpdate", { requests });
  const verified = readTemplate(await fetchTemplate(session, id));
  const known = new Set(verified.operations.map((op) => op.id));
  if (data.operations.some((op) => !known.has(op.id)))
    throw new Error(
      "Отправка завершена, но не все ID найдены при проверке. Проверьте таблицу.",
    );
  return {
    operations: writes.filter((w) => MONTHS.includes(w.sheet)).length,
    changes: writes.length,
  };
}
