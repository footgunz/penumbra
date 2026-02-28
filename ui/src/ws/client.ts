import type { ServerMessage, UIMessage } from '../types'

type MessageHandler = (msg: ServerMessage) => void

class WSClient {
  private ws: WebSocket | null = null
  private handlers: MessageHandler[] = []
  private reconnectDelay = 500
  private maxDelay = 5000
  private url = ''
  private stopped = false

  connect(url: string): void {
    this.url = url
    this.stopped = false
    this.open()
  }

  private open(): void {
    if (this.stopped) return
    const ws = new WebSocket(this.url)
    this.ws = ws

    ws.onmessage = (ev) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage
      } catch {
        return
      }
      for (const h of this.handlers) h(msg)
    }

    ws.onopen = () => {
      this.reconnectDelay = 500
    }

    ws.onclose = () => {
      this.ws = null
      if (!this.stopped) {
        setTimeout(() => this.open(), this.reconnectDelay)
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }

  send(msg: UIMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler)
    }
  }

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }
}

export const client = new WSClient()
