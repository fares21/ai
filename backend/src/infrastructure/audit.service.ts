import { PoolClient } from 'pg';

interface AuditEntry {
    schoolId?: number;
    userId?:   number;
    action:    string;
    entity?:   string;
    entityId?: number;
    details?:  object;
    ipAddress?: string;
}

export class AuditService {
    static async log(client: PoolClient, entry: AuditEntry): Promise<void> {
        await client.query(
            `INSERT INTO audit_logs (school_id, user_id, action, entity, entity_id, details, ip_address)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [
                entry.schoolId ?? null,
                entry.userId   ?? null,
                entry.action,
                entry.entity   ?? null,
                entry.entityId ?? null,
                JSON.stringify(entry.details ?? {}),
                entry.ipAddress ?? null,
            ]
        );
    }
}
