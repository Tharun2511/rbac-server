import * as repo from "./activity.repository";

export function addActivity(ticketId: string, userId: string, type: string, metadata?: any) {
  return repo.logActivity(ticketId, userId, type, metadata);
}

export function getTicketActivity(ticketId: string) {
  return repo.getActivity(ticketId);
}
