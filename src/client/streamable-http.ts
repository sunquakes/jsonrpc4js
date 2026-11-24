import * as http from 'http'
import Client from './client'
import { generateTimestampUUID } from '../utils/random'
import Response from '../type/response'
import { newRequest } from '../type/request'
import { Address, loadBalanceAddress, splitAddresses } from '../utils/address'
import Driver from '../discovery/driver'
import SSEParser from '../utils/sse'

const SESSION_HEADER = 'Mcp-Session-Id'
const PROTOCOL_HEADER = 'Mcp-Protocol-Version'
const DEFAULT_PROTOCOL_VERSION = '2025-06-18'

export type Options = {
  path: string
  callTimeout: number
  streamIdleTimeout: number
}

/**
 * Streamable HTTP client: speaks the same single-endpoint protocol as the
 * streamable-http server. call() performs a unary request over POST and
 * accepts either an application/json body or an SSE stream, while stream()
 * returns an async generator that yields every result message of an SSE
 * response for use with for-await.
 */
export default class StreamableHttp implements Client {
  /**
   * The remote service name.
   */
  private service: string

  /**
   * Address or discovery.
   */
  private address: string | Driver

  /**
   * Active service address.
   */
  private activeAddresses: Array<Address> = []

  /**
   * The options.
   */
  private options: Options = {
    path: '/mcp',
    callTimeout: 10000,
    streamIdleTimeout: 30000
  }

  /**
   * The session issued by the server, sent on every subsequent request.
   */
  private sessionId: string | null = null

  /**
   * The protocol version currently negotiated with the server.
   */
  private protocolVersion: string = DEFAULT_PROTOCOL_VERSION

  /**
   * Callback function map, kept for interface compatibility.
   */
  private map: Map<string, Function> = new Map()

  constructor(service: string, address: string | Driver, options?: {}) {
    this.service = service
    this.address = address
    if (options !== undefined) {
      this.options = Object.assign(this.options, options)
    }
  }

  /**
   * Call service method to the server, resolving with the first response
   * message matching the request id.
   */
  async call(method: string, ...args: any[]): Promise<any> {
    const id = generateTimestampUUID()
    const body = JSON.stringify(newRequest(id, this.service + '/' + method, args))
    return new Promise((resolve, reject) => {
      let settled = false
      let req: http.ClientRequest | undefined
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn()
      }
      const timer = setTimeout(() => {
        if (req !== undefined) req.destroy()
        finish(() => reject(new Error('Timeout')))
      }, this.options.callTimeout)

      this.send(body).then(
        (result) => {
          req = result.req
          this.consume(result.res, id).then(
            (value) => finish(() => resolve(value)),
            (e) => finish(() => reject(e))
          )
        },
        (e) => finish(() => reject(e))
      )
    })
  }

  /**
   * Call a service method and yield every result message of the response,
   * whether it arrives as a single JSON body or as an SSE stream.
   */
  async *stream(method: string, ...args: any[]): AsyncGenerator<any> {
    const id = generateTimestampUUID()
    const body = JSON.stringify(newRequest(id, this.service + '/' + method, args))
    const { req, res } = await this.send(body)
    this.checkStatus(res)

    const type = res.headers['content-type'] || ''
    if (!type.includes('text/event-stream')) {
      // The server chose a unary response; surface it as one yielded value.
      let data = ''
      res.setEncoding('utf8')
      for await (const chunk of res) {
        data += chunk
      }
      const parsed = this.parseMessage(data)
      if (parsed === null || parsed.id !== id) {
        throw new Error('Invalid response')
      }
      if (parsed.error !== undefined) {
        throw new Error(parsed.error.message)
      }
      yield parsed.result
      return
    }

    res.setEncoding('utf8')
    const parser = new SSEParser()
    let idleTimer: NodeJS.Timeout | undefined
    const armIdle = () => {
      if (idleTimer !== undefined) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        req.destroy(new Error('Timeout'))
      }, this.options.streamIdleTimeout)
    }
    try {
      armIdle()
      for await (const chunk of res) {
        armIdle()
        for (const event of parser.feed(chunk)) {
          const message = this.messageOf(event, id)
          if (message === null) continue
          if (message.error !== undefined) throw new Error(message.error.message)
          yield message.result
        }
      }
      for (const event of parser.end()) {
        const message = this.messageOf(event, id)
        if (message === null) continue
        if (message.error !== undefined) throw new Error(message.error.message)
        yield message.result
      }
    } finally {
      if (idleTimer !== undefined) clearTimeout(idleTimer)
    }
  }

  /**
   * Terminate the current session with DELETE. Resolves quietly when there
   * is no session or the server no longer knows it.
   */
  async close(): Promise<void> {
    if (this.sessionId === null) return
    const sessionId = this.sessionId
    const address = await this.getUrl()
    if (address == null) {
      this.sessionId = null
      return
    }
    return new Promise((resolve) => {
      const req = http.request(
        {
          host: address.host,
          port: address.port,
          path: this.options.path,
          method: 'DELETE',
          headers: { [SESSION_HEADER]: sessionId }
        },
        (res) => {
          res.resume()
          res.on('end', () => {
            this.sessionId = null
            resolve()
          })
        }
      )
      req.on('error', () => {
        this.sessionId = null
        resolve()
      })
      req.end()
    })
  }

  /**
   * Dispatch a single JSON-RPC message string, kept for interface
   * compatibility. SSE bodies are consumed inline by call() and stream().
   */
  handler(res: string): void {
    const data = this.parseMessage(res)
    if (data === null) return
    const callback = this.map.get(data.id)
    if (callback !== undefined) callback(data)
  }

  /**
   * POST a JSON-RPC message and resolve once response headers are in.
   */
  private async send(
    body: string
  ): Promise<{ req: http.ClientRequest; res: http.IncomingMessage }> {
    const address = await this.getUrl()
    if (address == null) {
      throw new Error('Without invalid address.')
    }
    const headers: { [key: string]: string } = {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(body)),
      Accept: 'application/json, text/event-stream',
      [PROTOCOL_HEADER]: this.protocolVersion
    }
    if (this.sessionId !== null) {
      headers[SESSION_HEADER] = this.sessionId
    }
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: address.host,
          port: address.port,
          path: this.options.path,
          method: 'POST',
          headers
        },
        (res) => {
          this.absorb(res)
          resolve({ req, res })
        }
      )
      req.on('error', (e) => {
        this.activeAddresses = this.activeAddresses.filter(
          (item) => item.host != address.host || item.port != address.port
        )
        reject(e)
      })
      req.write(body)
      req.end()
    })
  }

  /**
   * Read a POST response and return the JSON-RPC result matching the id,
   * from either a single JSON body or an SSE stream.
   */
  private async consume(res: http.IncomingMessage, id: string): Promise<any> {
    this.checkStatus(res)
    const type = res.headers['content-type'] || ''
    if (!type.includes('text/event-stream')) {
      let data = ''
      res.setEncoding('utf8')
      for await (const chunk of res) {
        data += chunk
      }
      const parsed = this.parseMessage(data)
      if (parsed === null || parsed.id !== id) {
        throw new Error('Invalid response')
      }
      if (parsed.error !== undefined) {
        throw new Error(parsed.error.message)
      }
      return parsed.result
    }

    res.setEncoding('utf8')
    const parser = new SSEParser()
    for await (const chunk of res) {
      for (const event of parser.feed(chunk)) {
        const message = this.messageOf(event, id)
        if (message === null) continue
        if (message.error !== undefined) throw new Error(message.error.message)
        return message.result
      }
    }
    throw new Error('Stream ended without a response')
  }

  /**
   * Reject transport-level failures and reset the session when the server
   * reports it no longer exists.
   */
  private checkStatus(res: http.IncomingMessage): void {
    const status = res.statusCode
    if (status === 200) return
    res.resume()
    if (status === 404) {
      this.sessionId = null
      throw new Error('Session not found')
    }
    throw new Error(`Request failed with status code ${status}`)
  }

  /**
   * Parse an SSE message event carrying the JSON-RPC response with the
   * given request id, or null for anything else.
   */
  private messageOf(event: { event: string; data: string }, id: string): Response | null {
    if (event.event !== 'message') return null
    const data = this.parseMessage(event.data)
    if (data === null || data.id !== id) return null
    return data
  }

  private absorb(res: http.IncomingMessage): void {
    const session = res.headers[SESSION_HEADER.toLowerCase()]
    if (typeof session === 'string' && session !== '') {
      this.sessionId = session
    }
    const version = res.headers[PROTOCOL_HEADER.toLowerCase()]
    if (typeof version === 'string' && version !== '') {
      this.protocolVersion = version
    }
  }

  private parseMessage(data: string): Response | null {
    try {
      return JSON.parse(data)
    } catch (e) {
      return null
    }
  }

  private async getUrl(): Promise<Address | null> {
    if (this.activeAddresses.length > 0) {
      return loadBalanceAddress(this.activeAddresses)
    }
    let address: string
    if (typeof this.address == 'string') {
      address = this.address
    } else {
      address = await this.address.get(this.service)
    }
    this.activeAddresses = splitAddresses(address)
    return loadBalanceAddress(this.activeAddresses)
  }
}
