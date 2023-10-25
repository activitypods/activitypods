import React, { useCallback } from 'react';
import { useTranslate } from 'react-admin';
import { List, ListItem, ListItemIcon, ListItemText, ListSubheader, Switch } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import NotificationsIcon from '@mui/icons-material/Notifications';
import OutboxIcon from '@mui/icons-material/Outbox';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import SearchIcon from '@mui/icons-material/Search';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import { arrayFromLdField } from '../../utils';

const specialRights = {
  'apods:ReadInbox': {
    label: 'app.authorization.read_inbox',
    icon: MoveToInboxIcon
  },
  'apods:ReadOutbox': {
    label: 'app.authorization.read_outbox',
    icon: OutboxIcon
  },
  'apods:PostOutbox': {
    label: 'app.authorization.post_outbox',
    icon: OutboxIcon
  },
  'apods:SendNotification': {
    label: 'app.authorization.send_notification',
    icon: NotificationsIcon
  },
  'apods:QuerySparqlEndpoint': {
    label: 'app.authorization.query_sparql_endpoint',
    icon: SearchIcon
  },
  'apods:CreateAclGroup': {
    label: 'app.authorization.create_acl_group',
    icon: GroupAddIcon
  }
};

const ACL_READ_RIGHTS = ['acl:Read'];
const ACL_WRITE_RIGHTS = ['acl:Create', 'acl:Update', 'acl:Write', 'acl:Append', 'acl:Delete'];

const AccessNeedsList = ({ accessNeeds, required, allowedAccessNeeds, setAllowedAccessNeeds }) => {
  const translate = useTranslate();

  const parseAccessNeed = useCallback(
    accessNeed => {
      if (typeof accessNeed === 'string') {
        const { label, icon } = specialRights[accessNeed];
        return {
          label: translate(label),
          icon
        };
      } else {
        let accessRights = [];
        const hasRead = arrayFromLdField(accessNeed['interop:accessMode']).some(a => ACL_READ_RIGHTS.includes(a));
        const hasWrite = arrayFromLdField(accessNeed['interop:accessMode']).some(a => ACL_WRITE_RIGHTS.includes(a));
        if (hasRead) accessRights.push(translate('app.authorization.read'));
        if (hasWrite) accessRights.push(translate('app.authorization.write'));

        return {
          label: translate('app.authorization.access_resources_of_type', {
            access_right: accessRights.join('/'),
            type: accessNeed['apods:registeredClass']
          }),
          icon: hasWrite ? CreateNewFolderIcon : FolderIcon
        };
      }
    },
    [translate]
  );

  const toggle = useCallback(
    (accessNeed, checked) => {
      if (checked) {
        setAllowedAccessNeeds(a => a.filter(a => a !== accessNeed && a !== accessNeed?.id));
      } else {
        setAllowedAccessNeeds(a => [...a, accessNeed?.id || accessNeed]);
      }
    },
    [setAllowedAccessNeeds]
  );

  return (
    <List
      sx={{ width: '100%', bgcolor: 'background.paper' }}
      subheader={
        <ListSubheader>
          {translate(required ? 'app.authorization.required' : 'app.authorization.optional')}
        </ListSubheader>
      }
    >
      {accessNeeds.map((accessNeed, i) => {
        const { label, icon } = parseAccessNeed(accessNeed);
        const checked = arrayFromLdField(allowedAccessNeeds).some(a => a === accessNeed || a === accessNeed?.id);
        return (
          <ListItem key={i} sx={{ pt: 0, pb: 0 }}>
            <ListItemIcon sx={{ minWidth: 36 }}>{React.createElement(icon)}</ListItemIcon>
            <ListItemText primary={label} />
            <Switch edge="end" onChange={() => toggle(accessNeed, checked)} checked={checked} disabled={required} />
          </ListItem>
        );
      })}
    </List>
  );
};

export default AccessNeedsList;
