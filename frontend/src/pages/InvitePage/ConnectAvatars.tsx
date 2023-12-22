import React, { useMemo } from 'react';
import { Avatar, AvatarGroup } from '@mui/material';
import { colorFromString } from '../../utils';

// Define profile structure
type Profile = {
  'vcard:given-name'?: string;
  'vcard:photo'?: string;
  describes?: string;
  [key: string]: any;
};

const ConnectAvatars = ({
  frontProfile: profileOne,
  backProfile: profileTwo,
  avatarSize
}: {
  frontProfile: Profile;
  backProfile: Profile;
  avatarSize: string | number | undefined;
}) => {
  const { 'vcard:given-name': avatar1FirstName, 'vcard:photo': avatar1Src, describes: profile1WebId } = profileOne;
  const { 'vcard:given-name': avatar2FirstName, 'vcard:photo': avatar2Src, describes: profile2WebId } = profileTwo;
  const avatarFontSize = '4em';
  const ownAvatarColor = useMemo(() => colorFromString(profile2WebId || ''), [profile2WebId]);
  const inviterAvatarColor = useMemo(() => colorFromString(profile1WebId || ''), [profile1WebId]);

  return (
    <AvatarGroup spacing="small">
      <Avatar
        src={avatar1Src}
        alt={avatar1FirstName}
        sx={{
          bgcolor: inviterAvatarColor,
          position: 'relative',
          left: '4%',
          fontSize: avatarFontSize,
          width: avatarSize,
          height: avatarSize,
          zIndex: 1
        }}
      >
        {avatar1FirstName?.[0]?.toUpperCase()}
      </Avatar>
      <Avatar
        src={avatar2Src}
        alt={avatar2FirstName}
        sx={{
          bgcolor: ownAvatarColor,
          position: 'relative',
          left: '-4%',
          fontSize: avatarFontSize,
          width: avatarSize,
          height: avatarSize
        }}
      >
        {avatar2FirstName?.[0]?.toUpperCase()}
      </Avatar>
    </AvatarGroup>
  );
};

export default ConnectAvatars;
