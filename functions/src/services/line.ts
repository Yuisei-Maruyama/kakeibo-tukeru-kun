import { Client, MessageAPIResponseBase } from '@line/bot-sdk';
import { ReportData, Category } from '../types/index.js';

/**
 * LINE Messaging APIクライアント
 */
let lineClient: Client | null = null;

/**
 * LINE APIクライアントの初期化
 */
function getLineClient(accessToken: string): Client {
  if (!lineClient) {
    lineClient = new Client({
      channelAccessToken: accessToken,
    });
  }
  return lineClient;
}

/**
 * 画像メッセージの内容を取得
 */
export async function getImageContent(
  messageId: string,
  accessToken: string
): Promise<Buffer> {
  const client = getLineClient(accessToken);
  const stream = await client.getMessageContent(messageId);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * リプライメッセージを送信
 */
export async function replyMessage(
  replyToken: string,
  message: string,
  accessToken: string
): Promise<MessageAPIResponseBase> {
  const client = getLineClient(accessToken);
  return client.replyMessage(replyToken, {
    type: 'text',
    text: message,
  });
}

/**
 * プッシュメッセージを送信
 */
export async function pushMessage(
  to: string,
  message: string,
  accessToken: string
): Promise<MessageAPIResponseBase> {
  const client = getLineClient(accessToken);
  return client.pushMessage(to, {
    type: 'text',
    text: message,
  });
}

/**
 * グループメンバーのプロフィール（表示名）を取得
 */
export async function getUserDisplayName(
  groupId: string,
  userId: string,
  accessToken: string
): Promise<string> {
  try {
    const client = getLineClient(accessToken);
    const profile = await client.getGroupMemberProfile(groupId, userId);
    return profile.displayName;
  } catch (error) {
    console.error('Failed to get user display name:', error);
    // エラー時はuserIdの最初の8文字を返す
    return userId.slice(0, 8);
  }
}

/**
 * 登録完了メッセージを生成
 */
export function createRegistrationMessage(
  category: Category,
  amount: number,
  userName: string,
  storeName: string,
  date: string,
  balance?: number
): string {
  let message = `✅ 登録しました！\n`;
  message += `📝 ${category}: ￥${amount.toLocaleString()}（${userName}）\n`;
  message += `🏪 ${storeName}\n`;
  message += `📅 ${date}\n`;
  message += `\n`;

  if (category === '外食費用' && balance !== undefined) {
    message += `💰 ${userName}の外食残高: ￥${balance.toLocaleString()}`;
  } else if (category === '買い物費用') {
    message += `🛒 買い物費用として登録されました`;
  }

  return message;
}

/**
 * エラーメッセージを生成
 */
export function createErrorMessage(reason?: string): string {
  let message = `❌ 画像を解析できませんでした\n\n`;
  message += `考えられる原因:\n`;
  message += `• 画像が不鮮明\n`;
  message += `• レシートや支払い画面ではない\n`;
  message += `• 文字が読み取れない\n`;

  if (reason) {
    message += `\n詳細: ${reason}\n`;
  }

  message += `\n📸 もう一度、鮮明な画像を送信してください`;
  return message;
}

/**
 * ヘルプメッセージを生成
 */
export function createHelpMessage(): string {
  let message = `📚 家計簿Bot ヘルプ\n`;
  message += `━━━━━━━━━━━━━━━\n\n`;

  // 基本の使い方
  message += `🔰 基本の使い方\n`;
  message += `────────────────\n`;
  message += `📸 レシート画像を送信\n`;
  message += `　→ 自動で解析・登録されます\n\n`;

  // よく使うコマンド
  message += `⭐ よく使うコマンド\n`;
  message += `────────────────\n`;
  message += `@残高　　　外食残高を確認\n`;
  message += `@履歴　　　直近10件の支出\n`;
  message += `@レポート　集計レポート表示\n\n`;

  // 支出登録
  message += `💰 支出を登録する\n`;
  message += `────────────────\n`;
  message += `@追加\n`;
  message += `　→ 対話形式で登録できます\n\n`;
  message += `一括入力の場合:\n`;
  message += `@追加 外食費用 名前 金額\n`;
  message += `@追加 外食費用 名前 金額 日付\n\n`;
  message += `💡 ヒント\n`;
  message += `・@自分 → 送信者の名前に置換\n`;
  message += `・日付省略 → 今日の日付\n\n`;

  // 予定登録
  message += `📅 予定を登録する\n`;
  message += `────────────────\n`;
  message += `@予定\n`;
  message += `　→ 対話形式で登録できます\n\n`;
  message += `一括入力の場合:\n`;
  message += `@予定 名前 内容\n`;
  message += `@予定 名前 内容 日付\n`;
  message += `@予定 名前 内容 日付 開始 終了\n\n`;

  // 削除
  message += `🗑️ 支出を削除する\n`;
  message += `────────────────\n`;
  message += `@削除\n`;
  message += `　→ 対話形式で削除できます\n\n`;
  message += `一括入力の場合:\n`;
  message += `@削除 日付 金額\n\n`;

  // サブスク
  message += `🔄 サブスク（定期支払い）\n`;
  message += `────────────────\n`;
  message += `@サブスク一覧　一覧を表示\n`;
  message += `@サブスク追加　新規登録\n`;
  message += `@サブスク削除　登録を削除\n\n`;
  message += `💡 登録時に設定する項目:\n`;
  message += `・支払い者\n`;
  message += `・支払い内容（Netflix等）\n`;
  message += `・金額\n`;
  message += `・開始日（初回支払日）\n`;
  message += `・間隔（週/月ごと）\n\n`;
  message += `📅 月初めに該当日を自動算出し\n`;
  message += `　 買い物費用として登録されます\n\n`;

  // 設定
  message += `⚙️ 設定\n`;
  message += `────────────────\n`;
  message += `@予算 金額　　月額予算を変更\n`;
  message += `@初期設定　　　外食担当者を設定\n`;
  message += `@設定変更　　　外食担当者を変更`;

  return message;
}

/**
 * 残高確認メッセージを生成
 */
export function createBalanceMessage(
  users: Array<{ userName: string; balance: number }>,
  monthlyBudget: number
): string {
  let message = `💰 外食残高\n\n`;

  for (const user of users) {
    message += `${user.userName}: ￥${user.balance.toLocaleString()}\n`;
  }

  message += `\n📅 今月の予算: ￥${monthlyBudget.toLocaleString()}/人`;
  return message;
}

/**
 * 予算変更メッセージを生成
 */
export function createBudgetUpdateMessage(newBudget: number): string {
  let message = `✅ 予算を変更しました！\n\n`;
  message += `📝 新しい予算: ￥${newBudget.toLocaleString()}/人/月\n\n`;
  message += `※ 次回の月次リセット時から適用されます\n`;
  message += `※ 今月の残高には影響しません`;
  return message;
}

/**
 * 集計レポートメッセージを生成
 */
export function createReportMessage(reportData: ReportData): string {
  const { period, diningExpenses, shoppingExpenses, currentPayer, monthlySummary } = reportData;

  let message = `📊 家計簿レポート（${formatDate(period.start)}〜${formatDate(period.end)}）\n`;

  if (currentPayer) {
    message += `👤 外食担当: ${currentPayer}\n`;
  }

  message += `\n【🍽️ 外食費用】\n`;
  for (const userExp of diningExpenses) {
    message += `${userExp.userName}: ￥${userExp.total.toLocaleString()}`;
    if (userExp.balance !== undefined) {
      message += ` （残高: ￥${userExp.balance.toLocaleString()}）`;
    }
    message += `\n`;
  }
  const diningTotal = diningExpenses.reduce((sum, u) => sum + u.total, 0);
  message += `合計: ￥${diningTotal.toLocaleString()}\n`;

  message += `\n【🛒 買い物費用】\n`;
  for (const userExp of shoppingExpenses) {
    message += `${userExp.userName}: ￥${userExp.total.toLocaleString()}\n`;
  }
  const shoppingTotal = shoppingExpenses.reduce((sum, u) => sum + u.total, 0);
  message += `合計: ￥${shoppingTotal.toLocaleString()}`;

  // 月末の場合は月間サマリーを追加
  if (monthlySummary) {
    message += `\n\n━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 月間サマリー\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n`;

    message += `\n【💰 外食費用 - 貯金額】\n`;
    for (const saving of monthlySummary.diningSavings) {
      message += `${saving.userName}: ￥${saving.used.toLocaleString()} 使用 → 貯金成功 ￥${saving.savings.toLocaleString()} 🎉\n`;
    }

    message += `\n【🛒 買い物費用 - 精算】\n`;
    for (const user of monthlySummary.shoppingSettlement.users) {
      message += `${user.userName} 合計: ￥${user.total.toLocaleString()}\n`;
    }
    message += `差額: ￥${monthlySummary.shoppingSettlement.difference.toLocaleString()}\n`;

    if (monthlySummary.shoppingSettlement.refundFrom && monthlySummary.shoppingSettlement.refundTo) {
      message += `\n→ ${monthlySummary.shoppingSettlement.refundFrom}が${monthlySummary.shoppingSettlement.refundTo}に ￥${monthlySummary.shoppingSettlement.refundAmount.toLocaleString()} を返金してください🙏`;
    } else {
      message += `\n✅ 精算の必要はありません`;
    }
  }

  return message;
}

/**
 * 履歴メッセージを生成
 */
export function createHistoryMessage(
  expenses: Array<{
    date: Date;
    category: Category;
    userName: string;
    amount: number;
  }>
): string {
  if (expenses.length === 0) {
    return `📋 支出履歴がありません`;
  }

  let message = `📋 直近の支出履歴\n\n`;

  expenses.forEach((exp, index) => {
    const dateStr = formatDate(exp.date.toISOString().split('T')[0]);
    message += `${index + 1}. ${dateStr} [${exp.category}] ${exp.userName} ￥${exp.amount.toLocaleString()}\n`;
  });

  return message;
}

/**
 * 削除完了メッセージを生成
 */
export function createDeleteMessage(
  date: string,
  category: Category,
  amount: number,
  userName: string,
  storeName: string,
  newBalance?: number
): string {
  let message = `🗑️ 以下の支出を削除しました\n\n`;
  message += `📅 ${formatDate(date)}\n`;
  message += `📝 ${category}: ￥${amount.toLocaleString()}（${userName}）\n`;
  message += `🏪 ${storeName}\n`;

  if (category === '外食費用' && newBalance !== undefined) {
    message += `\n💰 ${userName}の外食残高: ￥${newBalance.toLocaleString()}（+￥${amount.toLocaleString()}）`;
  }

  return message;
}

/**
 * 友達追加時のウェルカムメッセージを生成
 */
export function createWelcomeMessage(): string {
  let message = `はじめまして！家計簿Botです\n`;
  message += `友だち追加ありがとうございます\n\n`;

  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📱 このBotでできること\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  message += `📸 レシート画像を送信\n`;
  message += `→ 自動で金額・店舗名を解析してGoogleカレンダーに登録\n`;
  message += `→ 外食費用は残高を自動計算\n\n`;

  message += `📝 テキストコマンドで管理\n`;
  message += `@ヘルプ - コマンド一覧表示\n`;
  message += `@残高 - 外食残高確認\n`;
  message += `@履歴 - 支出履歴を表示\n`;
  message += `@追加 - 手動で支出登録\n`;
  message += `@削除 - 支出を削除\n\n`;

  message += `━━━━━━━━━━━━━━━━━━━━\n`;
  message += `💡 使い方\n`;
  message += `━━━━━━━━━━━━━━━━━━━━\n\n`;

  message += `1️⃣ グループにBotを追加\n`;
  message += `2️⃣ レシート画像を送信するだけ！\n`;
  message += `3️⃣ 外食費用・買い物費用を自動判別\n`;
  message += `4️⃣ 毎月15日と月末に集計レポート送信\n\n`;

  message += `詳しいコマンドは @ヘルプ で確認できます\n\n`;
  message += `それでは、楽しい家計簿管理をどうぞ`;

  return message;
}

/**
 * 日付をフォーマット（YYYY-MM-DD → M/D）
 */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
