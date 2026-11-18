// Calls `read` once for each distinct argument list and gives the same promise to every later
// call, a rejected one included.
export function memoize<Args extends readonly (string | number)[], Answer>(
  read: (...args: Args) => Promise<Answer>,
): (...args: Args) => Promise<Answer> {
  const answers = new Map<string, Promise<Answer>>();

  return (...args) => {
    const key = args.join('\u0000');
    const known = answers.get(key);

    if (known !== undefined) {
      return known;
    }

    const answer = read(...args);

    answers.set(key, answer);

    return answer;
  };
}
