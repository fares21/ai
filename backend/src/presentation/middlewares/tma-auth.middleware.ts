import * as crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export function verifyTelegramSignature(req: Request, res: Response, next: NextFunction) {
    const initData = req.headers['x-telegram-init-data'] as string;
    if (!initData) return res.status(401).json({ error: 'بيانات تلغرام مفقودة' });

    try {
        const params = new URLSearchParams(initData);
        const hash   = params.get('hash');
        if (!hash) return res.status(401).json({ error: 'توقيع مفقود' });

        params.delete('hash');

        // Use Array.from instead of spread for ES2020 compatibility
        const checkString = Array.from(params.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${k}=${v}`)
            .join('\n');

        const secretKey      = crypto.createHmac('sha256', 'WebAppData')
                                     .update(process.env.TELEGRAM_BOT_TOKEN!)
                                     .digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey)
                                     .update(checkString)
                                     .digest('hex');

        if (calculatedHash !== hash) {
            return res.status(403).json({ error: 'توقيع غير صالح' });
        }

        req.tmaUser = JSON.parse(params.get('user') || '{}');
        next();
    } catch {
        return res.status(400).json({ error: 'تنسيق بيانات خاطئ' });
    }
}
