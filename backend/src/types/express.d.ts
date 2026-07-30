import type { AuthenticatedUser } from './auth';

declare global {
  namespace Express {
    interface Request {
      /** Set by the `authenticate` middleware. Absent on public routes. */
      user?: AuthenticatedUser;
    }
  }
}

export {};
