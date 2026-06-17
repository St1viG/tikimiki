"use client";

/**
 * Shared Socket.io client for live chat + notifications.
 *
 * Connects to the NestJS RealtimeGateway, authenticating with the current
 * access token in the handshake. In dev the gateway runs on :4000 (cross-origin,
 * allowed by its CORS config); override with NEXT_PUBLIC_WS_URL in prod.
 */
import { io, type Socket } from "socket.io-client";
import { getAccessToken } from "./api";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:4000";

let socket: Socket | null = null;

/** Returns the shared socket (connecting it if needed), or null if signed out. */
export function getSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  const token = getAccessToken();
  if (!token) return null;

  if (!socket) {
    socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket"],
    });
  } else {
    // Keep the handshake token fresh for reconnects.
    socket.auth = { token };
    if (!socket.connected) socket.connect();
  }
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
