import * as net from 'net'
import Server from './server'
import handler from './handler'

export default class Tcp implements Server {
  /**
   * The method map.
   */
  private map = new Map<string, object>()

  /**
   * Set tcp options.
   */
  setOptions(options: any): void {}

  /**
   * Start the tcp server.
   */
  start(callback?: Function): void {
    const port = 8080

    var server = net.createServer((socket) => {
      socket.on('close', () => {})

      socket.on('data', (data) => {
        const res = handler(JSON.parse(data.toString()), this.map)
        socket.write(res)
      })
      socket.on('end', function () {})
    })

    server.listen(8080, () => {
      console.info(`Listening tcp://0.0.0.0:${port}`)
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
  handler(message: {}): string {
    const res = handler(message, this.map)
    return res
  }
}
