/**
 * 日付ユーティリティ
 * Cloud Functionsは UTC で動作するため、JST（日本時間）での日付処理を提供
 */

/**
 * 現在のJST（日本時間）のDateオブジェクトを取得
 * Cloud Functions内部ではUTCで動作しているが、JSTに変換した Date を返す
 */
export function getJSTDate(): Date {
  const now = new Date();
  // UTC時刻に9時間（日本時間のオフセット）を加算
  const jstOffset = 9 * 60 * 60 * 1000; // 9時間 = 9 * 60分 * 60秒 * 1000ミリ秒
  return new Date(now.getTime() + jstOffset);
}

/**
 * JSTの現在の年を取得
 */
export function getJSTYear(): number {
  const jstDate = getJSTDate();
  return jstDate.getUTCFullYear(); // getUTCFullYear()を使う（すでにJST時刻に変換済み）
}

/**
 * JSTの現在の月を取得（1-12）
 */
export function getJSTMonth(): number {
  const jstDate = getJSTDate();
  return jstDate.getUTCMonth() + 1; // getUTCMonth()は0-11を返すので+1
}

/**
 * JSTの現在の日を取得（1-31）
 */
export function getJSTDay(): number {
  const jstDate = getJSTDate();
  return jstDate.getUTCDate();
}

/**
 * JSTの現在の時刻を取得（0-23）
 */
export function getJSTHours(): number {
  const jstDate = getJSTDate();
  return jstDate.getUTCHours();
}

/**
 * 日付をフォーマット（YYYY-MM-DD）
 * @param date - フォーマットする日付（省略時は現在のJST日付）
 */
export function formatDateYYYYMMDD(date?: Date): string {
  const targetDate = date || getJSTDate();
  const year = targetDate.getUTCFullYear();
  const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 指定した年月の1日（JST）のDateオブジェクトを取得
 * @param year - 年（例: 2025）
 * @param month - 月（1-12）
 */
export function getJSTMonthStart(year: number, month: number): Date {
  // UTC基準で年月日を指定（既にJSTとして扱う）
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}

/**
 * 指定した年月の最終日（JST）のDateオブジェクトを取得
 * @param year - 年（例: 2025）
 * @param month - 月（1-12）
 */
export function getJSTMonthEnd(year: number, month: number): Date {
  // 次の月の0日 = 当月の最終日
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

/**
 * 現在のJST時刻情報を返す（デバッグ用）
 */
export function getJSTInfo(): {
  year: number;
  month: number;
  day: number;
  hours: number;
  formatted: string;
  utcOffset: string;
} {
  const jstDate = getJSTDate();
  return {
    year: getJSTYear(),
    month: getJSTMonth(),
    day: getJSTDay(),
    hours: getJSTHours(),
    formatted: formatDateYYYYMMDD(jstDate),
    utcOffset: '+09:00',
  };
}

/**
 * 日付文字列をパースしてDateオブジェクトを返す
 * 対応形式:
 * - M/D: 今年の日付（例: 5/22 → 2024/5/22）
 * - YYYY/M/D: 年を指定（例: 2024/5/22）
 * - YYYY-M-D: 年を指定（ハイフン）（例: 2024-5-22）
 *
 * @param dateStr - 日付文字列
 * @returns パースされたDateオブジェクト（JST）、パース失敗時はnull
 */
export function parseDateString(dateStr: string): Date | null {
  // スラッシュまたはハイフンで分割
  const parts = dateStr.split(/[/-]/);

  let year: number;
  let month: number;
  let day: number;

  if (parts.length === 3) {
    // YYYY/M/D または YYYY-M-D 形式
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
    day = parseInt(parts[2], 10);
  } else if (parts.length === 2) {
    // M/D 形式（今年として扱う）
    year = getJSTYear();
    month = parseInt(parts[0], 10);
    day = parseInt(parts[1], 10);
  } else {
    return null;
  }

  // 日付の妥当性チェック（UTCで作成して検証）
  const testDate = new Date(Date.UTC(year, month - 1, day));
  if (isNaN(testDate.getTime()) || testDate.getUTCMonth() !== month - 1) {
    return null;
  }

  // JST時刻として Date.UTC で日付を作成（時刻は00:00:00）
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * 指定した日付が現在の月（JST）かどうかを判定
 * @param dateStr - 判定する日付（YYYY-MM-DD形式の文字列）
 * @returns 現在の月と同じ場合はtrue
 */
export function isCurrentMonthJST(dateStr: string): boolean {
  const jstNow = getJSTDate();
  const currentYear = jstNow.getUTCFullYear();
  const currentMonth = jstNow.getUTCMonth(); // 0-11

  // YYYY-MM-DD形式の文字列をパース
  const parts = dateStr.split('-');
  if (parts.length !== 3) return false;

  const targetYear = parseInt(parts[0], 10);
  const targetMonth = parseInt(parts[1], 10) - 1; // 0-11に変換

  return targetYear === currentYear && targetMonth === currentMonth;
}

/**
 * 年月文字列をパースして年月を返す
 * 対応形式:
 * - M: 今年の指定月（例: 12 → 2024/12）
 * - YYYY/M: 年月を指定（例: 2024/12）
 * - YYYY-M: 年月を指定（ハイフン）（例: 2024-12）
 *
 * @param yearMonthStr - 年月文字列
 * @returns { year: 年, month: 月（1-12） }、パース失敗時はnull
 */
export function parseYearMonthString(yearMonthStr: string): { year: number; month: number } | null {
  // スラッシュまたはハイフンで分割
  const parts = yearMonthStr.split(/[/-]/);

  let year: number;
  let month: number;

  if (parts.length === 2) {
    // YYYY/M または YYYY-M 形式
    year = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10);
  } else if (parts.length === 1) {
    // M 形式（今年として扱う）
    year = getJSTYear();
    month = parseInt(parts[0], 10);
  } else {
    return null;
  }

  // 月の妥当性チェック
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}
