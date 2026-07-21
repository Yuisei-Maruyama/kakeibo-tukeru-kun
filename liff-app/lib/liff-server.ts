import { Firestore, Timestamp } from "@google-cloud/firestore";
import { google, type calendar_v3 } from "googleapis";
import { NextRequest } from "next/server";
import { createFirestoreClient, createGoogleAuth } from "@/lib/google-server";
import type {
  DashboardCalendarEvent,
  DashboardExpense,
  DashboardExpenseCategory,
  DashboardRent,
  DashboardReceiptNote,
  DashboardSubscription,
  DashboardUser,
  ReceiptNoteCategory,
} from "@/types/dashboard";

export type FirestoreUser = {
  id: string;
  displayName: string;
  groupId: string;
  isActive: boolean;
  diningBalance: number;
  balanceResetAt?: Timestamp;
  createdAt?: Timestamp;
};

export type FirestoreSettings = {
  monthlyBudget?: number;
  lineGroupId?: string;
  calendarId?: string;
  firstHalfPayerId?: string;
  secondHalfPayerId?: string;
};

export type ExpenseCategory = Exclude<DashboardExpenseCategory, "家賃費用">;

export type StoredExpense = {
  id: string;
  userId: string;
  userName: string;
  amount: number;
  category: ExpenseCategory;
  storeName: string;
  memo?: string;
  date: Timestamp;
  calendarEventId?: string;
  createdAt?: Timestamp;
};

export type LiffExpensePayload = {
  id: string;
  date: string;
  category: ExpenseCategory;
  payer: string;
  amount: number;
  storeName: string;
  memo?: string;
};

export type AuthorizedContext = {
  user: FirestoreUser;
  settings: FirestoreSettings;
  groupId: string;
  users: FirestoreUser[];
};

export type ScheduleInputPayload = {
  participants: string;
  title: string;
  date: string;
  startTime?: string;
  endTime?: string;
};

export type ScheduleUpdatePayload = {
  title: string;
  date: string;
  timeLabel?: string;
  description?: string;
  colorId?: string;
};

let firestore: Firestore | null = null;
let calendarClient: calendar_v3.Calendar | null = null;

const expenseCategories = new Set<ExpenseCategory>([
  "外食費用",
  "買い物費用",
  "旅行費用",
]);
const receiptNoteCategories = new Set<ReceiptNoteCategory>([
  "diningSaving",
  "shoppingSettlement",
  "travelSettlement",
  "other",
]);

export function getFirestore() {
  if (!firestore) {
    firestore = createFirestoreClient();
  }

  return firestore;
}

export function getCalendarClient() {
  if (!calendarClient) {
    const auth = createGoogleAuth(["https://www.googleapis.com/auth/calendar"]);
    calendarClient = google.calendar({ version: "v3", auth });
  }

  return calendarClient;
}

export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === "string" && expenseCategories.has(value as ExpenseCategory);
}

export function assertDateString(value: unknown, label = "日付") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label}は YYYY-MM-DD 形式で入力してください`);
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`${label}は実在する日付を入力してください`);
  }

  return value;
}

export function assertPositiveAmount(value: unknown, label = "金額") {
  // boolean は Number(true)=1 とすり抜けるため明示的に拒否する
  if (typeof value === "boolean") {
    throw new Error(`${label}は 1 円以上で入力してください`);
  }

  // 丸めてから判定し、0.5 未満が 0 円になるすり抜けを防ぐ
  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount < 1) {
    throw new Error(`${label}は 1 円以上で入力してください`);
  }

  return amount;
}

export function assertNonNegativeAmount(value: unknown, label = "金額") {
  if (typeof value === "boolean") {
    throw new Error(`${label}は 0 円以上で入力してください`);
  }

  const amount = Math.round(Number(value));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label}は 0 円以上で入力してください`);
  }

  return amount;
}

export function assertReceiptNoteCategory(value: unknown) {
  if (typeof value !== "string" || !receiptNoteCategories.has(value as ReceiptNoteCategory)) {
    throw new Error("受領ノートのカテゴリーを選択してください");
  }

  return value as ReceiptNoteCategory;
}

export function assertYearMonth(value: unknown, label = "対象月") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) {
    throw new Error(`${label}は YYYY-MM 形式で入力してください`);
  }

  const [year, month] = value.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`${label}は実在する年月を入力してください`);
  }

  return value;
}

export function dateStringToTimestamp(date: string) {
  return Timestamp.fromDate(new Date(`${date}T00:00:00.000Z`));
}

export function addDaysToDateString(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function formatTimestampDate(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return "";
}

export function isCurrentJSTMonth(date: string) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;

  return date.slice(0, 7) === `${year}-${month}`;
}

/**
 * JST の今日を "YYYY-MM-DD" 形式で返す。
 * @returns JST 基準の当日日付文字列
 */
export function todayJstDateString() {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function buildIntervalLabel(unit: string, value: number) {
  const unitLabel = unit === "week" ? "週" : "ヶ月";
  return value === 1 ? `毎${unitLabel}` : `${value}${unitLabel}ごと`;
}

export function parseIntervalLabel(value: string) {
  const label = value.trim().replace(/\s+/g, "");
  const intervalValue = Number(label.match(/\d+/)?.[0] ?? 1);

  return {
    intervalUnit: label.includes("週") ? "week" : "month",
    intervalValue: Number.isFinite(intervalValue) && intervalValue > 0 ? intervalValue : 1,
  } as const;
}

export async function verifyLineUser(request: NextRequest): Promise<FirestoreUser> {
  const db = getFirestore();

  if (process.env.LIFF_DASHBOARD_AUTH_DISABLED === "true") {
    const snapshot = await db.collection("users").where("isActive", "==", true).limit(1).get();
    if (!snapshot.empty) {
      return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as FirestoreUser;
    }

    return {
      id: "local-preview",
      displayName: "LIFFプレビュー",
      groupId: "",
      isActive: true,
      diningBalance: 0,
    };
  }

  const channelId = process.env.LINE_CHANNEL_ID;
  if (!channelId) {
    throw new Error("LINE_CHANNEL_ID が未設定です");
  }

  const authorization = request.headers.get("authorization") ?? "";
  const idToken = authorization.replace(/^Bearer\s+/i, "");
  if (!idToken) {
    throw new Error("LIFF ID token がありません");
  }

  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: channelId,
    }),
  });

  if (!response.ok) {
    throw new Error("LINE ID token の検証に失敗しました");
  }

  const verified = (await response.json()) as { sub: string };
  const userDoc = await db.collection("users").doc(verified.sub).get();
  if (!userDoc.exists) {
    throw new Error(
      "家計ぼっとに登録済みの LINE ユーザーではありません。同じプロバイダーの LINEログインチャネルを使ってください",
    );
  }

  const user = { id: userDoc.id, ...userDoc.data() } as FirestoreUser;
  if (!user.isActive) {
    throw new Error("このユーザーは無効です");
  }

  return user;
}

export async function getSettings() {
  const settingsDoc = await getFirestore().collection("settings").doc("global").get();
  return settingsDoc.exists ? (settingsDoc.data() as FirestoreSettings) : {};
}

export function getCalendarId(settings: FirestoreSettings) {
  return settings.calendarId || process.env.GOOGLE_CALENDAR_ID || "";
}

export async function getActiveUsers(groupId = "") {
  const snapshot = await getFirestore()
    .collection("users")
    .where("isActive", "==", true)
    .orderBy("createdAt", "asc")
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as FirestoreUser)
    .filter((user) => !groupId || user.groupId === groupId);
}

export async function getDashboardUsers(groupId = "") {
  const users = await getActiveUsers(groupId);

  return users.map(
    (user): DashboardUser => ({
      id: user.id,
      displayName: user.displayName,
      diningBalance: user.diningBalance ?? 0,
      groupId: user.groupId ?? "",
    }),
  );
}

export async function getAuthorizedContext(request: NextRequest): Promise<AuthorizedContext> {
  const user = await verifyLineUser(request);
  const settings = await getSettings();
  const groupId = user.groupId || settings.lineGroupId || "";
  const users = await getActiveUsers(groupId);

  return {
    user: users.find((item) => item.id === user.id) ?? user,
    settings,
    groupId,
    users,
  };
}

function normalizeUserName(value: string) {
  return value.replace(/^@/, "").replace(/\s+/g, "").toLowerCase();
}

// その他カテゴリーは userName を自由入力のタイトルとして扱う
export function resolveReceiptNoteUser(
  body: { category: ReceiptNoteCategory; userName: string },
  context: AuthorizedContext,
) {
  if (body.category === "other") {
    return { id: context.user.id, displayName: body.userName };
  }

  return resolveUserByName(body.userName, context);
}

export function resolveUserByName(input: string, context: AuthorizedContext) {
  const value = input.trim();
  const normalized = normalizeUserName(value);

  if (!normalized || normalized === "自分" || normalized === "me") {
    return context.user;
  }

  const exactMatch = context.users.find(
    (user) => normalizeUserName(user.displayName) === normalized,
  );
  if (exactMatch) {
    return exactMatch;
  }

  const fuzzyMatch = context.users.find((user) => {
    const userName = normalizeUserName(user.displayName);
    return userName.includes(normalized) || normalized.includes(userName);
  });
  if (fuzzyMatch) {
    return fuzzyMatch;
  }

  throw new Error(`ユーザー「${input}」が見つかりませんでした`);
}

export function ensureGroupExpenseAccess(expense: StoredExpense, context: AuthorizedContext) {
  if (!context.groupId || context.users.some((user) => user.id === expense.userId)) {
    return;
  }

  throw new Error("この支出を操作する権限がありません");
}

export function ensureGroupSubscriptionAccess(
  subscription: { groupId?: string },
  context: AuthorizedContext,
) {
  if (!context.groupId || subscription.groupId === context.groupId) {
    return;
  }

  throw new Error("このサブスクを操作する権限がありません");
}

export function ensureGroupRentAccess(
  rent: { groupId?: unknown },
  context: AuthorizedContext,
) {
  if (
    !context.groupId ||
    typeof rent.groupId !== "string" ||
    rent.groupId === context.groupId
  ) {
    return;
  }

  throw new Error("この家賃を操作する権限がありません");
}

export function ensureGroupReceiptNoteAccess(
  receiptNote: { groupId?: unknown },
  context: AuthorizedContext,
) {
  if (
    !context.groupId ||
    typeof receiptNote.groupId !== "string" ||
    receiptNote.groupId === context.groupId
  ) {
    return;
  }

  throw new Error("この受領ノートを操作する権限がありません");
}

function getColorId(category: ExpenseCategory | "家賃費用" | "予定") {
  if (category === "外食費用") {
    return "4";
  }

  if (category === "買い物費用") {
    return "5";
  }

  if (category === "家賃費用") {
    return "10";
  }

  if (category === "予定") {
    return "8";
  }

  return "1";
}

export async function createExpenseCalendarEvent(
  calendarId: string,
  expense: {
    userName: string;
    amount: number;
    category: ExpenseCategory;
    storeName: string;
    date: string;
    memo?: string;
  },
) {
  if (!calendarId) {
    throw new Error("Google Calendar ID が未設定です");
  }

  const response = await getCalendarClient().events.insert({
    calendarId,
    requestBody: buildExpenseCalendarRequestBody(expense),
  });

  if (!response.data.id) {
    throw new Error("Google Calendar のイベントIDを取得できませんでした");
  }

  return response.data.id;
}

export async function updateExpenseCalendarEvent(
  calendarId: string,
  eventId: string,
  expense: {
    userName: string;
    amount: number;
    category: ExpenseCategory;
    storeName: string;
    date: string;
    memo?: string;
  },
) {
  await getCalendarClient().events.patch({
    calendarId,
    eventId,
    requestBody: buildExpenseCalendarRequestBody(expense),
  });
}

function buildExpenseCalendarRequestBody(expense: {
  userName: string;
  amount: number;
  category: ExpenseCategory;
  storeName: string;
  date: string;
  memo?: string;
}): calendar_v3.Schema$Event {
  return {
    summary: `[${expense.category}]  ${expense.userName}　￥${expense.amount.toLocaleString()}`,
    description: [
      `店舗: ${expense.storeName}`,
      expense.memo ? `メモ: ${expense.memo}` : "",
      "登録元: LIFF家計ぼっと",
    ]
      .filter(Boolean)
      .join("\n"),
    start: {
      date: expense.date,
    },
    end: {
      date: addDaysToDateString(expense.date, 1),
    },
    colorId: getColorId(expense.category),
  };
}

function getCalendarApiStatus(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const apiError = error as { code?: number; response?: { status?: number } };
  return apiError.code || apiError.response?.status;
}

export async function deleteCalendarEvent(calendarId: string, eventId: string) {
  try {
    await getCalendarClient().events.delete({
      calendarId,
      eventId,
    });
  } catch (error) {
    const status = getCalendarApiStatus(error);
    if (status === 404 || status === 410) {
      return;
    }

    throw error;
  }
}

export async function getCalendarEvent(calendarId: string, eventId: string) {
  try {
    const response = await getCalendarClient().events.get({
      calendarId,
      eventId,
    });

    if (response.data.status === "cancelled") {
      throw new Error("対象の予定が見つかりませんでした");
    }

    return response.data;
  } catch (error) {
    const status = getCalendarApiStatus(error);
    if (status === 404 || status === 410) {
      throw new Error("対象の予定が見つかりませんでした");
    }

    throw error;
  }
}

export function ensureManagedScheduleEvent(event: calendar_v3.Schema$Event) {
  if (isManagedScheduleEvent(event)) {
    return;
  }

  throw new Error("家計ぼっとで登録した予定のみ更新・削除できます");
}

function isManagedScheduleEvent(event: calendar_v3.Schema$Event) {
  const summary = event.summary ?? "";
  const description = event.description ?? "";
  const hasManagedSource =
    description.includes("登録元: LIFF家計ぼっと") ||
    description.includes("登録元: LINE家計簿Bot");

  return (
    (hasManagedSource && description.includes("予定:")) ||
    summary.startsWith("[予定]")
  );
}

function formatDateInJST(date: Date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return `${parts.find((part) => part.type === "year")?.value}-${parts.find(
    (part) => part.type === "month",
  )?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

function formatTimeInJST(date: Date) {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return `${parts.find((part) => part.type === "hour")?.value}:${parts.find(
    (part) => part.type === "minute",
  )?.value}`;
}

function getMinutesFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function normalizeTime(value: string) {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error("時間は HH:mm 形式で入力してください");
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("時間は HH:mm 形式で入力してください");
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getEndDateForTimeRange(date: string, startTime: string, endTime: string) {
  return getMinutesFromTime(endTime) <= getMinutesFromTime(startTime)
    ? addDaysToDateString(date, 1)
    : date;
}

function createOneHourLaterJSTDateTime(date: string, startTime: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = startTime.split(":").map(Number);
  const startUtcMillis = Date.UTC(year, month - 1, day, hours - 9, minutes, 0, 0);
  const endDate = new Date(startUtcMillis + 60 * 60 * 1000);

  return `${formatDateInJST(endDate)}T${formatTimeInJST(endDate)}:00+09:00`;
}

function parseTimeLabel(timeLabel = "") {
  const normalized = timeLabel.trim().replace(/\s+/g, "");
  if (!normalized || normalized === "終日") {
    return { startTime: "", endTime: "" };
  }

  const match = normalized.match(/^(\d{1,2}:\d{2})(?:[〜~\-ー–—](\d{1,2}:\d{2}))?$/);
  if (!match) {
    throw new Error("時間表示は「終日」「09:00」「09:00 〜 10:00」の形式で入力してください");
  }

  return {
    startTime: normalizeTime(match[1]),
    endTime: match[2] ? normalizeTime(match[2]) : "",
  };
}

function resolveScheduleParticipants(participants: string, context: AuthorizedContext) {
  const tokens = participants
    .trim()
    .split(/[、,，\s・]+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return [context.user.displayName];
  }

  return tokens.map((token) => resolveUserByName(token, context).displayName);
}

function getScheduleColorId(participantNames: string[], context: AuthorizedContext) {
  const index = context.users.findIndex(
    (user) => user.displayName === participantNames[0],
  );
  return index === 1 ? "7" : "8";
}

export function buildScheduleCalendarRequestBody(
  payload: ScheduleInputPayload,
  context: AuthorizedContext,
): calendar_v3.Schema$Event {
  const title = payload.title.trim();
  const date = assertDateString(payload.date);
  const startTime = payload.startTime ? normalizeTime(payload.startTime) : "";
  const endTime = payload.endTime ? normalizeTime(payload.endTime) : "";

  // 終了時刻だけ指定されると無言で終日イベント化するため拒否する
  if (!startTime && endTime) {
    throw new Error("終了時刻を指定する場合は開始時刻も入力してください");
  }

  if (!title) {
    throw new Error("予定の内容を入力してください");
  }

  const participantNames = resolveScheduleParticipants(payload.participants, context);
  const participantLabel = participantNames.join("、");
  const base = {
    summary: title,
    description: [
      `予定: ${title}`,
      `担当: ${participantLabel}`,
      "登録元: LIFF家計ぼっと",
    ].join("\n"),
    colorId: getScheduleColorId(participantNames, context),
  };

  if (!startTime) {
    return {
      ...base,
      start: { date },
      end: { date: addDaysToDateString(date, 1) },
    };
  }

  return {
    ...base,
    start: { dateTime: `${date}T${startTime}:00+09:00`, timeZone: "Asia/Tokyo" },
    end: {
      dateTime: endTime
        ? `${getEndDateForTimeRange(date, startTime, endTime)}T${endTime}:00+09:00`
        : createOneHourLaterJSTDateTime(date, startTime),
      timeZone: "Asia/Tokyo",
    },
  };
}

export function buildScheduleUpdateRequestBody(
  payload: ScheduleUpdatePayload,
): calendar_v3.Schema$Event {
  const title = payload.title.trim();
  const date = assertDateString(payload.date);
  const { startTime, endTime } = parseTimeLabel(payload.timeLabel);

  if (!title) {
    throw new Error("予定の内容を入力してください");
  }

  const base = {
    summary: title,
    description: buildUpdatedScheduleDescription(title, payload.description),
    colorId: payload.colorId || getColorId("予定"),
  };

  if (!startTime) {
    return {
      ...base,
      start: { date },
      end: { date: addDaysToDateString(date, 1) },
    };
  }

  return {
    ...base,
    start: { dateTime: `${date}T${startTime}:00+09:00`, timeZone: "Asia/Tokyo" },
    end: {
      dateTime: endTime
        ? `${getEndDateForTimeRange(date, startTime, endTime)}T${endTime}:00+09:00`
        : createOneHourLaterJSTDateTime(date, startTime),
      timeZone: "Asia/Tokyo",
    },
  };
}

function buildUpdatedScheduleDescription(title: string, currentDescription?: string) {
  const lines = currentDescription
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean) ?? [];
  const participantLine = lines.find((line) => line.startsWith("担当:"));
  const sourceLine =
    lines.find((line) => line.includes("登録元:")) ?? "登録元: LIFF家計ぼっと";

  return [`予定: ${title}`, participantLine, sourceLine].filter(Boolean).join("\n");
}

function getCalendarEventType(event: calendar_v3.Schema$Event): DashboardCalendarEvent["type"] {
  const summary = event.summary ?? "";
  const colorId = event.colorId ?? "";

  if (summary.includes("家賃") || colorId === "10") {
    return "rent";
  }

  if (summary.includes("外食") || summary.includes("買い物") || summary.includes("旅行")) {
    return "expense";
  }

  if (["7", "8"].includes(colorId) || event.description?.includes("予定:")) {
    return "schedule";
  }

  return "other";
}

function getEventDate(event: calendar_v3.Schema$Event) {
  if (event.start?.date) {
    return event.start.date;
  }

  if (!event.start?.dateTime) {
    return "";
  }

  return formatDateInJST(new Date(event.start.dateTime));
}

function getEventTimeLabel(event: calendar_v3.Schema$Event) {
  if (event.start?.date) {
    return "終日";
  }

  if (!event.start?.dateTime) {
    return "時間不明";
  }

  const startTime = formatTimeInJST(new Date(event.start.dateTime));
  if (!event.end?.dateTime) {
    return startTime;
  }

  const endTime = formatTimeInJST(new Date(event.end.dateTime));
  return startTime === endTime ? startTime : `${startTime} 〜 ${endTime}`;
}

export function mapCalendarEvent(event: calendar_v3.Schema$Event): DashboardCalendarEvent {
  return {
    id: event.id ?? "",
    title: event.summary ?? "無題",
    date: getEventDate(event),
    timeLabel: getEventTimeLabel(event),
    type: getCalendarEventType(event),
    colorId: event.colorId ?? undefined,
    description: event.description ?? undefined,
  };
}

export function mapExpenseForClient(expense: StoredExpense): LiffExpensePayload {
  return {
    id: expense.id,
    date: formatTimestampDate(expense.date),
    category: expense.category,
    payer: expense.userName,
    amount: Number(expense.amount ?? 0),
    storeName: expense.storeName,
    memo: expense.memo ?? "",
  };
}

export function mapDashboardExpense(expense: StoredExpense): DashboardExpense {
  return {
    id: expense.id,
    userId: expense.userId,
    userName: expense.userName,
    amount: Number(expense.amount ?? 0),
    category: expense.category,
    storeName: expense.storeName,
    memo: expense.memo ?? undefined,
    date: formatTimestampDate(expense.date),
    calendarEventId: expense.calendarEventId,
  };
}

export function mapSubscriptionForClient(
  id: string,
  subscription: Record<string, unknown>,
): DashboardSubscription {
  return {
    id,
    payerName: String(subscription.payerName ?? ""),
    serviceName: String(subscription.serviceName ?? ""),
    amount: Number(subscription.amount ?? 0),
    startDate: formatTimestampDate(subscription.startDate),
    intervalLabel: buildIntervalLabel(
      String(subscription.intervalUnit ?? "month"),
      Number(subscription.intervalValue ?? 1),
    ),
  };
}

export function mapRentForClient(rent: Record<string, unknown>): DashboardRent {
  return {
    payerName: String(rent.payerName ?? ""),
    amount: Number(rent.amount ?? 0),
  };
}

/**
 * 受領ノートの確認マップを正規化する。
 * confirmations があれば値を文字列へ揃え、無く received=true の旧データは
 * グループ全ユーザーを "legacy"（日付なしマーカー）として合成する。
 * @param receiptNote Firestore の受領ノートデータ
 * @param groupUserIds 旧データ互換の合成に使うグループ全ユーザーの ID
 * @returns userId → "YYYY-MM-DD" | "legacy" の確認マップ
 */
export function normalizeReceiptNoteConfirmations(
  receiptNote: Record<string, unknown>,
  groupUserIds: string[],
): Record<string, string> {
  const raw = receiptNote.confirmations;
  if (raw && typeof raw === "object") {
    const result: Record<string, string> = {};
    for (const [userId, value] of Object.entries(raw as Record<string, unknown>)) {
      result[userId] = typeof value === "string" && value ? value : "legacy";
    }

    return result;
  }

  if (receiptNote.received === true) {
    return Object.fromEntries(groupUserIds.map((userId) => [userId, "legacy"]));
  }

  return {};
}

/**
 * Firestore の受領ノート doc をクライアント向けに整形する。
 * @param id 受領ノート doc ID
 * @param receiptNote Firestore の受領ノートデータ
 * @param groupUserIds 旧データ互換の confirmations 合成に使うグループ全ユーザーの ID
 * @returns クライアント向け受領ノート
 */
export function mapReceiptNoteForClient(
  id: string,
  receiptNote: Record<string, unknown>,
  groupUserIds: string[],
): DashboardReceiptNote {
  return {
    id,
    month: String(receiptNote.month ?? ""),
    category: assertReceiptNoteCategory(receiptNote.category),
    userId: String(receiptNote.userId ?? ""),
    userName: String(receiptNote.userName ?? ""),
    amount: Number(receiptNote.amount ?? 0),
    received: Boolean(receiptNote.received),
    confirmations: normalizeReceiptNoteConfirmations(receiptNote, groupUserIds),
    source: receiptNote.source === "summary" ? "summary" : "manual",
    isActive: receiptNote.isActive !== false,
  };
}

export async function adjustDiningBalance(userId: string, delta: number) {
  const db = getFirestore();
  const userRef = db.collection("users").doc(userId);

  return db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) {
      return null;
    }

    const newBalance = Number(userDoc.data()?.diningBalance ?? 0) + delta;
    transaction.update(userRef, {
      diningBalance: newBalance,
      updatedAt: Timestamp.now(),
    });

    return newBalance;
  });
}

export async function applyDiningBalanceForCreate(expense: StoredExpense) {
  if (expense.category !== "外食費用" || !isCurrentJSTMonth(formatTimestampDate(expense.date))) {
    return undefined;
  }

  return (await adjustDiningBalance(expense.userId, -expense.amount)) ?? undefined;
}

export async function applyDiningBalanceForDelete(expense: StoredExpense) {
  if (expense.category !== "外食費用" || !isCurrentJSTMonth(formatTimestampDate(expense.date))) {
    return undefined;
  }

  return (await adjustDiningBalance(expense.userId, expense.amount)) ?? undefined;
}

/**
 * 支出 doc の更新と外食費用の残高調整を単一トランザクションで実行する。
 * doc 書き込みと残高調整を別トランザクションに分けると途中失敗・再送で残高がずれるため、
 * 関係ユーザーの残高デルタを read-before-write でまとめて適用する。
 * @param expenseId 更新対象の支出 doc ID
 * @param before 更新前の支出
 * @param after 更新後の支出
 * @returns after が当月の外食費用なら after.userId の新残高、そうでなければ undefined
 */
export async function updateExpenseWithBalance(
  expenseId: string,
  before: StoredExpense,
  after: StoredExpense,
) {
  const db = getFirestore();
  const expenseRef = db.collection("expenses").doc(expenseId);

  const beforeApplies =
    before.category === "外食費用" && isCurrentJSTMonth(formatTimestampDate(before.date));
  const afterApplies =
    after.category === "外食費用" && isCurrentJSTMonth(formatTimestampDate(after.date));

  // 同一ユーザーの調整は合算して 1 回の update にまとめる
  const deltas = new Map<string, number>();
  if (beforeApplies) {
    deltas.set(before.userId, (deltas.get(before.userId) ?? 0) + before.amount);
  }
  if (afterApplies) {
    deltas.set(after.userId, (deltas.get(after.userId) ?? 0) - after.amount);
  }

  return db.runTransaction(async (transaction) => {
    // Firestore は read-before-write のため、update より先に全ユーザー doc を読む
    const userDocs = await Promise.all(
      [...deltas.keys()].map(async (userId) => {
        const ref = db.collection("users").doc(userId);
        return { userId, ref, snapshot: await transaction.get(ref) };
      }),
    );

    transaction.update(expenseRef, {
      userId: after.userId,
      userName: after.userName,
      amount: after.amount,
      category: after.category,
      storeName: after.storeName,
      memo: after.memo ?? null,
      date: after.date,
      calendarEventId: after.calendarEventId,
    });

    const now = Timestamp.now();
    const newBalances = new Map<string, number>();
    for (const { userId, ref, snapshot } of userDocs) {
      if (!snapshot.exists) {
        continue;
      }

      const newBalance = Number(snapshot.data()?.diningBalance ?? 0) + (deltas.get(userId) ?? 0);
      transaction.update(ref, { diningBalance: newBalance, updatedAt: now });
      newBalances.set(userId, newBalance);
    }

    return afterApplies ? newBalances.get(after.userId) : undefined;
  });
}

/**
 * balanceResetAt が属する JST 月の集計ウィンドウ [月初, 翌月初) を UTC ミリ秒で返す。
 * 支出 date は JST 日付の UTC 深夜（例: 2026-07-01T00:00:00Z）で保存される一方、
 * balanceResetAt は cron 実行時刻（数秒後）のため、時刻での閾値比較だと月初 1 日付の
 * 支出が漏れる。月単位のウィンドウで判定してこの取りこぼしを防ぐ。
 * @param balanceResetAt 残高リセット時刻
 * @returns 集計対象の月初・翌月初を表す UTC ミリ秒
 */
function getBalanceResetMonthWindow(balanceResetAt: Timestamp) {
  const jst = new Date(balanceResetAt.toMillis() + 9 * 60 * 60 * 1000);
  const monthStart = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1);
  const nextMonthStart = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth() + 1, 1);

  return { monthStart, nextMonthStart };
}

export async function recalculateDiningBalances(newBudget: number) {
  const db = getFirestore();
  const users = await getActiveUsers();

  return Promise.all(users.map(async (user): Promise<DashboardUser> => {
    // balanceResetAt 未設定時は現在の JST 月を対象にする（作成時の減算ルールと同じ範囲）
    const balanceResetAt = user.balanceResetAt ?? Timestamp.now();
    const { monthStart, nextMonthStart } = getBalanceResetMonthWindow(balanceResetAt);
    const expensesSnapshot = await db
      .collection("expenses")
      .where("userId", "==", user.id)
      .where("category", "==", "外食費用")
      .get();

    let totalExpenses = 0;
    expensesSnapshot.forEach((doc) => {
      const expense = doc.data();
      const expenseDate = expense.date as Timestamp | undefined;
      if (!expenseDate) {
        return;
      }

      const millis = expenseDate.toMillis();
      if (millis >= monthStart && millis < nextMonthStart) {
        totalExpenses += Number(expense.amount ?? 0);
      }
    });

    const newBalance = newBudget - totalExpenses;
    await db.collection("users").doc(user.id).update({
      diningBalance: newBalance,
      updatedAt: Timestamp.now(),
    });

    return {
      id: user.id,
      displayName: user.displayName,
      diningBalance: newBalance,
      groupId: user.groupId ?? "",
    };
  }));
}
