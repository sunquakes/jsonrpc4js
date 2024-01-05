import * as net from 'net'
import Server from './server'
import handler from './handler'
import Request from '../type/request'
import Driver from '../discovery/driver'
import { getLocalIp } from '../utils/address'

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
    var server = net.createServer((socket) => {
      socket.on('close', () => {})

      socket.on('data', (data) => {
        const res = handler(JSON.parse(data.toString()), this.map)
        socket.write(res)
      })
      socket.on('end', function () {})
    })

    server.listen(this.port, () => {
      console.info(`Listening tcp://0.0.0.0:${this.port}`)
      if (callback) callback(server)
    })
  }

  /**
   * Register the method to the map.
   */
  register(o: object): void {
    this.map.set(o.constructor.name, o)
    if (this.discovery !== undefined && this.hostname != null) {
      this.discovery.register(o.constructor.name, 'tcp', this.hostname, this.port)
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
