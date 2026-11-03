import { Fragment } from 'react';
import { useTranslate } from '@refinedev/core';
import { useLoginFlow, type LoginFlowOptions } from '@activitypods/refine-hooks';
import { Avatar, Button, Card, Divider, Layout, Space, Spin, Typography, theme } from 'antd';
import { DatabaseOutlined, LockOutlined } from '@ant-design/icons';

export type LoginPageProps = LoginFlowOptions & {
  /** Text shown above the Pod providers */
  text?: string;
};

/** Must be mounted on the `redirectUri` of the auth provider (`/login` by default) */
const LoginPage = ({ text, ...options }: LoginPageProps) => {
  const { token } = theme.useToken();
  const translate = useTranslate();
  const { isProcessing, error, podProviders, login, backToLogin } = useLoginFlow(options);

  if (isProcessing) {
    return (
      <Layout style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {error ? (
          <Space direction="vertical" align="center">
            <Typography.Text type="danger">{error}</Typography.Text>
            <Button onClick={backToLogin}>{translate('pages.login.backToLogin', 'Back to login')}</Button>
          </Space>
        ) : (
          <Spin size="large" />
        )}
      </Layout>
    );
  }

  return (
    <Layout style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Card
        style={{ minWidth: 300, maxWidth: 350, marginTop: '6em', backgroundColor: token.colorBgElevated }}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ margin: '1em', display: 'flex', justifyContent: 'center' }}>
          <Avatar size={40} icon={<LockOutlined />} />
        </div>
        <Typography.Paragraph
          type={error ? 'danger' : 'secondary'}
          style={{ textAlign: 'center', padding: '4px 24px 8px', marginBottom: 0, fontSize: token.fontSizeSM }}
        >
          {error ||
            text ||
            translate('pages.login.choosePodProvider', 'Choose the Pod provider that hosts your ActivityPods account')}
        </Typography.Paragraph>
        <div style={{ margin: 16 }}>
          {podProviders.map(podProvider => (
            <Fragment key={podProvider['apods:baseUrl']}>
              <Divider style={{ margin: 0 }} />
              <Button
                type="text"
                block
                onClick={() => login(podProvider)}
                style={{ height: 'auto', padding: '8px 16px', justifyContent: 'flex-start', textAlign: 'left' }}
              >
                <Space size="middle" align="center">
                  <Avatar size={40} icon={<DatabaseOutlined />} />
                  <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.5 }}>
                    <Typography.Text>{new URL(podProvider['apods:baseUrl']).host}</Typography.Text>
                    {podProvider['apods:area'] && (
                      <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                        {podProvider['apods:area']}
                      </Typography.Text>
                    )}
                  </div>
                </Space>
              </Button>
            </Fragment>
          ))}
        </div>
      </Card>
    </Layout>
  );
};

export default LoginPage;
