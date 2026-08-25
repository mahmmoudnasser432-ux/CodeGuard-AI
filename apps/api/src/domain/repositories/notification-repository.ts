import { Notification } from "../entities/notification.js";

export interface NotificationRepository {
  save(notification: Notification): Promise<Notification>;
  findById(id: string): Promise<Notification | null>;
  listByUser(userId: string, unreadOnly?: boolean): Promise<Notification[]>;
  markAsRead(id: string): Promise<void>;
}