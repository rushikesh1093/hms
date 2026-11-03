"""patient portal accounts

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-03 20:15:00

Adds patient_accounts: one optional portal login per patient, enabled by staff.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'patient_accounts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('patient_id', sa.Integer(), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('must_change_password', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('failed_login_attempts', sa.Integer(), server_default='0', nullable=False),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id'], name=op.f('fk_patient_accounts_patient_id_patients'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], name=op.f('fk_patient_accounts_created_by_users'), ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], name=op.f('fk_patient_accounts_updated_by_users'), ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_patient_accounts')),
        sa.UniqueConstraint('patient_id', name=op.f('uq_patient_accounts_patient_id')),
    )


def downgrade() -> None:
    op.drop_table('patient_accounts')
