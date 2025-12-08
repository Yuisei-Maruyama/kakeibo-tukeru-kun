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
function getColorId(category: Category | '予定'): string {
  switch (category) {
    case '外食費用':
      return '4'; // コーラルピンク
    case '買い物費用':
      return '7'; // シアン
    case '予定':
      return '10'; // バジル（緑）
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
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    const calendarIdMasked = calendarId ? `${calendarId.substring(0, 10)}...` : 'undefined';
    console.error('Calendar API error details:', {
      message: errorMsg,
      calendarId: calendarIdMasked,
      userName,
      amount,
      category,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    throw new Error(`カレンダー登録失敗: ${errorMsg}`);
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
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    const calendarIdMasked = calendarId ? `${calendarId.substring(0, 10)}...` : 'undefined';
    console.error('Calendar delete error details:', {
      message: errorMsg,
      calendarId: calendarIdMasked,
      eventId,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    throw new Error(`カレンダー削除失敗: ${errorMsg}`);
  }
}

/**
 * 予定を作成（支出ではない一般的な予定）
 */
export async function createScheduleEvent(
  calendarId: string,
  userName: string,
  scheduleContent: string,
  date: string
): Promise<string> {
  try {
    const calendar = getCalendarClient();

    const summary = `[予定] ${userName} - ${scheduleContent}`;
    const description = `予定: ${scheduleContent}\n担当: ${userName}\n登録元: LINE家計簿Bot`;

    const event: calendar_v3.Schema$Event = {
      summary,
      description,
      start: {
        date,
      },
      end: {
        date,
      },
      colorId: getColorId('予定'),
    };

    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    const eventId = response.data.id;
    if (!eventId) {
      throw new Error('Failed to get event ID from response');
    }

    console.log(`Schedule event created: ${eventId}`);
    return eventId;
  } catch (error) {
    console.error('Failed to create schedule event:', error);
    const errorMsg = error instanceof Error ? error.message : '不明なエラー';
    const calendarIdMasked = calendarId ? `${calendarId.substring(0, 10)}...` : 'undefined';
    console.error('Calendar API error details:', {
      message: errorMsg,
      calendarId: calendarIdMasked,
      userName,
      scheduleContent,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });
    throw new Error(`予定登録失敗: ${errorMsg}`);
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

/**
 * 特定の日の予定（緑色=colorId:10のイベント、またはタイトルに「予定」を含むイベント）を取得
 */
export async function getTodaySchedules(
  calendarId: string,
  date: Date
): Promise<Array<{ userName: string; content: string }>> {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const events = await getCalendarEvents(calendarId, startOfDay, endOfDay);

    // 予定（colorId: 10）または タイトルに「予定」を含むイベントをフィルター
    const schedules = events
      .filter(event => {
        const summary = event.summary || '';
        return event.colorId === '10' || summary.includes('予定');
      })
      .map(event => {
        const summary = event.summary || '';

        // [予定] ユーザー名 - 予定内容 の形式からパース
        const match = summary.match(/\[予定\]\s*(.+?)\s*-\s*(.+)/);
        if (match) {
          return {
            userName: match[1].trim(),
            content: match[2].trim(),
          };
        }

        // 「予定」という文言がタイトルに含まれている場合
        // 例: "田中の予定: 買い物" や "予定 - 会議"
        if (summary.includes('予定')) {
          // コロンで分割してみる（例: "田中の予定: 買い物"）
          const colonMatch = summary.match(/(.+?)[のの]?予定[:：]\s*(.+)/);
          if (colonMatch) {
            return {
              userName: colonMatch[1].trim(),
              content: colonMatch[2].trim(),
            };
          }

          // ハイフンで分割してみる（例: "予定 - 会議"）
          const dashMatch = summary.match(/予定\s*[-ー]\s*(.+)/);
          if (dashMatch) {
            return {
              userName: '不明',
              content: dashMatch[1].trim(),
            };
          }

          // それ以外はそのまま
          return {
            userName: '不明',
            content: summary,
          };
        }

        return {
          userName: '不明',
          content: summary,
        };
      });

    return schedules;
  } catch (error) {
    console.error('Failed to get today schedules:', error);
    return [];
  }
}
