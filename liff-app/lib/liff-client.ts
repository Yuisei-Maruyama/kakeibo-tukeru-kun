import type { Liff } from "@line/liff";

export type LiffProfile = {
  displayName: string;
  pictureUrl?: string;
};

export type LiffSession =
  | {
      status: "preview";
      message: string;
      profile: null;
      canSendMessages: false;
    }
  | {
      status: "ready";
      message: string;
      profile: LiffProfile | null;
      canSendMessages: boolean;
    }
  | {
      status: "error";
      message: string;
      profile: null;
      canSendMessages: false;
    };

let liffInstance: Liff | null = null;

export async function initializeLiff(): Promise<LiffSession> {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;

  if (!liffId) {
    return {
      status: "preview",
      message: "LIFF ID 未設定",
      profile: null,
      canSendMessages: false,
    };
  }

  try {
    const { default: liff } = await import("@line/liff");
    await liff.init({ liffId });
    liffInstance = liff;

    if (!liff.isLoggedIn()) {
      liff.login();
      return {
        status: "ready",
        message: "LINE ログインへ移動中",
        profile: null,
        canSendMessages: false,
      };
    }

    const profile = await liff.getProfile().catch(() => null);

    return {
      status: "ready",
      message: liff.isInClient() ? "LINE 内で利用中" : "ブラウザで利用中",
      profile: profile
        ? {
            displayName: profile.displayName,
            pictureUrl: profile.pictureUrl,
          }
        : null,
      canSendMessages: liff.isInClient(),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "LIFF 初期化に失敗しました",
      profile: null,
      canSendMessages: false,
    };
  }
}

export async function sendLineTextMessages(texts: string[]) {
  if (!liffInstance?.isInClient()) {
    throw new Error("LINE トークへ直接送信できません");
  }

  await liffInstance.sendMessages(
    texts.map((text) => ({
      type: "text",
      text,
    })),
  );
}

export function getLiffIdToken() {
  return liffInstance?.getIDToken() ?? null;
}

export function closeLiffWindow() {
  if (liffInstance?.isInClient()) {
    liffInstance.closeWindow();
  }
}
