import crypto from 'crypto';

export const createSign = (item, secretKey) => crypto.createHmac('sha256', secretKey).update(item).digest('base64');
