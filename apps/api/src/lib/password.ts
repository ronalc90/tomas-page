import bcrypt from "bcryptjs";

const ROUNDS = process.env.NODE_ENV === "test" ? 4 : 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummy: Promise<string> | null = null;

/**
 * Hash de relleno: cuando el usuario no existe se compara contra este hash,
 * para que el tiempo de respuesta no revele qué usuarios existen.
 */
export function dummyHash(): Promise<string> {
  dummy ??= hashPassword("contraseña-de-relleno");
  return dummy;
}
