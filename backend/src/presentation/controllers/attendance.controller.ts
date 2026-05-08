import { Request, Response } from 'express';
import { dbPool }       from '../../infrastructure/pg.client';
import { telegramBot }  from '../../infrastructure/telegram-bot.service';
import { AuditService } from '../../infrastructure/audit.service';
import { logger }       from '../../infrastructure/logger';

export const AttendanceController = {

    async markAttendance(req: Request, res: Response) {
        const { studentCode, status } = req.body as { studentCode: string; status: string };
        const tenantId  = req.tenantId!;
        const monitorId = (req as any).tmaUser?.id;

        if (!studentCode || !['present','absent','late','excused'].includes(status)) {
            return res.status(400).json({ error: 'بيانات غير صحيحة' });
        }

        res.status(202).json({ message: 'جارٍ التسجيل...' });

        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT set_config($1, $2, false)', [
                'app.current_school_id', tenantId.toString()
            ]);

            const studentRes = await client.query<{
                id: number; name: string; parent_telegram_id: string | null; class_id: number;
            }>(
                `SELECT id, name, parent_telegram_id, class_id
                 FROM students
                 WHERE student_code = $1 AND is_active = true`,
                [studentCode]
            );

            if (!studentRes.rows[0]) {
                logger.warn({ tenantId, studentCode }, 'Student not found');
                await client.query('ROLLBACK');
                return;
            }

            const student = studentRes.rows[0];

            await client.query(
                `INSERT INTO attendance (school_id, student_id, class_id, recorded_by, date, status, check_in_time)
                 VALUES ($1, $2, $3, $4, CURRENT_DATE, $5, CURRENT_TIME)
                 ON CONFLICT (student_id, date)
                 DO UPDATE SET status = EXCLUDED.status,
                               check_in_time = CASE WHEN EXCLUDED.status = 'present'
                                                    THEN EXCLUDED.check_in_time
                                                    ELSE attendance.check_in_time END`,
                [tenantId, student.id, student.class_id, monitorId || null, status]
            );

            await AuditService.log(client, {
                schoolId: tenantId,
                userId:   monitorId,
                action:   'MARK_ATTENDANCE',
                entity:   'students',
                entityId: student.id,
                details:  { status, studentCode },
            });

            await client.query('COMMIT');

            if (student.parent_telegram_id && status === 'present') {
                const now = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                const msg = `✅ تم تسجيل حضور *${student.name}* في المدرسة الساعة ${now}`;
                telegramBot.sendMessage(student.parent_telegram_id, msg).catch(err =>
                    logger.error({ err, parentId: student.parent_telegram_id }, 'Failed to notify parent')
                );
            }

            logger.info({ tenantId, studentCode, status }, 'Attendance marked');

        } catch (err) {
            await client.query('ROLLBACK');
            logger.error({ err, tenantId, studentCode }, 'Attendance failed');
        } finally {
            client.release();
        }
    },

    async getTodayAttendance(req: Request, res: Response) {
        const tenantId = req.tenantId!;
        const client   = await dbPool.connect();
        try {
            await client.query('SELECT set_config($1, $2, false)', [
                'app.current_school_id', tenantId.toString()
            ]);
            const result = await client.query(
                `SELECT s.student_code, s.name, a.status, a.check_in_time
                 FROM students s
                 LEFT JOIN attendance a ON a.student_id = s.id AND a.date = CURRENT_DATE
                 WHERE s.is_active = true
                 ORDER BY s.name`
            );
            return res.json(result.rows);
        } catch (err) {
            logger.error({ err }, 'Failed to fetch attendance');
            return res.status(500).json({ error: 'خطأ في جلب البيانات' });
        } finally {
            client.release();
        }
    }
};
