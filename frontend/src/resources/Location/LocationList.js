import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useListContext, useTranslate, useGetIdentity, useDataProvider, useCreatePath, useNotify } from 'react-admin';
import { Switch, List as MUIList, ListItem, ListItemButton, ListItemAvatar, ListItemText, Avatar } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import PlaceIcon from '@mui/icons-material/Place';
import List from '../../layout/List';

const useStyles = makeStyles(() => ({
  listItem: {
    backgroundColor: 'white',
    marginBottom: 8,
    padding: 0,
    height: 63,
    boxShadow: '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)',
  },
}));

const ListWithSwitches = () => {
  const { data } = useListContext();
  const [checkedId, setCheckedId] = useState();
  const createPath = useCreatePath();
  const { identity, refetch: refetchIdentity } = useGetIdentity();
  const dataProvider = useDataProvider();
  const classes = useStyles();
  const navigate = useNavigate();
  const notify = useNotify();

  useEffect(() => {
    setCheckedId(identity?.profileData?.['vcard:hasAddress']);
  }, [setCheckedId, identity]);

  const setHomeAddress = useCallback(
    (id) => {
      // If click on current address, no home address
      if (id === checkedId) id = undefined;
      setCheckedId(id);
      dataProvider
        .update('vcard:hasAddress', {
          id: identity?.profileData?.id,
          data: {
            ...identity?.profileData,
            'vcard:hasAddress': id,
          },
          previousData: identity?.profileData,
        })
        .then(() => {
          refetchIdentity();
          if (id) {
            notify('app.notification.home_address_updated', { type: 'success' });
          } else {
            notify('app.notification.home_address_deleted', { type: 'success' });
          }
        });
    },
    [setCheckedId, checkedId, dataProvider, identity, refetchIdentity, notify]
  );

  return (
    <MUIList>
      {data &&
        data.map((record) => (
          <ListItem
            key={record.id}
            className={classes.listItem}
            secondaryAction={
              <Switch
                edge="end"
                onChange={(e) => {
                  e.preventDefault();
                  setHomeAddress(record.id);
                }}
                checked={record.id === checkedId}
              />
            }
          >
            <ListItemButton onClick={() => navigate(createPath({ resource: 'Location', id: record.id, type: 'edit' }))}>
              <ListItemAvatar>
                <Avatar>
                  <PlaceIcon />
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={record['vcard:given-name']}
                secondary={record['vcard:hasAddress']?.['vcard:given-name']}
              />
            </ListItemButton>
          </ListItem>
        ))}
    </MUIList>
  );
};

const LocationList = (props) => {
  const translate = useTranslate();

  return (
    <List title={translate('app.page.addresses')} pagination={false} perPage={1000} {...props}>
      <ListWithSwitches />
    </List>
  );
};

export default LocationList;
