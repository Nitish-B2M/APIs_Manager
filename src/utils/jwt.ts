import jwt, { JwtPayload } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

export interface UserPayload extends JwtPayload {
    userId: string;
}

export const signJwt = (payload: object) => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

export const verifyJwt = (token: string): UserPayload | null => {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (typeof decoded === 'string') {
            return null; // or handle string token if applicable, but usually we want an object
        }
        return decoded as UserPayload;
    } catch (error) {
        return null;
    }
};
