import React, { useCallback, useState } from 'react';
import urlJoin from 'url-join';
import { useTranslate, useGetList, useDataProvider } from 'react-admin';
import { Box, Button, List, ListItem, ListItemAvatar, ListItemText, Switch, Avatar } from '@mui/material';
import SimpleBox from '../../layout/SimpleBox';
import ShareIcon from '@mui/icons-material/Share';
import useResource from '../../hooks/useResource';

const SocialAgent = ({ socialAgentRegistration, onSelect, selected }) => {
  return (
    <ListItem sx={{ px: 0 }}>
      <ListItemAvatar>
        <Avatar /*src={record?.['vcard:photo']}*/>{socialAgentRegistration['skos:prefLabel']?.[0]}</Avatar>
      </ListItemAvatar>
      <ListItemText
        primary={socialAgentRegistration['skos:prefLabel'] || socialAgentRegistration['interop:registeredAgent']}
      />
      <Switch edge="end" onChange={onSelect} checked={selected} />
    </ListItem>
  );
};

const ShareScreen = ({ resourceUri, application, accessApp }) => {
  const translate = useTranslate();
  const dataProvider = useDataProvider();
  const [selected, setSelected] = useState([]);
  const { data: socialAgentRegistrations, isLoading } = useGetList('SocialAgentRegistration', {
    page: 1,
    perPage: Infinity
  });
  const { data: resource } = useResource(resourceUri);

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

  const onShare = useCallback(async () => {
    await dataProvider.fetch(urlJoin(CONFIG.BACKEND_URL, '.auth-agent/authorizations'), {
      method: 'PUT',
      headers: new Headers({
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        resourceUri,
        authorizations: socialAgentRegistrations.map(reg => {
          const grantee = reg['interop:registeredAgent'];
          return { grantee, accessModes: selected.includes(grantee) ? ['acl:Read'] : [] };
        })
      })
    });

    accessApp();
  }, [resourceUri, socialAgentRegistrations, selected, accessApp, dataProvider]);

  return (
    <SimpleBox
      title={translate('app.page.share')}
      icon={<ShareIcon />}
      text={translate('app.helper.share', { resourceName: resource?.name })}
    >
      <List sx={{ width: '100%' }}>
        {socialAgentRegistrations?.map(socialAgentRegistration => (
          <SocialAgent
            key={socialAgentRegistration.id}
            socialAgentRegistration={socialAgentRegistration}
            onSelect={() => toggle(socialAgentRegistration['interop:registeredAgent'])}
            selected={selected.includes(socialAgentRegistration['interop:registeredAgent'])}
          />
        ))}
      </List>
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
