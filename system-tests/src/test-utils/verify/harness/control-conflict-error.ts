// A control step whose state is wrong, such as a claim with no current item. The control handler
// answers it with 409.
export class ControlConflictError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'ControlConflictError';
  }
}
