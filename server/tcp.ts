import * as net from 'net'
import Server from './server'
import handler from './handler'
import Request from '../type/request'

export default class Tcp implements Server {
  /**
   * The method map.
   */
  private map = new Map<string, object>()

  /**
   * The server port.
   */
  private port: number

  constructor(port: number) {
    this.port = port
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
        console.log('server data', data.toString())
        const res = handler(JSON.parse(data.toString()), this.map)
        console.log('server data map', this.map)
        console.log('server data res', res)
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
  }

  /**
   * Hander the client message.
   */
  handler(message: Request): string {
    const res = handler(message, this.map)
    return res
  }
}
