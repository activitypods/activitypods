import React, { useCallback, useState, useEffect } from 'react';
import urlJoin from 'url-join';
import LinkHeader from 'http-link-header';
import { useTranslate, useGetList, useDataProvider, useGetIdentity, useLocaleState } from 'react-admin';
import {
  Box,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListSubheader,
  Switch,
  Avatar,
  Select,
  MenuItem
} from '@mui/material';
import { useContainerByUri, useCompactPredicate } from '@semapps/semantic-data-provider';
import ShareIcon from '@mui/icons-material/Share';
import GroupsIcon from '@mui/icons-material/Groups';
import SimpleBox from '../../layout/SimpleBox';
import useResource from '../../hooks/useResource';
import useActor from '../../hooks/useActor';
import useRoleLabel from '../../hooks/useRoleLabel';
import useFetchShapeTree from '../../hooks/useFetchShapeTree';
import { arrayOf, formatUsername } from '../../utils';

const ACCESS_MODES = {
  none: [],
  read: ['acl:Read'],
  read_write: ['acl:Read', 'acl:Write']
};

const getAccess = accessModes =>
  accessModes.includes('acl:Write') ? 'read_write' : accessModes.includes('acl:Read') ? 'read' : 'none';

const AccessSelect = ({ value, onChange }) => {
  const translate = useTranslate();
  return (
    <Select size="small" value={value} onChange={e => onChange(e.target.value)} sx={{ minWidth: 150 }}>
      {Object.keys(ACCESS_MODES).map(access => (
        <MenuItem key={access} value={access}>
          {translate(`app.authorization.${access}`)}
        </MenuItem>
      ))}
    </Select>
  );
};

const RoleGrantee = ({ role, value, onChange }) => {
  const roleLabel = useRoleLabel();
  return (
    <ListItem sx={{ px: 0 }} secondaryAction={<AccessSelect value={value} onChange={onChange} />}>
      <ListItemAvatar>
        <Avatar>
          <GroupsIcon />
        </Avatar>
      </ListItemAvatar>
      <ListItemText primary={roleLabel(role)} />
    </ListItem>
  );
};

const MemberGrantee = ({ memberUri, value, onChange }) => {
  const actor = useActor(memberUri);
  return (
    <ListItem sx={{ px: 0 }} secondaryAction={<AccessSelect value={value} onChange={onChange} />}>
      <ListItemAvatar>
        <Avatar src={actor.image}>{actor.name?.toUpperCase()?.[0]}</Avatar>
      </ListItemAvatar>
      <ListItemText primary={actor.name} secondary={formatUsername(memberUri)} />
    </ListItem>
  );
};

const SocialAgent = ({ socialAgentRegistration, onSelect, selected }) => {
  return (
    <ListItem sx={{ px: 0 }}>
      <ListItemAvatar>
        <Avatar /*src={record?.['vcard:photo']}*/>{socialAgentRegistration['skos:prefLabel']?.[0]}</Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={socialAgentRegistration['skos:prefLabel'] || socialAgentRegistration['interop:registeredAgent']}
        secondary={socialAgentRegistration['skos:prefLabel'] && socialAgentRegistration['interop:registeredAgent']}
      />
      <Switch edge="end" onChange={onSelect} checked={selected} />
    </ListItem>
  );
};

const ShareScreen = ({ resourceUri, shapeTreeUri, podOwner, accessApp }) => {
  const translate = useTranslate();
  const [locale] = useLocaleState();
  const fetchShapeTree = useFetchShapeTree();
  const [shapeTree, setShapeTree] = useState();
  const dataProvider = useDataProvider();
  const { data: identity } = useGetIdentity();
  const [selected, setSelected] = useState([]);
  const [access, setAccess] = useState({});
  const [dataRegistrationUri, setDataRegistrationUri] = useState();
  const [authorizations, setAuthorizations] = useState();
  const [authorizationsLoading, setAuthorizationsLoading] = useState(false);
  const { data: socialAgentRegistrations } = useGetList('SocialAgentRegistration', {
    page: 1,
    perPage: Infinity
  });
  const { data: resource, headers } = useResource(resourceUri);

  useEffect(() => {
    if (shapeTreeUri) fetchShapeTree(shapeTreeUri).then(setShapeTree);
  }, [shapeTreeUri, fetchShapeTree, setShapeTree]);

  const toggle = useCallback(
    agentUri => {
      setSelected(cur => {
        if (cur.includes(agentUri)) {
          return cur.filter(uri => uri !== agentUri);
        } else {
          return [...cur, agentUri];
        }
      });
    },
    [setSelected]
  );

  // Find data registration (container) URI based on the resource header
  useEffect(() => {
    if (headers) {
      const linkHeader = LinkHeader.parse(headers.get('Link'));
      const dataRegistrationLinkHeader = linkHeader.rel('http://www.w3.org/ns/solid/interop#hasDataRegistration');
      if (dataRegistrationLinkHeader.length > 0) {
        const dataRegistrationUri = dataRegistrationLinkHeader[0].uri;
        setDataRegistrationUri(dataRegistrationUri);
      }
    }
  }, [headers, setDataRegistrationUri]);

  const container = useContainerByUri(dataRegistrationUri);
  const labelPredicate = useCompactPredicate(container?.labelPredicate, resource?.['@context']);

  useEffect(() => {
    if (!authorizations && !authorizationsLoading) {
      setAuthorizationsLoading(true);

      const authorizationsUrl = new URL(urlJoin(CONFIG.BACKEND_URL, '.auth-agent/authorizations'));
      if (resourceUri) {
        authorizationsUrl.searchParams.append('resource', resourceUri);
      } else {
        authorizationsUrl.searchParams.append('shapeTree', shapeTreeUri);
        if (podOwner) authorizationsUrl.searchParams.append('podOwner', podOwner);
      }

      dataProvider
        .fetch(authorizationsUrl.toString(), {
          headers: new Headers({
            Accept: 'application/json'
          })
        })
        .then(({ json }) => {
          setAuthorizations(json);
          setAccess(
            Object.fromEntries(json?.authorizations.map(auth => [auth.grantee, getAccess(arrayOf(auth.accessModes))]))
          );
          setSelected(
            json?.authorizations
              .filter(auth => arrayOf(auth.accessModes).includes('acl:Read'))
              .map(auth => auth.grantee)
          );
          setAuthorizationsLoading(false);
        });
    }
  }, [
    resourceUri,
    shapeTreeUri,
    podOwner,
    dataProvider,
    setSelected,
    authorizations,
    setAuthorizations,
    authorizationsLoading,
    setAuthorizationsLoading
  ]);

  const isGroup = !!authorizations?.roles;

  const onShare = useCallback(async () => {
    await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.auth-agent/authorizations'), {
      method: 'PUT',
      headers: new Headers({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        ...(resourceUri ? { resourceUri } : { shapeTreeUri, podOwner }),
        authorizations: isGroup
          ? [...authorizations.roles.map(role => role.uri), ...authorizations.members].map(grantee => ({
              grantee,
              accessModes: ACCESS_MODES[access[grantee] || 'none']
            }))
          : socialAgentRegistrations.map(reg => {
              const grantee = reg['interop:registeredAgent'];
              return { grantee, accessModes: selected.includes(grantee) ? ['acl:Read'] : [] };
            })
      })
    });

    accessApp();
  }, [
    resourceUri,
    shapeTreeUri,
    podOwner,
    isGroup,
    authorizations,
    access,
    socialAgentRegistrations,
    selected,
    accessApp,
    dataProvider
  ]);

  const changeAccess = grantee => value => setAccess(cur => ({ ...cur, [grantee]: value }));

  return (
    <SimpleBox
      title={translate('app.page.share')}
      icon={<ShareIcon />}
      text={
        shapeTreeUri
          ? translate(isGroup ? 'app.helper.share_type_group' : 'app.helper.share_type', {
              typeName: shapeTree?.label?.[locale] || shapeTree?.types?.join(', ') || ''
            })
          : translate(isGroup ? 'app.helper.share_group' : 'app.helper.share', {
              // The containers of a group are not in the user's data servers
              resourceName: resource?.[labelPredicate] || resource?.name
            })
      }
    >
      {isGroup ? (
        <List sx={{ width: '100%' }}>
          <ListSubheader sx={{ px: 0 }}>{translate('app.page.roles')}</ListSubheader>
          {authorizations.roles.map(role => (
            <RoleGrantee
              key={role.uri}
              role={role}
              value={access[role.uri] || 'none'}
              onChange={changeAccess(role.uri)}
            />
          ))}
          <ListSubheader sx={{ px: 0 }}>{translate('app.page.members')}</ListSubheader>
          {authorizations.members
            .filter(memberUri => memberUri !== identity?.id)
            .map(memberUri => (
              <MemberGrantee
                key={memberUri}
                memberUri={memberUri}
                value={access[memberUri] || 'none'}
                onChange={changeAccess(memberUri)}
              />
            ))}
        </List>
      ) : (
        <List sx={{ width: '100%' }}>
          {socialAgentRegistrations
            ?.filter(reg => reg['interop:registeredAgent'] !== identity?.id)
            .map(socialAgentRegistration => (
              <SocialAgent
                key={socialAgentRegistration.id}
                socialAgentRegistration={socialAgentRegistration}
                onSelect={() => toggle(socialAgentRegistration['interop:registeredAgent'])}
                selected={selected.includes(socialAgentRegistration['interop:registeredAgent'])}
              />
            ))}
        </List>
      )}
      <Box display="flex" justifyContent="end">
        <Button color="secondary" onClick={accessApp} sx={{ ml: 1 }}>
          {translate('ra.action.cancel')}
        </Button>
        <Button variant="contained" color="secondary" onClick={onShare} sx={{ ml: 1 }}>
          {translate('app.action.share')}
        </Button>
      </Box>
    </SimpleBox>
  );
};

export default ShareScreen;
