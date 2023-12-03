import * as http from 'http'
import Server from './server'
import handler from './handler'
import Request from '../type/request'

export default class Http implements Server {
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
    var server = http.createServer((request, response) => {
      console.log('http request data', request)
      const socket = request.socket
      socket.on('close', () => {})

      socket.on('data', (data) => {
        console.log('http data', data)
        const res = handler(JSON.parse(data.toString()), this.map)
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(res)
      })
      socket.on('end', function () {})
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end({ test: 1 })
    })

    server.listen(this.port, () => {
      console.info(`Listening http://0.0.0.0:${this.port}`)
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
