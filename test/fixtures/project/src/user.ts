export interface User {
  name: string;
}
export class UserService {
  register(name: string): User {
    return { name };
  }
}
export const MAX_USERS = 100;