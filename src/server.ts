import TcpServer, { Options } from './server/tcp'
import HttpServer from './server/http'
import StreamableHttpServer from './server/streamable-http'
import Server from './server/server'
import Driver from './discovery/driver'

export default function NewServer(
  protocol: string,
  port: number,
  discovery?: Driver,
  options?: Options
): Server {
  switch (protocol) {
    case 'tcp':
      return new TcpServer(port, discovery, options)
    case 'http':
      return new HttpServer(port, discovery)
    case 'streamable-http':
      return new StreamableHttpServer(port, discovery, options)
    default:
      throw new Error(`Unknown protocol: ${protocol}`)
  }
}
