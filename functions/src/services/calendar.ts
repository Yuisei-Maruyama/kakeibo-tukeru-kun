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
    case '旅行費用':
      return '1'; // ラベンダー（紫）
    case '家賃費用':
      return '5'; // バナナ（黄色）
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
  date: string,
  startTime?: string,
  endTime?: string
): Promise<string> {
  try {
    const calendar = getCalendarClient();

    const summary = `[予定] ${userName} - ${scheduleContent}`;
    const description = `予定: ${scheduleContent}\n担当: ${userName}\n登録元: LINE家計簿Bot`;

    let event: calendar_v3.Schema$Event;

    if (startTime && endTime) {
      // 開始時間と終了時間が両方指定されている場合
      const startDateTime = `${date}T${startTime}:00+09:00`;
      const endDateTime = `${date}T${endTime}:00+09:00`;

      event = {
        summary,
        description,
        start: {
          dateTime: startDateTime,
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'Asia/Tokyo',
        },
        colorId: getColorId('予定'),
      };
    } else if (startTime && !endTime) {
      // 開始時間のみ指定の場合は1時間後を終了時間とする
      const startDateTime = `${date}T${startTime}:00+09:00`;
      const startDate = new Date(startDateTime);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      const endDateTime = endDate.toISOString().replace(/\.\d{3}Z$/, '+09:00');

      event = {
        summary,
        description,
        start: {
          dateTime: startDateTime,
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'Asia/Tokyo',
        },
        colorId: getColorId('予定'),
      };
    } else {
      // 時間指定がない場合は終日イベント
      event = {
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
    }

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
    // UTC基準で1日の範囲を設定
    const startOfDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

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
          const colonMatch = summary.match(/(.+?)の?予定[:：]\s*(.+)/);
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

/**
 * カレンダーイベントのタイトルから支出情報をパース
 */
export interface ParsedExpenseEvent {
  category: '外食費用' | '買い物費用' | '旅行費用';
  userName: string;
  amount: number;
  storeName: string;
  eventId: string;
  date: string; // YYYY-MM-DD
}

export function parseExpenseEventTitle(
  event: calendar_v3.Schema$Event
): ParsedExpenseEvent | null {
  try {
    const summary = event.summary || '';
    const eventId = event.id || '';

    // 柔軟なパースパターン
    // パターン1: [カテゴリー] ユーザー名 ¥金額 (店舗名)
    // パターン2: [カテゴリー] ユーザー名 金額 (店舗名)
    // パターン3: [カテゴリー] ユーザー名 金額円 (店舗名)
    // パターン4: カテゴリー ユーザー名 ¥金額 (店舗名)
    // パターン5: カテゴリー ユーザー名 金額 (店舗名)
    // パターン6: カテゴリー ユーザー名 金額円 (店舗名)
    // カテゴリーは部分一致（外食、外食費、買い物、買物、旅行、旅行費）
    // 店舗名はすべてオプション

    let category: '外食費用' | '買い物費用' | '旅行費用' | null = null;
    let userName = '';
    let amount = 0;
    let storeName = '手動追加';

    // カテゴリーを抽出（柔軟な部分一致）
    // 外食費用: 外食、外食費を含む
    // 買い物費用: 買い物、買物を含む
    // 旅行費用: 旅行、旅行費を含む
    if (summary.includes('外食')) {
      category = '外食費用';
    } else if (summary.includes('買い物') || summary.includes('買物')) {
      category = '買い物費用';
    } else if (summary.includes('旅行')) {
      category = '旅行費用';
    }

    // カテゴリーが判定できない場合は完全一致を試みる
    if (!category) {
      const exactMatch = summary.match(/\[?(外食費用|買い物費用|旅行費用)\]?/);
      if (exactMatch) {
        category = exactMatch[1] as '外食費用' | '買い物費用' | '旅行費用';
      } else {
        console.warn(`No category found in event: ${summary}`);
        return null;
      }
    }

    // カテゴリー文字列を除去（様々なパターンに対応）
    let afterCategory = summary;

    // 1回のreplaceで複数パターンに対応（効率化）
    if (category === '外食費用') {
      // [外食費用]、外食費用、[外食費]、外食費、[外食]、外食 を除去
      afterCategory = afterCategory.replace(/\[?(外食費用|外食費|外食)\]?\s*/, '');
    } else if (category === '買い物費用') {
      // [買い物費用]、買い物費用、[買い物]、買い物、[買物]、買物 を除去
      afterCategory = afterCategory.replace(/\[?(買い物費用|買い物|買物)\]?\s*/, '');
    } else if (category === '旅行費用') {
      // [旅行費用]、旅行費用、[旅行費]、旅行費、[旅行]、旅行 を除去
      afterCategory = afterCategory.replace(/\[?(旅行費用|旅行費|旅行)\]?\s*/, '');
    }

    afterCategory = afterCategory.trim();

    // 先に店舗名を抽出・除去（金額との競合を避けるため）
    const storeMatch = afterCategory.match(/\(([^)]+)\)/);
    if (storeMatch) {
      storeName = storeMatch[1].trim();
      // 店舗名を除去
      afterCategory = afterCategory.replace(/\([^)]+\)/, '').trim();
    }

    // 金額を抽出（¥付き・円付き・記号なしのすべてに対応）
    // パターン1: ¥記号付き（優先度：高）
    // パターン2: 円付き（優先度：中）
    // パターン3: 記号なし・3桁以上の数字（優先度：低）
    let amountMatch = afterCategory.match(/[¥￥]\s*([\d,，]+)/);
    let amountStr = '';

    if (amountMatch) {
      // ¥記号付きの金額
      amountStr = amountMatch[1];
    } else {
      // 円付きの金額
      amountMatch = afterCategory.match(/(\d[\d,，]*)\s*円/);
      if (amountMatch) {
        amountStr = amountMatch[1];
      } else {
        // 記号なし・円なしの金額（3桁以上の数字を金額と判定）
        // ユーザー名の数字と区別するため、空白の後にある3桁以上の数字にマッチ
        amountMatch = afterCategory.match(/(?:^|\s)(\d{3,}[\d,，]*)(?:\s|$)/);
        if (amountMatch) {
          amountStr = amountMatch[1];
        }
      }
    }

    if (!amountStr) {
      console.warn(`No amount found in event: ${summary}. Supported formats: ¥1000, 1000円, 1000 (3+ digits)`);
      return null;
    }

    // カンマを除去して数値に変換
    amount = parseInt(amountStr.replace(/[,，]/g, ''), 10);

    if (isNaN(amount) || amount <= 0) {
      console.warn(`Invalid amount in event: ${summary}`);
      return null;
    }

    // ユーザー名を抽出（金額を除いた部分）
    let userNamePart = afterCategory
      .replace(/[¥￥]\s*[\d,，]+/, '') // ¥付き金額を除去
      .replace(/\d[\d,，]*\s*円/, '') // 円付き金額を除去
      .replace(/(?:^|\s)\d{3,}[\d,，]*(?:\s|$)/, '') // 記号なし金額を除去
      .trim();

    // 残った文字列がユーザー名
    if (userNamePart.length === 0) {
      console.warn(`No user name found in event: ${summary}`);
      return null;
    }

    userName = userNamePart;

    // イベントの日付を取得
    let dateStr = '';
    if (event.start?.date) {
      // 終日イベント
      dateStr = event.start.date;
    } else if (event.start?.dateTime) {
      // 時刻指定イベント
      dateStr = new Date(event.start.dateTime).toISOString().split('T')[0];
    } else {
      console.warn(`No date found in event: ${summary}`);
      return null;
    }

    return {
      category,
      userName,
      amount,
      storeName,
      eventId,
      date: dateStr,
    };
  } catch (error) {
    console.error('Failed to parse expense event:', error);
    return null;
  }
}

/**
 * 当月の支出イベントを取得（外食費用・買い物費用・旅行費用）
 */
export async function getMonthlyExpenseEvents(
  calendarId: string,
  year: number,
  month: number // 1-12
): Promise<ParsedExpenseEvent[]> {
  try {
    // 当月の開始日・終了日を計算
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // カレンダーイベントを取得
    const events = await getCalendarEvents(calendarId, startDate, endDate);

    // タイトルをパースして支出情報を抽出
    const parsedEvents: ParsedExpenseEvent[] = [];
    for (const event of events) {
      const parsed = parseExpenseEventTitle(event);
      if (parsed) {
        parsedEvents.push(parsed);
      }
    }

    console.log(`Found ${parsedEvents.length} expense events for ${year}/${month}`);
    return parsedEvents;
  } catch (error) {
    console.error('Failed to get monthly expense events:', error);
    throw error;
  }
}
