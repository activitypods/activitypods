import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslate, Button } from 'react-admin';
import {
  Box,
  List,
  ListItem,
  ListItemButton,
  Avatar,
  ListItemAvatar,
  ListItemText,
  CircularProgress,
  Dialog,
  useMediaQuery
} from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import ListView from '../../layout/ListView';
import useResourcesByType from '../../hooks/useResourcesByType';
import useTypeRegistrations from '../../hooks/useTypeRegistrations';
import ResourceCard from '../../common/cards/ResourceCard';
import SetDefaultAppButton from '../../common/buttons/SetDefaultAppButton';

const useStyles = makeStyles(() => ({
  listItem: {
    backgroundColor: 'white',
    padding: 0,
    marginBottom: 8,
    boxShadow: '0px 2px 1px -1px rgb(0 0 0 / 20%), 0px 1px 1px 0px rgb(0 0 0 / 14%), 0px 1px 3px 0px rgb(0 0 0 / 12%)'
  },
  listItemText: {
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
    marginRight: 32
  }
}));

const MyDataButton = ({ color }) => {
  const translate = useTranslate();
  return (
    <Link to="/data">
      <Button label={translate('app.page.data')} color={color}>
        <ArrowBackIcon />
      </Button>
    </Link>
  );
};

const DataTypePage = () => {
  useCheckAuthenticated();
  const classes = useStyles();
  const { containerUri } = useParams();
  const translate = useTranslate();
  const [selected, setSelected] = useState();
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });

  const { data: typeRegistrations, refetch } = useTypeRegistrations();
  const typeRegistration = typeRegistrations?.find(reg => reg['solid:instanceContainer'] === containerUri);
  const { resources, isLoading, isLoaded } = useResourcesByType(containerUri, typeRegistration);

  if (!typeRegistrations) return null;

  return (
    <ListView
      title={typeRegistration?.['skos:prefLabel']}
      actions={
        typeRegistration?.['apods:availableApps']
          ? [<MyDataButton />, <SetDefaultAppButton typeRegistration={typeRegistration} refetch={refetch} />]
          : [<MyDataButton />]
      }
      asides={selected && !xs ? [<ResourceCard resource={selected} typeRegistration={typeRegistration} />] : null}
    >
      <Box>
        <List>
          {isLoading && <CircularProgress />}
          {isLoaded && resources.length === 0 && translate('ra.navigation.no_results')}
          {resources?.map(resource => (
            <ListItem className={classes.listItem} key={resource.resourceUri.value}>
              <ListItemButton onClick={() => setSelected(resource)}>
                <ListItemAvatar>
                  <Avatar src={typeRegistration?.['apods:icon']}>
                    <InsertDriveFileIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={resource.label?.value}
                  secondary={resource.resourceUri.value}
                  className={classes.listItemText}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Box>
      {xs && (
        <Dialog fullWidth open={!!selected} onClose={() => setSelected(null)}>
          <ResourceCard resource={selected} typeRegistration={typeRegistration} />
        </Dialog>
      )}
    </ListView>
  );
};

export default DataTypePage;
