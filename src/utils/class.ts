/**
 * Get the methods parameters name array.
 */
export function getMethodParameters(method: Function): Array<string> {
  const p = method!
    .toString()
    .replace(/\/\*.*\*\//, '')
    .match(/\((.*?)\)/)![1]
  if (p == '') return []
  return p.split(',').map((param) => param.trim())
}
