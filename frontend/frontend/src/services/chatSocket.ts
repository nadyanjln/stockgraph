import type { WsChatEvent } from "@/types/chat";
import { getSupabaseAccessToken } from "@/services/supabase";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function buildWsUrl(path: string): Promise<string> {
  const url = new URL(API_BASE_URL);
  const protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = new URL(`${protocol}//${url.host}${path}`);
  const token = await getSupabaseAccessToken();
  if (token) wsUrl.searchParams.set("access_token", token);
  return wsUrl.toString();
}

export class ChatSocketClient {
  private socket: WebSocket | null = null;

  isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(onEvent: (event: WsChatEvent) => void, onError: (error: string) => void): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return Promise.resolve();

    return new Promise((resolve, reject) => {
      void buildWsUrl("/ws/chat").then((url) => {
        const ws = new WebSocket(url);

        ws.onopen = () => {
          this.socket = ws;
          resolve();
        };

        ws.onmessage = (messageEvent) => {
          try {
            onEvent(JSON.parse(messageEvent.data) as WsChatEvent);
          } catch {
            onError("Gagal membaca event dari server.");
          }
        };

        ws.onerror = () => {
          onError("Koneksi WebSocket gagal.");
          reject(new Error("Koneksi WebSocket gagal."));
        };

        ws.onclose = () => {
          this.socket = null;
        };
      }).catch(reject);
    });
  }

  send(payload: object): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket belum terhubung.");
    }
    this.socket.send(JSON.stringify(payload));
  }

  close(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
