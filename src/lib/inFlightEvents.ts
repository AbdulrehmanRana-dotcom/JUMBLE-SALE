import type { AppNotification } from '@/lib/notificationStore';

type InFlightListener = (notif: AppNotification) => void;
const listeners = new Set<InFlightListener>();

/**
 * Register a listener for real-time foreground in-flight banner notifications
 */
export function onInFlightNotification(listener: InFlightListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Broadcast an incoming notification to any active In-Flight banner listeners
 */
export function emitInFlightNotification(notif: AppNotification): void {
  listeners.forEach((fn) => {
    try {
      fn(notif);
    } catch (err) {
      console.warn('[InFlight] Listener execution error:', err);
    }
  });

  // OS-level Push / Browser notification dispatch
  triggerOSNotification(notif);
}

/**
 * Dispatches an OS-level push notification if browser or platform supports it
 */
export function triggerOSNotification(notif: AppNotification): void {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (window.Notification.permission === 'granted') {
        const osNotif = new window.Notification(notif.title, {
          body: notif.body,
          icon: '/favicon.ico',
          tag: notif.aggregation_key || notif.id,
        });

        osNotif.onclick = () => {
          window.focus();
          if (notif.action_url && typeof window.location !== 'undefined') {
            window.location.href = notif.action_url;
          }
        };
      } else if (window.Notification.permission === 'default') {
        // Request permission passively
        window.Notification.requestPermission().catch(() => {});
      }
    }
  } catch (err) {
    // Non-fatal fallback for native mobile or unsupported web environments
    console.debug('[OSNotification] Web notification dispatch notice:', err);
  }
}
