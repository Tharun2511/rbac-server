import { findUserByEmail } from '../users/user.repository';
import * as orgRepo from './organizations.repository';

export const createOrg = async (name: string, slug: string) => {
    // Check if slug exists? DB constraint handles it but nice to check.
    return await orgRepo.createOrganization(name, slug);
};

export const getOrgs = async () => {
    return await orgRepo.getAllOrganizations();
};

export const getOrgMembers = async (orgId: string) => {
    return await orgRepo.getOrganizationMembers(orgId);
};

export const inviteMember = async (orgId: string, email: string, roleId: string) => {
    const user = await findUserByEmail(email);
    if (!user) {
        throw new Error('User not found'); // For MVP, user must exist
    }

    // Check if member already exists
    // We could add a check here, or let DB unique constraint handle it.
    // Let's let DB handle it for brevity, but catch error in controller.

    return await orgRepo.addMemberToOrganization(user.id, orgId, roleId);
};
