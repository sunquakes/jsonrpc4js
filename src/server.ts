import TcpServer from './server/tcp'
import HttpServer from './server/http'
import Server from 'server/server'

export default function NewServer(protocol: string, port: number): Server {
  let server
  switch (protocol) {
    case 'tcp':
      server = new TcpServer(port)
      break
    case 'http':
      server = new HttpServer(port)
      break
    default:
      throw new Error('Unknown error')
  }
  return server
}
