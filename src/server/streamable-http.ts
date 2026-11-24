import * as http from 'http'
import { once } from 'events'
import Server, { REGISTER_RETRY_INTERVAL } from './server'
import handler, { resolve, isStreamable } from './handler'
import Mcp, { Outcome, ServerInfo } from './mcp'
import Request from '../type/request'
import { newResult, newError } from '../type/response'
import { INTERNAL_ERROR, INVALID_REQUEST, PARSE_ERROR } from '../type/error'
import Driver from '../discovery/driver'
import { getLocalIp } from '../utils/address'
import { generateTimestampUUID } from '../utils/random'

export const MCP_SESSION_HEADER = 'Mcp-Session-Id'
export const MCP_PROTOCOL_HEADER = 'Mcp-Protocol-Version'
export const SUPPORTED_PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26']

// Node lowercases all incoming header names.
const SESSION_HEADER = MCP_SESSION_HEADER.toLowerCase()
const PROTOCOL_HEADER = MCP_PROTOCOL_HEADER.toLowerCase()

export type Options = {
  path: string
  keepAliveInterval: number
  replayBufferSize: number
  protocolVersions: Array<string>
  serverInfo: ServerInfo
}

/**
 * A framed event kept for Last-Event-ID resumability.
 */
type BufferedEvent = {
  id: string
  frame: string
}

/**
 * The transport state of one client session.
 */
type Session = {
  buffer: Array<BufferedEvent>
  streams: Set<http.ServerResponse>
  timer?: NodeJS.Timeout
}

/**
 * Streamable HTTP server: a single endpoint that accepts JSON-RPC messages
 * over POST and answers either with application/json (unary) or with a
 * text/event-stream carrying several JSON-RPC messages (when the invoked
 * service method returns an array, generator or async iterable).
 *
 * It follows the MCP Streamable HTTP transport semantics — Mcp-Session-Id
 * sessions, Mcp-Protocol-Version negotiation, a GET server-to-client SSE
 * channel with keepalives, Last-Event-ID resumability and DELETE teardown —
 * while keeping this library's own "Service/method" dispatch.
 */
export default class StreamableHttp implements Server {
  /**
   * The method map.
   */
  private map = new Map<string, object>()

  /**
   * The server port.
   */
  private port: number

  /**
   * The server hostname.
   */
  private hostname: string | null = null

  /**
   * The discovery.
   */
  private discovery: Driver | undefined

  /**
   * The server options.
   */
  private options: Options = {
    path: '/mcp',
    keepAliveInterval: 10000,
    replayBufferSize: 128,
    protocolVersions: SUPPORTED_PROTOCOL_VERSIONS,
    serverInfo: { name: 'jsonrpc4js', version: '1.2.1' }
  }

  /**
   * The live sessions keyed by their Mcp-Session-Id.
   */
  private sessions = new Map<string, Session>()

  /**
   * The MCP compatibility layer exposing services as tools.
   */
  private mcp: Mcp

  constructor(port: number, discovery?: Driver, options?: {}) {
    this.port = port
    if (discovery != undefined) {
      this.discovery = discovery
      this.hostname = getLocalIp()
    }
    if (options !== undefined) {
      this.options = Object.assign(this.options, options)
    }
    this.mcp = new Mcp(this.options.serverInfo, this.options.protocolVersions)
  }

  /**
   * Set options. Kept for interface compatibility; options are supplied to
   * the constructor instead.
   */
  setOptions(options: any): void {}

  /**
   * Start the streamable http server.
   */
  start(callback?: Function): void {
    const server = http.createServer((request, response) => {
      this.route(request, response).catch(() => {
        if (!response.headersSent) {
          response.writeHead(500)
        }
        response.end()
      })
    })

    server.listen(this.port, () => {
      console.info(`Listening http://0.0.0.0:${this.port}${this.options.path}`)
      if (callback) callback(server)
    })
  }

  /**
   * Register the method to the map.
   */
  async register(o: object, name?: string): Promise<void> {
    if (!name) {
      name = o.constructor.name
    }
    this.map.set(name, o)
    this.mcp.addService(name, o)
    if (this.discovery !== undefined && this.hostname != null) {
      const res = await this.discovery.register(
        name,
        'streamable-http',
        this.hostname,
        this.port
      )
      if (res !== true) {
        setTimeout(() => {
          // Keep the resolved name so retries register the same service.
          this.register(o, name)
        }, REGISTER_RETRY_INTERVAL)
      }
    }
  }

  /**
   * Handle the client message synchronously, for interface compatibility.
   * The HTTP request pipeline uses the async dispatch in onPost instead.
   */
  handler(message: Request): string {
    return handler(message, this.map)
  }

  private async route(request: http.IncomingMessage, response: http.ServerResponse) {
    const path = (request.url || '').split('?')[0]
    if (path !== this.options.path) {
      response.writeHead(404)
      response.end('Not Found')
      return
    }
    // DNS-rebinding protection: a browser-supplied Origin must match the
    // Host the server is reached under.
    const origin = request.headers['origin']
    if (typeof origin === 'string' && origin !== '') {
      let allowed = false
      try {
        allowed = new URL(origin).host === request.headers.host
      } catch (e) {
        allowed = false
      }
      if (!allowed) {
        request.resume()
        response.writeHead(403)
        response.end()
        return
      }
    }
    switch (request.method) {
      case 'POST':
        await this.onPost(request, response)
        break
      case 'GET':
        this.onGet(request, response)
        break
      case 'DELETE':
        this.onDelete(request, response)
        break
      default:
        response.writeHead(405)
        response.end()
    }
  }

  private async onPost(request: http.IncomingMessage, response: http.ServerResponse) {
    const accept = request.headers['accept'] || ''
    if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
      request.resume()
      response.writeHead(406)
      response.end()
      return
    }

    // Negotiate the protocol version before any other work.
    const requested = request.headers[PROTOCOL_HEADER]
    const negotiated = this.options.protocolVersions[0]
    if (typeof requested === 'string' && requested !== '') {
      if (!this.options.protocolVersions.includes(requested)) {
        request.resume()
        response.setHeader(MCP_PROTOCOL_HEADER, negotiated)
        response.writeHead(400)
        response.end()
        return
      }
    }
    response.setHeader(MCP_PROTOCOL_HEADER, requested || negotiated)

    // Resolve or issue the session.
    const provided = request.headers[SESSION_HEADER]
    let sessionId: string
    let session: Session
    if (typeof provided === 'string' && provided !== '') {
      const existing = this.sessions.get(provided)
      if (existing === undefined) {
        request.resume()
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(newError('', INVALID_REQUEST)))
        return
      }
      sessionId = provided
      session = existing
    } else {
      sessionId = generateTimestampUUID()
      session = { buffer: [], streams: new Set() }
      this.sessions.set(sessionId, session)
    }
    response.setHeader(MCP_SESSION_HEADER, sessionId)

    let requestData = ''
    await new Promise<void>((resolveBody, rejectBody) => {
      request.setEncoding('utf8')
      request.on('data', (chunk) => {
        requestData += chunk
      })
      request.on('end', resolveBody)
      request.on('error', rejectBody)
    })

    let message: Request
    try {
      message = JSON.parse(requestData)
    } catch (e) {
      response.writeHead(400, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(newError('', PARSE_ERROR)))
      return
    }

    // JSON-RPC notifications carry no id and get an empty 202 Accepted,
    // as the MCP Streamable HTTP transport prescribes.
    if (message.id === undefined || message.id === null) {
      response.writeHead(202)
      response.end()
      return
    }

    let outcome: Outcome
    if (Mcp.handles(message.method)) {
      outcome = await this.mcp.handle(message)
    } else {
      outcome = await this.dispatchLegacy(message)
    }

    if (outcome.status === 202) {
      response.writeHead(202)
      response.end()
      return
    }
    if ('json' in outcome) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(outcome.json)
      return
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    // The client may disconnect mid-stream; writes then emit errors that
    // must not surface as unhandled events.
    response.on('error', () => {})
    try {
      for await (const responseMessage of outcome.stream) {
        if (response.destroyed) return
        await this.writeFrame(response, session, responseMessage)
      }
    } catch (e) {
      await this.writeFrame(response, session, newError(message.id, INTERNAL_ERROR))
    }
    response.end()
  }

  /**
   * Dispatch a "Service/method" request with async-aware semantics: the
   * result is awaited, and iterable results become a stream of JSON-RPC
   * result messages instead of a single response.
   */
  private async dispatchLegacy(message: Request): Promise<Outcome> {
    const resolved = resolve(message, this.map)
    if ('error' in resolved) {
      return { status: 200, json: resolved.error }
    }
    let result: any
    try {
      result = await resolved.invoke()
    } catch (e) {
      return { status: 200, json: JSON.stringify(newError(message.id, INTERNAL_ERROR)) }
    }
    // Normalize undefined to null so the result field is always present,
    // matching the synchronous handler used by the tcp/http transports.
    if (!isStreamable(result)) {
      const body = JSON.stringify(newResult(message.id, result === undefined ? null : result))
      return { status: 200, json: body }
    }
    const id = message.id
    const stream = (async function* (): AsyncGenerator<object> {
      for await (const value of result) {
        yield newResult(id, value === undefined ? null : value)
      }
    })()
    return { status: 200, stream }
  }

  private onGet(request: http.IncomingMessage, response: http.ServerResponse) {
    const accept = request.headers['accept'] || ''
    if (!accept.includes('text/event-stream')) {
      response.writeHead(406)
      response.end()
      return
    }

    const provided = request.headers[SESSION_HEADER]
    if (typeof provided !== 'string' || provided === '') {
      response.writeHead(400)
      response.end()
      return
    }
    const session = this.sessions.get(provided)
    if (session === undefined) {
      response.writeHead(404)
      response.end()
      return
    }

    // Replay only when asked: a plain GET opens the live channel, while a
    // GET with Last-Event-ID re-sends every buffered frame that follows it.
    let replayFrom = session.buffer.length
    const lastEventId = request.headers['last-event-id']
    if (typeof lastEventId === 'string' && lastEventId !== '') {
      const index = session.buffer.findIndex((event) => event.id === lastEventId)
      if (index === -1) {
        response.writeHead(400)
        response.end()
        return
      }
      replayFrom = index + 1
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })
    // Streams may be torn down while keepalive or replay writes are in
    // flight; swallow the resulting socket errors.
    response.on('error', () => {})
    for (let i = replayFrom; i < session.buffer.length; i++) {
      response.write(session.buffer[i].frame)
    }

    session.streams.add(response)
    if (session.timer === undefined) {
      session.timer = setInterval(() => {
        for (const stream of session.streams) {
          if (stream.destroyed || stream.writableEnded) continue
          stream.write(': keepalive\n\n')
        }
      }, this.options.keepAliveInterval)
    }
    response.on('close', () => {
      session.streams.delete(response)
      if (session.streams.size === 0 && session.timer !== undefined) {
        clearInterval(session.timer)
        session.timer = undefined
      }
    })
  }

  private onDelete(request: http.IncomingMessage, response: http.ServerResponse) {
    const provided = request.headers[SESSION_HEADER]
    if (typeof provided !== 'string' || provided === '') {
      response.writeHead(400)
      response.end()
      return
    }
    const session = this.sessions.get(provided)
    if (session === undefined) {
      response.writeHead(404)
      response.end()
      return
    }
    for (const stream of session.streams) {
      stream.end()
    }
    session.streams.clear()
    if (session.timer !== undefined) {
      clearInterval(session.timer)
      session.timer = undefined
    }
    this.sessions.delete(provided)
    response.writeHead(204)
    response.end()
  }

  /**
   * Write one SSE frame carrying a JSON-RPC message and keep it in the
   * session's bounded replay buffer so it can be replayed by id.
   */
  private async writeFrame(
    response: http.ServerResponse,
    session: Session,
    message: object
  ): Promise<void> {
    const id = generateTimestampUUID()
    const frame = `id: ${id}\nevent: message\ndata: ${JSON.stringify(message)}\n\n`
    session.buffer.push({ id, frame })
    if (session.buffer.length > this.options.replayBufferSize) {
      session.buffer.shift()
    }
    if (response.destroyed || response.writableEnded) {
      return
    }
    if (!response.write(frame)) {
      // Wait for the socket to drain, but never hang if the peer goes away.
      await Promise.race([once(response, 'drain'), once(response, 'close')])
    }
  }
}
