import React from 'react';
import { useTranslate } from 'react-admin';
import { List, useMediaQuery } from '@mui/material';
import Header from '../../common/Header';
import ListView from '../../layout/ListView';
import useRealmContext from '../../hooks/useRealmContext';
import useGroupMembers from '../../hooks/useGroupMembers';
import MemberItem from './MemberItem';
import AddMemberCard from './AddMemberCard';
import JoinRequestsBlock from './JoinRequestsBlock';
import ProfileCard from '../../common/cards/ProfileCard';

const GroupMembersPage = () => {
  const translate = useTranslate();
  const xs = useMediaQuery((theme: any) => theme.breakpoints.down('sm'), { noSsr: true });
  const { isLoading: isGroupLoading, data: group } = useRealmContext() as any;
  const { members, roles, isOwner, rights, isLoading, addMember, removeMember, addRoleMember, removeRoleMember } =
    useGroupMembers();

  if (isGroupLoading) return null;

  return (
    <>
      <Header title="app.titles.group_members" titleVariables={{ groupName: group.fullName }} />
      <ListView
        title={translate('app.page.members')}
        actions={[]}
        asides={[
          ...(xs ? [] : [<ProfileCard />]),
          ...(rights.includes('interop:ManageMembers') ? [<AddMemberCard members={members} onAdd={addMember} />] : [])
        ]}
      >
        {!isLoading && rights.includes('interop:ManageMembers') && (
          <JoinRequestsBlock
            requests={members?.filter(member => member.requested) || []}
            onAccept={addMember}
            onReject={removeMember}
          />
        )}
        {!isLoading && (
          <List>
            {members
              ?.filter(member => !member.requested)
              .map(member => (
                <MemberItem
                  key={member.webId}
                  member={member}
                  roles={roles || []}
                  isOwner={isOwner}
                  rights={rights}
                  onRemove={removeMember}
                  onToggleRole={(role, memberUri, hasRole) =>
                    hasRole ? removeRoleMember(role, memberUri) : addRoleMember(role, memberUri)
                  }
                />
              ))}
          </List>
        )}
      </ListView>
    </>
  );
};

export default GroupMembersPage;
