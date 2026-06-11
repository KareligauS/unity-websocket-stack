// WebSocket event protocol
export interface WebSocketEvent {
  type: "event";
  event: number;
}

const getWebSocketUrl = (): string => {
  if (typeof window === "undefined") return "";

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (wsUrl) return wsUrl;

  // Fallback: use same host as frontend, with ws/wss protocol
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}`;
};

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private listeners: Map<number, Set<(data: WebSocketEvent) => void>> = new Map();
  private closeCallback: (() => void) | null = null;

  constructor(url?: string) {
    this.url = url || getWebSocketUrl();
  }

  onClose(callback: () => void): void {
    this.closeCallback = callback;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log("WebSocket connected");
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data: WebSocketEvent = JSON.parse(event.data);
            if (data.type === "event") {
              const callbacks = this.listeners.get(data.event);
              if (callbacks) {
                callbacks.forEach(callback => callback(data));
              }
            }
          } catch (error) {
            console.error("Failed to parse message:", error);
          }
        };

        this.ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log("WebSocket disconnected");
          this.closeCallback?.();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(event: number): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message: WebSocketEvent = { type: "event", event };
      this.ws.send(JSON.stringify(message));
    }
  }

  on(event: number, callback: (data: WebSocketEvent) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
