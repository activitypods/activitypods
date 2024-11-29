import React from 'react';
import { Form, TextInput, useNotify, useRecordContext, useTranslate, useGetIdentity } from 'react-admin';
import { Box, Button, Alert } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { useOutbox, useCollection, OBJECT_TYPES } from '@semapps/activitypub-components';
import makeStyles from '@mui/styles/makeStyles';
import useActor from '../../hooks/useActor';

const useStyles = makeStyles(() => ({
  input: {
    marginTop: 0,
    marginBottom: -20
  }
}));

const ContactField = ({ source, context }) => {
  const classes = useStyles();
  const record = useRecordContext();
  const notify = useNotify();
  const outbox = useOutbox();
  const translate = useTranslate();
  const { data: identity } = useGetIdentity();
  const { items: contacts, isLoading: isContactsLoading } = useCollection('apods:contacts');
  const { items: attendees } = useCollection(record?.['apods:attendees']);
  const actor = useActor(record?.id);

  if (!record) return null;

  const isOwner = identity?.id === record[source];

  const onSubmit = async values => {
    try {
      await outbox.post({
        type: OBJECT_TYPES.NOTE,
        attributedTo: outbox.owner,
        content: values.content,
        context: context ? record[context] : undefined,
        to:
          isOwner && record.type === OBJECT_TYPES.EVENT
            ? attendees?.filter(userUri => userUri !== record[source])
            : record[source]
      });
      notify('app.notification.message_sent', { type: 'success' });
    } catch (e) {
      notify('app.notification.message_send_error', { type: 'error', messageArgs: { error: e.message } });
    }
  };

  return (
    <Form onSubmit={onSubmit}>
      {!isOwner && !isContactsLoading && !contacts.includes(record[source]) && (
        <Box mb={1}>
          <Alert severity="warning">
            {translate('app.helper.message_profile_show_right', { username: actor.name })}
          </Alert>
        </Box>
      )}
      <TextInput
        source="content"
        label={translate('app.input.message')}
        className={classes.input}
        variant="filled"
        margin="dense"
        fullWidth
        multiline
        minRows={4}
      />
      <Box mt={1}>
        <Button type="submit" variant="contained" color="secondary" size="medium" endIcon={<SendIcon />}>
          {translate('app.action.send')}
        </Button>
      </Box>
    </Form>
  );
};

ContactField.defaultProps = {
  addLabel: true
};

export default ContactField;
