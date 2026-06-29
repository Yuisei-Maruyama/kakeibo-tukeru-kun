import { Firestore, type Settings } from "@google-cloud/firestore";
import { google } from "googleapis";

type GoogleServerAuthOptions = {
  projectId?: string;
  credentials?: {
    client_email: string;
    private_key: string;
  };
};

function getGoogleServerAuthOptions(): GoogleServerAuthOptions {
  const projectId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GOOGLE_PROJECT_ID ||
    process.env.GCLOUD_PROJECT;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!clientEmail && !privateKey) {
    return projectId ? { projectId } : {};
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Google認証には GOOGLE_CLOUD_PROJECT、GOOGLE_CLIENT_EMAIL、GOOGLE_PRIVATE_KEY が必要です",
    );
  }

  return {
    projectId,
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
  };
}

export function createFirestoreClient() {
  return new Firestore(getGoogleServerAuthOptions() as Settings);
}

export function createGoogleAuth(scopes: string[]) {
  return new google.auth.GoogleAuth({
    ...getGoogleServerAuthOptions(),
    scopes,
  });
}
