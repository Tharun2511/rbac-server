import bcrypt from 'bcrypt';
import { env } from '../config/env';

const SALT_ROUNDS = env.SALT_ROUNDS;

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, SALT_ROUNDS);
};

export const passwordCompare = async (enteredPassword: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(enteredPassword, hash);
};
