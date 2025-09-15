import React, { useState, useCallback } from 'react';
import { Button, useTranslate, useGetOne, useDataProvider, useNotify } from 'react-admin';
import { Menu, MenuItem, ListItemIcon } from '@mui/material';
import AppsIcon from '@mui/icons-material/Apps';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import rdf from '@rdfjs/data-model';
import { arrayOf } from '../../utils';

const AppMenuItem = ({ appUri, isDefault, ...rest }: any) => {
  const { data: app, isLoading } = useGetOne('App', { id: appUri });
  if (isLoading) return null;
  return (
    <MenuItem {...rest}>
      <ListItemIcon>{isDefault ? <CheckBoxIcon /> : <CheckBoxOutlineBlankIcon />}</ListItemIcon>
      {app.name}
    </MenuItem>
  );
};

const SetDefaultAppButton = ({ typeRegistration, refetch, color }: any) => {
  const translate = useTranslate();
  const notify = useNotify();
  const dataProvider = useDataProvider();
  const [anchorEl, setAnchorEl] = useState(null);

  const handleOpen = (event: any) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const selectDefaultApp = useCallback(
    async (appUri: any) => {
      await dataProvider.patch('TypeRegistration', {
        id: typeRegistration.id,
        triplesToAdd: [
          rdf.quad(
            rdf.namedNode(typeRegistration.id),
            rdf.namedNode('http://activitypods.org/ns/core#defaultApp'),
            rdf.namedNode(appUri)
          )
        ],
        triplesToRemove: [
          rdf.quad(
            rdf.namedNode(typeRegistration.id),
            rdf.namedNode('http://activitypods.org/ns/core#defaultApp'),
            rdf.namedNode(typeRegistration['apods:defaultApp'])
          )
        ]
      });

      await refetch();

      notify('app.message.default_app_changed', { type: 'success' });

      setAnchorEl(null);
    },
    [dataProvider, typeRegistration, setAnchorEl, notify, refetch]
  );

  return (
    <>
      <Button label={translate('app.action.set_default_app')} color={color} onClick={handleOpen}>
        <AppsIcon />
      </Button>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={handleClose}>
        {arrayOf(typeRegistration['apods:availableApps']).map(appUri => (
          <AppMenuItem
            key={appUri}
            appUri={appUri}
            isDefault={appUri === typeRegistration['apods:defaultApp']}
            onClick={() => selectDefaultApp(appUri)}
          />
        ))}
      </Menu>
    </>
  );
};

export default SetDefaultAppButton;
