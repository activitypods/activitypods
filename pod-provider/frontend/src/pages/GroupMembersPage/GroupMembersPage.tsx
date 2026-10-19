import React from 'react';
import { useTranslate } from 'react-admin';
import { List, useMediaQuery } from '@mui/material';
import Header from '../../common/Header';
import ListView from '../../layout/ListView';
import useRealmContext from '../../hooks/useRealmContext';
import useGroupMembers from '../../hooks/useGroupMembers';
import MemberItem from './MemberItem';
import AddMemberCard from './AddMemberCard';
import ProfileCard from '../../common/cards/ProfileCard';

const GroupMembersPage = () => {
  const translate = useTranslate();
  const xs = useMediaQuery((theme: any) => theme.breakpoints.down('sm'), { noSsr: true });
  const { isLoading: isGroupLoading, data: group } = useRealmContext() as any;
  const { members, isLoading, addMember, removeMember, addOwner, removeOwner } = useGroupMembers();

  if (isGroupLoading) return null;

  return (
    <>
      <Header title="app.titles.group_members" titleVariables={{ groupName: group.fullName }} />
      <ListView
        title={translate('app.page.members')}
        actions={[]}
        asides={[...(xs ? [] : [<ProfileCard />]), <AddMemberCard members={members} onAdd={addMember} />]}
      >
        {!isLoading && (
          <List>
            {members?.map(member => (
              <MemberItem
                key={member.webId}
                member={member}
                onRemove={removeMember}
                onToggleOwner={(memberUri, isOwner) => (isOwner ? removeOwner(memberUri) : addOwner(memberUri))}
              />
            ))}
          </List>
        )}
      </ListView>
    </>
  );
};

export default GroupMembersPage;
