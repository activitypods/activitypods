import React, { useCallback } from 'react';
import { useTranslate } from 'react-admin';
import { List, ListItem, ListItemIcon, ListItemText, ListSubheader, Switch } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import CreateNewFolderIcon from '@mui/icons-material/CreateNewFolder';
import OutboxIcon from '@mui/icons-material/Outbox';
import MoveToInboxIcon from '@mui/icons-material/MoveToInbox';
import SearchIcon from '@mui/icons-material/Search';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { arrayOf } from '../../utils';

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
  'apods:QuerySparqlEndpoint': {
    label: 'app.authorization.query_sparql_endpoint',
    icon: SearchIcon
  },
  'apods:CreateWacGroup': {
    label: 'app.authorization.create_wac_group',
    icon: GroupAddIcon
  },
  'apods:CreateCollection': {
    label: 'app.authorization.create_collection',
    icon: PlaylistAddIcon
  },
  'apods:UpdateWebId': {
    label: 'app.authorization.update_webid',
    icon: ManageAccountsIcon
  }
};

const AccessNeedsList = ({
  accessNeeds,
  required,
  allowedAccessNeeds,
  setAllowedAccessNeeds,
  classDescriptions,
  typeRegistrations
}) => {
  const translate = useTranslate();

  const parseAccessNeed = useCallback(
    accessNeed => {
      if (typeof accessNeed === 'string') {
        const specialRight = specialRights[accessNeed];
        if (specialRight) {
          return {
            label: translate(specialRight.label),
            icon: specialRight.icon
          };
        } else {
          return {
            label: translate('app.authorization.unknown', { key: accessNeed }),
            icon: HelpOutlineIcon
          };
        }
      } else {
        const accessRights = [];

        const hasRead = arrayOf(accessNeed['interop:accessMode']).includes('acl:Read');
        const hasAppend = arrayOf(accessNeed['interop:accessMode']).includes('acl:Append');
        const hasWrite = arrayOf(accessNeed['interop:accessMode']).includes('acl:Write');
        const hasControl = arrayOf(accessNeed['interop:accessMode']).includes('acl:Control');

        if (hasRead) accessRights.push(translate('app.authorization.read'));
        if (hasAppend) accessRights.push(translate('app.authorization.append'));
        if (hasWrite) accessRights.push(translate('app.authorization.write'));
        if (hasControl) accessRights.push(translate('app.authorization.control'));

        const matchingTypeRegistration = typeRegistrations?.find(reg =>
          arrayOf(reg['solid:forClass']).includes(accessNeed['apods:registeredClass'])
        );

        const matchingClassDescription = classDescriptions?.find(desc =>
          arrayOf(desc['apods:describedClass']).includes(accessNeed['apods:registeredClass'])
        );

        // Get description from local TypeRegistrations first, to prevent apps to fool users about what they request
        const description =
          matchingTypeRegistration?.['skos:prefLabel'] || matchingClassDescription?.['skos:prefLabel'];

        return {
          label: (
            <span>
              {accessRights.join('/')}{' '}
              {description ? (
                <span title={accessNeed['apods:registeredClass']} style={{ textDecoration: 'underline dotted grey' }}>
                  {description}
                </span>
              ) : (
                accessNeed['apods:registeredClass']
              )}
            </span>
          ),
          icon: hasAppend || hasWrite ? CreateNewFolderIcon : FolderIcon
        };
      }
    },
    [translate, classDescriptions]
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

  if (accessNeeds.length === 0) return null;

  return (
    <List
      sx={{ width: '100%', bgcolor: 'background.paper' }}
      subheader={
        <ListSubheader sx={{ p: 0, lineHeight: 3 }}>
          {translate(required ? 'app.authorization.required' : 'app.authorization.optional')}
        </ListSubheader>
      }
    >
      {accessNeeds.map((accessNeed, i) => {
        const parsedAccessNeed = parseAccessNeed(accessNeed);
        if (!parsedAccessNeed) return null;
        const { label, icon } = parsedAccessNeed;
        const checked = arrayOf(allowedAccessNeeds).some(a => a === accessNeed || a === accessNeed?.id);
        return (
          <ListItem key={i} sx={{ p: 0 }}>
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
