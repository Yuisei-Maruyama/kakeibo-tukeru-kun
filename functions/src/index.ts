import { HttpFunction } from '@google-cloud/functions-framework';
import { handleWebhook } from './handlers/webhook.js';
import { handleScheduledReport, handleDailyScheduleNotification, handleCalendarSync, handleMonthlySubscriptions } from './handlers/scheduler.js';

/**
 * LINE Webhook Handler
 * LINE からの Webhook イベントを受け取り処理する
 */
export const webhook: HttpFunction = async (req, res) => {
  await handleWebhook(req, res);
};

/**
 * Scheduled Report Handler
 * Cloud Scheduler から呼び出され、半月ごとの集計レポートを送信
 */
export const scheduledReport: HttpFunction = async (req, res) => {
  await handleScheduledReport(req, res);
};

/**
 * Daily Schedule Notification Handler
 * Cloud Scheduler から呼び出され、毎朝7:00に当日の予定を通知
 */
export const dailyScheduleNotification: HttpFunction = async (req, res) => {
  await handleDailyScheduleNotification(req, res);
};

/**
 * Calendar Sync Handler
 * Cloud Scheduler から呼び出され、毎日深夜3:00にGoogleカレンダーの支出イベントをFirestoreに同期
 */
export const calendarSync: HttpFunction = async (req, res) => {
  await handleCalendarSync(req, res);
};

/**
 * Monthly Subscriptions Handler
 * Cloud Scheduler から呼び出され、毎月1日にサブスクを自動登録
 */
export const monthlySubscriptions: HttpFunction = async (req, res) => {
  await handleMonthlySubscriptions(req, res);
};
