import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useListContext, useTranslate, useGetIdentity, useDataProvider, linkToRecord, useNotify } from 'react-admin';
import {
  Switch,
  List as MUIList,
  ListItem,
  ListItemAvatar,
  ListItemSecondaryAction,
  ListItemText,
  Avatar
} from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import PlaceIcon from '@mui/icons-material/Place';
import List from '../../layout/List';

const useStyles = makeStyles(() => ({
  root: {
    height: 63,
  },
  container: {
    backgroundColor: 'white',
    marginBottom: 8,
    height: 63,
    boxShadow: '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)',
  }
}));

const ListWithSwitches = () => {
  const { ids, data } = useListContext();
  const [checkedId, setCheckedId] = useState();
  const { identity } = useGetIdentity();
  const dataProvider = useDataProvider();
  const classes = useStyles();
  const navigate = useNavigate();
  const notify = useNotify();

  useEffect(() => {
    setCheckedId(identity?.profileData?.["vcard:hasAddress"])
  }, [setCheckedId, identity]);

  const setHomeAddress = useCallback(id => {
    // If click on current address, no home address
    if (id === checkedId) id = undefined;
    setCheckedId(id);
    dataProvider
      .update('vcard:hasAddress', {
        id: identity?.profileData?.id,
        data: {
          ...identity?.profileData,
          'vcard:hasAddress': id
        },
        previousData: identity?.profileData
      })
      .then(() => {
        if (id) {
          notify('app.notification.home_address_updated',  { type: 'success' });
        } else {
          notify('app.notification.home_address_deleted',  { type: 'success' });
        }
      });
  }, [setCheckedId, checkedId, dataProvider, identity, notify]);

  return (
    <MUIList>
      {ids.map(id =>
        <ListItem key={id} button onClick={() => navigate(linkToRecord('/Location', id, 'edit'), { replace: true })} classes={classes}>
          <ListItemAvatar>
            <Avatar>
              <PlaceIcon />
            </Avatar>
          </ListItemAvatar>
          <ListItemText
            primary={data[id]['vcard:given-name']}
            secondary={data[id]['vcard:hasAddress']?.['vcard:given-name']}
          />
          <ListItemSecondaryAction>
            <Switch
              edge="end"
              onChange={e => setHomeAddress(id)}
              checked={id === checkedId}
            />
          </ListItemSecondaryAction>
        </ListItem>
      )}
    </MUIList>
  );
}

const LocationList = (props) => {
  const translate = useTranslate();
  
  return (
    <List title={translate('app.page.addresses')} pagination={false} perPage={1000} {...props}>
      <ListWithSwitches />
    </List>
  );
}

export default LocationList;
