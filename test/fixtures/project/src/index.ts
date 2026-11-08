import { UserService } from './user';
export { UserService } from './user';
export function registerUser(name: string) {
  return new UserService().register(name);
}