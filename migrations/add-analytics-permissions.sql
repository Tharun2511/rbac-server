-- Migration: Add Analytics Permissions for Role-Specific Dashboards
-- Date: 2026-02-17
-- Description: Adds analytics permissions for PROJECT_MANAGER, AGENT, REQUESTER, and ORG_OWNER roles

-- Step 1: Insert new analytics permissions
INSERT INTO permissions (key, description)
VALUES
    ('analytics:view.self', 'View personal analytics'),
    ('analytics:view.project', 'View project-level analytics'),
    ('analytics:view.org', 'View organization-level analytics')
ON CONFLICT (key) DO NOTHING;

-- Step 2: Grant permissions to appropriate roles

-- SYSTEM_ADMIN already has '*' wildcard, so they have all analytics permissions

-- ORG_OWNER and ORG_ADMIN get org-level analytics
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('ORG_OWNER', 'ORG_ADMIN')
AND p.key = 'analytics:view.org'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- PROJECT_MANAGER gets project-level analytics
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'PROJECT_MANAGER'
AND p.key = 'analytics:view.project'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- AGENT, REQUESTER, and PROJECT_VIEWER get self analytics
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name IN ('AGENT', 'REQUESTER', 'PROJECT_VIEWER')
AND p.key = 'analytics:view.self'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Verification query (optional - comment out for production)
-- SELECT
--     r.name as role,
--     p.key as permission
-- FROM role_permissions rp
-- JOIN roles r ON rp.role_id = r.id
-- JOIN permissions p ON rp.permission_id = p.id
-- WHERE p.key LIKE 'analytics:%'
-- ORDER BY r.name, p.key;
