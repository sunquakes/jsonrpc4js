import TcpClient, { Options } from './client/tcp'
import HttpClient from './client/http'
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
    default:
      throw new Error(`Unknown protocol: ${protocol}`)
  }
}
