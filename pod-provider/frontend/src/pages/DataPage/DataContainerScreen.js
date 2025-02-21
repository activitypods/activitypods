import React, { useCallback, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslate, useGetIdentity, useLocaleState } from 'react-admin';
import {
  Box,
  Badge,
  List,
  ListItem,
  ListItemButton,
  Avatar,
  ListItemAvatar,
  ListItemText,
  Dialog,
  useMediaQuery
} from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CachedIcon from '@mui/icons-material/Cached';
import { useContainers, useCompactPredicate } from '@semapps/semantic-data-provider';
import ListView from '../../layout/ListView';
import ResourceCard from '../../common/cards/ResourceCard';
import BackButton from '../../common/buttons/BackButton';
import { arrayOf } from '../../utils';

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

const DataContainerScreen = ({ containerData }) => {
  const { data: identity } = useGetIdentity();
  const classes = useStyles();
  const navigate = useNavigate();
  const translate = useTranslate();
  const [selected, setSelected] = useState();
  const [locale] = useLocaleState();
  const developerMode = !!localStorage.getItem('developer_mode');
  const xs = useMediaQuery(theme => theme.breakpoints.down('sm'), { noSsr: true });

  const containers = useContainers({ serverKeys: ['user'] });
  const container = useMemo(() => containers.find(c => c.uri === containerData.id), [containers, containerData]);
  const labelPredicate = useCompactPredicate(container?.labelPredicate, containerData['@context']);

  const onSelect = useCallback(
    resource => {
      if (developerMode) {
        navigate(`/data/${encodeURIComponent(resource.id || resource['@id'])}`);
      } else {
        setSelected(resource);
      }
    },
    [developerMode, navigate, setSelected]
  );

  const resources = arrayOf(containerData['ldp:contains']);

  if (!container) return null;

  return (
    <ListView
      title={container.label[locale] || containerData.id || containerData['@id']}
      actions={[
        <BackButton to="/data" /> /*<SetDefaultAppButton typeRegistration={typeRegistration} refetch={refetch} />*/
      ]}
      asides={selected && !xs ? [<ResourceCard resource={selected} labelPredicate={labelPredicate} />] : null}
    >
      <Box>
        <List>
          {resources.length === 0 && translate('ra.navigation.no_results')}
          {resources.map(resource => {
            const resourceUri = resource.id || resource['@id'];
            const isLocal = resourceUri.startsWith(identity?.id);
            const label = labelPredicate && resource[labelPredicate];
            return (
              <ListItem className={classes.listItem} key={resourceUri}>
                <ListItemButton onClick={() => onSelect(resource)}>
                  <ListItemAvatar>
                    {isLocal ? (
                      <Avatar>
                        <InsertDriveFileIcon />
                      </Avatar>
                    ) : (
                      <Badge
                        badgeContent={<CachedIcon sx={{ width: 16, height: 16, color: 'grey' }} />}
                        overlap="circular"
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                      >
                        <Avatar>
                          <InsertDriveFileIcon />
                        </Avatar>
                      </Badge>
                    )}
                  </ListItemAvatar>
                  <ListItemText
                    primary={label || resourceUri}
                    secondary={label ? resourceUri : undefined}
                    className={classes.listItemText}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      </Box>
      {xs && (
        <Dialog fullWidth open={!!selected} onClose={() => setSelected(null)}>
          <ResourceCard resource={selected} /*typeRegistration={typeRegistration}*/ />
        </Dialog>
      )}
    </ListView>
  );
};

export default DataContainerScreen;
