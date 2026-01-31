import * as repo from "./timeline.repository";

export async function getTimeline(ticketId: string) {
  const comments = await repo.getTicketComments(ticketId);
  const activity = await repo.getTicketActivity(ticketId);

  const merged = [...comments, ...activity];

  merged.sort((a, b) =>
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return merged;
}
