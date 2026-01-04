import { signToken } from '../../utils/jwt';
import { passwordCompare } from '../../utils/password';
import { findUserByEmail } from './auth.repository';

export const login = async (email: string, password: string) => {
  const userDetails = await findUserByEmail(email);

  if (!userDetails || !userDetails.is_active) throw new Error('Invalid Credentials');

  const passwordMatch = await passwordCompare(password, userDetails.hashed_password);

  if (!passwordMatch) throw new Error('Invalid Credentials');

  const token = signToken({ userId: userDetails.id, role: userDetails.role });

  return {
    user: {
      id: userDetails.id,
      email: userDetails.email,
      role: userDetails.role,
    },
    token,
  };
};
