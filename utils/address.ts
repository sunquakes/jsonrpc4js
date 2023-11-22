type Address = {
  host: string
  port: number
}
export function splitAddress(address: string): Address {
  const addressArray = address.split(':')
  return { host: addressArray[0], port: addressArray[1] ? Number(addressArray[1]) : 80 }
}
