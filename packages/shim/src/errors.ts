/** Thrown by generated functions when a tool returns `isError`. */
export class ToolError extends Error {
  constructor(
    readonly tool: string,
    message: string,
    readonly payload: unknown,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}
