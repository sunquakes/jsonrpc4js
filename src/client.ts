import TcpClient, { Options } from './client/tcp'
import HttpClient from './client/http'
import StreamableHttpClient from './client/streamable-http'
import Client from './client/client'
import Driver from './discovery/driver'

export default function NewClient(
  service: string,
  protocol: string,
  address: string | Driver,
  options?: Options
): Client {
  switch (protocol) {
    case 'tcp':
      return new TcpClient(service, address, options)
    case 'http':
      return new HttpClient(service, address)
    case 'streamable-http':
      return new StreamableHttpClient(service, address, options)
    default:
      throw new Error(`Unknown protocol: ${protocol}`)
  }
}
