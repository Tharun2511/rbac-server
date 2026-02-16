import { isValidEmail } from '../../utils/emailCheck';
import { hashPassword } from '../../utils/password';
import * as userRepo from './user.repository';

export const createUser = async (name: string, email: string, password: string, orgId: string) => {
    if (!isValidEmail(email)) throw new Error('Enter a valid email');
    if (name.length < 3) throw new Error('Name must be at least 3 characters');

    const passwordHash = await hashPassword(password);

    // Create user
    const user = await userRepo.createUser({
        name,
        email,
        passwordHash,
    });

    // Find default org role and add user to org
    const defaultRole = await userRepo.findDefaultOrgRole();
    if (!defaultRole) throw new Error('Default org role not found. Please seed roles first.');
    await userRepo.addUserToOrg(user.id, orgId, defaultRole.id);

    return user;
};

export const listAllUsers = async (orgId?: string) => {
    return await userRepo.findAllUsers(orgId);
};

export const listMembersByRole = async (orgId: string, roleName: string, projectId?: string) => {
    return await userRepo.findMembersByRole(orgId, roleName, projectId);
};

export const setUserActiveStatus = async (userId: string, isActive: boolean) => {
    const user = await userRepo.findUserById(userId);
    if (!user) throw new Error('User does not exist');
    return await userRepo.changeUserStatus(userId, isActive);
};

export const getUserDetails = async (userId: string) => {
    return await userRepo.findUserById(userId);
};

export const getUserMemberships = async (userId: string) => {
    return await userRepo.getUserMemberships(userId);
};

export const getOrgUsersNotInProject = async (orgId: string, projectId: string) => {
    return await userRepo.getOrgUsersNotInProject(orgId, projectId);
};

export const getRolesByScope = async (scope: string) => {
    return await userRepo.findRolesByScope(scope);
};
