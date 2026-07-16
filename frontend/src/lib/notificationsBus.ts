/**
 * Cross-component signal fired the instant notifications are marked read
 * (one, several, or all) so the nav rail's unread badge drops immediately —
 * carries the delta so the listener can adjust its local count synchronously
 * instead of waiting on a network round-trip (which is what made the badge
 * feel unresponsive: it used to only refresh on the next new-notification
 * socket event).
 */
const NOTIFICATIONS_READ_EVENT = "notifications:read";

export function emitNotificationsRead(delta: number): void {
  window.dispatchEvent(new CustomEvent<number>(NOTIFICATIONS_READ_EVENT, { detail: delta }));
}

export function onNotificationsRead(handler: (delta: number) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<number>).detail);
  window.addEventListener(NOTIFICATIONS_READ_EVENT, listener);
  return () => window.removeEventListener(NOTIFICATIONS_READ_EVENT, listener);
}
