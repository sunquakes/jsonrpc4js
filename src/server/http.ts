import * as http from 'http'
import Server, { REGISTER_RETRY_INTERVAL } from './server'
import handler from './handler'
import Request from '../type/request'
import { newError } from '../type/response'
import { PARSE_ERROR } from '../type/error'
import Driver from '../discovery/driver'
import { getLocalIp } from '../utils/address'

export default class Http implements Server {
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

  constructor(port: number, discovery?: Driver) {
    this.port = port
    if (discovery != undefined) {
      this.discovery = discovery
      this.hostname = getLocalIp()
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
    const server = http.createServer((request, response) => {
      let requestData = ''

      request.setEncoding('utf8')
      // Listen for data events
      request.on('data', (chunk) => {
        requestData += chunk
      })

      // Listen for end event (all data received)
      request.on('end', () => {
        let message: string
        try {
          message = this.handler(JSON.parse(requestData))
        } catch (e) {
          message = JSON.stringify(newError('', PARSE_ERROR))
        }
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(message)
      })
    })

    server.listen(this.port, () => {
      console.info(`Listening http://0.0.0.0:${this.port}`)
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
    if (this.discovery !== undefined && this.hostname != null) {
      const res = await this.discovery.register(name, 'http', this.hostname, this.port)
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
