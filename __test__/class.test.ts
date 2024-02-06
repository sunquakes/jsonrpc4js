import { getMethodParameters } from '../src/utils/class'

class C {
  zero(): void {}

  one(a: string): void {}

  two(a: string, b: number): void {}
}

test('Test get parameters class method names.', async () => {
  const c = new C()
  expect(getMethodParameters(c.zero)).toEqual([])
  expect(getMethodParameters(c.one)).toEqual(['a'])
  expect(getMethodParameters(c.two)).toEqual(['a', 'b'])
})
