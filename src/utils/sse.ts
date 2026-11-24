/**
 * A single Server-Sent Events frame parsed out of a text/event-stream body.
 */
export type SSEEvent = {
  id: string
  event: string
  data: string
  comments: Array<string>
}

/**
 * Incremental, chunk-safe parser for the Server-Sent Events wire format.
 *
 * Feed raw text as it arrives via feed(); it returns only the frames that are
 * complete, buffering any partial line or event until the next chunk. It
 * understands LF, CRLF and CR line terminators (including a CRLF split across
 * two chunks), comment lines (which never dispatch an event), multi-line data
 * fields, and the persistence of the id field across events required for
 * Last-Event-ID resumability. Call end() once the stream closes to flush a
 * trailing CR terminator.
 */
export default class SSEParser {
  /**
   * Text received but not yet consumed into a complete line.
   */
  private buffer = ''

  /**
   * Data lines accumulated for the event currently being parsed.
   */
  private dataLines: Array<string> = []

  /**
   * Comment lines accumulated for the event currently being parsed.
   */
  private comments: Array<string> = []

  /**
   * The event type for the event currently being parsed.
   */
  private eventType = 'message'

  /**
   * The last id seen. Per the SSE spec this persists across events until an
   * explicit id field changes it, which is what Last-Event-ID relies on.
   */
  private lastEventId = ''

  /**
   * The most recently dispatched event id, for resumability tracking.
   */
  get id(): string {
    return this.lastEventId
  }

  /**
   * Consume a chunk of text and return any events that became complete.
   */
  feed(chunk: string): Array<SSEEvent> {
    this.buffer += chunk
    return this.consume()
  }

  /**
   * Flush the stream: a trailing CR is a complete line terminator once no
   * more data can follow. Incomplete events without a closing blank line are
   * discarded, as the SSE spec requires.
   */
  end(): Array<SSEEvent> {
    if (this.buffer.endsWith('\r')) {
      this.buffer = this.buffer.substring(0, this.buffer.length - 1) + '\n'
    }
    return this.consume()
  }

  private consume(): Array<SSEEvent> {
    const events: Array<SSEEvent> = []
    let line: string | null
    while ((line = this.takeLine()) !== null) {
      this.processLine(line, events)
    }
    return events
  }

  /**
   * Extract the next complete line from the buffer, or null when the buffer
   * holds no full line yet. A buffer ending in CR returns null because the CR
   * may be the first half of a CRLF pair split across chunks.
   */
  private takeLine(): string | null {
    const buffer = this.buffer
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i]
      if (ch === '\n') {
        this.buffer = buffer.substring(i + 1)
        return buffer.substring(0, i)
      }
      if (ch === '\r') {
        if (i === buffer.length - 1) {
          return null
        }
        const skip = buffer[i + 1] === '\n' ? 2 : 1
        this.buffer = buffer.substring(i + skip)
        return buffer.substring(0, i)
      }
    }
    return null
  }

  private processLine(line: string, events: Array<SSEEvent>): void {
    if (line === '') {
      // Blank line: the event boundary. Dispatch only when data was seen,
      // so keepalive comment frames never surface as events.
      const dispatched = this.dispatch()
      if (dispatched) events.push(dispatched)
      return
    }

    if (line.startsWith(':')) {
      this.comments.push(line.substring(1))
      return
    }

    const colon = line.indexOf(':')
    let field: string
    let value: string
    if (colon === -1) {
      field = line
      value = ''
    } else {
      field = line.substring(0, colon)
      value = line.substring(colon + 1)
      // A single leading space after the colon is part of the separator.
      if (value.startsWith(' ')) value = value.substring(1)
    }

    switch (field) {
      case 'data':
        this.dataLines.push(value)
        break
      case 'event':
        this.eventType = value
        break
      case 'id':
        // Ids containing NUL are ignored per the SSE spec.
        if (!value.includes('\0')) {
          this.lastEventId = value
        }
        break
      default:
        // Unknown fields (e.g. retry) are ignored.
        break
    }
  }

  private dispatch(): SSEEvent | null {
    const hasData = this.dataLines.length > 0
    const event: SSEEvent | null = hasData
      ? {
          id: this.lastEventId,
          event: this.eventType,
          data: this.dataLines.join('\n'),
          comments: this.comments
        }
      : null
    this.dataLines = []
    this.comments = []
    this.eventType = 'message'
    return event
  }
}
