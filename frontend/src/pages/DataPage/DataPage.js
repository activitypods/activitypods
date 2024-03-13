import React from 'react';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { useTranslate, useGetList, useGetOne } from 'react-admin';
import FolderIcon from '@mui/icons-material/Folder';
import {
  Box,
  Badge,
  Typography,
  List,
  ListItem,
  ListItemButton,
  Avatar,
  ListItemAvatar,
  ListItemText
} from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { useNavigate } from 'react-router-dom';

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

const ApplicationBadge = ({ appUri, children }) => {
  const { data: app } = useGetOne('App', { id: appUri }, { enabled: !!appUri });
  if (!appUri) return children;
  return (
    <Badge
      overlap="circular"
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      badgeContent={
        <Avatar
          alt={app['interop:applicationName']}
          src={app['interop:applicationThumbnail']}
          sx={{ width: 22, height: 22, bgcolor: 'white' }}
        />
      }
    >
      {children}
    </Badge>
  );
};

const DataPage = () => {
  useCheckAuthenticated();
  const translate = useTranslate();
  const navigate = useNavigate();
  const classes = useStyles();

  const { data: classDescriptions } = useGetList('ClassDescription');
  const { data: appRegistrations } = useGetList('AppRegistration');

  if (!classDescriptions || !appRegistrations) return null;

  return (
    <>
      <Typography variant="h2" component="h1" sx={{ mt: 2 }}>
        {translate('app.page.data')}
      </Typography>
      <Box>
        <List>
          {classDescriptions?.map(classDescription => {
            const appRegistration = appRegistrations.find(
              appReg => appReg['apods:preferredForClass'] === classDescription['apods:describedClass']
            );
            return (
              <ListItem className={classes.listItem} key={classDescription.id}>
                <ListItemButton
                  onClick={() => navigate(`/data/${encodeURIComponent(classDescription['apods:describedClass'])}`)}
                >
                  <ListItemAvatar>
                    <ApplicationBadge appUri={appRegistration?.['interop:registeredAgent']}>
                      <Avatar>
                        <FolderIcon />
                      </Avatar>
                    </ApplicationBadge>
                  </ListItemAvatar>
                  <ListItemText
                    primary={classDescription['skos:prefLabel']}
                    secondary={classDescription['apods:describedClass']}
                    className={classes.listItemText}
                  />
                  {/* <ListItemSecondaryAction>
                  <IconButton>
                    <EditIcon />
                  </IconButton>
                </ListItemSecondaryAction> */}
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>
    </>
  );
};

export default DataPage;
