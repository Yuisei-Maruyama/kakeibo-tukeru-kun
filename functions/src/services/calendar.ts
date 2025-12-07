import { google, calendar_v3 } from 'googleapis';
import { CalendarEventParams, Category } from '../types/index.js';

/**
 * Google Calendar APIクライアント
 */
let calendarClient: calendar_v3.Calendar | null = null;

/**
 * Google Calendar APIの初期化
 */
function getCalendarClient(): calendar_v3.Calendar {
  if (!calendarClient) {
    const auth = new google.auth.GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
    calendarClient = google.calendar({ version: 'v3', auth });
  }
  return calendarClient;
}

/**
 * カテゴリーに応じた色IDを取得
 */
function getColorId(category: Category): string {
  switch (category) {
    case '外食費用':
      return '4'; // コーラルピンク
    case '買い物費用':
      return '7'; // シアン
    default:
      return '1'; // デフォルト
  }
}

/**
 * カレンダーイベントを作成
 */
export async function createCalendarEvent(
  calendarId: string,
  userName: string,
  amount: number,
  category: Category,
  storeName: string,
  date: string,
  items?: string[]
): Promise<string> {
  try {
    const calendar = getCalendarClient();

    const summary = `[${category}]  ${userName}　￥${amount.toLocaleString()}`;

    let description = `店舗: ${storeName}\n`;
    if (items && items.length > 0) {
      description += `商品: ${items.join(', ')}\n`;
    }
    description += `登録元: LINE家計簿Bot`;

    const params: CalendarEventParams = {
      summary,
      description,
      date,
      colorId: getColorId(category),
    };

    const event: calendar_v3.Schema$Event = {
      summary: params.summary,
      description: params.description,
      start: {
        date: params.date,
      },
      end: {
        date: params.date,
      },
      colorId: params.colorId,
    };

    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    const eventId = response.data.id;
    if (!eventId) {
      throw new Error('Failed to get event ID from response');
    }

    console.log(`Calendar event created: ${eventId}`);
    return eventId;
  } catch (error) {
    console.error('Failed to create calendar event:', error);
    throw error;
  }
}

/**
 * カレンダーイベントを削除
 */
export async function deleteCalendarEvent(
  calendarId: string,
  eventId: string
): Promise<void> {
  try {
    const calendar = getCalendarClient();
    await calendar.events.delete({
      calendarId,
      eventId,
    });
    console.log(`Calendar event deleted: ${eventId}`);
  } catch (error) {
    console.error('Failed to delete calendar event:', error);
    throw error;
  }
}

/**
 * 期間内のカレンダーイベントを取得
 */
export async function getCalendarEvents(
  calendarId: string,
  startDate: Date,
  endDate: Date
): Promise<calendar_v3.Schema$Event[]> {
  try {
    const calendar = getCalendarClient();
    const response = await calendar.events.list({
      calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    return response.data.items || [];
  } catch (error) {
    console.error('Failed to get calendar events:', error);
    throw error;
  }
}
