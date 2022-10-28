import React from 'react';
import { DateField, TextField, useRecordContext, useTranslate } from 'react-admin';
import { makeStyles, Typography } from '@material-ui/core';

const useStyles = makeStyles((theme) => ({
  root: {
    marginBottom: 10,
    '& li': {
      marginBottom: 7,
    },
  },
}));

const EventConditionsField = () => {
  const classes = useStyles();
  const record = useRecordContext();
  const translate = useTranslate();
  return (
    <ul className={classes.root}>
      {record['apods:otherConditions'] &&
        record['apods:otherConditions'].split('\n').map((condition) => (
          <li>
            <Typography>{condition}</Typography>
          </li>
        ))}
      {record['apods:closingTime'] && (
        <li>
          <Typography>
            <strong>{translate('resources.Event.fields.apods:closingTime')}:</strong>&nbsp;
            <DateField
              showTime
              source="apods:closingTime"
              options={{ year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }}
              variant="body1"
            />
          </Typography>
        </li>
      )}
      {record['apods:maxAttendees'] && (
        <li>
          <Typography>
            <strong>{translate('resources.Event.fields.apods:maxAttendees')}:</strong>&nbsp;
            <TextField source="apods:maxAttendees" />
          </Typography>
        </li>
      )}
      {!record['apods:otherConditions'] && !record['apods:closingTime'] && !record['apods:maxAttendees'] && (
        <li>
          <Typography>{translate('app.message.no_condition')}</Typography>
        </li>
      )}
    </ul>
  );
};

EventConditionsField.defaultProps = {
  label: 'Conditions',
  addLabel: true,
};

export default EventConditionsField;
