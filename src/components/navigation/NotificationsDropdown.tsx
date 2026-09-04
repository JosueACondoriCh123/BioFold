import { useState, useRef, useEffect } from "react";
import { Link } from "react-router";
import {
  Bell,
  CheckCheck,
  Trash2,
  UploadCloud,
  FileText,
  Sparkles,
  RefreshCw,
  Info,
  ArrowRight,
} from "lucide-react";
import { useNotifications, type SessionNotification } from "../../services/notificationService";
import "./navigationComponents.css";

function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return "Justo ahora";
    if (diffMins < 60) return `Hace ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours} h`;
    return new Intl.DateTimeFormat("es", { month: "short", day: "numeric" }).format(
      new Date(isoString)
    );
  } catch {
    return "Reciente";
  }
}

function getNotificationIcon(type: SessionNotification["type"]) {
  switch (type) {
    case "storage":
      return <UploadCloud size={16} className="bf-notif-icon-storage" />;
    case "export":
      return <FileText size={16} className="bf-notif-icon-export" />;
    case "vision":
      return <Sparkles size={16} className="bf-notif-icon-vision" />;
    case "sync":
      return <RefreshCw size={16} className="bf-notif-icon-sync" />;
    default:
      return <Info size={16} />;
  }
}

export function NotificationsDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleNotificationClick = (notif: SessionNotification) => {
    if (!notif.read) {
      markAsRead(notif.id);
    }
    if (notif.actionUrl) {
      setIsOpen(false);
    }
  };

  return (
    <div className="bf-notifications-container" ref={dropdownRef}>
      <button
        type="button"
        className={`bf-notifications-bell-btn ${isOpen ? "is-active" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Notificaciones (${unreadCount} no leídas)`}
        title={unreadCount > 0 ? `${unreadCount} notificaciones no leídas` : "Notificaciones del sistema"}
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="bf-bell-badge" aria-label={`${unreadCount} no leídas`}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="bf-notifications-popover" role="dialog" aria-label="Centro de Notificaciones">
          <div className="bf-notifications-header">
            <div className="bf-notifications-title-group">
              <span className="bf-notifications-title">Notificaciones</span>
              {unreadCount > 0 && (
                <span className="bf-notifications-count-chip">{unreadCount} nuevas</span>
              )}
            </div>
            <div className="bf-notifications-actions">
              {unreadCount > 0 && (
                <button
                  type="button"
                  className="bf-notif-action-btn"
                  onClick={() => markAllAsRead()}
                  aria-label="Marcar todas como leídas"
                  title="Marcar todas como leídas"
                >
                  <CheckCheck size={14} />
                  <span>Leídas</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  className="bf-notif-action-btn bf-notif-clear-btn"
                  onClick={() => clearAll()}
                  aria-label="Limpiar historial"
                  title="Limpiar historial"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>

          <div className="bf-notifications-list">
            {notifications.length === 0 ? (
              <div className="bf-notifications-empty">
                <Bell size={26} />
                <p>No tienes notificaciones pendientes</p>
                <span>Los eventos de almacenamiento, exportación y análisis aparecerán aquí.</span>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`bf-notification-item ${notif.read ? "is-read" : "is-unread"}`}
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className={`bf-notif-icon-wrapper type-${notif.type}`}>
                    {getNotificationIcon(notif.type)}
                  </div>
                  <div className="bf-notif-content">
                    <div className="bf-notif-item-header">
                      <span className="bf-notif-item-title">{notif.title}</span>
                      <span className="bf-notif-time">{formatRelativeTime(notif.timestamp)}</span>
                    </div>
                    <p className="bf-notif-item-message">{notif.message}</p>
                    {notif.actionUrl && (
                      <Link
                        to={notif.actionUrl}
                        className="bf-notif-item-link"
                        onClick={() => setIsOpen(false)}
                      >
                        <span>{notif.actionLabel ?? "Ver detalles"}</span>
                        <ArrowRight size={12} />
                      </Link>
                    )}
                  </div>
                  {!notif.read && <span className="bf-notif-unread-dot" aria-label="No leída" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
