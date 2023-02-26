import React, {useEffect} from 'react';
import { useHistory } from 'react-router-dom';
import { useListContext, useTranslate, useGetIdentity, useDataProvider,linkToRecord } from 'react-admin';
import { makeStyles, Switch, List as MUIList, ListItem, ListItemSecondaryAction, ListItemText } from '@material-ui/core';
import List from '../../layout/List';

const useStyles = makeStyles(() => ({
  listItem: {
    backgroundColor: 'white',
    marginBottom: 8,
    boxShadow: '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)',
  }
}));

const AddressList = () => {
  const { ids, data } = useListContext();
  const [checkedId, setCheckedId] = React.useState("");
  const { identity } = useGetIdentity();
  const dataProvider = useDataProvider();
  const classes = useStyles();
  const history = useHistory();

    useEffect(() => {
        setCheckedId(identity?.profileData?.["vcard:hasAddress"])
    }, [setCheckedId, identity]);

  const handleToggle = (e, id) => {
    setCheckedId(id);
    dataProvider.update("vcard:hasAddress", {
      id: identity?.profileData?.id,
      data: {
        ...identity?.profileData,
        "vcard:hasAddress": id,
      },
      previousData: identity?.profileData
          })
  };

  return (
      <MUIList>
        {ids.map(id => 
            <ListItem key={id} button onClick={() => history.push(linkToRecord('/Location', id, 'edit'))} className={classes.listItem}>
              <ListItemText primary={data[id]["vcard:given-name"]} />
              <ListItemSecondaryAction>
                <Switch
                  edge="end"
                  onChange={e => handleToggle(e, id)}
                  checked={id == checkedId}
                  inputProps={{ 'aria-labelledby': 'favorite-adress' }}
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
    <List title={translate('app.page.addresses')} pagination={false} {...props}>
      <AddressList/>
    </List>
  );
}

export default LocationList;
