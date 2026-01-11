import bcrypt from 'bcrypt';
import { env } from '../config/env';

const SALT_ROUNDS = env.SALT_ROUNDS;

export const hashPassword = async (password: string): Promise<string> => {
    return await bcrypt.hash(password, SALT_ROUNDS);
};

export const passwordCompare = async (enteredPassword: string, hash: string): Promise<boolean> => {
    try {
        const result1 = await bcrypt.compare(enteredPassword, hash);
    } catch (err) {
        console.log(err);
    }
    return await bcrypt.compare(enteredPassword, hash);
};
