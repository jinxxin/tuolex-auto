import { useEffect, useState } from 'react';
import {
  Modal, Table, Button, Select, Space, Tag, Typography, message, Popconfirm,
} from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { apiFetch, notifyDbChanged } from '../core/api';
import { useAuth } from '../store/auth';
import { useTranslation } from 'react-i18next';
import type { User } from '../core/types';

const { Text } = Typography;

interface MemberRow {
  userId: number;
  role: 'owner' | 'member';
  username: string;
  name: string;
  active: boolean;
}

// 项目成员管理弹窗：admin / owner 可增删成员、设置负责人
export default function ProjectMembersModal({
  projectId,
  projectName,
  open,
  onClose,
}: {
  projectId: number;
  projectName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { user: me } = useAuth();
  const { t } = useTranslation();
  const [msg, msgCtx] = message.useMessage();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const canManage = me?.role === 'admin' || members.some((m) => m.userId === me?.id && m.role === 'owner');

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/projects/members/${projectId}`);
      setMembers(await res.json());
      const ures = await apiFetch('/data/users?orderBy=id');
      setUsers(await ures.json());
    } catch (e) {
      msg.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  const save = async (next: MemberRow[]) => {
    setSaving(true);
    try {
      await apiFetch(`/projects/members/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify({ members: next.map((m) => ({ userId: m.userId, role: m.role })) }),
      });
      msg.success(t('members.updated'));
      setMembers(next);
      notifyDbChanged();
    } catch (e) {
      msg.error((e as Error).message);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const addUser = async (userId: number) => {
    if (!userId) return;
    if (members.some((m) => m.userId === userId)) {
      msg.warning(t('members.alreadyMember'));
      return;
    }
    await save([...members, { userId, role: 'member', username: '', name: '', active: true }]);
  };

  const removeUser = async (userId: number) => {
    const next = members.filter((m) => m.userId !== userId);
    if (!next.some((m) => m.role === 'owner')) {
      msg.error(t('members.needOwner'));
      return;
    }
    await save(next);
  };

  const setRole = async (userId: number, role: 'owner' | 'member') => {
    const next = members.map((m) => (m.userId === userId ? { ...m, role } : m));
    if (role === 'member' && !next.some((m) => m.role === 'owner')) {
      msg.error(t('members.needOwner'));
      return;
    }
    await save(next);
  };

  const candidates = users.filter((u) => u.active && !members.some((m) => m.userId === u.id));

  return (
    <Modal
      title={t('members.title', { name: projectName })}
      open={open}
      onCancel={onClose}
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
      width={640}
      destroyOnClose
    >
      {msgCtx}
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        {t('members.hintAccess')}{canManage ? t('members.hintCanManage') : t('members.hintAdminOnly')}
      </Text>
      <Table<MemberRow>
        rowKey="userId"
        size="small"
        loading={loading}
        dataSource={members}
        pagination={false}
        columns={[
          {
            title: t('members.colUser'), dataIndex: 'name', width: 180,
            render: (name: string, r) => (
              <Space direction="vertical" size={0}>
                <span>{name || t('members.nameLoading')}</span>
                <Text type="secondary" style={{ fontSize: 12 }}>@{r.username}</Text>
              </Space>
            ),
          },
          {
            title: t('members.colRole'), dataIndex: 'role', width: 150,
            render: (role: string, r) => canManage ? (
              <Select
                size="small"
                value={role as 'owner' | 'member'}
                style={{ width: 110 }}
                disabled={r.userId === me?.id && role === 'owner'} // 不能撤自己的负责人
                onChange={(v: 'owner' | 'member') => setRole(r.userId, v)}
                options={[
                  { value: 'owner', label: t('members.owner') },
                  { value: 'member', label: t('members.member') },
                ]}
              />
            ) : (
              <Tag color={role === 'owner' ? 'gold' : 'blue'}>{role === 'owner' ? t('members.owner') : t('members.member')}</Tag>
            ),
          },
          {
            title: t('common.actions'), width: 80,
            render: (_: unknown, r) => canManage ? (
              <Popconfirm
                title={r.role === 'owner' ? t('members.removeOwner') : t('members.removeMember')}
                onConfirm={() => removeUser(r.userId)}
                disabled={r.userId === me?.id}
              >
                <Button size="small" danger icon={<DeleteOutlined />} disabled={r.userId === me?.id} />
              </Popconfirm>
            ) : null,
          },
        ]}
      />
      {canManage && (
        <Space style={{ marginTop: 12 }}>
          <Select
            placeholder={t('members.addUserPh')}
            style={{ width: 260 }}
            showSearch
            optionFilterProp="label"
            value={undefined}
            onChange={addUser}
            loading={saving}
            options={candidates.map((u) => ({ value: u.id!, label: `${u.name}（@${u.username}）` }))}
          />
        </Space>
      )}
      {saving && <Text type="secondary" style={{ marginLeft: 8 }}>{t('members.saving')}</Text>}
    </Modal>
  );
}
