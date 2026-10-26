/** An error the API turns into `{ error, message }` with this HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const forbidden = (message = 'You don’t have permission to do that.') =>
  new ApiError(403, 'forbidden', message);
export const notFound = (what = 'That') => new ApiError(404, 'not_found', `${what} doesn’t exist.`);
