import { NextRequest, NextResponse } from "next/server";
import {
  buildScheduleCalendarRequestBody,
  getAuthorizedContext,
  getCalendarClient,
  getCalendarId,
  getErrorMessage,
  mapCalendarEvent,
  type ScheduleInputPayload,
} from "@/lib/liff-server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const context = await getAuthorizedContext(request);
    const body = (await request.json()) as Partial<ScheduleInputPayload>;
    const calendarId = getCalendarId(context.settings);
    if (!calendarId) {
      throw new Error("Google Calendar ID が未設定です");
    }

    const response = await getCalendarClient().events.insert({
      calendarId,
      requestBody: buildScheduleCalendarRequestBody(
        {
          participants: body.participants ?? "@自分",
          title: body.title ?? "",
          date: body.date ?? "",
          startTime: body.startTime,
          endTime: body.endTime,
        },
        context,
      ),
    });

    return NextResponse.json({
      status: "ok",
      message: "Google Calendar に予定を保存しました",
      event: mapCalendarEvent(response.data),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: getErrorMessage(error, "予定の保存に失敗しました"),
      },
      { status: 400 },
    );
  }
}
