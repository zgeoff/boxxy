// how many items at the end of the list pass the test, counting back until one fails
export function countTrailing<T>(list: readonly T[], test: (item: T) => boolean): number {
  let count = 0;

  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];

    if (item === undefined || !test(item)) {
      break;
    }

    count += 1;
  }

  return count;
}
