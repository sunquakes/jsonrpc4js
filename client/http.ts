import * as http from 'http'
import Client from './client'
import { generateTimestampUUID } from '../utils/random'
import Response from '../type/response'
import { newRequest } from '../type/request'
import { Address, splitAddress } from '../utils/address'

export default class Http implements Client {
  /**
   * The remote service name.
   */
  private service: string

  private map: Map<string, Function> = new Map()

  private address: Address

  constructor(service: string, address: string, options?: {}) {
    this.service = service
    this.address = splitAddress(address)
  }

  async call(method: string, ...args: any[]): Promise<any> {
    const id = generateTimestampUUID()
    const postData = JSON.stringify(newRequest(id, this.service + '/' + method, args))
    const request = http.request(
      {
        host: this.address.host,
        port: this.address.port,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('close', () => {
          this.handler(JSON.parse(data))
        })
      }
    )
    // Write data to request body
    request.write(postData)
    request.end()
    return new Promise((resolve, reject) => {
      this.map.set(id, (data: Response) => {
        if (data.error != undefined) {
          reject(new Error(data.error.message))
        } else if (data.result) {
          resolve(data.result)
        } else {
          reject(new Error('Unknown error'))
        }
      })
      setTimeout(() => {
        this.map.delete(id)
        reject()
      }, 10000)
    })
  }

  handler(data: Response) {
    const resolve = this.map.get(data.id)
    if (resolve !== undefined) resolve(data)
  }
}
