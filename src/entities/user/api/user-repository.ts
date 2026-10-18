import { db, type User } from "@/shared/db";

export type PublicUser = Pick<User, "id" | "email" | "displayName">;

export function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  return db.users.where("email").equals(email).first();
}

export async function findUserById(id: string): Promise<User | undefined> {
  return db.users.get(id);
}
