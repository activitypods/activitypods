import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslate, useGetList } from 'react-admin';
import { Box, Typography, List, ListItem, ListItemButton, Avatar, ListItemAvatar, ListItemText } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import FolderIcon from '@mui/icons-material/Folder';
import { useCheckAuthenticated } from '@semapps/auth-provider';
import useTypeRegistrations from '../../hooks/useTypeRegistrations';
import { arrayFromLdField } from '../../utils';

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
  const { data: typeRegistrations } = useTypeRegistrations();

  if (!typeRegistrations) return null;

  return (
    <>
      <Typography variant="h2" component="h1" sx={{ mt: 2 }}>
        {translate('app.page.data')}
      </Typography>
      <Box>
        <List>
          {typeRegistrations
            ?.filter(r => r['skos:prefLabel'])
            ?.sort(a => (a['apods:defaultApp'] ? -1 : 1))
            .map(typeRegistration => (
              <ListItem className={classes.listItem} key={typeRegistration.id}>
                <ListItemButton
                  onClick={() => navigate(`/data/${encodeURIComponent(typeRegistration['solid:instanceContainer'])}`)}
                >
                  <ListItemAvatar>
                    <Avatar src={typeRegistration?.['apods:icon']}>
                      <FolderIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={typeRegistration['skos:prefLabel']}
                    secondary={arrayFromLdField(typeRegistration['solid:forClass']).join(', ')}
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

export default DataPage;
