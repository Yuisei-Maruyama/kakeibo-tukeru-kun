import { Firestore, Timestamp } from "@google-cloud/firestore";
import { google, type calendar_v3 } from "googleapis";
import { NextRequest, NextResponse } from "next/server";
import { createFirestoreClient, createGoogleAuth } from "@/lib/google-server";
import type {
  DashboardCalendarEvent,
  DashboardData,
  DashboardExpense,
  DashboardExpenseCategory,
  DashboardRent,
  DashboardSettings,
  DashboardSubscription,
  DashboardUser,
} from "@/types/dashboard";

export const runtime = "nodejs";

let firestore: Firestore | null = null;
let calendarClient: calendar_v3.Calendar | null = null;

type LineTokenVerification = {
  sub: string;
  name?: string;
  aud: string;
};

type FirestoreUser = {
  id: string;
  displayName: string;
  groupId: string;
  isActive: boolean;
  diningBalance: number;
};

type FirestoreSettings = {
  monthlyBudget?: number;
  lineGroupId?: string;
  calendarId?: string;
  firstHalfPayerId?: string;
  secondHalfPayerId?: string;
};

function getFirestore() {
  if (!firestore) {
    firestore = createFirestoreClient();
  }

  return firestore;
}

function getCalendarClient() {
  if (!calendarClient) {
    const auth = createGoogleAuth(["https://www.googleapis.com/auth/calendar.readonly"]);
    calendarClient = google.calendar({ version: "v3", auth });
  }

  return calendarClient;
}

function createUnavailable(message: string): DashboardData {
  const now = getCurrentJSTYearMonth();

  return {
    source: "unavailable",
    message,
    month: `${now.year}-${String(now.month).padStart(2, "0")}`,
    users: [],
    expenses: [],
    calendarEvents: [],
    subscriptions: [],
    rent: null,
    settings: {
      monthlyBudget: 50000,
      lineGroupId: "",
      calendarId: "",
    },
    totals: {
      dining: 0,
      shopping: 0,
      travel: 0,
      total: 0,
    },
  };
}

function getCurrentJSTYearMonth() {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
  }).formatToParts(new Date());

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

function parseTargetMonth(value: string | null) {
  if (!value) {
    return getCurrentJSTYearMonth();
  }

  const [year, month] = value.split(/[/-]/).map(Number);
  if (!year || !month || month < 1 || month > 12) {
    return getCurrentJSTYearMonth();
  }

  return { year, month };
}

function getStoredExpenseMonthRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}

function getJSTCalendarMonthRange(year: number, month: number) {
  return {
    start: new Date(Date.UTC(year, month - 1, 1, -9, 0, 0, 0)),
    end: new Date(Date.UTC(year, month, 1, -9, 0, 0, 0)),
  };
}

function formatTimestampDate(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString().slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return "";
}

function formatDateTimeLabel(event: calendar_v3.Schema$Event) {
  if (event.start?.date) {
    return "終日";
  }

  if (!event.start?.dateTime) {
    return "時間不明";
  }

  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
  const startTime = formatter.format(new Date(event.start.dateTime));

  if (!event.end?.dateTime) {
    return startTime;
  }

  const endTime = formatter.format(new Date(event.end.dateTime));
  return startTime === endTime ? startTime : `${startTime} 〜 ${endTime}`;
}

function getEventDate(event: calendar_v3.Schema$Event) {
  if (event.start?.date) {
    return event.start.date;
  }

  if (!event.start?.dateTime) {
    return "";
  }

  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(event.start.dateTime));

  return `${parts.find((part) => part.type === "year")?.value}-${parts.find(
    (part) => part.type === "month",
  )?.value}-${parts.find((part) => part.type === "day")?.value}`;
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

function buildIntervalLabel(unit: string, value: number) {
  const unitLabel = unit === "week" ? "週" : "ヶ月";
  return value === 1 ? `毎${unitLabel}` : `${value}${unitLabel}ごと`;
}

async function verifyLineToken(request: NextRequest): Promise<LineTokenVerification | null> {
  if (process.env.LIFF_DASHBOARD_AUTH_DISABLED === "true") {
    return null;
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

  return (await response.json()) as LineTokenVerification;
}

async function authorizeUser(request: NextRequest) {
  const verification = await verifyLineToken(request);
  const db = getFirestore();

  if (!verification) {
    return {
      id: "auth-disabled",
      displayName: "認証スキップ",
      groupId: "",
      isActive: true,
      diningBalance: 0,
    } satisfies FirestoreUser;
  }

  const userDoc = await db.collection("users").doc(verification.sub).get();
  if (!userDoc.exists) {
    throw new Error("家計ぼっとに登録済みの LINE ユーザーではありません");
  }

  const user = userDoc.data() as FirestoreUser;
  if (!user.isActive) {
    throw new Error("このユーザーは無効です");
  }

  return user;
}

async function getUsers(groupId: string) {
  const snapshot = await getFirestore()
    .collection("users")
    .where("isActive", "==", true)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as FirestoreUser)
    .filter((user) => !groupId || user.groupId === groupId)
    .map(
      (user): DashboardUser => ({
        id: user.id,
        displayName: user.displayName,
        diningBalance: user.diningBalance ?? 0,
        groupId: user.groupId ?? "",
      }),
    );
}

async function getSettings(users: DashboardUser[]): Promise<DashboardSettings> {
  const doc = await getFirestore().collection("settings").doc("global").get();
  const settings = doc.exists ? (doc.data() as FirestoreSettings) : {};

  return {
    monthlyBudget: settings.monthlyBudget ?? 50000,
    lineGroupId: settings.lineGroupId ?? "",
    calendarId: settings.calendarId ?? process.env.GOOGLE_CALENDAR_ID ?? "",
    firstHalfPayerName: users.find((user) => user.id === settings.firstHalfPayerId)
      ?.displayName,
    secondHalfPayerName: users.find((user) => user.id === settings.secondHalfPayerId)
      ?.displayName,
  };
}

async function getExpenses(year: number, month: number, groupUserIds: Set<string>) {
  const { start, end } = getStoredExpenseMonthRange(year, month);
  const snapshot = await getFirestore()
    .collection("expenses")
    .where("date", ">=", Timestamp.fromDate(start))
    .where("date", "<=", Timestamp.fromDate(end))
    .orderBy("date", "desc")
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as Record<string, unknown>)
    .filter((expense) => {
      return !groupUserIds.size || groupUserIds.has(String(expense.userId ?? ""));
    })
    .map(
      (expense): DashboardExpense => ({
        id: String(expense.id),
        userId: String(expense.userId ?? ""),
        userName: String(expense.userName ?? ""),
        amount: Number(expense.amount ?? 0),
        category: String(expense.category ?? "買い物費用") as DashboardExpenseCategory,
        storeName: String(expense.storeName ?? ""),
        date: formatTimestampDate(expense.date),
        calendarEventId: expense.calendarEventId
          ? String(expense.calendarEventId)
          : undefined,
      }),
    );
}

async function getCalendarEvents(
  calendarId: string,
  year: number,
  month: number,
): Promise<DashboardCalendarEvent[]> {
  if (!calendarId) {
    return [];
  }

  const { start, end } = getJSTCalendarMonthRange(year, month);
  const response = await getCalendarClient().events.list({
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    timeZone: "Asia/Tokyo",
  });

  return (response.data.items ?? []).map((event) => ({
    id: event.id ?? "",
    title: event.summary ?? "無題",
    date: getEventDate(event),
    timeLabel: formatDateTimeLabel(event),
    type: getCalendarEventType(event),
    colorId: event.colorId ?? undefined,
    description: event.description ?? undefined,
  }));
}

async function getSubscriptions(groupId: string): Promise<DashboardSubscription[]> {
  const snapshot = await getFirestore()
    .collection("subscriptions")
    .where("isActive", "==", true)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }) as Record<string, unknown>)
    .filter((subscription) => !groupId || subscription.groupId === groupId)
    .map((subscription) => ({
      id: String(subscription.id),
      payerName: String(subscription.payerName ?? ""),
      serviceName: String(subscription.serviceName ?? ""),
      amount: Number(subscription.amount ?? 0),
      startDate: formatTimestampDate(subscription.startDate),
      intervalLabel: buildIntervalLabel(
        String(subscription.intervalUnit ?? "month"),
        Number(subscription.intervalValue ?? 1),
      ),
    }))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

async function getRent(groupId: string): Promise<DashboardRent> {
  const doc = await getFirestore().collection("rents").doc("global").get();
  if (!doc.exists) {
    return null;
  }

  const rent = doc.data() as Record<string, unknown>;
  if (groupId && rent.groupId !== groupId) {
    return null;
  }

  return {
    payerName: String(rent.payerName ?? ""),
    amount: Number(rent.amount ?? 0),
  };
}

export async function GET(request: NextRequest) {
  try {
    const authorizedUser = await authorizeUser(request);
    const { year, month } = parseTargetMonth(request.nextUrl.searchParams.get("month"));
    const users = await getUsers(authorizedUser.groupId);
    const settings = await getSettings(users);
    const groupId = authorizedUser.groupId || settings.lineGroupId;
    const groupUserIds = new Set(users.map((user) => user.id));

    const [expenses, calendarEvents, subscriptions, rent] = await Promise.all([
      getExpenses(year, month, groupUserIds),
      getCalendarEvents(settings.calendarId, year, month),
      getSubscriptions(groupId),
      getRent(groupId),
    ]);

    const totals = expenses.reduce(
      (acc, expense) => {
        if (expense.category === "外食費用") {
          acc.dining += expense.amount;
        } else if (expense.category === "買い物費用") {
          acc.shopping += expense.amount;
        } else if (expense.category === "旅行費用") {
          acc.travel += expense.amount;
        }

        acc.total += expense.amount;
        return acc;
      },
      { dining: 0, shopping: 0, travel: 0, total: 0 },
    );

    return NextResponse.json({
      source: "live",
      message: "Firestore と Google Calendar から取得しました",
      month: `${year}-${String(month).padStart(2, "0")}`,
      users,
      expenses,
      calendarEvents,
      subscriptions,
      rent,
      settings,
      totals,
    } satisfies DashboardData, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "データ取得に失敗しました";
    return NextResponse.json(createUnavailable(message), { status: 200 });
  }
}
