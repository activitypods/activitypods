import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslate, useGetList } from 'react-admin';
import { Box, Typography, List, ListItem, ListItemButton, Avatar, ListItemAvatar, ListItemText } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import FolderIcon from '@mui/icons-material/Folder';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import AppBadge from '../../common/AppBadge';
import SplitView from '../../layout/SplitView';
import useResourcesByType from '../../hooks/useResourcesByType';

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

const DataPage = () => {
  useCheckAuthenticated();
  const translate = useTranslate();
  const navigate = useNavigate();
  const classes = useStyles();
  const { type } = useParams();

  const { data: classDescriptions } = useGetList('ClassDescription');
  const { data: appRegistrations } = useGetList('AppRegistration');

  const classDescription = type && classDescriptions?.find(desc => desc['apods:describedClass'] === type);
  const resources = useResourcesByType(type, classDescription);

  if (!classDescriptions || !appRegistrations) return null;

  return (
    <SplitView>
      <Typography variant="h2" component="h1" sx={{ mt: 2 }}>
        {classDescription?.['skos:prefLabel'] || translate('app.page.data')}
      </Typography>
      <Box>
        <List>
          {type
            ? resources.map(resource => (
                <ListItem className={classes.listItem} key={resource.resourceUri.value}>
                  <ListItemButton onClick={() => navigate(`/data`)}>
                    <ListItemAvatar>
                      <AppBadge>
                        <Avatar>
                          <InsertDriveFileIcon />
                        </Avatar>
                      </AppBadge>
                    </ListItemAvatar>
                    <ListItemText
                      primary={resource.label.value}
                      secondary={resource.resourceUri.value}
                      className={classes.listItemText}
                    />
                  </ListItemButton>
                </ListItem>
              ))
            : classDescriptions?.map(classDescription => {
                const appRegistration = appRegistrations.find(
                  appReg => appReg['apods:preferredForClass'] === classDescription['apods:describedClass']
                );
                return (
                  <ListItem className={classes.listItem} key={classDescription.id}>
                    <ListItemButton
                      onClick={() => navigate(`/data/${encodeURIComponent(classDescription['apods:describedClass'])}`)}
                    >
                      <ListItemAvatar>
                        <AppBadge appUri={appRegistration?.['interop:registeredAgent']}>
                          <Avatar>
                            <FolderIcon />
                          </Avatar>
                        </AppBadge>
                      </ListItemAvatar>
                      <ListItemText
                        primary={classDescription['skos:prefLabel']}
                        secondary={classDescription['apods:describedClass']}
                        className={classes.listItemText}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
        </List>
      </Box>
    </SplitView>
  );
};

export default DataPage;
