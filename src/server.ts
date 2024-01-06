import TcpServer from './server/tcp'
import HttpServer from './server/http'
import Server from 'server/server'
import Driver from 'discovery/driver'

export default function NewServer(protocol: string, port: number, discovery?: Driver): Server {
  let server
  switch (protocol) {
    case 'tcp':
      server = new TcpServer(port, discovery)
      break
    case 'http':
      server = new HttpServer(port, discovery)
      break
    default:
      throw new Error('Unknown error')
  }
  return server
}
