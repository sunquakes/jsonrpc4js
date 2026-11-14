import * as os from 'os'

export function getLocalIp(): string | null {
  const networkInterfaces = os.networkInterfaces()
  const externalAddresses: Array<string> = []
  const allAddresses: Array<string> = []

  Object.keys(networkInterfaces).forEach((interfaceName) => {
    const ifaces = networkInterfaces[interfaceName]
    if (ifaces === undefined) {
      return
    }
    ifaces.forEach((iface) => {
      // Filter IPv4 addresses
      if (iface.family === 'IPv4') {
        allAddresses.push(iface.address)
        if (!iface.internal) {
          externalAddresses.push(iface.address)
        }
      }
    })
  })
  if (externalAddresses.length > 0) {
    return externalAddresses[0]
  }
  return allAddresses.length > 0 ? allAddresses[0] : null
}

export type Address = {
  host: string
  port: number
}

export function splitAddress(address: string): Address {
  const addressArray = address.split(':')
  return { host: addressArray[0], port: addressArray[1] ? Number(addressArray[1]) : 80 }
}

export function splitAddresses(address: string): Array<Address> {
  return address
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => splitAddress(item))
}

export function loadBalanceAddress(addresses: Array<Address>): Address | null {
  if (addresses.length === 0) {
    return null
  }
  const randomIndex = Math.floor(Math.random() * addresses.length)
  return addresses[randomIndex]
}
