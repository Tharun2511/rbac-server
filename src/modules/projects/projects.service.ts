import * as projectRepo from './projects.repository';

export const createProj = async (name: string, slug: string, orgId: string) => {
    return await projectRepo.createProject(name, slug, orgId);
};

export const getOrgProjects = async (orgId: string) => {
    return await projectRepo.getProjectsByOrg(orgId);
};

export const getProjMembers = async (projectId: string) => {
    return await projectRepo.getProjectMembers(projectId);
};

export const addMemberToProject = async (userId: string, orgId: string, projectId: string, roleId: string) => {
    return await projectRepo.addMemberToProject(userId, orgId, projectId, roleId);
};

export const updateProj = async (id: string, name: string) => {
    return await projectRepo.updateProject(id, name);
};

export const deleteProj = async (id: string) => {
    return await projectRepo.deleteProject(id);
};

export const removeMember = async (projectId: string, userId: string) => {
    return await projectRepo.removeMemberFromProject(projectId, userId);
};
