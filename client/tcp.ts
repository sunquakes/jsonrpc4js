import * as net from 'net'
import Client from './client'
import { resolve } from 'path'
import { generateTimestampUUID } from '../utils/random'
import { Socket } from 'dgram'

export default class Tcp implements Client {
  private socket: net.Socket

  private map: Map<string, Function>

  constructor(service: string, address: string, options?: {}) {
    this.socket = new net.Socket()
    this.map = new Map<string, Function>()
  }

  connect(ip: string, port: number) {
    this.socket.connect(port, ip, () => {
      this.socket.on('close', () => {})
      this.socket.on('data', (data) => {})
    })
  }

  async call(method: string, ...args: any[]): Promise<any> {
    const id = generateTimestampUUID()
    return new Promise((resolve) => {
      const f = (data: {}) => {
        resolve(data)
      }
      this.map.set(id, f)
      setTimeout(() => {
        this.map.delete(id)
      }, 10000)
    })
  }
}
