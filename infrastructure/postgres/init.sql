-- ============================================================
-- SchoolMaster AI — Production Database Schema
-- PostgreSQL 15+ | Row Level Security (Zero-Trust)
-- ============================================================

-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. SCHOOLS (Tenants)
-- ============================================================
CREATE TABLE IF NOT EXISTS schools (
    id                   SERIAL PRIMARY KEY,
    name                 VARCHAR(255)  NOT NULL,
    subdomain            VARCHAR(100)  UNIQUE,
    custom_domain        VARCHAR(255)  UNIQUE,
    telegram_bot_token   TEXT,
    telegram_group_id    VARCHAR(100),
    plan_id              INTEGER       DEFAULT 1,
    subscription_status  VARCHAR(20)   NOT NULL DEFAULT 'trial'
                            CHECK (subscription_status IN ('trial','active','expired','suspended')),
    subscription_end     DATE,
    ai_daily_budget      INTEGER       NOT NULL DEFAULT 50000,
    features             JSONB         NOT NULL DEFAULT '{
        "ai_assistant": true,
        "attendance": true,
        "grades": true,
        "telegram_bot": true,
        "parent_notifications": true
    }',
    settings             JSONB         NOT NULL DEFAULT '{"language":"ar"}',
    logo_url             TEXT,
    is_active            BOOLEAN       NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. STAFF (Teachers, Admins, Monitors)
-- ============================================================
CREATE TABLE IF NOT EXISTS staff (
    id            SERIAL PRIMARY KEY,
    school_id     INTEGER       REFERENCES schools(id) ON DELETE CASCADE,
    telegram_id   BIGINT,
    name          VARCHAR(255)  NOT NULL,
    email         VARCHAR(255)  UNIQUE NOT NULL,
    password_hash VARCHAR(255)  NOT NULL,
    phone         VARCHAR(20),
    role          VARCHAR(50)   NOT NULL
                    CHECK (role IN ('platform','admin','principal','teacher','accountant','monitor')),
    is_active     BOOLEAN       NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, telegram_id)
);

-- Platform Super Admin (password: Admin@2026 — CHANGE IN PRODUCTION)
INSERT INTO staff (name, email, password_hash, role)
VALUES (
    'Super Admin',
    'admin@monadim.online',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMleqd1Q1NRYH.6k5Cx8mG8NqK',
    'platform'
) ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- 3. CLASSES
-- ============================================================
CREATE TABLE IF NOT EXISTS classes (
    id             SERIAL PRIMARY KEY,
    school_id      INTEGER       NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    name           VARCHAR(100)  NOT NULL,
    grade_level    INTEGER,
    academic_year  VARCHAR(20)   DEFAULT TO_CHAR(NOW(), 'YYYY'),
    capacity       INTEGER       DEFAULT 35,
    teacher_id     INTEGER       REFERENCES staff(id) ON DELETE SET NULL,
    is_active      BOOLEAN       NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. STUDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
    id                  SERIAL PRIMARY KEY,
    school_id           INTEGER       NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    class_id            INTEGER       REFERENCES classes(id) ON DELETE SET NULL,
    telegram_id         BIGINT,
    parent_telegram_id  BIGINT,
    name                VARCHAR(255)  NOT NULL,
    phone               VARCHAR(20),
    parent_phone        VARCHAR(20),
    student_code        VARCHAR(50)   NOT NULL,
    gender              VARCHAR(10)   CHECK (gender IN ('male','female')),
    date_of_birth       DATE,
    is_active           BOOLEAN       NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (school_id, student_code),
    UNIQUE (school_id, telegram_id)
);

-- ============================================================
-- 5. ATTENDANCE
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
    id             SERIAL PRIMARY KEY,
    school_id      INTEGER       NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    student_id     INTEGER       NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    class_id       INTEGER       REFERENCES classes(id),
    recorded_by    INTEGER       REFERENCES staff(id),
    date           DATE          NOT NULL DEFAULT CURRENT_DATE,
    status         VARCHAR(20)   NOT NULL
                     CHECK (status IN ('present','absent','late','excused')),
    check_in_time  TIME,
    check_out_time TIME,
    notes          TEXT,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE (student_id, date)
);

-- ============================================================
-- 6. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL PRIMARY KEY,
    school_id   INTEGER       REFERENCES schools(id) ON DELETE CASCADE,
    user_id     INTEGER       REFERENCES staff(id) ON DELETE SET NULL,
    action      VARCHAR(100)  NOT NULL,
    entity      VARCHAR(100),
    entity_id   INTEGER,
    details     JSONB         DEFAULT '{}',
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. ROW LEVEL SECURITY — Zero-Trust Isolation
-- ============================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE classes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE students   ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: safely parse the current school context
CREATE OR REPLACE FUNCTION current_school_id() RETURNS INTEGER AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_school_id', true), '')::INTEGER;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- CLASSES policy
CREATE POLICY tenant_isolation_classes ON classes
    USING (school_id = current_school_id());

-- STUDENTS policy
CREATE POLICY tenant_isolation_students ON students
    USING (school_id = current_school_id());

-- STAFF policy: tenant members see only their school; platform sees all
CREATE POLICY tenant_isolation_staff ON staff
    USING (
        school_id = current_school_id()
        OR role = 'platform'
    );

-- ATTENDANCE policy
CREATE POLICY tenant_isolation_attendance ON attendance
    USING (school_id = current_school_id());

-- AUDIT LOGS policy
CREATE POLICY tenant_isolation_audit ON audit_logs
    USING (school_id = current_school_id());

-- ============================================================
-- 8. INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_students_school     ON students (school_id);
CREATE INDEX IF NOT EXISTS idx_students_code       ON students (school_id, student_code);
CREATE INDEX IF NOT EXISTS idx_attendance_student  ON attendance (student_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_school   ON attendance (school_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_school        ON audit_logs (school_id, created_at DESC);

-- ============================================================
-- 9. Trigger: auto-update updated_at on schools
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_schools_updated
BEFORE UPDATE ON schools
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================
-- 10. Sample school for testing (remove in production)
-- ============================================================
INSERT INTO schools (name, subdomain, telegram_bot_token, subscription_status, ai_daily_budget)
VALUES ('مدرسة النموذج', 'demo', 'TOKEN_REPLACE_ME', 'active', 100000)
ON CONFLICT (subdomain) DO NOTHING;
