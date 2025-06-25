import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslate, useLocaleState } from 'react-admin';
import {
  Badge,
  Box,
  Typography,
  List,
  ListItem,
  ListItemButton,
  Avatar,
  ListItemAvatar,
  ListItemText
} from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import FolderIcon from '@mui/icons-material/Folder';
import SettingsIcon from '@mui/icons-material/Settings';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import { useContainers, useGetPrefixFromUri } from '@semapps/semantic-data-provider';

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

const DataListPage = () => {
  useCheckAuthenticated();
  const translate = useTranslate();
  const navigate = useNavigate();
  const classes = useStyles();
  const [locale] = useLocaleState();
  const getPrefixFromUri = useGetPrefixFromUri();
  const developerMode = !!localStorage.getItem('developer_mode');
  const containers = useContainers(undefined, '@default');

  return (
    <>
      <Typography variant="h2" component="h1" noWrap sx={{ mt: 2 }}>
        {translate('app.page.data')}
      </Typography>
      <Box>
        <List>
          {containers
            ?.filter(container => !container.private || developerMode)
            ?.map(container => (
              <ListItem className={classes.listItem} key={container.uri}>
                <ListItemButton onClick={() => navigate(`/data/${encodeURIComponent(container.uri)}`)}>
                  <ListItemAvatar>
                    {container.private === true ? (
                      <Badge
                        badgeContent={<SettingsIcon sx={{ width: 16, height: 16, color: 'grey' }} />}
                        overlap="circular"
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      >
                        <Avatar>
                          <FolderIcon />
                        </Avatar>
                      </Badge>
                    ) : (
                      <Avatar>
                        <FolderIcon />
                      </Avatar>
                    )}
                  </ListItemAvatar>
                  <ListItemText
                    primary={container.label?.[locale] || container.label?.en}
                    secondary={container.types?.map(uri => getPrefixFromUri(uri)).join(', ')}
                    className={classes.listItemText}
                  />
                </ListItemButton>
              </ListItem>
            ))}
        </List>
      </Box>
    </>
  );
};

export default DataListPage;
