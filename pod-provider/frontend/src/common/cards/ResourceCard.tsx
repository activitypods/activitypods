import React from 'react';
import { Card, Avatar, Box, Button, Table, TableBody, TableRow, TableCell, Typography } from '@mui/material';
import { makeStyles } from 'tss-react/mui';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { useTranslate } from 'react-admin';
import useActor from '../../hooks/useActor';
import { arrayOf } from '../../utils';

const useStyles = makeStyles()(theme => ({
  title: {
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundImage: `radial-gradient(circle at 50% 14em, ${theme.palette.primary.light} 0%, ${theme.palette.primary.main} 100%)`,
    // @ts-expect-error TS(2339): Property 'palette' does not exist on type 'Default... Remove this comment to see the full error message
    color: theme.palette.primary.contrastText,
    height: 85,
    position: 'relative'
  },
  avatarWrapper: {
    position: 'absolute',
    margin: 10,
    top: 0,
    left: 0,
    right: 0,
    textAlign: 'center'
  },
  avatar: {
    width: 150,
    height: 150
  }
}));

const ResourceCard = ({ resource, labelPredicate }: any) => {
  const translate = useTranslate();
  const { classes } = useStyles();

  const actor = useActor(resource['dc:creator']);

  const created = resource['dc:created'] && new Date(resource['dc:created']);
  const modified = resource['dc:modified'] && new Date(resource['dc:modified']);
  const dateTimeFormat = new Intl.DateTimeFormat(CONFIG.DEFAULT_LOCALE);

  if (!resource) return null;

  return (
    <Card>
      <Box className={classes.title}>
        <Box display="flex" justifyContent="center" className={classes.avatarWrapper}>
          <Avatar /*src={typeRegistration?.['apods:icon']}*/ className={classes.avatar}>
            <InsertDriveFileIcon sx={{ width: 100, height: 100 }} />
          </Avatar>
        </Box>
      </Box>
      <Typography
        variant="h4"
        sx={{
          mt: 10,
          pl: 2,
          pr: 2,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {resource[labelPredicate]}
      </Typography>
      <Box p={2}>
        <Table size="small">
          <TableBody>
            {actor.name && (
              <TableRow>
                <TableCell>{translate('app.input.creator')}</TableCell>
                <TableCell align="right">{actor.name}</TableCell>
              </TableRow>
            )}
            {created && (
              <TableRow>
                <TableCell>{translate('app.input.created')}</TableCell>
                <TableCell align="right">{dateTimeFormat.format(created)}</TableCell>
              </TableRow>
            )}
            {modified && (
              <TableRow>
                <TableCell>{translate('app.input.modified')}</TableCell>
                <TableCell align="right">{dateTimeFormat.format(modified)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Box>
      {/*typeRegistration?.['apods:openEndpoint'] && (
        <Box sx={{ mt: 1, mb: 3, textAlign: 'center' }}>
          <a
            href={`${typeRegistration['apods:openEndpoint']}?type=${encodeURIComponent(
              arrayOf(typeRegistration['solid:forClass'])?.[0]
            )}&uri=${encodeURIComponent(resource.id || resource['@id'])}&mode=show`}
            target="_blank"
            rel="noreferrer"
          >
            <Button variant="contained" color="secondary" type="submit">
              {translate('app.action.open')}
            </Button>
          </a>
        </Box>
      )*/}
    </Card>
  );
};

export default ResourceCard;
