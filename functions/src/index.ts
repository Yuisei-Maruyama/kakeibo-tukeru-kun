import { HttpFunction } from '@google-cloud/functions-framework';
import { handleWebhook } from './handlers/webhook.js';
import { handleScheduledReport } from './handlers/scheduler.js';

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
