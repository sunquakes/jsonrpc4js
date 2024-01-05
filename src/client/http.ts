import * as http from 'http'
import Client from './client'
import { generateTimestampUUID } from '../utils/random'
import Response from '../type/response'
import { newRequest } from '../type/request'
import { Address, loadBalanceAddress, splitAddresses } from '../utils/address'
import Driver from 'discovery/driver'

export default class Http implements Client {
  /**
   * The remote service name.
   */
  private service: string

  /**
   * Callback function map.
   */
  private map: Map<string, Function> = new Map()

  /**
   * Address or discovery.
   */
  private address: string | Driver

  /**
   * Active service address.
   */
  private activeAddresses: Array<Address> = []

  constructor(service: string, address: string | Driver, options?: {}) {
    this.service = service
    this.address = address
  }

  /**
   * Call service method to the server.
   * @param method 
   * @param args 
   * @returns 
   */
  async call(method: string, ...args: any[]): Promise<any> {
    const id = generateTimestampUUID()
    const postData = JSON.stringify(newRequest(id, this.service + '/' + method, args))
    const address = await this.getUrl()
    if (address == null) {
      return Promise.reject(new Error('Without invalid address.'))
    }
    const req = http.request(
      {
        host: address.host,
        port: address.port,
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

        res.on('end', () => {
          this.handler(JSON.parse(data))
        })
      }
    )

    req.on('error', (e) => {
      this.activeAddresses = this.activeAddresses.filter(item => item.host != address.host || item.port != address.port)
    })

    // Write data to request body
    req.write(postData)
    req.end()
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
        reject(new Error('Timeout'))
      }, 10000)
    })
  }

  private async getUrl(): Promise<Address | null> {
    if (this.activeAddresses.length > 0) {
      return loadBalanceAddress(this.activeAddresses)
    }
    let address: string
    if (typeof this.address == 'string') {
      address = this.address
    } else {
      address = await this.address.get(this.service)
    }
    this.activeAddresses = splitAddresses(address)
    return loadBalanceAddress(this.activeAddresses)
  }

  handler(data: Response) {
    const callback = this.map.get(data.id)
    if (callback !== undefined) callback(data)
  }
}
