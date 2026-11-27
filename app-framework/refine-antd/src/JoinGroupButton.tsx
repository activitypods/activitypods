import { useEffect, useState, type ReactNode } from 'react';
import { useTranslate } from '@refinedev/core';
import { useGroupMembership } from '@activitypods/refine-hooks';
import { App, Button, Grid, Input, Modal, Popconfirm, notification as staticNotification, type ButtonProps } from 'antd';
import { ClockCircleOutlined, MailOutlined, UsergroupAddOutlined } from '@ant-design/icons';

export type JoinGroupButtonProps = Omit<ButtonProps, 'onClick' | 'icon' | 'loading'> & {
  /** WebID of the group */
  groupWebId: string;
};

/**
 * Join a group, ask to join it or accept its invitation, depending on its join policy.
 * Nothing is shown to its members, to anonymous users, and if the group can only be joined by invitation.
 * A notification is shown once the user is a member.
 */
const JoinGroupButton = ({ groupWebId, ...props }: JoinGroupButtonProps) => {
  const translate = useTranslate();
  const screens = Grid.useBreakpoint();
  const { status, isWaiting, joined, acknowledgeJoined, join, cancelRequest } = useGroupMembership(groupWebId);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState('');
  const app = App.useApp();
  // Outside of an antd App, the static method is used
  const notification = 'success' in app.notification ? app.notification : staticNotification;

  useEffect(() => {
    if (!joined) return;
    notification.success({ message: translate('groups.joined', 'You are now a member of the group'), placement: 'bottom' });
    acknowledgeJoined();
  }, [joined, acknowledgeJoined, notification, translate]);

  const button = (icon: ReactNode, label: string, onClick?: () => void) => (
    <Button icon={icon} loading={isWaiting} onClick={onClick} title={label} {...props}>
      {screens.sm && label}
    </Button>
  );

  switch (status) {
    case 'can-join':
      return button(<UsergroupAddOutlined />, translate('groups.join', 'Join'), () => join());

    case 'invited':
      return button(<MailOutlined />, translate('groups.acceptInvitation', 'Accept the invitation'), () => join());

    case 'can-request':
      return (
        <>
          {button(<UsergroupAddOutlined />, translate('groups.requestToJoin', 'Request to join'), () =>
            setModalOpen(true)
          )}
          <Modal
            open={modalOpen}
            title={translate('groups.requestToJoin', 'Request to join')}
            okText={translate('groups.sendRequest', 'Send the request')}
            cancelText={translate('buttons.cancel', 'Cancel')}
            onCancel={() => setModalOpen(false)}
            onOk={async () => {
              setModalOpen(false);
              await join(message.trim() || undefined);
              setMessage('');
            }}
          >
            <Input.TextArea
              rows={4}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder={translate('groups.requestMessage', 'A message for the admins (optional)')}
            />
          </Modal>
        </>
      );

    case 'requested':
      return (
        <Popconfirm
          title={translate('groups.cancelRequest', 'Cancel your request to join?')}
          okText={translate('groups.cancelRequestOk', 'Cancel the request')}
          cancelText={translate('groups.keepRequest', 'Keep it')}
          onConfirm={() => cancelRequest()}
        >
          {button(<ClockCircleOutlined />, translate('groups.requestSent', 'Request sent'))}
        </Popconfirm>
      );

    default:
      return null;
  }
};

export default JoinGroupButton;
