import { users, type User } from "../data/users.js";

export function getAllUsers(): User[] {
  return users;
}

export function getUserById(id: number): User | undefined {
  return users.find((user) => user.id === id);
}

export function getUsersByRole(role: string): User[] {
  return users.filter((user) => user.role === role);
}
