import { Request, Response, NextFunction } from 'express';
import { dbPool }      from '../../infrastructure/pg.client';
import { redisClient } from '../../infrastructure/redis.client';

declare global {
    namespace Express {
        interface Request {
            tenantId?: number;
            dbClient?: import('pg').PoolClient;
            tmaUser?:  Record<string, unknown>;
        }
    }
}

export async function tenantRLSMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
        const host      = (req.headers.host || '').split(':')[0];
        const subdomain = host.split('.')[0];

        let tenantId = parseInt(await redisClient.get(`tenant:${subdomain}`) || '0');

        if (!tenantId) {
            const result = await dbPool.query(
                'SELECT id, subscription_status FROM schools WHERE subdomain = $1 OR custom_domain = $1',
                [subdomain]
            );
            if (!result.rows[0]) {
                res.status(404).json({ error: 'المدرسة غير موجودة' });
                return;
            }
            const school = result.rows[0];
            if (['expired','suspended'].includes(school.subscription_status)) {
                res.status(403).json({ error: 'الاشتراك منتهٍ. يرجى التواصل مع الإدارة.' });
                return;
            }
            tenantId = school.id;
            await redisClient.setex(`tenant:${subdomain}`, 3600, tenantId.toString());
        }

        req.tenantId = tenantId;
        next();
    } catch (err) {
        next(err);
    }
}
