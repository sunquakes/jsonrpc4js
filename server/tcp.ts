import * as net from 'net'
import Server from './server'

export default class Tcp implements Server {
  setOptions(options: any): void {}

  start(callback?: Function): void {
    const port = 8080

    var server = net.createServer(function (conn) {
      conn.on('end', function () {})
    })

    server.listen(8080, () => {
      console.info(`Listening tcp://0.0.0.0:${port}`)
      if (callback) callback(server)
    })
  }

  register(o: Object): void {}
}
