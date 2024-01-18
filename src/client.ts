import TcpClient, { Options } from './client/tcp'
import HttpClient from './client/http'
import Client from 'client/client'
import Driver from 'discovery/driver'

export default function NewClient(
  service: string,
  protocol: string,
  address: string | Driver,
  options?: Options 
): Client {
  let client
  switch (protocol) {
    case 'tcp':
      client = new TcpClient(service, address, options)
      break
    case 'http':
      client = new HttpClient(service, address)
      break
    default:
      throw new Error('Unknown error')
  }
  return client
}
