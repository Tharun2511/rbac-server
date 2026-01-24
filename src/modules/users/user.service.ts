import { allowedRoles } from '../../constant/allowedRoles';
import { isValidEmail } from '../../utils/emailCheck';
import { hashPassword } from '../../utils/password';
import * as userRepo from './user.repository';

export const createUser = async (name: string, email: string, role: string, password: string) => {
    if (!allowedRoles.includes(role)) throw new Error('Role must be a valid one');

    if (!isValidEmail(email)) throw new Error('Enter a valid email');

    if (name.length < 3) throw new Error('Name must be atleast 3 characters');

    const passwordHash = await hashPassword(password);

    const createdUser = await userRepo.createUser({
        name,
        email,
        role,
        passwordHash,
    });

    return createdUser;
};

export const listAllUsers = async () => {
    return await userRepo.findAllUsers();
};

export const listAllResolvers = async () => {
    return await userRepo.findAllResolvers();
};

export const setUserActiveStatus = async (userId: string, isAcitve: boolean) => {
    if (!userRepo.findUserById(userId)) throw new Error('User does not exist');

    return await userRepo.changeUserStatus(userId, isAcitve);
};

export const getUserDetails = async (userId: string) => {
    return await userRepo.findUserById(userId);
};

export const updateUserRole = async (userId: string, role: string) => {
    if (!allowedRoles.includes(role)) throw new Error('Role must be a valid one');

    if (!userRepo.findUserById(userId)) throw new Error('User does not exist');

    return await userRepo.changeUserRole(userId, role);
};
