-- Migration: Add BYODB user_connections table + connection_id on conversations
-- Run against app_db

CREATE TABLE IF NOT EXISTS user_connections (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name           VARCHAR(100) NOT NULL,
    -- Encrypted fields (Fernet/AES-128-CBC via cryptography package)
    host_enc       TEXT NOT NULL,
    port           INTEGER NOT NULL DEFAULT 5432,
    database_enc   TEXT NOT NULL,
    username_enc   TEXT NOT NULL,
    password_enc   TEXT NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'untested',
    -- NULL = never tested; set on create/test
    last_tested_at TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_conn_name UNIQUE (user_id, name),
    CONSTRAINT chk_status CHECK (status IN ('untested','connected','unreachable','auth_failed'))
);

CREATE INDEX IF NOT EXISTS idx_user_connections_user
    ON user_connections (user_id);

-- Add nullable connection_id to conversations
-- NULL → Chinook demo (existing behaviour unchanged)
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS connection_id UUID
        REFERENCES user_connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_connection
    ON conversations (connection_id)
    WHERE connection_id IS NOT NULL;
