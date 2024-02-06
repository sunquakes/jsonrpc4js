import * as os from 'os'

export function getLocalIp(): string | null {
  const networkInterfaces = os.networkInterfaces()
  const ipv4Addresses: Array<string> = []

  Object.keys(networkInterfaces).forEach((interfaceName) => {
    if (networkInterfaces === undefined || networkInterfaces[interfaceName] === undefined) {
      return
    }
    const ifaces = networkInterfaces[interfaceName] || []
    ifaces.forEach((iface) => {
      // Filter IPv4 addresses
      if (iface.family === 'IPv4') {
        ipv4Addresses.push(iface.address)
      }
    })
  })
  return ipv4Addresses.length > 0 ? ipv4Addresses[0] : null
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
  const addressArray = address.split(',')
  return addressArray.filter((item) => item != undefined).map((item) => splitAddress(item))
}

export function loadBalanceAddress(addresses: Array<Address>): Address | null {
  if (addresses.length === 0) {
    return null
  }
  const randomIndex = Math.floor(Math.random() * addresses.length)
  return addresses[randomIndex]
}
