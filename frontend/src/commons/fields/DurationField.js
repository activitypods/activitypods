import React from 'react';
import { useRecordContext, useTranslate } from 'react-admin';
import { Typography } from '@material-ui/core';

const getDiff = (startDate, endDate) => {
  let seconds = Math.floor((endDate - startDate) / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  let days = Math.floor(hours / 24);

  hours = hours - days * 24;
  minutes = minutes - days * 24 * 60 - hours * 60;

  return {
    days: Math.floor(days),
    hours: Math.floor(hours),
    minutes: Math.floor(minutes),
  };
};

const DurationField = ({ startDate, endDate, ...rest }) => {
  const record = useRecordContext(rest);
  const translate = useTranslate();

  let dateElements = [];

  const { days, hours, minutes } = getDiff(new Date(record[startDate]), new Date(record[endDate]));
  if (days) dateElements.push(translate('app.time.days', { smart_count: days }));
  if (hours) dateElements.push(translate('app.time.hours', { smart_count: hours }));
  if (minutes) dateElements.push(translate('app.time.minutes', { smart_count: minutes }));

  return dateElements.length > 0 ? (
    <Typography component="span" variant="body2">
      {dateElements.join(', ')}
    </Typography>
  ) : null;
};

export default DurationField;
