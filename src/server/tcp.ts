import * as net from 'net'
import Server, { REGISTER_RETRY_INTERVAL } from './server'
import handler from './handler'
import Request from '../type/request'
import { newError } from '../type/response'
import { PARSE_ERROR } from '../type/error'
import Driver from '../discovery/driver'
import { getLocalIp } from '../utils/address'

export type Options = {
  delimiter: string
}

export default class Tcp implements Server {
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
  private options: Options = { delimiter: '\r\n' }

  constructor(port: number, discovery?: Driver, options?: {}) {
    this.port = port
    if (discovery != undefined) {
      this.discovery = discovery
      this.hostname = getLocalIp()
    }
    if (options !== undefined) {
      this.options = Object.assign(this.options, options)
    }
  }

  /**
   * Set tcp options.
   */
  setOptions(options: any): void {}

  /**
   * Start the tcp server.
   */
  start(callback?: Function): void {
    const server = net.createServer((socket) => {
      const delimiter = this.options.delimiter
      let buffer = ''

      // Decode as utf8 at the stream level so multi-byte characters split
      // across chunks are handled correctly.
      socket.setEncoding('utf8')
      socket.on('data', (data: string) => {
        buffer += data
        let index = buffer.indexOf(delimiter)
        while (index !== -1) {
          const message = buffer.substring(0, index)
          buffer = buffer.substring(index + delimiter.length)
          if (message.length > 0) {
            socket.write(this.handleMessage(message) + delimiter)
          }
          index = buffer.indexOf(delimiter)
        }
      })
    })

    server.listen(this.port, () => {
      console.info(`Listening tcp://0.0.0.0:${this.port}`)
      if (callback) callback(server)
    })
  }

  /**
   * Parse and dispatch a single request frame.
   */
  private handleMessage(message: string): string {
    let request: Request
    try {
      request = JSON.parse(message)
    } catch (e) {
      return JSON.stringify(newError('', PARSE_ERROR))
    }
    return handler(request, this.map)
  }

  /**
   * Register the method to the map.
   */
  async register(o: object, name?: string): Promise<void> {
    if (!name) {
      name = o.constructor.name
    }
    this.map.set(name, o)
    if (this.discovery !== undefined && this.hostname != null) {
      const res = await this.discovery.register(name, 'tcp', this.hostname, this.port)
      if (res !== true) {
        setTimeout(() => {
          // Keep the resolved name so retries register the same service.
          this.register(o, name)
        }, REGISTER_RETRY_INTERVAL)
      }
    }
  }

  /**
   * Hander the client message.
   */
  handler(message: Request): string {
    const res = handler(message, this.map)
    return res
  }
}
