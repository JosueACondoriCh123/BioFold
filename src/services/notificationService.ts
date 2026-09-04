/**
 * BioFold Notification Service
 * Manages session notifications for:
 * - PDB / CIF storage uploads
 * - 4K figures and PDF report compilations
 * - Multimodal Vision AI analyses
 * - Project cloud sync events
 */

import { useSyncExternalStore } from "react";

export interface SessionNotification {
  id: string;
  type: "storage" | "export" | "vision" | "sync" | "info";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

const INITIAL_NOTIFICATIONS: SessionNotification[] = [
  {
    id: "notif-sync-1",
    type: "sync",
    title: "Sincronización Cloud Activa",
    message: "Sesión conectada con Supabase. Las modificaciones de estructura y proyectos se guardan en tiempo real.",
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: "/app",
    actionLabel: "Ver proyectos",
  },
  {
    id: "notif-storage-1",
    type: "storage",
    title: "Archivo PDB guardado en Storage",
    message: "La estructura 1CRN (Crambin) ha sido persistida en Supabase Storage con compresión local.",
    timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: "/app/lab?pdb=1CRN",
    actionLabel: "Abrir en 3D",
  },
  {
    id: "notif-vision-1",
    type: "vision",
    title: "Análisis Multimodal Vision Listo",
    message: "MiniMax M3 completó el diagnóstico estructural de la conformación activa.",
    timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: "/app/vision",
    actionLabel: "Ver en Vision",
  },
  {
    id: "notif-export-1",
    type: "export",
    title: "Reporte Científico Generado",
    message: "La figura 4K y el resumen de mutaciones e impacto ΔΔG están listos para descarga.",
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    read: true,
    actionUrl: "/app/lab",
    actionLabel: "Ir al Laboratorio",
  },
];

let notifications: SessionNotification[] = [...INITIAL_NOTIFICATIONS];
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export const notificationService = {
  getNotifications(): SessionNotification[] {
    return notifications;
  },

  getUnreadCount(): number {
    return notifications.filter((n) => !n.read).length;
  },

  addNotification(
    data: Omit<SessionNotification, "id" | "timestamp" | "read"> & {
      id?: string;
      timestamp?: string;
      read?: boolean;
    }
  ): SessionNotification {
    const item: SessionNotification = {
      id: data.id ?? `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: data.timestamp ?? new Date().toISOString(),
      read: data.read ?? false,
      type: data.type,
      title: data.title,
      message: data.message,
      actionUrl: data.actionUrl,
      actionLabel: data.actionLabel,
    };
    notifications = [item, ...notifications];
    emitChange();
    return item;
  },

  markAsRead(id: string) {
    notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    emitChange();
  },

  markAllAsRead() {
    notifications = notifications.map((n) => ({ ...n, read: true }));
    emitChange();
  },

  clearAll() {
    notifications = [];
    emitChange();
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export function useNotifications() {
  const currentNotifications = useSyncExternalStore(
    notificationService.subscribe,
    notificationService.getNotifications
  );
  const unreadCount = currentNotifications.filter((n) => !n.read).length;

  return {
    notifications: currentNotifications,
    unreadCount,
    markAsRead: notificationService.markAsRead,
    markAllAsRead: notificationService.markAllAsRead,
    clearAll: notificationService.clearAll,
    addNotification: notificationService.addNotification,
  };
}
