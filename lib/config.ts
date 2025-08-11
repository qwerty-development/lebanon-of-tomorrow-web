export const currentEventId = process.env.NEXT_PUBLIC_EVENT_ID ?? "";
export function assertEventId() {
  if (!currentEventId) {
    throw new Error("Missing NEXT_PUBLIC_EVENT_ID");
  }
}

