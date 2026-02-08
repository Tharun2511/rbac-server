import bcrypt from 'bcrypt';
import { env } from '../config/env';
import logger from './logger';

const SALT_ROUNDS = env.SALT_ROUNDS;

export const hashPassword = async (password: string): Promise<string> => {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return await bcrypt.hash(password, salt);
};

export const passwordCompare = async (enteredPassword: string, hash: string): Promise<boolean> => {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashed = await bcrypt.hash(enteredPassword, salt);
    logger.info(hashed);
    return await bcrypt.compare(enteredPassword, hash);
};
