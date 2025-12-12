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
