import { Card, Table, Tag, Alert, Button } from 'antd';
import { SafetyCertificateOutlined, UserOutlined } from '@ant-design/icons';
import { useLiveQuery } from '../../core/api';
import { db } from '../../core/db';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { User, Role } from '../../core/types';

const ROLE_COLOR: Record<Role, string> = {
  admin: 'red',
  qa: 'blue',
  it: 'cyan',
  reviewer: 'purple',
  viewer: 'default',
};

export default function UsersPage() {
  const { t } = useTranslation();
  const users = useLiveQuery(() => db.users.toArray(), []) ?? [];

  return (
    <Card title={t('usersPage.title')}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('usersPage.alertMsg')}
        description={t('usersPage.alertDesc')}
        action={
          <Button type="primary" icon={<UserOutlined />} href="/user-admin.html" target="_blank">
            {t('usersPage.goEasyx')}
          </Button>
        }
      />
      <Table<User>
        rowKey="id" dataSource={users} pagination={false}
        columns={[
          { title: t('usersPage.colUsername'), dataIndex: 'username', width: 140 },
          { title: t('usersPage.colName'), dataIndex: 'name' },
          { title: t('usersPage.colRole'), dataIndex: 'role', width: 140, render: (r: Role) => <Tag color={ROLE_COLOR[r]}>{t(`role.${r}`)}</Tag> },
          { title: t('usersPage.colSign'), width: 140, render: (_, u) => u.certId ? <Tag color="green" icon={<SafetyCertificateOutlined />}>{t('usersPage.certBound')}</Tag> : <Tag>{t('usersPage.pwdSign')}</Tag> },
          { title: t('usersPage.colActive'), dataIndex: 'active', width: 90, render: (a) => <Tag color={a ? 'green' : 'default'}>{a ? t('usersPage.activeOn') : t('usersPage.activeOff')}</Tag> },
          { title: t('usersPage.colCreated'), dataIndex: 'createdAt', width: 150, render: (v) => dayjs(v).format('YYYY-MM-DD') },
        ]}
      />
    </Card>
  );
}
