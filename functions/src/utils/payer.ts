import { getUserDisplayName } from '../services/line.js';
import { getUserByDisplayNamePartial } from '../services/firestore.js';

/**
 * 支払い者名の解決結果
 */
export interface ResolvedPayer {
  payerName: string;
  payerUserId?: string;
}

/**
 * 支払い者名を解決する共通ヘルパー
 * - @自分 → コマンド実行者の表示名
 * - @メンション → メンションされたユーザーの表示名
 * - テキスト入力 → 部分一致でユーザー検索
 */
export async function resolvePayerName(
  input: string,
  groupId: string,
  userId: string,
  accessToken: string,
  mentions: any[]
): Promise<ResolvedPayer> {
  const displayName = await getUserDisplayName(groupId, userId, accessToken);

  if (input === '@自分') {
    return { payerName: displayName, payerUserId: userId };
  }

  if (mentions.length > 0 && input.startsWith('@')) {
    const mentionedUserId = mentions[0].userId;
    const mentionedName = await getUserDisplayName(groupId, mentionedUserId, accessToken);
    return { payerName: mentionedName, payerUserId: mentionedUserId };
  }

  if (!input.startsWith('@')) {
    const matchedUser = await getUserByDisplayNamePartial(input);
    if (matchedUser) {
      return { payerName: matchedUser.displayName, payerUserId: matchedUser.id };
    }
  }

  return { payerName: input };
}
