import React, { useCallback, useState, useEffect } from 'react';
import { useTranslate, useLocaleState } from 'react-admin';
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
import useFetchShapeTree from '../../hooks/useFetchShapeTree';

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

const AccessNeedsList = ({ accessNeeds, required, allowedAccessNeeds, setAllowedAccessNeeds }) => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const fetchShapeTree = useFetchShapeTree();
  const [parsedAccessNeeds, setParsedAccessNeeds] = useState([]);

  const parseAccessNeed = useCallback(
    async accessNeed => {
      if (typeof accessNeed === 'string') {
        const specialRight = specialRights[accessNeed];
        if (specialRight) {
          return {
            label: translate(specialRight.label),
            icon: specialRight.icon,
            accessNeed
          };
        } else {
          return {
            label: translate('app.authorization.unknown', { key: accessNeed }),
            icon: HelpOutlineIcon,
            accessNeed
          };
        }
      } else {
        const accessRights = [];

        const shapeTree = await fetchShapeTree(accessNeed['interop:registeredShapeTree']);

        const hasRead = arrayOf(accessNeed['interop:accessMode']).includes('acl:Read');
        const hasAppend = arrayOf(accessNeed['interop:accessMode']).includes('acl:Append');
        const hasWrite = arrayOf(accessNeed['interop:accessMode']).includes('acl:Write');
        const hasControl = arrayOf(accessNeed['interop:accessMode']).includes('acl:Control');

        if (hasRead) accessRights.push(translate('app.authorization.read'));
        if (hasAppend) accessRights.push(translate('app.authorization.append'));
        if (hasWrite) accessRights.push(translate('app.authorization.write'));
        if (hasControl) accessRights.push(translate('app.authorization.control'));

        return {
          label: (
            <span>
              {accessRights.join('/')}{' '}
              {shapeTree.label ? (
                <span title={shapeTree.types?.join(', ')} style={{ textDecoration: 'underline dotted grey' }}>
                  {shapeTree.label[locale]}
                </span>
              ) : (
                shapeTree.types?.join(', ')
              )}
            </span>
          ),
          icon: hasAppend || hasWrite ? CreateNewFolderIcon : FolderIcon,
          accessNeed
        };
      }
    },
    [translate, locale]
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

  useEffect(() => {
    Promise.all(accessNeeds.map(accessNeed => parseAccessNeed(accessNeed))).then(results =>
      setParsedAccessNeeds(results)
    );
  }, [accessNeeds, setParsedAccessNeeds]);

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
      {parsedAccessNeeds.map(({ label, icon, accessNeed }, i) => {
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
