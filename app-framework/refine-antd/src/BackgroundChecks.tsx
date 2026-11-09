import type { ReactNode } from 'react';
import { useLogout, useTranslate } from '@refinedev/core';
import { useBackgroundChecks, type BackgroundChecksOptions } from '@activitypods/refine-hooks';
import { Button, Space, Spin, Typography, theme } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';

export type BackgroundChecksProps = BackgroundChecksOptions & { children: ReactNode };

/** Pass `appStatusCheckInterval: false` to the auth provider when using this component */
const BackgroundChecks = ({ children, ...options }: BackgroundChecksProps) => {
  const { token } = theme.useToken();
  const translate = useTranslate();
  const { mutate: logout } = useLogout();
  const { isLoggedOut, isChecked, error, retry } = useBackgroundChecks(options);

  if (isLoggedOut || isChecked) return <>{children}</>;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      {error ? (
        <div
          style={{
            backgroundColor: token.colorError,
            padding: 16,
            textAlign: 'center',
            borderRadius: token.borderRadius
          }}
        >
          <ExclamationCircleFilled style={{ fontSize: 50, color: token.colorWhite }} />
          <Typography.Paragraph style={{ color: token.colorWhite, marginTop: 8 }}>{error}</Typography.Paragraph>
          <Space>
            <Button danger type="primary" onClick={retry}>
              {translate('buttons.refresh', 'Refresh')}
            </Button>
            <Button danger type="primary" onClick={() => logout()}>
              {translate('buttons.logout', 'Logout')}
            </Button>
          </Space>
        </div>
      ) : (
        <Spin size="large" />
      )}
    </div>
  );
};

export default BackgroundChecks;
